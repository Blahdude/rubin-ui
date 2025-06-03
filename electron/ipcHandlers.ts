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
    async (event, inputFilePath: string) => {
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
        const replicate = new Replicate({
          auth: replicateApiKey,
        });
        console.log("[IPC Main] Replicate client initialized.");

        // Get audio duration using ffmpeg from the original local file
        let inputAudioDurationSeconds: number | undefined;
        console.log(`[IPC Main] Attempting to get duration for: ${inputFilePath} using ffprobe.`);
        try {
          const durationOutput = await new Promise<string>((resolve, reject) => {
            const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`;
            console.log(`[IPC Main] Executing ffprobe command: ${command}`);
            exec(command, (error, stdout, stderr) => {
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
          } else {
            console.log(`[IPC Main] ffprobe successfully got duration: ${inputAudioDurationSeconds} seconds.`);
          }
        } catch (ffmpegError: any) {
          console.error("[IPC Main] ERROR executing ffprobe to get audio duration:", ffmpegError.message);
          console.warn("[IPC Main] WARNING: Could not determine input audio duration. Proceeding without it, which might affect continuation accuracy.");
          inputAudioDurationSeconds = undefined; 
        }

        const continuationEndTime = inputAudioDurationSeconds ? Math.min(inputAudioDurationSeconds, 2.0) : 2.0;
        console.log(`[IPC Main] Determined continuation_end time (float): ${continuationEndTime} seconds.`);
        const continuationEndInteger = Math.round(continuationEndTime);
        console.log(`[IPC Main] Rounded continuation_end time to integer: ${continuationEndInteger} seconds.`);

        // Read the audio file into a buffer for Replicate client to upload
        let audioBuffer: Buffer;
        try {
          audioBuffer = fs.readFileSync(inputFilePath);
          console.log(`[IPC Main] Read input audio file into buffer for upload: ${inputFilePath}`);
        } catch (readError: any) {
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
          const outputUrl = finalPrediction.output as string; // Assuming output is a string URL
          console.log(`[IPC Main] Prediction succeeded. Output URL: ${outputUrl}`);
          
          const inputFileName = path.basename(inputFilePath, path.extname(inputFilePath));
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const outputFileName = `${inputFileName}_continuation_${timestamp}.wav`;

          // New base path for generated recordings in project root
          const projectRootRecordingsDir = path.resolve(process.cwd(), "local_recordings");
          const generatedDirInProjectRoot = path.join(projectRootRecordingsDir, "generated");

          if (!fs.existsSync(generatedDirInProjectRoot)) {
            fs.mkdirSync(generatedDirInProjectRoot, { recursive: true });
            console.log(`[IPC Main] Created directory for generated files: ${generatedDirInProjectRoot}`);
          }

          const localOutputPath = path.join(generatedDirInProjectRoot, outputFileName);

          console.log(`[IPC Main] Downloading generated audio to: ${localOutputPath}`);

          await new Promise<void>((resolve, reject) => {
            const file = fs.createWriteStream(localOutputPath);
            https.get(outputUrl, (response) => {
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
              fs.unlink(localOutputPath, () => {}); // Attempt to delete partial file
              console.error("[IPC Main] Error downloading file:", err);
              reject(err);
            });
          });

          // After downloading, extract BPM and Key using the Python script
          let audioFeatures = { bpm: "N/A", key: "N/A" };
          try {
            console.log(`[IPC Main] Calling Python script to extract features for: ${localOutputPath}`);
            const pythonProcess = spawn("python", [path.resolve(process.cwd(), "extract_audio_features.py"), localOutputPath]);
            
            let scriptOutput = "";
            let scriptError = "";

            pythonProcess.stdout.on("data", (data) => {
              scriptOutput += data.toString();
            });

            pythonProcess.stderr.on("data", (data) => {
              scriptError += data.toString();
            });

            await new Promise<void>((resolveProcess, rejectProcess) => {
              pythonProcess.on("close", (code) => {
                if (code === 0) {
                  try {
                    audioFeatures = JSON.parse(scriptOutput);
                    console.log(`[IPC Main] Python script success. Features:`, audioFeatures);
                  } catch (parseError: any) {
                    console.error("[IPC Main] Error parsing Python script output:", parseError, "Raw output:", scriptOutput, "Stderr:", scriptError);
                    // Keep default N/A features
                  }
                  resolveProcess();
                } else {
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
          } catch (pyError: any) {
            console.error("[IPC Main] Error executing or processing Python script for audio features:", pyError);
            // audioFeatures remains N/A
          }

          return { generatedPath: localOutputPath, features: audioFeatures }; // Return path and features
        } else {
          console.error(`[IPC Main] Replicate prediction failed or canceled: ${finalPrediction.status}, Error: ${finalPrediction.error}`);
          throw new Error(`Music generation failed: ${finalPrediction.error || finalPrediction.status}`);
        }

      } catch (error: any) {
        console.error("[IPC Main] Error in generate-music-continuation:", error);
        throw new Error(`Failed to generate music continuation: ${error.message}`);
      }
    }
  );

  // Handler for when renderer notifies that a generated audio is ready
  ipcMain.on("notify-generated-audio-ready", (event, data: { generatedPath: string, originalPath: string, features: { bpm: string | number, key: string } }) => {
    console.log(`[IPC Main] Received notify-generated-audio-ready. Broadcasting to all windows:`, data);
    // Broadcast to all windows. Assumes appState.getMainWindow() returns the relevant window
    // or you might need a way to iterate over all windows if multiple are possible.
    const mainWindow = appState.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("generated-audio-ready", data);
    }
  });
}
