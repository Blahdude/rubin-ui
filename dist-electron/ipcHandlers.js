"use strict";
// ipcHandlers.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callReplicateMusicGeneration = callReplicateMusicGeneration;
exports.cancelSpecificReplicatePrediction = cancelSpecificReplicatePrediction;
exports.initializeIpcHandlers = initializeIpcHandlers;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path")); // Import path for icon handling if needed later
const fs_1 = __importDefault(require("fs"));
const replicate_1 = __importDefault(require("replicate"));
const dotenv_1 = __importDefault(require("dotenv"));
const os_1 = __importDefault(require("os")); // For temp directory
const child_process_1 = require("child_process"); // For calling ffmpeg
// Import the new function from shortcuts.ts
const shortcuts_1 = require("./shortcuts");
// Variable to store the UI preferred generation duration
let uiPreferredGenerationDurationSeconds = 8; // Default value
// Map to store active Replicate prediction IDs associated with an operation ID
const activeReplicatePredictions = new Map(); // operationId -> predictionId
// Load environment variables from .env file
// Consider DX: for development, process.cwd() might be better if .env is in project root
// and app.getAppPath() points deeper into electron build folders.
// For packaged app, app.getAppPath() would be inside the package.
const envPath = electron_1.app.isPackaged ? path_1.default.resolve(process.resourcesPath, '.env') : path_1.default.resolve(process.cwd(), '.env');
if (fs_1.default.existsSync(envPath)) {
    dotenv_1.default.config({ path: envPath });
    console.log(`[IPC Main] Loaded .env from: ${envPath}`);
}
else {
    // Fallback for common dev scenario where app.getAppPath() is project root
    const devEnvPath = path_1.default.resolve(electron_1.app.getAppPath(), '.env');
    if (fs_1.default.existsSync(devEnvPath)) {
        dotenv_1.default.config({ path: devEnvPath });
        console.log(`[IPC Main] Loaded .env from: ${devEnvPath}`);
    }
    else {
        console.warn(`[IPC Main] .env file not found at ${envPath} or ${devEnvPath}. Ensure REPLICATE_API_KEY is set globally or .env is correctly placed.`);
    }
}
// Corrected callReplicateMusicGeneration function
async function callReplicateMusicGeneration(operationId, promptText, inputFilePath, durationFromCaller // This is the UI slider value for "new segment length" in continuation, or desired total length if passed for text-to-music (though usually undefined for text-to-music now)
) {
    let finalApiDuration;
    let originalInputDurationForLog = "N/A";
    if (inputFilePath && typeof inputFilePath === 'string' && fs_1.default.existsSync(inputFilePath)) {
        // CONTINUATION LOGIC
        let knownInputAudioDurationSeconds;
        try {
            const durationOutput = await new Promise((resolve, reject) => {
                (0, child_process_1.exec)(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`, (err, stdout, stderr) => {
                    if (err) {
                        console.error(`[Replicate] ffprobe stderr for op ${operationId}: ${stderr}`);
                        return reject(err);
                    }
                    resolve(stdout.trim());
                });
            });
            knownInputAudioDurationSeconds = parseFloat(durationOutput);
            if (isNaN(knownInputAudioDurationSeconds))
                knownInputAudioDurationSeconds = undefined;
        }
        catch (e) {
            console.error(`[Replicate] ffprobe error for op ${operationId}:`, e);
            knownInputAudioDurationSeconds = undefined;
        }
        originalInputDurationForLog = knownInputAudioDurationSeconds ?? "N/A";
        const newSegmentDuration = durationFromCaller ?? uiPreferredGenerationDurationSeconds; // Length of the part to add
        finalApiDuration = (knownInputAudioDurationSeconds || 0) + newSegmentDuration;
        // Round to nearest integer for the API
        finalApiDuration = Math.round(finalApiDuration);
        console.log(`[Replicate] CONTINUATION for op ${operationId}. Input: ${inputFilePath}, Input Duration: ~${originalInputDurationForLog}s. New Segment Desired: ${newSegmentDuration}s. Rounded Total API Duration: ${finalApiDuration}s.`);
    }
    else {
        // TEXT-TO-MUSIC (FROM SCRATCH) LOGIC
        // durationFromCaller is expected to be undefined here (from ProcessingHelper), so uiPreferredGenerationDurationSeconds is used.
        finalApiDuration = durationFromCaller ?? uiPreferredGenerationDurationSeconds;
        // Ensure it's an integer for text-to-music as well, though it usually will be from the slider.
        finalApiDuration = Math.round(finalApiDuration);
        console.log(`[Replicate] TEXT-TO-MUSIC for op ${operationId}. Prompt: "${promptText}". Effective Total Duration: ${finalApiDuration}s (Caller: ${durationFromCaller}, UI Pref: ${uiPreferredGenerationDurationSeconds})`);
    }
    const replicateApiKey = process.env.REPLICATE_API_KEY;
    if (!replicateApiKey) {
        console.error(`[Replicate] API key not configured for operation ${operationId}.`);
        throw new Error("Replicate API key is not configured.");
    }
    const replicate = new replicate_1.default({ auth: replicateApiKey });
    function sanitizePromptForFilename(prompt, maxLength = 50) {
        if (!prompt) {
            return "generated_audio";
        }
        const sanitized = prompt
            .toLowerCase()
            .replace(/[\/?:*"<>|#%&{}\s+]/g, '_')
            .replace(/__+/g, '_')
            .replace(/^_|_$/g, '');
        let truncated = sanitized.substring(0, maxLength);
        if (truncated.endsWith('_')) {
            truncated = truncated.substring(0, truncated.length - 1);
        }
        if (!truncated) {
            return "generated_audio";
        }
        return truncated;
    }
    const modelInputs = {
        model_version: "stereo-melody-large",
        prompt: promptText,
        duration: finalApiDuration, // Use the calculated final API duration
        output_format: "wav"
    };
    if (inputFilePath && typeof inputFilePath === 'string' && fs_1.default.existsSync(inputFilePath)) {
        console.log(`[Replicate] Operation ${operationId}: Operating in CONTINUATION mode.`);
        modelInputs.continuation = true;
        modelInputs.continuation_start = 0;
        let inputAudioDurationSeconds;
        try {
            const durationOutput = await new Promise((resolve, reject) => {
                (0, child_process_1.exec)(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`, (err, stdout, stderr) => {
                    if (err) {
                        console.error(`[Replicate] ffprobe stderr for op ${operationId}: ${stderr}`);
                        return reject(err);
                    }
                    resolve(stdout.trim());
                });
            });
            inputAudioDurationSeconds = parseFloat(durationOutput);
            if (isNaN(inputAudioDurationSeconds))
                inputAudioDurationSeconds = undefined;
        }
        catch (e) {
            console.error(`[Replicate] ffprobe error for op ${operationId}:`, e);
            inputAudioDurationSeconds = undefined;
        }
        modelInputs.continuation_end = Math.round(inputAudioDurationSeconds ? Math.min(inputAudioDurationSeconds, 2.0) : 2.0);
        modelInputs.input_audio = fs_1.default.readFileSync(inputFilePath);
        console.log(`[Replicate] Operation ${operationId}: Added continuation parameters and input_audio.`);
    }
    else {
        console.log(`[Replicate] Operation ${operationId}: Operating in TEXT-TO-MUSIC (from scratch) mode.`);
    }
    console.log(`[Replicate] Calling Replicate API for operation ${operationId} with inputs:`, { ...modelInputs, input_audio: modelInputs.input_audio ? `<Buffer for ${inputFilePath}>` : 'N/A' });
    let predictionId = null;
    try {
        const prediction = await replicate.predictions.create({
            version: "b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38", // facebookresearch/musicgen:stereo-melody-large
            input: modelInputs,
        });
        if (prediction.error) {
            console.error(`[Replicate] Prediction creation error for operation ${operationId}: ${prediction.error}`);
            throw new Error(`Replicate prediction error: ${prediction.error}`);
        }
        predictionId = prediction.id;
        activeReplicatePredictions.set(operationId, predictionId);
        console.log(`[Replicate] Prediction started for operation ${operationId}. ID: ${predictionId}, Status: ${prediction.status}`);
        let finalPrediction = prediction;
        while (finalPrediction.status !== "succeeded" && finalPrediction.status !== "failed" && finalPrediction.status !== "canceled") {
            await new Promise(resolve => setTimeout(resolve, 2500));
            if (!predictionId) {
                console.error(`[Replicate] Critical error: predictionId is null during polling for operation ${operationId}.`);
                // This should ideally not be reached if prediction creation was successful and predictionId was set.
                throw new Error("Internal error: Prediction ID became null during polling.");
            }
            finalPrediction = await replicate.predictions.get(predictionId);
            console.log(`[Replicate] Polling prediction ${predictionId} (operation ${operationId}): Status: ${finalPrediction.status}`);
        }
        if (finalPrediction.status === "succeeded") {
            const outputUrl = finalPrediction.output;
            console.log(`[Replicate] Prediction ${predictionId} (operation ${operationId}) succeeded. Output URL: ${outputUrl}`);
            console.log("THIS IS THE FINAL ATTEMPT");
            const baseName = inputFilePath
                ? path_1.default.basename(inputFilePath, path_1.default.extname(inputFilePath))
                : sanitizePromptForFilename(promptText);
            return { generatedUrl: outputUrl, features: { bpm: "N/A", key: "N/A" }, displayName: baseName, originalPromptText: promptText };
        }
        else if (finalPrediction.status === "canceled") {
            console.log(`[Replicate] Music generation canceled for operation ${operationId}, prediction ${predictionId}.`);
            throw new Error(`Music generation for operation ${operationId} was canceled.`);
        }
        else { // failed
            console.error(`[Replicate] Music generation failed for operation ${operationId}, prediction ${predictionId}. Status: ${finalPrediction.status}, Error: ${finalPrediction.error}`);
            throw new Error(`Music generation failed for operation ${operationId}: ${finalPrediction.error || finalPrediction.status}`);
        }
    }
    catch (error) {
        console.error(`[Replicate] Overall error in callReplicateMusicGeneration for operation ${operationId} (prediction ${predictionId || 'N/A'}):`, error.message);
        // Ensure the error thrown has a message property, as ProcessingHelper expects it.
        throw (error instanceof Error ? error : new Error(String(error.message || error)));
    }
    finally {
        if (operationId) { // Ensure operationId was provided
            activeReplicatePredictions.delete(operationId);
            console.log(`[Replicate] Cleaned up operation ${operationId} (prediction ${predictionId || 'N/A'}) from active predictions map in finally block.`);
        }
    }
}
async function cancelSpecificReplicatePrediction(operationId) {
    const predictionId = activeReplicatePredictions.get(operationId);
    if (!predictionId) {
        console.warn(`[Replicate] Cancel request for operation ${operationId}, but no active prediction found in map.`);
        return { success: false, message: "No active prediction found for this operation ID to cancel." };
    }
    console.log(`[Replicate] Attempting to cancel Replicate prediction ${predictionId} for operation ${operationId}.`);
    try {
        const replicateApiKey = process.env.REPLICATE_API_KEY;
        if (!replicateApiKey) {
            console.error(`[Replicate] API key not configured for cancellation of op ${operationId}.`);
            throw new Error("Replicate API key is not configured for cancellation.");
        }
        const replicate = new replicate_1.default({ auth: replicateApiKey });
        const cancelResult = await replicate.predictions.cancel(predictionId);
        console.log(`[Replicate] Cancellation API call for prediction ${predictionId} (op ${operationId}) result status: ${cancelResult.status}`);
        // If Replicate's API confirms cancellation, or if the prediction is already in another terminal state.
        if (cancelResult && (cancelResult.status === "canceled" || cancelResult.status === "succeeded" || cancelResult.status === "failed")) {
            activeReplicatePredictions.delete(operationId);
            console.log(`[Replicate] Prediction ${predictionId} (op ${operationId}) is now in terminal state '${cancelResult.status}'. Removed from map.`);
            if (cancelResult.status === "canceled") {
                return { success: true, message: "Music generation task cancelled successfully." };
            }
            else {
                // If it was already succeeded or failed, it's not a "successful cancellation" from user's POV but the operation is over.
                return { success: false, message: `Prediction was already in terminal state: ${cancelResult.status}.` };
            }
        }
        else {
            // This case implies the API call might have succeeded but the status is unexpected, or the call itself had issues not throwing an error.
            console.warn(`[Replicate] Replicate prediction ${predictionId} (op ${operationId}) not definitively terminal after cancel call. Status: ${cancelResult?.status}.`);
            return { success: false, message: `Could not definitively cancel. Prediction status from Replicate: ${cancelResult?.status || 'unknown'}` };
        }
    }
    catch (error) {
        console.error(`[Replicate] Error cancelling Replicate prediction ${predictionId} for operation ${operationId}:`, error);
        // Consider if certain errors from Replicate (e.g., "prediction not found", "already completed") mean we should delete from map.
        // For now, deleting from map only on confirmed terminal states.
        return { success: false, message: `Error during Replicate cancellation: ${error.message}` };
    }
}
function initializeIpcHandlers(appState) {
    electron_1.ipcMain.handle("update-content-dimensions", async (event, { width, height }) => {
        if (width && height) {
            appState.setWindowDimensions(width, height);
        }
    });
    electron_1.ipcMain.handle("delete-screenshot", async (event, path) => {
        return appState.deleteScreenshot(path);
    });
    electron_1.ipcMain.handle("take-screenshot", async () => {
        try {
            const screenshotPath = await appState.takeScreenshot();
            const preview = await appState.getImagePreview(screenshotPath);
            return { path: screenshotPath, preview };
        }
        catch (error) {
            console.error("Error taking screenshot:", error);
            throw error;
        }
    });
    electron_1.ipcMain.handle("get-screenshots", async () => {
        console.log({ view: appState.getView() });
        try {
            let previews = [];
            if (appState.getView() === "queue") {
                previews = await Promise.all(appState.getScreenshotQueue().map(async (path) => ({
                    path,
                    preview: await appState.getImagePreview(path)
                })));
            }
            else {
                previews = await Promise.all(appState.getExtraScreenshotQueue().map(async (path) => ({
                    path,
                    preview: await appState.getImagePreview(path)
                })));
            }
            previews.forEach((preview) => console.log(preview.path));
            return previews;
        }
        catch (error) {
            console.error("Error getting screenshots:", error);
            throw error;
        }
    });
    electron_1.ipcMain.handle("toggle-window", async () => {
        appState.toggleMainWindow();
    });
    electron_1.ipcMain.handle("reset-queues", async () => {
        try {
            appState.clearQueues();
            console.log("Screenshot queues have been cleared.");
            return { success: true };
        }
        catch (error) {
            console.error("Error resetting queues:", error);
            return { success: false, error: error.message };
        }
    });
    // IPC handler for analyzing audio from base64 data
    electron_1.ipcMain.handle("analyze-audio-base64", async (event, data, mimeType) => {
        try {
            const result = await appState.processingHelper.processAudioBase64(data, mimeType);
            return result;
        }
        catch (error) {
            console.error("Error in analyze-audio-base64 handler:", error);
            throw error;
        }
    });
    // IPC handler for analyzing audio from file path
    electron_1.ipcMain.handle("analyze-audio-file", async (event, path) => {
        try {
            const result = await appState.processingHelper.processAudioFile(path);
            return result;
        }
        catch (error) {
            console.error("Error in analyze-audio-file handler:", error);
            throw error;
        }
    });
    // IPC handler for analyzing image from file path
    electron_1.ipcMain.handle("analyze-image-file", async (event, path) => {
        try {
            const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path);
            return result;
        }
        catch (error) {
            console.error("Error in analyze-image-file handler:", error);
            throw error;
        }
    });
    electron_1.ipcMain.handle("quit-app", () => {
        electron_1.app.quit();
    });
    // Handler for starting a file drag operation
    electron_1.ipcMain.on('ondragstart-file', async (event, filePath) => {
        console.log(`[IPC Main] Received ondragstart-file for: ${filePath}`);
        // Check if it's a URL (Firebase Storage) or local file path
        if (filePath.startsWith('https://') || filePath.startsWith('http://')) {
            // Handle Firebase Storage URL by downloading temporarily
            try {
                console.log(`[IPC Main] Downloading Firebase Storage file for drag: ${filePath}`);
                // Create a temporary file path
                const url = new URL(filePath);
                const fileName = path_1.default.basename(url.pathname) || 'audio.wav';
                const tempDir = path_1.default.join(os_1.default.tmpdir(), 'rubin-drag-temp');
                const tempFilePath = path_1.default.join(tempDir, fileName);
                // Ensure temp directory exists
                if (!fs_1.default.existsSync(tempDir)) {
                    fs_1.default.mkdirSync(tempDir, { recursive: true });
                }
                // Download the file to temp location
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(`Failed to download file: ${response.statusText}`);
                }
                const buffer = await response.arrayBuffer();
                fs_1.default.writeFileSync(tempFilePath, Buffer.from(buffer));
                console.log(`[IPC Main] Downloaded to temp file: ${tempFilePath}`);
                // Now drag the temp file
                const icon = await electron_1.app.getFileIcon(tempFilePath);
                event.sender.startDrag({
                    file: tempFilePath,
                    icon: icon
                });
                // Clean up temp file after a delay (give time for drag to complete)
                setTimeout(() => {
                    try {
                        if (fs_1.default.existsSync(tempFilePath)) {
                            fs_1.default.unlinkSync(tempFilePath);
                            console.log(`[IPC Main] Cleaned up temp drag file: ${tempFilePath}`);
                        }
                    }
                    catch (cleanupError) {
                        console.error(`[IPC Main] Failed to clean up temp file: ${tempFilePath}`, cleanupError);
                    }
                }, 30000); // Clean up after 30 seconds
            }
            catch (error) {
                console.error(`[IPC Main] Failed to download and drag Firebase Storage file: ${filePath}`, error);
                return;
            }
        }
        else {
            // Handle local file path (existing logic)
            if (!filePath || !fs_1.default.existsSync(filePath)) {
                console.error(`[IPC Main] Drag failed: File path "${filePath}" is invalid or file does not exist.`);
                return;
            }
            try {
                const icon = await electron_1.app.getFileIcon(filePath);
                event.sender.startDrag({
                    file: filePath,
                    icon: icon
                });
            }
            catch (error) {
                console.error(`[IPC Main] Failed to start drag for ${filePath}:`, error);
            }
        }
    });
    // Renamed IPC Handler, inputFilePath is now optional
    electron_1.ipcMain.handle("generate-music", // Renamed from generate-music-continuation
    async (event, operationId, promptText, inputFilePath, durationSeconds) => {
        if (!operationId) {
            console.error("[IPC Main] generate-music called without an operationId.");
            // Ensure a proper error object is thrown for the renderer to catch
            throw new Error("operationId is required for music generation.");
        }
        console.log(`[IPC Main] Received generate-music request for operationId: ${operationId}`);
        try {
            const result = await callReplicateMusicGeneration(operationId, promptText, inputFilePath, durationSeconds);
            return result;
        }
        catch (error) {
            console.error(`[IPC Main] Error in generate-music handler for operationId ${operationId}:`, error.message);
            // Rethrow so the renderer's .catch() block in ProcessingHelper can handle it
            throw new Error(error.message || "Unknown error during music generation.");
        }
    });
    electron_1.ipcMain.handle("cancel-music-generation", async (event, operationId) => {
        if (!operationId) {
            console.error("[IPC Main] cancel-music-generation called without an operationId.");
            return { success: false, message: "operationId is required for cancellation." };
        }
        console.log(`[IPC Main] Received cancel-music-generation request for operationId: ${operationId}`);
        try {
            const result = await cancelSpecificReplicatePrediction(operationId);
            return result;
        }
        catch (error) { // Catching potential errors from cancelSpecificReplicatePrediction itself
            console.error(`[IPC Main] Error in cancel-music-generation handler for operationId ${operationId}:`, error.message);
            return { success: false, message: error.message || "Unknown error during cancellation task." };
        }
    });
    electron_1.ipcMain.on("notify-generated-audio-ready", (event, data) => {
        console.log(`[IPC Main] Received notify-generated-audio-ready. Data:`, data);
        const mainWindow = appState.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            console.log("[IPC Main] Broadcasting 'generated-audio-ready' to renderer with data:", data);
            mainWindow.webContents.send("generated-audio-ready", data);
        }
        else {
            console.warn("[IPC Main] No main window to send 'generated-audio-ready' event to, or window destroyed.");
        }
    });
    // Handler for user-initiated follow-up responses
    electron_1.ipcMain.handle("user-response-to-ai", async (_, userText, screenshots) => {
        try {
            console.log(`[IPC] Received user response: "${userText}" with ${screenshots?.length || 0} screenshots.`);
            // Use the processing helper to handle the text and screenshots
            await appState.processingHelper.processUserText(userText, screenshots);
            // After processing, clear the main screenshot queue as they've been "used"
            appState.clearQueues();
            // Also notify the frontend that the queue has been cleared
            const mainWindow = appState.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("screenshot-queue-cleared");
            }
            return { success: true };
        }
        catch (error) {
            console.error("[IPC] Error processing user response:", error);
            return { success: false, error: error.message };
        }
    });
    // ADDED: Handler for starting a new chat
    electron_1.ipcMain.handle("start-new-chat", async () => {
        if (!appState)
            return { success: false, error: "AppState not initialized" };
        try {
            await appState.processingHelper.startNewChat();
            return { success: true };
        }
        catch (error) {
            console.error("Failed to start new chat via IPC:", error);
            return { success: false, error: error.message };
        }
    });
    // ADDED: Handler for canceling queries
    electron_1.ipcMain.handle("cancel-query", async () => {
        if (!appState)
            return { success: false, error: "AppState not initialized" };
        try {
            console.log("[IPC] Received cancel-query request");
            appState.processingHelper.cancelOngoingRequests();
            return { success: true };
        }
        catch (error) {
            console.error("Failed to cancel query via IPC:", error);
            return { success: false, error: error.message };
        }
    });
    // ADDED: IPC handler for moving the window to the right
    electron_1.ipcMain.handle("move-window-right", async (event) => {
        try {
            appState.moveWindowRight();
            return { success: true };
        }
        catch (error) {
            console.error("Error moving window right:", error);
            return { success: false, error: error.message };
        }
    });
    // Example of a simple IPC handler (can be removed or modified)
    electron_1.ipcMain.on("simple-message", (event, arg) => {
        console.log("Received simple message:", arg);
        event.reply("simple-message-reply", "Message received!");
    });
    electron_1.ipcMain.on("set-recording-duration", (event, durationSeconds) => {
        if (typeof durationSeconds === 'number' && durationSeconds > 0) {
            (0, shortcuts_1.setRecordingDuration)(durationSeconds);
            console.log(`[IPC Main] Recording duration set to ${durationSeconds}s via IPC.`);
        }
        else {
            console.warn(`[IPC Main] Invalid recording duration received: ${durationSeconds}`);
        }
    });
    electron_1.ipcMain.on("set-ui-preferred-generation-duration", (event, durationSeconds) => {
        if (typeof durationSeconds === 'number' && durationSeconds > 0 && durationSeconds <= 30) { // Max 30s like the slider
            uiPreferredGenerationDurationSeconds = durationSeconds;
            console.log(`[IPC Main] UI Preferred Generation Duration set to ${durationSeconds}s.`);
        }
        else {
            console.warn(`[IPC Main] Invalid UI preferred generation duration received: ${durationSeconds}`);
        }
    });
}
//# sourceMappingURL=ipcHandlers.js.map