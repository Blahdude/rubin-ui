"use strict";
// ipcHandlers.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callReplicateMusicGeneration = callReplicateMusicGeneration;
exports.initializeIpcHandlers = initializeIpcHandlers;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path")); // Import path for icon handling if needed later
const fs_1 = __importDefault(require("fs"));
const replicate_1 = __importDefault(require("replicate"));
const dotenv_1 = __importDefault(require("dotenv"));
const https_1 = __importDefault(require("https")); // For downloading
const child_process_1 = require("child_process"); // For calling ffmpeg
const child_process_2 = require("child_process"); // For calling python script
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
// Renamed function, inputFilePath is now optional
async function callReplicateMusicGeneration(promptText, inputFilePath, durationSeconds = 8) {
    console.log(`[Replicate] callReplicateMusicGeneration. Prompt: "${promptText}". InputFile: ${inputFilePath || 'N/A'}'. Duration: ${durationSeconds}s`);
    // Helper function to sanitize prompt text for use as a filename
    function sanitizePromptForFilename(prompt, maxLength = 50) {
        if (!prompt) {
            return "generated_audio";
        }
        // Remove characters that are problematic for filenames, replace spaces with underscores
        const sanitized = prompt
            .toLowerCase() // Optional: make it lowercase
            .replace(/[\/?:*"<>|#%&{}\s+]/g, '_') // Replace special chars and spaces with underscore
            .replace(/__+/g, '_') // Replace multiple underscores with single
            .replace(/^_|_$/g, ''); // Trim leading/trailing underscores
        // Truncate to maxLength
        let truncated = sanitized.substring(0, maxLength);
        // Remove trailing underscore if truncation caused it
        if (truncated.endsWith('_')) {
            truncated = truncated.substring(0, truncated.length - 1);
        }
        // Ensure it's not empty after sanitization/truncation
        if (!truncated) {
            return "generated_audio";
        }
        return truncated;
    }
    const replicateApiKey = process.env.REPLICATE_API_KEY;
    if (!replicateApiKey)
        throw new Error("Replicate API key is not configured.");
    const replicate = new replicate_1.default({ auth: replicateApiKey });
    const modelInputs = {
        model_version: "stereo-melody-large", // This is for melody generation, might need "stereo-music-large" for broader music.
        // For true text-to-music, MusicGen models like "stereo-music-large" are usually better.
        // The version hash b05b1... is for melody.
        // Let's try with "stereo-melody-large" first as user suggested it's the same model.
        // If it fails for text-only, we'll need to confirm the right model_version for MusicGen text-to-music.
        prompt: promptText,
        duration: durationSeconds, // Use the duration parameter
        output_format: "wav"
    };
    if (inputFilePath && typeof inputFilePath === 'string' && fs_1.default.existsSync(inputFilePath)) {
        console.log("[Replicate] Operating in CONTINUATION mode.");
        modelInputs.continuation = true;
        modelInputs.continuation_start = 0;
        let inputAudioDurationSeconds;
        try {
            const durationOutput = await new Promise((resolve, reject) => {
                (0, child_process_1.exec)(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`, (err, stdout, stderr) => {
                    if (err) {
                        console.error(`[Replicate] ffprobe stderr: ${stderr}`);
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
            console.error("[Replicate] ffprobe error:", e);
            inputAudioDurationSeconds = undefined;
        }
        modelInputs.continuation_end = Math.round(inputAudioDurationSeconds ? Math.min(inputAudioDurationSeconds, 2.0) : 2.0);
        modelInputs.input_audio = fs_1.default.readFileSync(inputFilePath);
        console.log("[Replicate] Added continuation parameters and input_audio.");
    }
    else {
        console.log("[Replicate] Operating in TEXT-TO-MUSIC (from scratch) mode.");
        // For text-to-music, ensure no continuation flags are sent if the model doesn't expect them or if they default incorrectly.
        // modelInputs.continuation = false; // Explicitly set if needed, or remove if model handles absence correctly.
    }
    console.log("[Replicate] Calling Replicate API with inputs:", { ...modelInputs, input_audio: modelInputs.input_audio ? `<Buffer for ${inputFilePath}>` : 'N/A' });
    const prediction = await replicate.predictions.create({
        version: "b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38", // This is facebookresearch/musicgen:stereo-melody-large
        input: modelInputs,
    });
    if (prediction.error)
        throw new Error(`Replicate prediction error: ${prediction.error}`);
    console.log(`[Replicate] Prediction started. ID: ${prediction.id}, Status: ${prediction.status}`);
    let finalPrediction = prediction;
    while (finalPrediction.status !== "succeeded" && finalPrediction.status !== "failed" && finalPrediction.status !== "canceled") {
        await new Promise(resolve => setTimeout(resolve, 2500));
        finalPrediction = await replicate.predictions.get(prediction.id);
        console.log(`[Replicate] Polling prediction: ${finalPrediction.id}, Status: ${finalPrediction.status}`);
    }
    if (finalPrediction.status === "succeeded") {
        const outputUrl = finalPrediction.output;
        console.log(`[Replicate] Prediction succeeded. Output URL: ${outputUrl}`);
        const baseName = inputFilePath
            ? path_1.default.basename(inputFilePath, path_1.default.extname(inputFilePath))
            : sanitizePromptForFilename(promptText);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFileName = `${baseName}_${inputFilePath ? 'cont' : 'gen'}_${timestamp}.wav`;
        const projectRootRecordingsDir = path_1.default.resolve(process.cwd(), "local_recordings");
        const generatedDirInProjectRoot = path_1.default.join(projectRootRecordingsDir, "generated");
        if (!fs_1.default.existsSync(generatedDirInProjectRoot))
            fs_1.default.mkdirSync(generatedDirInProjectRoot, { recursive: true });
        const localOutputPath = path_1.default.join(generatedDirInProjectRoot, outputFileName);
        await new Promise((resolve, reject) => {
            const file = fs_1.default.createWriteStream(localOutputPath);
            https_1.default.get(outputUrl, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                    return;
                }
                response.pipe(file);
                file.on("finish", () => { file.close(); resolve(); });
            }).on("error", (err) => { fs_1.default.unlink(localOutputPath, () => { }); reject(err); });
        });
        let audioFeatures = { bpm: "N/A", key: "N/A" };
        try {
            const pythonProcess = (0, child_process_2.spawn)("python", [path_1.default.resolve(process.cwd(), "extract_audio_features.py"), localOutputPath]);
            let scriptOutput = "";
            let scriptError = "";
            pythonProcess.stdout.on("data", (data) => scriptOutput += data.toString());
            pythonProcess.stderr.on("data", (data) => scriptError += data.toString());
            await new Promise((res, rej) => {
                pythonProcess.on("close", (code) => {
                    if (code === 0) {
                        try {
                            audioFeatures = JSON.parse(scriptOutput);
                        }
                        catch (e) {
                            console.error("[Replicate] Py parse err:", e, "Out:", scriptOutput);
                        }
                    }
                    else {
                        console.error(`[Replicate] Py script err code ${code}. STDERR: ${scriptError}`);
                    }
                    res();
                });
                pythonProcess.on("error", (err) => { console.error("[Replicate] Py spawn err:", err); res(); });
            });
        }
        catch (pyErr) {
            console.error("[Replicate] Py exec err:", pyErr);
        }
        console.log("[Replicate] callReplicateMusicGeneration returning:", { generatedPath: localOutputPath, features: audioFeatures, displayName: baseName, originalPromptText: promptText });
        return { generatedPath: localOutputPath, features: audioFeatures, displayName: baseName, originalPromptText: promptText };
    }
    else {
        throw new Error(`Music generation failed: ${finalPrediction.error || finalPrediction.status}`);
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
            // Optionally, you could try to drag without a custom icon as a fallback,
            // but given the previous errors, it might be better to just log and not drag.
            // For example, to try with the potentially problematic empty string icon path:
            // event.sender.startDrag({ file: filePath, icon: '' });
        }
    });
    // Renamed IPC Handler, inputFilePath is now optional
    electron_1.ipcMain.handle("generate-music", // Renamed from generate-music-continuation
    async (event, promptText, inputFilePath, durationSeconds) => {
        return callReplicateMusicGeneration(promptText, inputFilePath, durationSeconds);
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
    // ADDED IPC Handler for user follow-up responses
    electron_1.ipcMain.handle("user-response-to-ai", async (_event, userText) => {
        if (!appState)
            return { success: false, error: "AppState not initialized" };
        try {
            await appState.processingHelper.processUserText(userText);
            return { success: true };
        }
        catch (error) {
            console.error("Failed to process user text input via IPC:", error);
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
}
//# sourceMappingURL=ipcHandlers.js.map