import { globalShortcut, app } from "electron"
import { AppState } from "./main" // Adjust the import path if necessary
import fs from "fs"
import path from "path"
import { Writer as WavWriter } from "wav"; // Import WavWriter
import { exec } from "child_process"; // For running SoX
import NodeRecordLpcm16 from "node-record-lpcm16" // Use require for CommonJS

// VAD Constants (assuming they were defined here or should be)
const VAD_RMS_THRESHOLD = 500; // Threshold for actual sound (default, adjust as needed)
const VAD_SILENCE_TIMEOUT_MS = 2000; // Time of silence before stopping (default, adjust as needed)
const VAD_WAIT_TIMEOUT_MS = 3000; // Max time to wait for sound
let currentRecordingDurationMs = 5000; // Default 5 seconds, will be updated by UI

// Helper function to calculate RMS of an audio chunk (16-bit PCM)
function calculateRMS(pcmData: Buffer): number {
  if (pcmData.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < pcmData.length; i += 2) {
    // Assuming 16-bit Little Endian PCM
    const sample = pcmData.readInt16LE(i);
    sumSquares += (sample * sample);
  }
  return Math.sqrt(sumSquares / (pcmData.length / 2));
}

const TEMP_LOG_RMS_MODE = false; // SET TO false FOR NORMAL VAD OPERATION

const INITIAL_CHUNKS_TO_SKIP = 5; // Number of initial audio chunks to skip for VAD to stabilize

// SoX command parameters for trimming trailing silence
const SOX_SILENCE_THRESHOLD = "0.5%" // Percentage of max volume to be considered silence
const SOX_SILENCE_DURATION = "0.5"   // Duration in seconds of silence to trigger trim

export function setRecordingDuration(durationSeconds: number): void {
  console.log(`[Shortcuts] Setting recording duration to ${durationSeconds} seconds.`);
  currentRecordingDurationMs = durationSeconds * 1000;
}

export class ShortcutsHelper {
  private appState: AppState
  // To manage VAD state for potentially multiple concurrent attempts (though unlikely with global shortcut)
  private vadState: { [key: string]: any } = {};

  constructor(appState: AppState) {
    this.appState = appState
  }

  public registerGlobalShortcuts(): void {
    globalShortcut.register("CommandOrControl+H", async () => {
      // This shortcut is now effectively OBSOLETE as Solve will auto-screenshot
      // We can leave it for debugging or remove it later if desired.
      // For now, let's comment out its direct action to avoid confusion.
      console.log("CommandOrControl+H pressed, but its primary function is now part of 'Solve'.");
      /*
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow) {
        console.log("Taking screenshot (Manual ⌘H)...")
        try {
          const screenshotPath = await this.appState.takeScreenshot()
          const preview = await this.appState.getImagePreview(screenshotPath)
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          })
        } catch (error) {
          console.error("Error capturing screenshot (Manual ⌘H):", error)
        }
      }
      */
    })

    globalShortcut.register("CommandOrControl+Enter", async () => {
      console.log("'Solve' (CommandOrControl+Enter) triggered.");
      const mainWindow = this.appState.getMainWindow();

      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log("Taking screenshot...");
        try {
          const screenshotPath = await this.appState.takeScreenshot();
          if (screenshotPath) {
            const preview = await this.appState.getImagePreview(screenshotPath);
            mainWindow.webContents.send("screenshot-taken", { 
              path: screenshotPath, 
              preview 
            });
            console.log(`Screenshot taken and event sent: ${screenshotPath}`);
          } else {
            console.error("Screenshot capture failed: takeScreenshot returned no path.");
          }
        } catch (error) {
          console.error("Error capturing screenshot:", error);
        }
      } else {
        console.warn("Main window not available for screenshot.");
      }
    })

