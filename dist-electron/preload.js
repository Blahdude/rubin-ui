"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROCESSING_EVENTS = void 0;
const electron_1 = require("electron");
exports.PROCESSING_EVENTS = {
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
    DEBUG_ERROR: "debug-error"
};
// Expose the Electron API to the renderer process
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    updateContentDimensions: (dimensions) => electron_1.ipcRenderer.invoke("update-content-dimensions", dimensions),
    takeScreenshot: () => electron_1.ipcRenderer.invoke("take-screenshot"),
    getScreenshots: () => electron_1.ipcRenderer.invoke("get-screenshots"),
    deleteScreenshot: (path) => electron_1.ipcRenderer.invoke("delete-screenshot", path),
    // Event listeners
    onScreenshotTaken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("screenshot-taken", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("screenshot-taken", subscription);
        };
    },
    onSolutionsReady: (callback) => {
        const subscription = (_, solutions) => callback(solutions);
        electron_1.ipcRenderer.on("solutions-ready", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("solutions-ready", subscription);
        };
    },
    onResetView: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("reset-view", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("reset-view", subscription);
        };
    },
    onScreenshotLimitReached: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("screenshot-limit-reached", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("screenshot-limit-reached", subscription);
        };
    },
    onSolutionStart: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.INITIAL_START, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.INITIAL_START, subscription);
        };
    },
    onDebugStart: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.DEBUG_START, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.DEBUG_START, subscription);
        };
    },
    onDebugSuccess: (callback) => {
        const subscription = (_event, data) => callback(data);
        electron_1.ipcRenderer.on("debug-success", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("debug-success", subscription);
        };
    },
    onDebugError: (callback) => {
        const subscription = (_, error) => callback(error);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.DEBUG_ERROR, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.DEBUG_ERROR, subscription);
        };
    },
    onSolutionError: (callback) => {
        const subscription = (_, error) => callback(error);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription);
        };
    },
    onProcessingNoScreenshots: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.NO_SCREENSHOTS, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.NO_SCREENSHOTS, subscription);
        };
    },
    onProblemExtracted: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription);
        };
    },
    onSolutionSuccess: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription);
        };
    },
    onAudioRecordingComplete: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("audio-recording-complete", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("audio-recording-complete", subscription);
        };
    },
    onAudioRecordingError: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("audio-recording-error", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("audio-recording-error", subscription);
        };
    },
    onVadWaiting: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("vad-waiting", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("vad-waiting", subscription);
        };
    },
    onVadRecordingStarted: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("vad-recording-started", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("vad-recording-started", subscription);
        };
    },
    onVadTimeout: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("vad-timeout", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("vad-timeout", subscription);
        };
    },
    onUnauthorized: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.UNAUTHORIZED, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.UNAUTHORIZED, subscription);
        };
    },
    moveWindowLeft: () => electron_1.ipcRenderer.invoke("move-window-left"),
    moveWindowRight: () => electron_1.ipcRenderer.invoke("move-window-right"),
    analyzeAudioFromBase64: (data, mimeType) => electron_1.ipcRenderer.invoke("analyze-audio-base64", data, mimeType),
    analyzeAudioFile: (path) => electron_1.ipcRenderer.invoke("analyze-audio-file", path),
    analyzeImageFile: (path) => electron_1.ipcRenderer.invoke("analyze-image-file", path),
    quitApp: () => electron_1.ipcRenderer.invoke("quit-app"),
    startFileDrag: (filePath) => {
        electron_1.ipcRenderer.send("ondragstart-file", filePath);
    },
    generateMusic: (operationId, promptText, inputFilePath, durationSeconds) => electron_1.ipcRenderer.invoke("generate-music", operationId, promptText, inputFilePath, durationSeconds),
    generateMusicFromRecording: (operationId, promptText, inputFilePath, durationSeconds) => electron_1.ipcRenderer.invoke("generate-music-from-recording", operationId, promptText, inputFilePath, durationSeconds),
    generateMusicFromText: (operationId, promptText, durationSeconds) => electron_1.ipcRenderer.invoke("generate-music-from-text", operationId, promptText, durationSeconds),
    cancelMusicGeneration: (operationId) => electron_1.ipcRenderer.invoke("cancel-music-generation", operationId),
    notifyGeneratedAudioReady: (generatedUrl, originalPath, features, displayName, originalPromptText) => {
        electron_1.ipcRenderer.send("notify-generated-audio-ready", { generatedUrl, originalPath, features, displayName, originalPromptText });
    },
    onGeneratedAudioReady: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on("generated-audio-ready", handler);
        return () => electron_1.ipcRenderer.removeListener("generated-audio-ready", handler);
    },
    userResponseToAi: (userText, screenshots) => electron_1.ipcRenderer.invoke("user-response-to-ai", userText, screenshots),
    cancelQuery: () => electron_1.ipcRenderer.invoke("cancel-query"),
    onFollowUpSuccess: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on("follow-up-success", handler);
        return () => {
            electron_1.ipcRenderer.removeListener("follow-up-success", handler);
        };
    },
    onFollowUpError: (callback) => {
        const handler = (_event, error) => callback(error);
        electron_1.ipcRenderer.on("follow-up-error", handler);
        return () => {
            electron_1.ipcRenderer.removeListener("follow-up-error", handler);
        };
    },
    startNewChat: () => electron_1.ipcRenderer.invoke("start-new-chat"),
    onChatUpdated: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on("chat-updated", handler);
        return () => electron_1.ipcRenderer.removeListener("chat-updated", handler);
    },
    onScreenshotQueueCleared: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("screenshot-queue-cleared", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("screenshot-queue-cleared", subscription);
        };
    },
    setRecordingDuration: (durationSeconds) => {
        electron_1.ipcRenderer.send("set-recording-duration", durationSeconds);
    },
    setUiPreferredGenerationDuration: (durationSeconds) => {
        electron_1.ipcRenderer.send("set-ui-preferred-generation-duration", durationSeconds);
    },
    // Local recordings management
    getLocalRecordings: () => electron_1.ipcRenderer.invoke("get-local-recordings"),
    cleanupOldLocalRecordings: () => electron_1.ipcRenderer.invoke("cleanup-old-local-recordings"),
    deleteLocalRecording: (filePath) => electron_1.ipcRenderer.invoke("delete-local-recording", filePath),
    getFileAsBuffer: (filePath) => electron_1.ipcRenderer.invoke("get-file-as-buffer", filePath),
    // LLM and other functionalities
    invokeLLM: (prompt) => electron_1.ipcRenderer.invoke("invoke-llm", prompt)
});
//# sourceMappingURL=preload.js.map