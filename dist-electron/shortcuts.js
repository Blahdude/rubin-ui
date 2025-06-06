"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShortcutsHelper = void 0;
exports.setRecordingDuration = setRecordingDuration;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const wav_1 = require("wav");
const child_process_1 = require("child_process");
const node_record_lpcm16_1 = __importDefault(require("node-record-lpcm16"));
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
function calculateRMS(pcmData) {
    if (pcmData.length === 0)
        return 0;
    let sumSquares = 0;
    for (let i = 0; i < pcmData.length; i += 2) {
        const sample = pcmData.readInt16LE(i);
        sumSquares += (sample * sample);
    }
    return Math.sqrt(sumSquares / (pcmData.length / 2));
}
function setRecordingDuration(durationSeconds) {
    console.log(`[Shortcuts] Setting recording duration to ${durationSeconds} seconds.`);
    currentRecordingDurationMs = durationSeconds * 1000;
}
class ShortcutsHelper {
    appState;
    vadState = {};
    constructor(appState) {
        this.appState = appState;
    }
    registerGlobalShortcuts() {
        electron_1.globalShortcut.register("CommandOrControl+Enter", async () => {
            console.log("'Solve' (CommandOrControl+Enter) triggered.");
            const mainWindow = this.appState.getMainWindow();
            let screenshotTakenSuccessfully = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                try {
                    const screenshotPath = await this.appState.takeScreenshot();
                    if (screenshotPath) {
                        const preview = await this.appState.getImagePreview(screenshotPath);
                        mainWindow.webContents.send("screenshot-taken", { path: screenshotPath, preview });
                        screenshotTakenSuccessfully = true;
                    }
                }
                catch (error) {
                    console.error("Error auto-capturing screenshot for 'Solve':", error);
                }
            }
            if (this.appState.getScreenshots().length > 0 || screenshotTakenSuccessfully) {
                await this.appState.processingHelper.processScreenshots();
            }
            else if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("processing-no-screenshots");
            }
        });
        electron_1.globalShortcut.register("CommandOrControl+R", () => {
            console.log("Command + R pressed. Canceling requests and resetting queues...");
            this.appState.processingHelper.cancelOngoingRequests();
            this.appState.clearQueues();
            this.appState.setView("queue");
            const mainWindow = this.appState.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("reset-view");
            }
        });
        electron_1.globalShortcut.register("CommandOrControl+Left", () => this.appState.moveWindowLeft());
        electron_1.globalShortcut.register("CommandOrControl+Right", () => this.appState.moveWindowRight());
        electron_1.globalShortcut.register("CommandOrControl+Down", () => this.appState.moveWindowDown());
        electron_1.globalShortcut.register("CommandOrControl+Up", () => this.appState.moveWindowUp());
        electron_1.globalShortcut.register("CommandOrControl+B", () => {
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
        electron_1.app.on("will-quit", () => {
            electron_1.globalShortcut.unregisterAll();
            Object.keys(this.vadState).forEach(key => this.cleanupVadSession(key, false));
        });
    }
    async trimAudioWithSox(filePath) {
        return new Promise((resolve) => {
            (0, child_process_1.exec)('which sox', (whichError) => {
                if (whichError) {
                    resolve(filePath);
                    return;
                }
                const trimmedPath = filePath.replace(".wav", "-trimmed.wav");
                const soxCommand = `sox "${filePath}" "${trimmedPath}" silence 1 ${SOX_SILENCE_DURATION} ${SOX_SILENCE_THRESHOLD} reverse silence 1 ${SOX_SILENCE_DURATION} ${SOX_SILENCE_THRESHOLD} reverse`;
                (0, child_process_1.exec)(soxCommand, (error) => {
                    if (error) {
                        if (fs_1.default.existsSync(trimmedPath))
                            fs_1.default.unlinkSync(trimmedPath);
                        resolve(filePath);
                        return;
                    }
                    fs_1.default.unlinkSync(filePath);
                    fs_1.default.renameSync(trimmedPath, filePath);
                    resolve(filePath);
                });
            });
        });
    }
    cleanupVadSession(sessionId, sendCompleteMessage = true) {
        const session = this.vadState[sessionId];
        if (!session)
            return;
        if (session.vadWaitTimeoutId)
            clearTimeout(session.vadWaitTimeoutId);
        if (session.stopTimeoutId)
            clearTimeout(session.stopTimeoutId);
        if (session.recordingInstance)
            session.recordingInstance.stop();
        if (session.wavWriterInstance) {
            session.wavWriterInstance.end();
        }
        else if (session.fileStream) {
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
                }
                else if (!session.hasStartedSaving && fs_1.default.existsSync(session.audioPath)) {
                    fs_1.default.unlinkSync(session.audioPath);
                }
            });
        }
        delete this.vadState[sessionId];
    }
    registerAudioShortcut() {
        electron_1.globalShortcut.register("Command+;", () => {
            if (Object.keys(this.vadState).length > 0) {
                const activeSessionId = Object.keys(this.vadState)[0];
                this.cleanupVadSession(activeSessionId, true);
                return;
            }
            const sessionId = `vad-session-${Date.now()}`;
            const mainWindow = this.appState.getMainWindow();
            if (mainWindow)
                mainWindow.webContents.send("vad-waiting");
            const audioDir = path_1.default.join(electron_1.app.getPath('userData'), "local_recordings");
            if (!fs_1.default.existsSync(audioDir))
                fs_1.default.mkdirSync(audioDir, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const audioPath = path_1.default.join(audioDir, `recording-${timestamp}.wav`);
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
            session.recordingInstance = node_record_lpcm16_1.default.record({
                sampleRate: 48000,
                channels: 2,
                bitDepth: 16,
                recorder: "sox",
                device: AUDIO_DEVICE_NAME, // Explicitly target the device
            });
            session.recordingInstance.stream()
                .on('data', (chunk) => {
                if (!this.vadState[sessionId])
                    return;
                session.chunksProcessedCounter++;
                if (session.chunksProcessedCounter <= INITIAL_CHUNKS_TO_SKIP && session.isDetecting)
                    return;
                const rms = calculateRMS(chunk);
                if (session.isDetecting && rms > VAD_RMS_THRESHOLD) {
                    session.isDetecting = false;
                    session.hasStartedSaving = true;
                    if (session.vadWaitTimeoutId)
                        clearTimeout(session.vadWaitTimeoutId);
                    session.wavWriterInstance = new wav_1.Writer({ channels: 2, sampleRate: 48000, bitDepth: 16 });
                    session.fileStream = fs_1.default.createWriteStream(audioPath);
                    session.wavWriterInstance.pipe(session.fileStream);
                    session.wavWriterInstance.write(chunk);
                    if (mainWindow)
                        mainWindow.webContents.send("vad-recording-started");
                    session.stopTimeoutId = setTimeout(() => this.cleanupVadSession(sessionId, true), currentRecordingDurationMs);
                }
                else if (session.hasStartedSaving) {
                    session.wavWriterInstance?.write(chunk);
                }
            })
                .on('error', (err) => {
                console.error(`Recorder error:`, err);
                if (mainWindow)
                    mainWindow.webContents.send("audio-recording-error", { message: err.message });
                this.cleanupVadSession(sessionId, false);
            });
            session.vadWaitTimeoutId = setTimeout(() => {
                if (this.vadState[sessionId]?.isDetecting) {
                    if (mainWindow)
                        mainWindow.webContents.send("vad-timeout");
                    this.cleanupVadSession(sessionId, false);
                }
            }, VAD_WAIT_TIMEOUT_MS);
        });
    }
}
exports.ShortcutsHelper = ShortcutsHelper;
//# sourceMappingURL=shortcuts.js.map