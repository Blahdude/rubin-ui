import { globalShortcut, app, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { Writer as WavWriter } from "wav";
import { exec } from "child_process";
import record from "node-record-lpcm16";
import { AppState } from "./main";

// --- Audio Configuration ---
const AUDIO_DEVICE_NAME = 'BlackHole 2ch'; // Explicitly set the recording device.
                                           // Check Audio MIDI Setup on your Mac if this name is different.

// VAD Constants
const VAD_RMS_THRESHOLD = 500;
const VAD_WAIT_TIMEOUT_MS = 3000;
let currentRecordingDurationMs = 5000;

// SoX command parameters
const SOX_SILENCE_THRESHOLD = "0.5%";
const SOX_SILENCE_DURATION = "0.5";

const INITIAL_CHUNKS_TO_SKIP = 5;

// --- Type Definition for VAD Session ---
interface VadSessionState {
  isDetecting: boolean;
  hasStartedSaving: boolean;
  audioPath: string;
  chunksProcessedCounter: number;
  recordingInstance: any; 
  wavWriterInstance: WavWriter | null;
  fileStream: fs.WriteStream | null;
  vadWaitTimeoutId: NodeJS.Timeout | undefined;
  stopTimeoutId: NodeJS.Timeout | undefined;
}

function calculateRMS(pcmData: Buffer): number {
  if (pcmData.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < pcmData.length; i += 2) {
    const sample = pcmData.readInt16LE(i);
    sumSquares += (sample * sample);
  }
  return Math.sqrt(sumSquares / (pcmData.length / 2));
}

export function setRecordingDuration(durationSeconds: number): void {
  console.log(`[Shortcuts] Setting recording duration to ${durationSeconds} seconds.`);
  currentRecordingDurationMs = durationSeconds * 1000;
}

export class ShortcutsHelper {
  private appState: AppState;
  private vadState: { [key: string]: VadSessionState } = {};

  constructor(appState: AppState) {
    this.appState = appState;
  }

  private getSoxPath(): string {
    if (app.isPackaged) {
      const soxFilename = process.platform === "win32" ? "sox.exe" : "sox";
      const soxPath = path.join(process.resourcesPath, "bin", soxFilename);
      console.log(`[Sox Path] Packaged app, sox path: ${soxPath}`);
      return soxPath;
    }
    console.log("[Sox Path] Development mode, using 'sox' from PATH.");
    return "sox";
  }

  private getRecorderType(): 'sox' | undefined {
    // Always return 'sox' as the recorder type for node-record-lpcm16
    // The library will handle finding the executable through PATH
    return 'sox';
  }

  private setupSoxEnvironment(): void {
    if (app.isPackaged) {
      const soxPath = this.getSoxPath();
      const soxDir = path.dirname(soxPath);
      
      // Add sox directory to PATH so node-record-lpcm16 can find it
      const currentPath = process.env.PATH || '';
      if (!currentPath.includes(soxDir)) {
        process.env.PATH = `${soxDir}${path.delimiter}${currentPath}`;
        console.log(`[Sox Setup] Added ${soxDir} to PATH`);
      }

      // Ensure sox binary is executable (Unix-like systems)
      if (process.platform !== 'win32') {
        try {
          const fs = require('fs');
          fs.chmodSync(soxPath, 0o755);
          console.log(`[Sox Setup] Made ${soxPath} executable`);
        } catch (error) {
          console.error(`[Sox Setup] Failed to make sox executable:`, error);
        }
      }
    }
  }

  public registerGlobalShortcuts(): void {
    globalShortcut.register("CommandOrControl+Enter", async () => {
      console.log("'Take Screenshot' (CommandOrControl+Enter) triggered.");
      const mainWindow = this.appState.getMainWindow();

      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          const screenshotPath = await this.appState.takeScreenshot();
          if (screenshotPath) {
            const preview = await this.appState.getImagePreview(screenshotPath);
            mainWindow.webContents.send("screenshot-taken", { path: screenshotPath, preview });
            console.log("Screenshot taken and stored. It will be analyzed when user provides a text prompt.");
          }
        } catch (error: any) {
          console.error("Error taking screenshot:", error);
          if (error.message && error.message.includes("Maximum")) {
            mainWindow.webContents.send("screenshot-limit-reached", { message: "Max 2 Screenshots" });
          }
        }
      }
    });

    globalShortcut.register("CommandOrControl+R", () => {
      console.log("Command + R pressed. Canceling requests and resetting queues...");
      this.appState.processingHelper.cancelOngoingRequests();
      this.appState.clearQueues();
      this.appState.setView("queue");
      const mainWindow = this.appState.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view");
      }
    });

    globalShortcut.register("CommandOrControl+Left", () => this.appState.moveWindowLeft());
    globalShortcut.register("CommandOrControl+Right", () => this.appState.moveWindowRight());
    globalShortcut.register("CommandOrControl+Down", () => this.appState.moveWindowDown());
    globalShortcut.register("CommandOrControl+Up", () => this.appState.moveWindowUp());

    globalShortcut.register("CommandOrControl+B", () => {
      this.appState.toggleMainWindow();
      const mainWindow = this.appState.getMainWindow();
      if (mainWindow && !this.appState.isVisible()) {
        if (process.platform === "darwin") {
          mainWindow.setAlwaysOnTop(true, "normal");
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setAlwaysOnTop(true, "floating");
            }
          }, 100);
        }
      }
    });

    app.on("will-quit", () => {
      globalShortcut.unregisterAll();
      Object.keys(this.vadState).forEach(key => this.cleanupVadSession(key, false));
    });
  }

  private async trimAudioWithSox(filePath: string): Promise<string> {
    const soxPath = this.getSoxPath();

    const soxExists = app.isPackaged
      ? fs.existsSync(soxPath)
      : await new Promise<boolean>(resolve => exec('which sox', (err) => resolve(!err)));

    if (!soxExists) {
      if (app.isPackaged) {
        console.error(`Sox executable not found at expected path: ${soxPath}`);
      } else {
        console.log("`sox` not found in PATH during development. Skipping audio trim.");
      }
      return filePath;
    }

    return new Promise((resolve) => {
        const trimmedPath = filePath.replace(".wav", "-trimmed.wav");
        const soxCommand = `"${soxPath}" "${filePath}" "${trimmedPath}" silence 1 ${SOX_SILENCE_DURATION} ${SOX_SILENCE_THRESHOLD} reverse silence 1 ${SOX_SILENCE_DURATION} ${SOX_SILENCE_THRESHOLD} reverse`;

        exec(soxCommand, (error) => {
          if (error) {
            console.error("Error during Sox trim:", error);
            if (fs.existsSync(trimmedPath)) fs.unlinkSync(trimmedPath);
            resolve(filePath);
            return;
          }

          fs.unlinkSync(filePath);
          fs.renameSync(trimmedPath, filePath);
          console.log("Audio trimmed successfully.");
          resolve(filePath);
        });
    });
  }

  private cleanupVadSession(sessionId: string, sendCompleteMessage = true): void {
    const session = this.vadState[sessionId];
    if (!session) return;

    if (session.vadWaitTimeoutId) clearTimeout(session.vadWaitTimeoutId);
    if (session.stopTimeoutId) clearTimeout(session.stopTimeoutId);
    if (session.recordingInstance) session.recordingInstance.stop();

    if (session.wavWriterInstance) {
      session.wavWriterInstance.end();
    } else if (session.fileStream) {
      session.fileStream.end();
    }

    if (session.fileStream) {
      session.fileStream.once('finish', async () => {
        if (sendCompleteMessage && session.hasStartedSaving) {
          const finalAudioPath = await this.trimAudioWithSox(session.audioPath);
          const mainWindow = this.appState.getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("audio-recording-complete", { path: finalAudioPath });
          }
        } else if (!session.hasStartedSaving && fs.existsSync(session.audioPath)) {
          fs.unlinkSync(session.audioPath);
        }
      });
    }

    delete this.vadState[sessionId];
  }

  public registerAudioShortcut(): void {
    // Setup sox environment when registering audio shortcuts
    this.setupSoxEnvironment();

    globalShortcut.register("Command+;", () => {
      if (Object.keys(this.vadState).length > 0) {
        const activeSessionId = Object.keys(this.vadState)[0];
        this.cleanupVadSession(activeSessionId, true);
        return;
      }

      const sessionId = `vad-session-${Date.now()}`;
      const mainWindow = this.appState.getMainWindow();
      if (mainWindow) mainWindow.webContents.send("vad-waiting");

      const audioDir = path.join(app.getPath('userData'), "local_recordings");
      if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const audioPath = path.join(audioDir, `recording-${timestamp}.wav`);

      this.vadState[sessionId] = {
        isDetecting: true,
        hasStartedSaving: false,
        audioPath,
        chunksProcessedCounter: 0,
        recordingInstance: null,
        wavWriterInstance: null,
        fileStream: null,
        vadWaitTimeoutId: undefined,
        stopTimeoutId: undefined,
      };
      const session = this.vadState[sessionId];

      session.recordingInstance = record.record({
          sampleRate: 48000,
          channels: 2,
          bitDepth: 16,
          recorder: this.getRecorderType(),
          device: AUDIO_DEVICE_NAME, // Explicitly target the device
      });

      session.recordingInstance.stream()
        .on('data', (chunk: Buffer) => {
          if (!this.vadState[sessionId]) return;
          
          session.chunksProcessedCounter++;
          if (session.chunksProcessedCounter <= INITIAL_CHUNKS_TO_SKIP && session.isDetecting) return;

          const rms = calculateRMS(chunk);
          if (session.isDetecting && rms > VAD_RMS_THRESHOLD) {
            session.isDetecting = false;
            session.hasStartedSaving = true;
            if (session.vadWaitTimeoutId) clearTimeout(session.vadWaitTimeoutId);

            session.wavWriterInstance = new WavWriter({ channels: 2, sampleRate: 48000, bitDepth: 16 });
            session.fileStream = fs.createWriteStream(audioPath);
            session.wavWriterInstance.pipe(session.fileStream);
            session.wavWriterInstance.write(chunk);
            
            if(mainWindow) mainWindow.webContents.send("vad-recording-started");

            session.stopTimeoutId = setTimeout(() => this.cleanupVadSession(sessionId, true), currentRecordingDurationMs);
          } else if (session.hasStartedSaving) {
            session.wavWriterInstance?.write(chunk);
          }
        })
        .on('error', (err: Error) => {
            console.error(`Recorder error:`, err);
            if(mainWindow) mainWindow.webContents.send("audio-recording-error", { message: err.message });
            this.cleanupVadSession(sessionId, false);
        });

      session.vadWaitTimeoutId = setTimeout(() => {
        if (this.vadState[sessionId]?.isDetecting) {
          if(mainWindow) mainWindow.webContents.send("vad-timeout");
          this.cleanupVadSession(sessionId, false);
        }
      }, VAD_WAIT_TIMEOUT_MS);
    });
  }
}