"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppState = void 0;
const electron_1 = require("electron");
const ipcHandlers_1 = require("./ipcHandlers");
const WindowHelper_1 = require("./WindowHelper");
const ScreenshotHelper_1 = require("./ScreenshotHelper");
const shortcuts_1 = require("./shortcuts");
const ProcessingHelper_1 = require("./ProcessingHelper");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const dotenv_1 = __importDefault(require("dotenv"));
const os_1 = __importDefault(require("os"));
// Load environment variables - handle both development and packaged app
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
if (isDev) {
    // Point userData to a temporary directory for development to avoid session conflicts
    const tempUserDataPath = node_path_1.default.join(os_1.default.tmpdir(), 'RubinDev');
    electron_1.app.setPath('userData', tempUserDataPath);
    // Development: load from root .env
    dotenv_1.default.config();
}
else {
    // Production: load from Resources/.env
    const envPath = node_path_1.default.join(process.resourcesPath, '.env');
    if (node_fs_1.default.existsSync(envPath)) {
        dotenv_1.default.config({ path: envPath });
    }
    else {
        console.warn('Environment file not found in packaged app:', envPath);
    }
}
class AppState {
    static instance = null;
    windowHelper;
    screenshotHelper;
    shortcutsHelper;
    processingHelper;
    // View management
    view = "queue";
    problemInfo = null; // Allow null
    hasDebugged = false;
    lastAiResponse = null; // Will be superseded by conversationHistory
    conversationHistory = []; // ADDED
    // Processing events
    PROCESSING_EVENTS = {
        //global states
        UNAUTHORIZED: "procesing-unauthorized",
        NO_SCREENSHOTS: "processing-no-screenshots",
        //states for generating the initial solution
        INITIAL_START: "initial-start",
        PROBLEM_EXTRACTED: "problem-extracted",
        SOLUTION_SUCCESS: "solution-success",
        INITIAL_SOLUTION_ERROR: "solution-error",
        //states for processing the debugging
        DEBUG_START: "debug-start",
        DEBUG_SUCCESS: "debug-success",
        DEBUG_ERROR: "debug-error",
        // ADDED for follow-up
        FOLLOW_UP_SUCCESS: "follow-up-success", // To be replaced
        FOLLOW_UP_ERROR: "follow-up-error", // To be replaced
        CHAT_UPDATED: "chat-updated" // ADDED - for new AI messages in chat
    };
    constructor() {
        // Initialize WindowHelper with this
        this.windowHelper = new WindowHelper_1.WindowHelper(this);
        // Initialize ScreenshotHelper
        this.screenshotHelper = new ScreenshotHelper_1.ScreenshotHelper(this.view);
        // Initialize ProcessingHelper
        this.processingHelper = new ProcessingHelper_1.ProcessingHelper(this);
        // Initialize ShortcutsHelper
        this.shortcutsHelper = new shortcuts_1.ShortcutsHelper(this);
    }
    static getInstance() {
        if (!AppState.instance) {
            AppState.instance = new AppState();
        }
        return AppState.instance;
    }
    // Getters and Setters
    getMainWindow() {
        return this.windowHelper.getMainWindow();
    }
    getView() {
        return this.view;
    }
    setView(view) {
        this.view = view;
        this.screenshotHelper.setView(view);
    }
    isVisible() {
        return this.windowHelper.isVisible();
    }
    getScreenshotHelper() {
        return this.screenshotHelper;
    }
    getProblemInfo() {
        return this.problemInfo;
    }
    setProblemInfo(problemInfo) {
        this.problemInfo = problemInfo;
    }
    getScreenshotQueue() {
        return this.screenshotHelper.getScreenshotQueue();
    }
    getExtraScreenshotQueue() {
        return this.screenshotHelper.getExtraScreenshotQueue();
    }
    // ADDED: Method to get all screenshots (paths) for the shortcut handler check
    getScreenshots() {
        const mainPaths = this.screenshotHelper.getScreenshotQueue().map(p => ({ path: p }));
        const extraPaths = this.screenshotHelper.getExtraScreenshotQueue().map(p => ({ path: p }));
        return [...mainPaths, ...extraPaths];
    }
    // Window management methods
    createWindow() {
        this.windowHelper.createWindow();
    }
    hideMainWindow() {
        this.windowHelper.hideMainWindow();
    }
    showMainWindow() {
        this.windowHelper.showMainWindow();
    }
    toggleMainWindow() {
        console.log("Screenshots: ", this.screenshotHelper.getScreenshotQueue().length, "Extra screenshots: ", this.screenshotHelper.getExtraScreenshotQueue().length);
        this.windowHelper.toggleMainWindow();
    }
    setWindowDimensions(width, height) {
        this.windowHelper.setWindowDimensions(width, height);
    }
    async clearQueues() {
        await this.screenshotHelper.clearQueues();
        // Clear problem info
        this.problemInfo = null;
        // Reset view to initial state
        this.setView("queue");
    }
    // Screenshot management methods
    async takeScreenshot() {
        return this.screenshotHelper.takeScreenshot(() => this.hideMainWindow(), () => this.showMainWindow());
    }
    async getImagePreview(filepath) {
        return this.screenshotHelper.getImagePreview(filepath);
    }
    async deleteScreenshot(path) {
        return this.screenshotHelper.deleteScreenshot(path);
    }
    // New methods to move the window
    moveWindowLeft() {
        this.windowHelper.moveWindowLeft();
    }
    moveWindowRight() {
        this.windowHelper.moveWindowRight();
    }
    moveWindowDown() {
        this.windowHelper.moveWindowDown();
    }
    moveWindowUp() {
        this.windowHelper.moveWindowUp();
    }
    setHasDebugged(value) {
        this.hasDebugged = value;
    }
    getHasDebugged() {
        return this.hasDebugged;
    }
    // ADDED getter and setter for lastAiResponse
    getLastAiResponse() {
        return this.lastAiResponse;
    }
    setLastAiResponse(response) {
        this.lastAiResponse = response;
    }
    // ADDED Conversation History Methods
    getConversationHistory() {
        return this.conversationHistory;
    }
    addToConversationHistory(item) {
        this.conversationHistory.push(item);
        // Optionally, could emit CHAT_UPDATED here if AppState manages UI updates directly
        // For now, ProcessingHelper will explicitly send the event with the new AI message.
    }
    clearConversationHistory() {
        this.conversationHistory = [];
        this.lastAiResponse = null; // Also clear the old single response state
        // Optionally, emit CHAT_UPDATED here with an empty history or initial message
    }
}
exports.AppState = AppState;
// Application initialization
async function initializeApp() {
    const gotTheLock = electron_1.app.requestSingleInstanceLock();
    if (!gotTheLock) {
        electron_1.app.quit();
        return;
    }
    electron_1.app.on("second-instance", (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        const appState = AppState.getInstance();
        const mainWindow = appState.getMainWindow();
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
    const appState = AppState.getInstance();
    // Initialize IPC handlers before window creation
    (0, ipcHandlers_1.initializeIpcHandlers)(appState);
    electron_1.app.whenReady().then(() => {
        appState.createWindow();
        console.log("App is ready");
        // Register custom protocol for local audio files
        electron_1.protocol.registerFileProtocol("clp", (request, callback) => {
            console.log(`[CLP Protocol] Received request for URL: ${request.url}`);
            let rawPath = request.url.slice("clp://".length);
            // Check if the path is a full URL (like from Firebase Storage)
            if (rawPath.startsWith('https://') || rawPath.startsWith('http://')) {
                // For remote URLs, we can't use `callback({ path })`.
                // The renderer should be updated to not use `clp://` for remote URLs.
                // As a temporary measure, we will return an error to prevent a crash.
                console.warn(`[CLP Protocol] Attempting to load a remote URL (${rawPath}) via the 'clp' protocol. This should be handled in the renderer.`);
                callback({ error: -6 }); // -6 is net::ERR_FILE_NOT_FOUND
                return;
            }
            let decodedPath;
            try {
                decodedPath = decodeURIComponent(rawPath);
            }
            catch (e) {
                console.error(`[CLP Protocol] Error decoding URI component for path: ${rawPath}`, e);
                return callback({ error: -2 }); // Consider a more specific error code if available
            }
            console.log(`[CLP Protocol] Decoded path: ${decodedPath}`);
            let finalResolvedPath;
            if (node_path_1.default.isAbsolute(decodedPath)) {
                finalResolvedPath = decodedPath;
                console.log(`[CLP Protocol] Path is absolute: ${finalResolvedPath}`);
            }
            else {
                // If path is relative, resolve it from the app's root directory.
                // app.getAppPath() points to the app root in dev, and resources/app(.asar) in prod.
                finalResolvedPath = node_path_1.default.join(electron_1.app.getAppPath(), decodedPath);
                console.log(`[CLP Protocol] Path is relative. Resolved from app root to: ${finalResolvedPath}`);
            }
            // IMPORTANT: Add security checks here if necessary!
            // For example, ensure the path is within an allowed directory.
            try {
                const fileExists = node_fs_1.default.existsSync(finalResolvedPath);
                console.log(`[CLP Protocol] Checking existence of (final path): ${finalResolvedPath}. Exists: ${fileExists}`);
                if (fileExists) {
                    callback({ path: finalResolvedPath });
                }
                else {
                    console.error(`[CLP Protocol] File not found (final path): ${finalResolvedPath}`);
                    callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
                }
            }
            catch (error) {
                console.error(`[CLP Protocol] Error accessing file ${finalResolvedPath}:`, error);
                callback({ error: -2 }); // net::ERR_FAILED or a more specific error
            }
        });
        appState.shortcutsHelper.registerGlobalShortcuts();
        appState.shortcutsHelper.registerAudioShortcut();
    });
    electron_1.app.on("activate", () => {
        console.log("App activated");
        if (appState.getMainWindow() === null) {
            appState.createWindow();
        }
    });
    // Quit when all windows are closed, except on macOS
    electron_1.app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            electron_1.app.quit();
        }
    });
    electron_1.app.dock?.hide(); // Hide dock icon for overlay app
    electron_1.app.commandLine.appendSwitch("disable-background-timer-throttling");
}
// Start the application
initializeApp().catch(console.error);
//# sourceMappingURL=main.js.map