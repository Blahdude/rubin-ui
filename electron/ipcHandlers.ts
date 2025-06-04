// ipcHandlers.ts

import { ipcMain, app } from "electron"
import { AppState } from "./main"
import path from "path"; // Import path for icon handling if needed later
import fs from "fs";
import Replicate from "replicate";
import dotenv from "dotenv";
import https from "https"; // For downloading
import { exec } from "child_process"; // For calling ffmpeg
import { open } from "fs/promises"; // For opening files
import { spawn } from "child_process"; // For calling python script

// Load environment variables from .env file
// Consider DX: for development, process.cwd() might be better if .env is in project root
// and app.getAppPath() points deeper into electron build folders.
// For packaged app, app.getAppPath() would be inside the package.
const envPath = app.isPackaged ? path.resolve(process.resourcesPath, '.env') : path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`[IPC Main] Loaded .env from: ${envPath}`);
} else {
  // Fallback for common dev scenario where app.getAppPath() is project root
  const devEnvPath = path.resolve(app.getAppPath(), '.env');
  if (fs.existsSync(devEnvPath)) {
    dotenv.config({ path: devEnvPath });
    console.log(`[IPC Main] Loaded .env from: ${devEnvPath}`);
  } else {
    console.warn(`[IPC Main] .env file not found at ${envPath} or ${devEnvPath}. Ensure REPLICATE_API_KEY is set globally or .env is correctly placed.`);
  }
}