    globalShortcut.register("CommandOrControl+R", () => {
      console.log(
        "Command + R pressed. Canceling requests and resetting queues..."
      )

      // Cancel ongoing API requests
      this.appState.processingHelper.cancelOngoingRequests()

      // Clear both screenshot queues
      this.appState.clearQueues()

      console.log("Cleared queues.")

      // Update the view state to 'queue'
      this.appState.setView("queue")

      // Notify renderer process to switch view to 'queue'
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
      }
    })

    // New shortcuts for moving the window
    globalShortcut.register("CommandOrControl+Left", () => {
      console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.appState.moveWindowLeft()
    })

    globalShortcut.register("CommandOrControl+Right", () => {
      console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.appState.moveWindowRight()
    })
    globalShortcut.register("CommandOrControl+Down", () => {
      console.log("Command/Ctrl + down pressed. Moving window down.")
      this.appState.moveWindowDown()
    })
    globalShortcut.register("CommandOrControl+Up", () => {
      console.log("Command/Ctrl + Up pressed. Moving window Up.")
      this.appState.moveWindowUp()
    })

    globalShortcut.register("CommandOrControl+B", () => {
      this.appState.toggleMainWindow()
      // If window exists and we're showing it, bring it to front
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !this.appState.isVisible()) {
        // Force the window to the front on macOS
        if (process.platform === "darwin") {
          mainWindow.setAlwaysOnTop(true, "normal")
          // Reset alwaysOnTop after a brief delay
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setAlwaysOnTop(true, "floating")
            }
          }, 100)
        }
      }
    })

    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
      // Clean up any ongoing recordings on quit
      Object.keys(this.vadState).forEach(key => {
        this.cleanupVadSession(key, false); // Don't send completion message
      });
    })
  }

  private async trimAudioWithSox(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const originalPath = filePath;
      
      // Check if sox is available first
      exec('which sox', (whichError) => {
        if (whichError) {
          console.warn(`[SoX Trimming] SoX not available - skipping audio trimming for ${originalPath}`);
          resolve(originalPath); // Return original file without trimming
          return;
        }

        const trimmedPath = filePath.replace(".wav", "-trimmed.wav");
        // SoX command: sox original.wav trimmed.wav silence 1 0.1 1% reverse silence 1 0.1 1% reverse
        // The parameters are: 1 period of silence, duration (SOX_SILENCE_DURATION), threshold (SOX_SILENCE_THRESHOLD)
        const soxCommand = `sox "${originalPath}" "${trimmedPath}" silence 1 ${SOX_SILENCE_DURATION} ${SOX_SILENCE_THRESHOLD} reverse silence 1 ${SOX_SILENCE_DURATION} ${SOX_SILENCE_THRESHOLD} reverse`;

        console.log(`[SoX Trimming] Executing: ${soxCommand}`);
        exec(soxCommand, (error, stdout, stderr) => {
          if (error) {
            console.error(`[SoX Trimming] Error during SoX execution for ${originalPath}:`, error);
            console.error(`[SoX Trimming] SoX stderr: ${stderr}`);
            // If SoX fails, we still have the original file.
            // Depending on the error, SoX might create an empty/corrupt trimmed file, ensure it's removed.
            if (fs.existsSync(trimmedPath)) {
              try { fs.unlinkSync(trimmedPath); } catch (e) { /* ignore */ }
            }
            resolve(originalPath); // Return original file if trimming fails
            return;
          }
          console.log(`[SoX Trimming] Successfully trimmed ${originalPath} to ${trimmedPath}. SoX stdout: ${stdout}`);
          // Replace original with trimmed version
          try {
            fs.unlinkSync(originalPath);
            fs.renameSync(trimmedPath, originalPath);
            console.log(`[SoX Trimming] Replaced ${originalPath} with trimmed version.`);
            resolve(originalPath); // Resolve with the original path, now pointing to the trimmed audio
          } catch (fileError) {
            console.error(`[SoX Trimming] Error replacing original file with trimmed version for ${originalPath}:`, fileError);
            // If replacing fails, try to resolve with trimmedPath if it exists, otherwise original
            if(fs.existsSync(trimmedPath)) resolve(trimmedPath); else resolve(originalPath);
          }
        });
      });
    });
  }

  private cleanupVadSession(sessionId: string, sendCompleteMessage: boolean = true) {
    const session = this.vadState[sessionId];
    if (!session) return;

    console.log(`[VAD Cleanup] Starting cleanup for session ${sessionId}`);

    if (session.vadWaitTimeoutId) clearTimeout(session.vadWaitTimeoutId);
    if (session.stopTimeoutId) clearTimeout(session.stopTimeoutId);

    if (session.recordingInstance) {
      console.log(`[VAD Cleanup] Stopping recordingInstance for session ${sessionId}`);
      session.recordingInstance.stop();
      // Attempt to remove listeners to prevent further data processing
      if (session.recordingInstance.stream && typeof session.recordingInstance.stream === 'function') {
        session.recordingInstance.stream().removeAllListeners('data');
        session.recordingInstance.stream().removeAllListeners('error');
        console.log(`[VAD Cleanup] Removed data/error listeners from recordingInstance stream for session ${sessionId}`);
      }
    }
    
    // Handle ffmpeg process cleanup
    if (session.ffmpegProcess && !session.ffmpegProcess.killed) {
      console.log(`[VAD Cleanup] Killing ffmpeg process for session ${sessionId}`);
      session.ffmpegProcess.kill('SIGINT');
    }

    // End WavWriter if it exists
    if (session.wavWriterInstance) {
      console.log(`[VAD Cleanup] Ending wavWriterInstance for session ${sessionId}`);
      session.wavWriterInstance.end(); // This will in turn end the fileStream it's piped to
    } else if (session.fileStream && !session.hasStartedSaving) {
      // If VAD timed out before recording started, but filestream was somehow created (shouldn't happen with current logic)
      console.log(`[VAD Cleanup] Ending fileStream (no WavWriter) for session ${sessionId} as recording didn't start.`);
      session.fileStream.end();
    } else if (session.fileStream) {
       console.log(`[VAD Cleanup] fileStream exists but no WavWriter, session started saving: ${session.hasStartedSaving}. This is unusual.`);
       session.fileStream.end(); // Ensure it's closed
    }
    
    if (session.fileStream) {
        console.log(`[VAD Cleanup] Setting up fileStream finish/error handlers for session ${sessionId}`);
        session.fileStream.once('finish', async () => {
            console.log(`[VAD Cleanup] fileStream finished for session ${sessionId}`);
            if (sendCompleteMessage && session.audioPath && session.hasStartedSaving) {
                let finalAudioPath = session.audioPath;
                try {
                    console.log(`[VAD Cleanup] Attempting to trim audio for ${session.audioPath}`);
                    finalAudioPath = await this.trimAudioWithSox(session.audioPath);
                    console.log(`[VAD Cleanup] Audio trimming successful. Final path: ${finalAudioPath}`);
                } catch (trimError) {
                    console.warn(`[VAD Cleanup] Audio trimming failed for ${session.audioPath}. Using original. Error:`, trimError.message);
                    // finalAudioPath remains session.audioPath (the original untrimmed file)
                }

                console.log(`Audio saved (final path after potential trim): ${finalAudioPath}`);
                const mainWindow = this.appState.getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send("audio-recording-complete", { path: finalAudioPath });
                }
            } else if (!session.hasStartedSaving) {
                if(session.audioPath && fs.existsSync(session.audioPath)) {
                    try { 
                        fs.unlinkSync(session.audioPath); 
                        console.log(`[VAD Cleanup] Cleaned up unused audio file (no save): ${session.audioPath}`);
                    } catch(e) { 
                        console.error("[VAD Cleanup] Error deleting unused audio file:", e, session.audioPath);
                    }
                }
            }
        });
         session.fileStream.once('error', (err: Error) => {
            console.error(`[VAD Cleanup] Error with file stream during cleanup for session ${sessionId}:`, err);
        });
    } else if (!session.hasStartedSaving && session.audioPath && fs.existsSync(session.audioPath)) {
        // Case where VAD timed out, no filestream was ever created (correct), but the empty file might exist.
        // This is because audioPath is determined before recordingInstance starts.
        console.log(`[VAD Cleanup] VAD timed out for ${sessionId}, no fileStream created. Checking for orphaned empty file: ${session.audioPath}`);
        try { 
            fs.unlinkSync(session.audioPath); 
            console.log(`[VAD Cleanup] Cleaned up orphaned empty audio file (VAD timeout): ${session.audioPath}`);
        } catch(e) { 
            // Ignore if file doesn't exist or other minor error, as it's just cleanup
            console.warn("[VAD Cleanup] Minor error or file not found while trying to delete orphaned empty audio file:", e, session.audioPath);
        }
    }

    console.log(`[VAD Cleanup] Deleting VAD state for session ${sessionId}`);
    delete this.vadState[sessionId];
  }

  public registerAudioShortcut(): void {
    globalShortcut.register("Command+;", () => {
      const activeSessionId = Object.keys(this.vadState)[0];
      if (activeSessionId) {
        console.log(`Command+; pressed again. Stopping active session: ${activeSessionId}`);
        this.cleanupVadSession(activeSessionId, true); 
        return;
      }

      const sessionId = `vad-session-${Date.now()}`;
      
      console.log(`Command+; pressed. Starting new session ${sessionId}. VAD_RMS_THRESHOLD = ${VAD_RMS_THRESHOLD}`);
      const mainWindow = this.appState.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("vad-waiting");
      }

      const audioDir = path.join(app.getPath('userData'), "local_recordings");
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const audioPath = path.join(audioDir, `recording-${timestamp}.wav`);

      this.vadState[sessionId] = {
        isDetecting: true, 
        hasStartedSaving: false,
        audioPath: audioPath,
        chunksProcessedCounter: 0,
      };
      const session = this.vadState[sessionId];

      // NUCLEAR OPTION: Use ffmpeg directly since it's more reliable
      const { spawn } = require('child_process');
      
      // Use ffmpeg to record from BLACKHOLE with MAXIMUM QUALITY
      const ffmpegProcess = spawn('ffmpeg', [
        '-f', 'avfoundation',           // macOS audio foundation
        '-i', ':BlackHole 2ch',         // Specifically target BLACKHOLE 2ch device
        '-acodec', 'pcm_s32le',         // 32-bit PCM (highest quality)
        '-ar', '192000',                // 192kHz sample rate (professional quality)
        '-ac', '2',                     // 2 channels (stereo)
        '-t', '30',                     // Max 30 seconds
        '-af', 'highpass=f=20,lowpass=f=20000', // Clean frequency response
        '-y',                           // Overwrite output
        audioPath
      ]);
      
      session.ffmpegProcess = ffmpegProcess;
      
      ffmpegProcess.on('error', (err: Error) => {
        console.error(`[FFmpeg Recording] Error:`, err);
        const mw = this.appState.getMainWindow();
        if (mw && !mw.isDestroyed()) {
          mw.webContents.send("audio-recording-error", { 
            message: `Audio recording failed: ${err.message}` 
          });
        }
      });
      
      // Set a timeout to stop recording after X seconds
      session.stopTimeoutId = setTimeout(() => {
        if (session.ffmpegProcess && !session.ffmpegProcess.killed) {
          session.ffmpegProcess.kill('SIGINT'); // Graceful stop
          console.log(`[FFmpeg Recording] Stopped recording after timeout`);
          
          // Wait a bit for ffmpeg to finish writing, then send completion
          setTimeout(() => {
            const mainWindow = this.appState.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("audio-recording-complete", { path: audioPath });
            }
          }, 1000);
        }
      }, currentRecordingDurationMs);
      
      // Immediate feedback that recording started
      const currentMainWindow = this.appState.getMainWindow();
      if (currentMainWindow && !currentMainWindow.isDestroyed()) {
        currentMainWindow.webContents.send("vad-recording-started");
      }
      
      return; // Skip the old NodeRecordLpcm16 code entirely

      session.recordingInstance.stream()
        .on('data', (chunk: Buffer) => {
          if (!this.vadState[sessionId]) {
            console.log(`[Data Handler] Session ${sessionId} no longer exists. Ignoring chunk.`);
            return;
          }

          session.chunksProcessedCounter++;

          if (session.chunksProcessedCounter <= INITIAL_CHUNKS_TO_SKIP && session.isDetecting) {
            return; 
          }

          const rms = calculateRMS(chunk);

          if (session.isDetecting) {
            if (rms > VAD_RMS_THRESHOLD) {
              console.log(`Sound detected (RMS: ${rms.toFixed(2)} after skipping ${INITIAL_CHUNKS_TO_SKIP} chunks). Starting to save for session ${sessionId}.`);
              session.isDetecting = false;
              session.hasStartedSaving = true;
              if (session.vadWaitTimeoutId) clearTimeout(session.vadWaitTimeoutId);
              session.vadWaitTimeoutId = undefined; 

              session.wavWriterInstance = new WavWriter({
                channels: 2,
                sampleRate: 48000,
                bitDepth: 16
              });
              session.fileStream = fs.createWriteStream(audioPath);
              session.wavWriterInstance.pipe(session.fileStream);
              session.wavWriterInstance.write(chunk);

              const currentMainWindow = this.appState.getMainWindow();
              if (currentMainWindow && !currentMainWindow.isDestroyed()) {
                currentMainWindow.webContents.send("vad-recording-started");
              }

              session.stopTimeoutId = setTimeout(() => {
                if (this.vadState[sessionId]) {
                    console.log(`${currentRecordingDurationMs / 1000}s recording duration reached for session ${sessionId}. Stopping.`);
                    this.cleanupVadSession(sessionId, true);
                } else {
                    console.log(`${currentRecordingDurationMs / 1000}s timer for ${sessionId} fired, but session already cleaned up.`);
                }
              }, currentRecordingDurationMs);
            }
          } else if (session.hasStartedSaving && session.wavWriterInstance) {
            session.wavWriterInstance.write(chunk);
          }
        })
        .on('error', (err: Error) => {
          if (!this.vadState[sessionId]) {
            console.log(`[Error Handler] Session ${sessionId} no longer exists. Ignoring recorder error:`, err.message);
            return;
          }
          console.error(`Recorder error for session ${sessionId}:`, err);
          const mw = this.appState.getMainWindow();
          if (mw && !mw.isDestroyed()) {
            mw.webContents.send("audio-recording-error", { message: err.message });
          }
          this.cleanupVadSession(sessionId, false);
        });

      session.vadWaitTimeoutId = setTimeout(() => {
        if (this.vadState[sessionId] && this.vadState[sessionId].isDetecting) {
          console.log(`VAD timed out for session ${sessionId} after ${VAD_WAIT_TIMEOUT_MS / 1000}s. No sound detected.`);
          const mw = this.appState.getMainWindow();
          if (mw && !mw.isDestroyed()) {
            mw.webContents.send("vad-timeout");
          }
          this.cleanupVadSession(sessionId, false); // Cleanup without sending completion
        }
      }, VAD_WAIT_TIMEOUT_MS);
    });
  }
}
