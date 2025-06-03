"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShortcutsHelper = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const NodeRecordLpcm16 = require("node-record-lpcm16"); // Use require for CommonJS
class ShortcutsHelper {
    appState;
    constructor(appState) {
        this.appState = appState;
    }
    registerGlobalShortcuts() {
        electron_1.globalShortcut.register("CommandOrControl+H", async () => {
            const mainWindow = this.appState.getMainWindow();
            if (mainWindow) {
                console.log("Taking screenshot...");
                try {
                    const screenshotPath = await this.appState.takeScreenshot();
                    const preview = await this.appState.getImagePreview(screenshotPath);
                    mainWindow.webContents.send("screenshot-taken", {
                        path: screenshotPath,
                        preview
                    });
                }
                catch (error) {
                    console.error("Error capturing screenshot:", error);
                }
            }
        });
        electron_1.globalShortcut.register("CommandOrControl+Enter", async () => {
            await this.appState.processingHelper.processScreenshots();
        });
        electron_1.globalShortcut.register("CommandOrControl+R", () => {
            console.log("Command + R pressed. Canceling requests and resetting queues...");
            // Cancel ongoing API requests
            this.appState.processingHelper.cancelOngoingRequests();
            // Clear both screenshot queues
            this.appState.clearQueues();
            console.log("Cleared queues.");
            // Update the view state to 'queue'
            this.appState.setView("queue");
            // Notify renderer process to switch view to 'queue'
            const mainWindow = this.appState.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("reset-view");
            }
        });
        // New shortcuts for moving the window
        electron_1.globalShortcut.register("CommandOrControl+Left", () => {
            console.log("Command/Ctrl + Left pressed. Moving window left.");
            this.appState.moveWindowLeft();
        });
        electron_1.globalShortcut.register("CommandOrControl+Right", () => {
            console.log("Command/Ctrl + Right pressed. Moving window right.");
            this.appState.moveWindowRight();
        });
        electron_1.globalShortcut.register("CommandOrControl+Down", () => {
            console.log("Command/Ctrl + down pressed. Moving window down.");
            this.appState.moveWindowDown();
        });
        electron_1.globalShortcut.register("CommandOrControl+Up", () => {
            console.log("Command/Ctrl + Up pressed. Moving window Up.");
            this.appState.moveWindowUp();
        });
        electron_1.globalShortcut.register("CommandOrControl+B", () => {
            this.appState.toggleMainWindow();
            // If window exists and we're showing it, bring it to front
            const mainWindow = this.appState.getMainWindow();
            if (mainWindow && !this.appState.isVisible()) {
                // Force the window to the front on macOS
                if (process.platform === "darwin") {
                    mainWindow.setAlwaysOnTop(true, "normal");
                    // Reset alwaysOnTop after a brief delay
                    setTimeout(() => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.setAlwaysOnTop(true, "floating");
                        }
                    }, 100);
                }
            }
        });
        // Unregister shortcuts when quitting
        electron_1.app.on("will-quit", () => {
            electron_1.globalShortcut.unregisterAll();
        });
    }
    registerAudioShortcut() {
        electron_1.globalShortcut.register("Command+;", () => {
            console.log("Command+; pressed. Starting audio recording...");
            // const { record } = await import("node-record-lpcm16-ts") // Removed dynamic import
            // Changed audio directory to be local to the project root
            const audioDir = path_1.default.join(electron_1.app.getAppPath(), "local_recordings");
            if (!fs_1.default.existsSync(audioDir)) {
                fs_1.default.mkdirSync(audioDir, { recursive: true });
            }
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const audioPath = path_1.default.join(audioDir, `recording-${timestamp}.wav`);
            const file = fs_1.default.createWriteStream(audioPath, { encoding: "binary" });
            const recording = NodeRecordLpcm16.record({
                sampleRate: 16000,
                channels: 1,
                recorder: "sox",
                device: "BlackHole 2ch"
            });
            recording.stream().pipe(file);
            console.log(`Recording started. Saving to: ${audioPath}`);
            setTimeout(() => {
                recording.stop();
                console.log("Recording stopped.");
                file.end(() => {
                    console.log(`Audio saved: ${audioPath}`);
                    const mainWindow = this.appState.getMainWindow();
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send("audio-recording-complete", { path: audioPath });
                    }
                });
            }, 10000); // Record for 10 seconds
            recording.stream().on("error", (err) => {
                console.error("Recorder error:", err);
                const mainWindow = this.appState.getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send("audio-recording-error", { message: err.message });
                }
            });
        });
    }
}
exports.ShortcutsHelper = ShortcutsHelper;
//# sourceMappingURL=shortcuts.js.map