// Renamed function, inputFilePath is now optional
export async function callReplicateMusicGeneration(promptText: string, inputFilePath?: string, durationSeconds: number = 8): Promise<{ generatedPath: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }> {
  console.log(`[Replicate] callReplicateMusicGeneration. Prompt: "${promptText}". InputFile: ${inputFilePath || 'N/A'}'. Duration: ${durationSeconds}s`);

  // Helper function to sanitize prompt text for use as a filename
  function sanitizePromptForFilename(prompt: string, maxLength: number = 50): string {
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
        truncated = truncated.substring(0, truncated.length -1);
    }

    // Ensure it's not empty after sanitization/truncation
    if (!truncated) {
      return "generated_audio";
    }
    return truncated;
  }

  const replicateApiKey = process.env.REPLICATE_API_KEY;
  if (!replicateApiKey) throw new Error("Replicate API key is not configured.");

  const replicate = new Replicate({ auth: replicateApiKey });

  const modelInputs: any = {
    model_version: "stereo-melody-large", // This is for melody generation, might need "stereo-music-large" for broader music.
                                          // For true text-to-music, MusicGen models like "stereo-music-large" are usually better.
                                          // The version hash b05b1... is for melody.
                                          // Let's try with "stereo-melody-large" first as user suggested it's the same model.
                                          // If it fails for text-only, we'll need to confirm the right model_version for MusicGen text-to-music.
    prompt: promptText,
    duration: durationSeconds, // Use the duration parameter
    output_format: "wav"
  };

  if (inputFilePath && typeof inputFilePath === 'string' && fs.existsSync(inputFilePath)) {
    console.log("[Replicate] Operating in CONTINUATION mode.");
    modelInputs.continuation = true;
    modelInputs.continuation_start = 0;

    let inputAudioDurationSeconds: number | undefined;
    try {
      const durationOutput = await new Promise<string>((resolve, reject) => {
        exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`, (err, stdout, stderr) => {
          if (err) { console.error(`[Replicate] ffprobe stderr: ${stderr}`); return reject(err); }
          resolve(stdout.trim());
        });
      });
      inputAudioDurationSeconds = parseFloat(durationOutput);
      if (isNaN(inputAudioDurationSeconds)) inputAudioDurationSeconds = undefined;
    } catch (e) { console.error("[Replicate] ffprobe error:", e); inputAudioDurationSeconds = undefined; }
    
    modelInputs.continuation_end = Math.round(inputAudioDurationSeconds ? Math.min(inputAudioDurationSeconds, 2.0) : 2.0);
    modelInputs.input_audio = fs.readFileSync(inputFilePath);
    console.log("[Replicate] Added continuation parameters and input_audio.");
  } else {
    console.log("[Replicate] Operating in TEXT-TO-MUSIC (from scratch) mode.");
    // For text-to-music, ensure no continuation flags are sent if the model doesn't expect them or if they default incorrectly.
    // modelInputs.continuation = false; // Explicitly set if needed, or remove if model handles absence correctly.
  }

  console.log("[Replicate] Calling Replicate API with inputs:", { ...modelInputs, input_audio: modelInputs.input_audio ? `<Buffer for ${inputFilePath}>` : 'N/A' });

  const prediction = await replicate.predictions.create({
    version: "b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38", // This is facebookresearch/musicgen:stereo-melody-large
    input: modelInputs,
  });

  if (prediction.error) throw new Error(`Replicate prediction error: ${prediction.error}`);
  console.log(`[Replicate] Prediction started. ID: ${prediction.id}, Status: ${prediction.status}`);

  let finalPrediction = prediction;
  while (finalPrediction.status !== "succeeded" && finalPrediction.status !== "failed" && finalPrediction.status !== "canceled") {
    await new Promise(resolve => setTimeout(resolve, 2500));
    finalPrediction = await replicate.predictions.get(prediction.id);
    console.log(`[Replicate] Polling prediction: ${finalPrediction.id}, Status: ${finalPrediction.status}`);
  }

  if (finalPrediction.status === "succeeded") {
    const outputUrl = finalPrediction.output as string;
    console.log(`[Replicate] Prediction succeeded. Output URL: ${outputUrl}`);
    
    const baseName = inputFilePath 
      ? path.basename(inputFilePath, path.extname(inputFilePath)) 
      : sanitizePromptForFilename(promptText);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFileName = `${baseName}_${inputFilePath ? 'cont' : 'gen'}_${timestamp}.wav`;

    const projectRootRecordingsDir = path.resolve(process.cwd(), "local_recordings");
    const generatedDirInProjectRoot = path.join(projectRootRecordingsDir, "generated");
    if (!fs.existsSync(generatedDirInProjectRoot)) fs.mkdirSync(generatedDirInProjectRoot, { recursive: true });
    const localOutputPath = path.join(generatedDirInProjectRoot, outputFileName);

    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(localOutputPath);
      https.get(outputUrl, (response) => {
        if (response.statusCode !== 200) { reject(new Error(`Failed to download: HTTP ${response.statusCode}`)); return; }
        response.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
      }).on("error", (err) => { fs.unlink(localOutputPath, () => {}); reject(err); });
    });

    let audioFeatures = { bpm: "N/A", key: "N/A" };
    try {
      const pythonProcess = spawn("python", [path.resolve(process.cwd(), "extract_audio_features.py"), localOutputPath]);
      let scriptOutput = ""; let scriptError = "";
      pythonProcess.stdout.on("data", (data) => scriptOutput += data.toString());
      pythonProcess.stderr.on("data", (data) => scriptError += data.toString());
      await new Promise<void>((res, rej) => {
        pythonProcess.on("close", (code) => { 
          if (code === 0) { try { audioFeatures = JSON.parse(scriptOutput); } catch (e) { console.error("[Replicate] Py parse err:", e, "Out:", scriptOutput); } }
          else { console.error(`[Replicate] Py script err code ${code}. STDERR: ${scriptError}`); }
          res(); 
        });
        pythonProcess.on("error", (err) => { console.error("[Replicate] Py spawn err:", err); res(); });
      });
    } catch (pyErr) { console.error("[Replicate] Py exec err:", pyErr); }

    console.log("[Replicate] callReplicateMusicGeneration returning:", { generatedPath: localOutputPath, features: audioFeatures, displayName: baseName, originalPromptText: promptText });
    return { generatedPath: localOutputPath, features: audioFeatures, displayName: baseName, originalPromptText: promptText };
  } else {
    throw new Error(`Music generation failed: ${finalPrediction.error || finalPrediction.status}`);
  }
}

export function initializeIpcHandlers(appState: AppState): void {
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return appState.deleteScreenshot(path)
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await appState.takeScreenshot()
      const preview = await appState.getImagePreview(screenshotPath)
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      throw error
    }
  })

  ipcMain.handle("get-screenshots", async () => {
    console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      previews.forEach((preview: any) => console.log(preview.path))
      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  ipcMain.handle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      appState.clearQueues()
      console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: any) {
      console.error("Error resetting queues:", error)
      return { success: false, error: error.message }
    }
  })

  // IPC handler for analyzing audio from base64 data
  ipcMain.handle("analyze-audio-base64", async (event, data: string, mimeType: string) => {
    try {
      const result = await appState.processingHelper.processAudioBase64(data, mimeType)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-base64 handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing audio from file path
  ipcMain.handle("analyze-audio-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.processAudioFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-file handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing image from file path
  ipcMain.handle("analyze-image-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  ipcMain.handle("quit-app", () => {
    app.quit()
  })

  // Handler for starting a file drag operation
  ipcMain.on('ondragstart-file', async (event, filePath: string) => {
    console.log(`[IPC Main] Received ondragstart-file for: ${filePath}`);
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`[IPC Main] Drag failed: File path "${filePath}" is invalid or file does not exist.`);
      return;
    }
    try {
      const icon = await app.getFileIcon(filePath);
      event.sender.startDrag({
        file: filePath,
        icon: icon
      });
    } catch (error) {
      console.error(`[IPC Main] Failed to start drag for ${filePath}:`, error);
      // Optionally, you could try to drag without a custom icon as a fallback,
      // but given the previous errors, it might be better to just log and not drag.
      // For example, to try with the potentially problematic empty string icon path:
      // event.sender.startDrag({ file: filePath, icon: '' });
    }
  });

  // Renamed IPC Handler, inputFilePath is now optional
  ipcMain.handle(
    "generate-music", // Renamed from generate-music-continuation
    async (event, promptText: string, inputFilePath?: string, durationSeconds?: number) => {
      return callReplicateMusicGeneration(promptText, inputFilePath, durationSeconds);
    }
  );

  ipcMain.on("notify-generated-audio-ready", (event, data: { generatedPath: string, originalPath?: string, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string }) => {
    console.log(`[IPC Main] Received notify-generated-audio-ready. Data:`, data);
    const mainWindow = appState.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log("[IPC Main] Broadcasting 'generated-audio-ready' to renderer with data:", data);
      mainWindow.webContents.send("generated-audio-ready", data);
    } else {
      console.warn("[IPC Main] No main window to send 'generated-audio-ready' event to, or window destroyed.");
    }
  });

  // ADDED IPC Handler for user follow-up responses
  ipcMain.handle("user-response-to-ai", async (_event, userText: string) => {
    if (!appState) return { success: false, error: "AppState not initialized" };
    try {
      await appState.processingHelper.processUserText(userText);
      return { success: true };
    } catch (error: any) {
      console.error("Failed to process user text input via IPC:", error);
      return { success: false, error: error.message };
    }
  });

  // ADDED: Handler for starting a new chat
  ipcMain.handle("start-new-chat", async () => {
    if (!appState) return { success: false, error: "AppState not initialized" };
    try {
      await appState.processingHelper.startNewChat();
      return { success: true };
    } catch (error: any) {
      console.error("Failed to start new chat via IPC:", error);
      return { success: false, error: error.message };
    }
  });
}
