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

export async function callReplicateToContinueMusic(inputFilePath: string, promptText?: string): Promise<{ generatedPath: string, features: { bpm: string | number, key: string } }> {
  console.log(`[Replicate] callReplicateToContinueMusic for input file: ${inputFilePath} with prompt: "${promptText || ''}"`);

  if (!inputFilePath || typeof inputFilePath !== 'string') {
    console.error("[Replicate] ERROR: Invalid or missing inputFilePath for music continuation.");
    throw new Error("Invalid input file path for music continuation.");
  }

  const replicateApiKey = process.env.REPLICATE_API_KEY;

  if (!replicateApiKey) {
    console.error("[Replicate] ERROR: REPLICATE_API_KEY not found in environment variables.");
    throw new Error("Replicate API key is not configured.");
  }
  // console.log("[Replicate] API key found."); // Reduced verbosity

  const replicate = new Replicate({
    auth: replicateApiKey,
  });
  // console.log("[Replicate] client initialized."); // Reduced verbosity

  let inputAudioDurationSeconds: number | undefined;
  try {
    const durationOutput = await new Promise<string>((resolve, reject) => {
      const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`[Replicate] ffprobe stderr: ${stderr}`);
          return reject(error);
        }
        return resolve(stdout.trim());
      });
    });
    inputAudioDurationSeconds = parseFloat(durationOutput);
    if (isNaN(inputAudioDurationSeconds)) {
      console.warn(`[Replicate] WARNING: ffprobe output was not a number: '${durationOutput}'. Using full audio for continuation.`);
      inputAudioDurationSeconds = undefined; 
    }
  } catch (ffmpegError: any) {
    console.error("[Replicate] ERROR executing ffprobe to get audio duration:", ffmpegError.message);
    inputAudioDurationSeconds = undefined; 
  }

  const continuationEndTime = inputAudioDurationSeconds ? Math.min(inputAudioDurationSeconds, 2.0) : 2.0;
  const continuationEndInteger = Math.round(continuationEndTime);

  let audioBuffer: Buffer;
  try {
    audioBuffer = fs.readFileSync(inputFilePath);
  } catch (readError: any) {
    console.error(`[Replicate] ERROR reading input audio file (${inputFilePath}) into buffer:`, readError);
    throw new Error(`Failed to read input audio file: ${readError.message}`);
  }

  const modelInputs = {
    model_version: "stereo-melody-large",
    input_audio: audioBuffer,
    prompt: promptText || "",
    duration: 4,
    continuation: true,
    continuation_start: 0,
    continuation_end: continuationEndInteger,
    output_format: "wav"
  };

  console.log("[Replicate] Calling Replicate API with inputs:", { ...modelInputs, input_audio: `<Buffer for ${inputFilePath}>` });

  const prediction = await replicate.predictions.create({
    version: "b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38",
    input: modelInputs,
  });

  if (prediction.error) {
    console.error("[Replicate] ERROR from Replicate during prediction creation:", prediction.error);
    throw new Error(`Replicate prediction error: ${prediction.error}`);
  }

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
    
    const inputFileName = path.basename(inputFilePath, path.extname(inputFilePath));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFileName = `${inputFileName}_continuation_${timestamp}.wav`;

    const projectRootRecordingsDir = path.resolve(process.cwd(), "local_recordings");
    const generatedDirInProjectRoot = path.join(projectRootRecordingsDir, "generated");

    if (!fs.existsSync(generatedDirInProjectRoot)) {
      fs.mkdirSync(generatedDirInProjectRoot, { recursive: true });
    }
    const localOutputPath = path.join(generatedDirInProjectRoot, outputFileName);

    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(localOutputPath);
      https.get(outputUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download file: HTTP ${response.statusCode} ${response.statusMessage}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close(); resolve();
        });
      }).on("error", (err) => {
        fs.unlink(localOutputPath, () => {});
        reject(err);
      });
    });

    let audioFeatures = { bpm: "N/A", key: "N/A" };
    try {
      const pythonProcess = spawn("python", [path.resolve(process.cwd(), "extract_audio_features.py"), localOutputPath]);
      let scriptOutput = "";
      let scriptError = "";
      pythonProcess.stdout.on("data", (data) => { scriptOutput += data.toString(); });
      pythonProcess.stderr.on("data", (data) => { scriptError += data.toString(); });
      await new Promise<void>((resolveProcess, rejectProcess) => {
        pythonProcess.on("close", (code) => {
          if (code === 0) {
            try { audioFeatures = JSON.parse(scriptOutput); } catch (e) { console.error("[Replicate] Error parsing Python script output:", e, "Raw:", scriptOutput); }
          } else { console.error(`[Replicate] Python script exited with code ${code}. ERR: ${scriptError}`); }
          resolveProcess();
        });
        pythonProcess.on("error", (err) => { console.error("[Replicate] Failed to start Python script:", err); resolveProcess(); });
      });
    } catch (pyError) { console.error("[Replicate] Error executing Python script for features:", pyError); }

    console.log("[Replicate] callReplicateToContinueMusic returning successfully with:", { generatedPath: localOutputPath, features: audioFeatures });
    return { generatedPath: localOutputPath, features: audioFeatures };
  } else {
    console.error(`[Replicate] Prediction failed or canceled: ${finalPrediction.status}, Error: ${finalPrediction.error}`);
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

  ipcMain.handle(
    "generate-music-continuation",
    async (event, inputFilePath: string, promptText?: string) => {
      // Now this handler simply calls the extracted function
      return callReplicateToContinueMusic(inputFilePath, promptText);
    }
  );

  ipcMain.on("notify-generated-audio-ready", (event, data: { generatedPath: string, originalPath: string, features: { bpm: string | number, key: string } }) => {
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
