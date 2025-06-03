"use strict";
// ipcHandlers.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
    electron_1.ipcMain.handle("generate-music-continuation", async (event, inputFilePath) => {
        console.log(`[IPC Main] ENTERED handleGenerateMusicContinuation for input file: ${inputFilePath}`);
        if (!inputFilePath || typeof inputFilePath !== 'string') {
            console.error("[IPC Main] ERROR: Invalid or missing inputFilePath for music continuation.");
            throw new Error("Invalid input file path for music continuation.");
        }
        const replicateApiKey = process.env.REPLICATE_API_KEY;
        if (!replicateApiKey) {
            console.error("[IPC Main] ERROR: REPLICATE_API_KEY not found in environment variables.");
            throw new Error("Replicate API key is not configured.");
        }
        console.log("[IPC Main] Replicate API key found.");
        try {
            const replicate = new replicate_1.default({
                auth: replicateApiKey,
            });
            console.log("[IPC Main] Replicate client initialized.");
            // Get audio duration using ffmpeg from the original local file
            let inputAudioDurationSeconds;
            console.log(`[IPC Main] Attempting to get duration for: ${inputFilePath} using ffprobe.`);
            try {
                const durationOutput = await new Promise((resolve, reject) => {
                    const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`;
                    console.log(`[IPC Main] Executing ffprobe command: ${command}`);
                    (0, child_process_1.exec)(command, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`[IPC Main] ffprobe stderr: ${stderr}`);
                            return reject(error);
                        }
                        return resolve(stdout.trim());
                    });
                });
                inputAudioDurationSeconds = parseFloat(durationOutput);
                if (isNaN(inputAudioDurationSeconds)) {
                    console.warn(`[IPC Main] WARNING: ffprobe output was not a number: '${durationOutput}'. Using full audio for continuation.`);
                    inputAudioDurationSeconds = undefined;
                }
                else {
                    console.log(`[IPC Main] ffprobe successfully got duration: ${inputAudioDurationSeconds} seconds.`);
                }
            }
            catch (ffmpegError) {
                console.error("[IPC Main] ERROR executing ffprobe to get audio duration:", ffmpegError.message);
                console.warn("[IPC Main] WARNING: Could not determine input audio duration. Proceeding without it, which might affect continuation accuracy.");
                inputAudioDurationSeconds = undefined;
            }
            const continuationEndTime = inputAudioDurationSeconds ? Math.min(inputAudioDurationSeconds, 2.0) : 2.0;
            console.log(`[IPC Main] Determined continuation_end time (float): ${continuationEndTime} seconds.`);
            const continuationEndInteger = Math.round(continuationEndTime);
            console.log(`[IPC Main] Rounded continuation_end time to integer: ${continuationEndInteger} seconds.`);
            // Read the audio file into a buffer for Replicate client to upload
            let audioBuffer;
            try {
                audioBuffer = fs_1.default.readFileSync(inputFilePath);
                console.log(`[IPC Main] Read input audio file into buffer for upload: ${inputFilePath}`);
            }
            catch (readError) {
                console.error(`[IPC Main] ERROR reading input audio file (${inputFilePath}) into buffer:`, readError);
                throw new Error(`Failed to read input audio file: ${readError.message}`);
            }
            const modelInputs = {
                model_version: "stereo-melody-large", // Corrected based on API error
                input_audio: audioBuffer, // Provide buffer; Replicate client should upload and use URL
                prompt: "",
                duration: 4, // Generate 4 additional seconds (user request)
                continuation: true,
                continuation_start: 0,
                continuation_end: continuationEndInteger, // Ensure this is an integer
                output_format: "wav" // Request WAV output
            };
            console.log("[IPC Main] Calling Replicate with inputs:", { ...modelInputs, input_audio: `ReadStream for ${inputFilePath}` });
            // Start prediction
            const prediction = await replicate.predictions.create({
                version: "b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38", // Reverted to specific melody version hash
                input: modelInputs,
            });
            if (prediction.error) {
                console.error("[IPC Main] ERROR from Replicate during prediction creation:", prediction.error);
                throw new Error(`Replicate prediction error: ${prediction.error}`);
            }
            console.log(`[IPC Main] Replicate prediction started. ID: ${prediction.id}, Status: ${prediction.status}`);
            let finalPrediction = prediction;
            while (finalPrediction.status !== "succeeded" && finalPrediction.status !== "failed" && finalPrediction.status !== "canceled") {
                await new Promise(resolve => setTimeout(resolve, 2500)); // Poll every 2.5 seconds
                finalPrediction = await replicate.predictions.get(prediction.id);
                console.log(`[IPC Main] Polling Replicate prediction: ${finalPrediction.id}, Status: ${finalPrediction.status}`);
            }
            if (finalPrediction.status === "succeeded") {
                const outputUrl = finalPrediction.output; // Assuming output is a string URL
                console.log(`[IPC Main] Prediction succeeded. Output URL: ${outputUrl}`);
                const inputFileName = path_1.default.basename(inputFilePath, path_1.default.extname(inputFilePath));
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const outputFileName = `${inputFileName}_continuation_${timestamp}.wav`;
                // New base path for generated recordings in project root
                const projectRootRecordingsDir = path_1.default.resolve(process.cwd(), "local_recordings");
                const generatedDirInProjectRoot = path_1.default.join(projectRootRecordingsDir, "generated");
                if (!fs_1.default.existsSync(generatedDirInProjectRoot)) {
                    fs_1.default.mkdirSync(generatedDirInProjectRoot, { recursive: true });
                    console.log(`[IPC Main] Created directory for generated files: ${generatedDirInProjectRoot}`);
                }
                const localOutputPath = path_1.default.join(generatedDirInProjectRoot, outputFileName);
                console.log(`[IPC Main] Downloading generated audio to: ${localOutputPath}`);
                await new Promise((resolve, reject) => {
                    const file = fs_1.default.createWriteStream(localOutputPath);
                    https_1.default.get(outputUrl, (response) => {
                        if (response.statusCode !== 200) {
                            reject(new Error(`Failed to download file: HTTP ${response.statusCode} ${response.statusMessage}`));
                            return;
                        }
                        response.pipe(file);
                        file.on("finish", () => {
                            file.close();
                            console.log("[IPC Main] Download complete.");
                            resolve();
                        });
                    }).on("error", (err) => {
                        fs_1.default.unlink(localOutputPath, () => { }); // Attempt to delete partial file
                        console.error("[IPC Main] Error downloading file:", err);
                        reject(err);
                    });
                });
                // After downloading, extract BPM and Key using the Python script
                let audioFeatures = { bpm: "N/A", key: "N/A" };
                try {
                    console.log(`[IPC Main] Calling Python script to extract features for: ${localOutputPath}`);
                    const pythonProcess = (0, child_process_2.spawn)("python", [path_1.default.resolve(process.cwd(), "extract_audio_features.py"), localOutputPath]);
                    let scriptOutput = "";
                    let scriptError = "";
                    pythonProcess.stdout.on("data", (data) => {
                        scriptOutput += data.toString();
                    });
                    pythonProcess.stderr.on("data", (data) => {
                        scriptError += data.toString();
                    });
                    await new Promise((resolveProcess, rejectProcess) => {
                        pythonProcess.on("close", (code) => {
                            if (code === 0) {
                                try {
                                    audioFeatures = JSON.parse(scriptOutput);
                                    console.log(`[IPC Main] Python script success. Features:`, audioFeatures);
                                }
                                catch (parseError) {
                                    console.error("[IPC Main] Error parsing Python script output:", parseError, "Raw output:", scriptOutput, "Stderr:", scriptError);
                                    // Keep default N/A features
                                }
                                resolveProcess();
                            }
                            else {
                                console.error(`[IPC Main] Python script exited with code ${code}. STDOUT: ${scriptOutput} STDERR: ${scriptError}`);
                                // Keep default N/A features
                                // rejectProcess(new Error(`Python script error: ${scriptError || `exit code ${code}`}`));
                                resolveProcess(); // Resolve anyway to not break the flow, features will be N/A
                            }
                        });
                        pythonProcess.on("error", (err) => {
                            console.error("[IPC Main] Failed to start Python script (spawn error):", err, "STDERR:", scriptError);
                            // rejectProcess(err);
                            resolveProcess(); // Resolve anyway
                        });
                    });
                }
                catch (pyError) {
                    console.error("[IPC Main] Error executing or processing Python script for audio features:", pyError);
                    // audioFeatures remains N/A
                }
                console.log("[IPC Main] handleGenerateMusicContinuation returning successfully with:", { generatedPath: localOutputPath, features: audioFeatures });
                return { generatedPath: localOutputPath, features: audioFeatures };
            }
            else {
                console.error(`[IPC Main] Replicate prediction failed or canceled: ${finalPrediction.status}, Error: ${finalPrediction.error}`);
                throw new Error(`Music generation failed: ${finalPrediction.error || finalPrediction.status}`);
            }
        }
        catch (error) {
            console.error("[IPC Main] Error in generate-music-continuation:", error);
            throw new Error(`Failed to generate music continuation: ${error.message}`);
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