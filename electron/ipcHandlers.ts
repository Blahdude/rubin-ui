// ipcHandlers.ts

import { ipcMain, app } from "electron"
import { AppState, ConversationItem } from "./main"
import path from "path"; // Import path for icon handling if needed later
import fs from "fs";
import Replicate from "replicate";
import dotenv from "dotenv";
import https from "https"; // For downloading
import os from "os"; // For temp directory
import { exec } from "child_process"; // For calling ffmpeg
import { open } from "fs/promises"; // For opening files
import { spawn } from "child_process"; // For calling python script

// Import the new function from shortcuts.ts
import { setRecordingDuration as setShortcutRecordingDuration } from "./shortcuts";
import { filterToValidTags, validatePromptTags } from "./cyanite-tags-parser";

// Variable to store the UI preferred generation duration
let uiPreferredGenerationDurationSeconds: number = 8; // Default value

// Map to store active Replicate prediction IDs associated with an operation ID
const activeReplicatePredictions = new Map<string, string>(); // operationId -> predictionId

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

// DEDICATED FUNCTION FOR AUDIO CONDITIONING (MusicGen)
export async function callMusicGenAudioConditioning(
  operationId: string,
  promptText: string,
  inputFilePath: string,
  durationFromCaller?: number
): Promise<{ generatedUrl: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }> {
  
  const replicateApiKey = process.env.REPLICATE_API_KEY;
  if (!replicateApiKey) {
    console.error(`[Replicate] API key not configured for MusicGen operation ${operationId}.`);
    throw new Error("Replicate API key is not configured.");
  }
  const replicate = new Replicate({ auth: replicateApiKey });
  
  if (!inputFilePath || !fs.existsSync(inputFilePath)) {
    throw new Error(`Input audio file is required for MusicGen conditioning but path "${inputFilePath}" is invalid or does not exist.`);
  }

  const predictionModelName = "MusicGen (Audio Conditioning)";
  let knownInputAudioDurationSeconds: number | undefined;
  
  try {
    const durationOutput = await new Promise<string>((resolve, reject) => {
      exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`, (err, stdout, stderr) => {
        if (err) { console.error(`[Replicate] ffprobe stderr for op ${operationId}: ${stderr}`); return reject(err); }
        resolve(stdout.trim());
      });
    });
    knownInputAudioDurationSeconds = parseFloat(durationOutput);
    if (isNaN(knownInputAudioDurationSeconds)) knownInputAudioDurationSeconds = undefined;
  } catch (e) { 
    console.error(`[Replicate] ffprobe error for op ${operationId}:`, e); 
    knownInputAudioDurationSeconds = undefined; 
  }
  
  const originalInputDurationForLog = knownInputAudioDurationSeconds ?? "N/A";
  const newSegmentDuration = durationFromCaller ?? uiPreferredGenerationDurationSeconds;
  let finalApiDuration = (knownInputAudioDurationSeconds || 0) + newSegmentDuration;
  finalApiDuration = Math.round(finalApiDuration);
  
  // Validate and filter prompt to only use approved tags from cyanite_tags.csv
  const validation = validatePromptTags(promptText);
  const filteredPromptText = filterToValidTags(promptText);
  
  if (validation.invalidTags.length > 0) {
    console.warn(`[Replicate] Invalid tags detected and filtered out for MusicGen op ${operationId}:`, validation.invalidTags);
  }
  
  console.log(`[Replicate] MUSICGEN AUDIO CONDITIONING for op ${operationId}. Input: ${inputFilePath}, Input Duration: ~${originalInputDurationForLog}s. New Segment Desired: ${newSegmentDuration}s. Rounded Total API Duration: ${finalApiDuration}s. Original Prompt: "${promptText}". Filtered Prompt: "${filteredPromptText}".`);

  const modelInputs: any = {
    model_version: "stereo-melody-large",
    prompt: filteredPromptText || "Happy",
    duration: finalApiDuration,
    output_format: "wav",
    continuation: true,
    continuation_start: 0,
    continuation_end: Math.round(knownInputAudioDurationSeconds ? Math.min(knownInputAudioDurationSeconds, 2.0) : 2.0),
    input_audio: fs.readFileSync(inputFilePath)
  };
  
  console.log(`[Replicate] Calling ${predictionModelName} for op ${operationId} with inputs:`, { ...modelInputs, input_audio: `<Buffer for ${inputFilePath}>` });
  
  const predictionPromise = replicate.predictions.create({
    version: "b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38", // facebookresearch/musicgen:stereo-melody-large
    input: modelInputs,
  });

  let predictionId: string | null = null;

  try {
    const prediction = await predictionPromise;

    if (prediction.error) {
      console.error(`[Replicate] MusicGen prediction creation error for operation ${operationId}: ${prediction.error}`);
      throw new Error(`Replicate MusicGen prediction error: ${prediction.error}`);
    }
    
    predictionId = prediction.id;
    activeReplicatePredictions.set(operationId, predictionId);
    console.log(`[Replicate] MusicGen prediction started for operation ${operationId}. ID: ${predictionId}, Status: ${prediction.status}`);

    let finalPrediction = prediction;
    while (finalPrediction.status !== "succeeded" && finalPrediction.status !== "failed" && finalPrediction.status !== "canceled") {
      await new Promise(resolve => setTimeout(resolve, 2500));
      if (!predictionId) { 
        console.error(`[Replicate] Critical error: predictionId is null during MusicGen polling for operation ${operationId}.`);
        throw new Error("Internal error: MusicGen prediction ID became null during polling.");
      }
      finalPrediction = await replicate.predictions.get(predictionId);
      console.log(`[Replicate] Polling MusicGen prediction ${predictionId} (operation ${operationId}): Status: ${finalPrediction.status}`);
    }

    if (finalPrediction.status === "succeeded") {
      const outputUrl = finalPrediction.output as string;
      console.log(`[Replicate] MusicGen prediction ${predictionId} (operation ${operationId}) succeeded. Output URL: ${outputUrl}`);
      
      const baseName = path.basename(inputFilePath, path.extname(inputFilePath));
      return { generatedUrl: outputUrl, features: { bpm: "N/A", key: "N/A" }, displayName: baseName, originalPromptText: promptText };
    } else if (finalPrediction.status === "canceled") {
      console.log(`[Replicate] MusicGen generation canceled for operation ${operationId}, prediction ${predictionId}.`);
      throw new Error(`MusicGen generation for operation ${operationId} was canceled.`);
    } else { // failed
      console.error(`[Replicate] MusicGen generation failed for operation ${operationId}, prediction ${predictionId}. Status: ${finalPrediction.status}, Error: ${finalPrediction.error}`);
      throw new Error(`MusicGen generation failed for operation ${operationId}: ${finalPrediction.error || finalPrediction.status}`);
    }
  } catch (error: any) {
    console.error(`[Replicate] Overall error in MusicGen audio conditioning for operation ${operationId} (prediction ${predictionId || 'N/A'}):`, error.message);
    throw (error instanceof Error ? error : new Error(String(error.message || error)));
  } finally {
    if (operationId) {
      activeReplicatePredictions.delete(operationId);
      console.log(`[Replicate] Cleaned up MusicGen operation ${operationId} (prediction ${predictionId || 'N/A'}) from active predictions map.`);
    }
  }
}

// DEDICATED FUNCTION FOR TEXT CONDITIONING (ACE-STEP)
export async function callACEStepTextConditioning(
  operationId: string,
  promptText: string,
  durationFromCaller?: number
): Promise<{ generatedUrl: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }> {
  
  const replicateApiKey = process.env.REPLICATE_API_KEY;
  if (!replicateApiKey) {
    console.error(`[Replicate] API key not configured for ACE-STEP operation ${operationId}.`);
    throw new Error("Replicate API key is not configured.");
  }
  const replicate = new Replicate({ auth: replicateApiKey });
  
  const predictionModelName = "ACE-STEP (Text Conditioning)";
  let finalApiDuration = durationFromCaller ?? uiPreferredGenerationDurationSeconds;
  finalApiDuration = Math.round(finalApiDuration);
  
  // Validate and filter prompt to only use approved tags from cyanite_tags.csv
  const validation = validatePromptTags(promptText);
  const filteredPromptText = filterToValidTags(promptText);
  
  if (validation.invalidTags.length > 0) {
    console.warn(`[Replicate] Invalid tags detected and filtered out for ACE-STEP op ${operationId}:`, validation.invalidTags);
  }
  
  console.log(`[Replicate] ACE-STEP TEXT CONDITIONING for op ${operationId}. Original Prompt: "${promptText}". Filtered Prompt: "${filteredPromptText}". Duration: ${finalApiDuration}s (Caller: ${durationFromCaller}, UI Pref: ${uiPreferredGenerationDurationSeconds})`);
  
  const modelInputs = {
    tags: filteredPromptText || "Happy",
    lyrics: "[inst]",
    duration: finalApiDuration
  };

  console.log(`[Replicate] Calling ${predictionModelName} for op ${operationId} with inputs:`, modelInputs);
  
  const predictionPromise = replicate.predictions.create({
    version: "280fc4f9ee507577f880a167f639c02622421d8fecf492454320311217b688f1", // lucataco/ace-step
    input: modelInputs,
  });

  let predictionId: string | null = null;

  try {
    const prediction = await predictionPromise;

    if (prediction.error) {
      console.error(`[Replicate] ACE-STEP prediction creation error for operation ${operationId}: ${prediction.error}`);
      throw new Error(`Replicate ACE-STEP prediction error: ${prediction.error}`);
    }
    
    predictionId = prediction.id;
    activeReplicatePredictions.set(operationId, predictionId);
    console.log(`[Replicate] ACE-STEP prediction started for operation ${operationId}. ID: ${predictionId}, Status: ${prediction.status}`);

    let finalPrediction = prediction;
    while (finalPrediction.status !== "succeeded" && finalPrediction.status !== "failed" && finalPrediction.status !== "canceled") {
      await new Promise(resolve => setTimeout(resolve, 2500));
      if (!predictionId) { 
        console.error(`[Replicate] Critical error: predictionId is null during ACE-STEP polling for operation ${operationId}.`);
        throw new Error("Internal error: ACE-STEP prediction ID became null during polling.");
      }
      finalPrediction = await replicate.predictions.get(predictionId);
      console.log(`[Replicate] Polling ACE-STEP prediction ${predictionId} (operation ${operationId}): Status: ${finalPrediction.status}`);
    }

    if (finalPrediction.status === "succeeded") {
      const outputUrl = finalPrediction.output as string;
      console.log(`[Replicate] ACE-STEP prediction ${predictionId} (operation ${operationId}) succeeded. Output URL: ${outputUrl}`);
      
      return { generatedUrl: outputUrl, features: { bpm: "N/A", key: "N/A" }, displayName: promptText, originalPromptText: promptText };
    } else if (finalPrediction.status === "canceled") {
      console.log(`[Replicate] ACE-STEP generation canceled for operation ${operationId}, prediction ${predictionId}.`);
      throw new Error(`ACE-STEP generation for operation ${operationId} was canceled.`);
    } else { // failed
      console.error(`[Replicate] ACE-STEP generation failed for operation ${operationId}, prediction ${predictionId}. Status: ${finalPrediction.status}, Error: ${finalPrediction.error}`);
      throw new Error(`ACE-STEP generation failed for operation ${operationId}: ${finalPrediction.error || finalPrediction.status}`);
    }
  } catch (error: any) {
    console.error(`[Replicate] Overall error in ACE-STEP text conditioning for operation ${operationId} (prediction ${predictionId || 'N/A'}):`, error.message);
    throw (error instanceof Error ? error : new Error(String(error.message || error)));
  } finally {
    if (operationId) {
      activeReplicatePredictions.delete(operationId);
      console.log(`[Replicate] Cleaned up ACE-STEP operation ${operationId} (prediction ${predictionId || 'N/A'}) from active predictions map.`);
    }
  }
}

// LEGACY UNIFIED FUNCTION (DEPRECATED - KEEPING FOR BACKWARD COMPATIBILITY)
// This function should be replaced with the dedicated functions above
export async function callReplicateMusicGeneration(
  operationId: string,
  promptText: string,
  inputFilePath?: string,
  durationFromCaller?: number
): Promise<{ generatedUrl: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }> {
  
  console.warn(`[Replicate] DEPRECATED: callReplicateMusicGeneration is deprecated. Use callMusicGenAudioConditioning or callACEStepTextConditioning instead.`);
  
  if (inputFilePath && typeof inputFilePath === 'string' && fs.existsSync(inputFilePath)) {
    // Route to MusicGen for audio conditioning
    return await callMusicGenAudioConditioning(operationId, promptText, inputFilePath, durationFromCaller);
  } else {
    // Route to ACE-STEP for text conditioning
    return await callACEStepTextConditioning(operationId, promptText, durationFromCaller);
  }
}

export async function cancelSpecificReplicatePrediction(operationId: string): Promise<{ success: boolean, message: string }> {
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
    const replicate = new Replicate({ auth: replicateApiKey });

    const cancelResult = await replicate.predictions.cancel(predictionId);
    console.log(`[Replicate] Cancellation API call for prediction ${predictionId} (op ${operationId}) result status: ${cancelResult.status}`);

    // If Replicate's API confirms cancellation, or if the prediction is already in another terminal state.
    if (cancelResult && (cancelResult.status === "canceled" || cancelResult.status === "succeeded" || cancelResult.status === "failed")) {
        activeReplicatePredictions.delete(operationId); 
        console.log(`[Replicate] Prediction ${predictionId} (op ${operationId}) is now in terminal state '${cancelResult.status}'. Removed from map.`);
        if (cancelResult.status === "canceled") {
            return { success: true, message: "Music generation task cancelled successfully." };
        } else {
            // If it was already succeeded or failed, it's not a "successful cancellation" from user's POV but the operation is over.
            return { success: false, message: `Prediction was already in terminal state: ${cancelResult.status}.` };
        }
    } else {
        // This case implies the API call might have succeeded but the status is unexpected, or the call itself had issues not throwing an error.
        console.warn(`[Replicate] Replicate prediction ${predictionId} (op ${operationId}) not definitively terminal after cancel call. Status: ${cancelResult?.status}.`);
        return { success: false, message: `Could not definitively cancel. Prediction status from Replicate: ${cancelResult?.status || 'unknown'}` };
    }
  } catch (error: any) {
    console.error(`[Replicate] Error cancelling Replicate prediction ${predictionId} for operation ${operationId}:`, error);
    // Consider if certain errors from Replicate (e.g., "prediction not found", "already completed") mean we should delete from map.
    // For now, deleting from map only on confirmed terminal states.
    return { success: false, message: `Error during Replicate cancellation: ${error.message}` };
  }
}

// Handler to read a file and return its buffer
ipcMain.handle('get-file-as-buffer', async (_, filePath) => {
  try {
    // Check if it's a URL (HTTP/HTTPS)
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      console.log(`[IPC Main] Downloading file from URL: ${filePath}`);
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return { success: true, data: buffer };
    } else {
      // Handle local file path
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(app.getAppPath(), filePath);
      console.log(`[IPC Main] Reading local file to buffer: ${absolutePath}`);
      const buffer = await fs.promises.readFile(absolutePath);
      return { success: true, data: buffer };
    }
  } catch (error: any) {
    console.error(`[IPC Main] Error reading file/URL to buffer (${filePath}):`, error);
    return { success: false, error: error.message };
  }
});

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
      return { success: true, path: screenshotPath, preview }
    } catch (error: any) {
      console.error("Error taking screenshot:", error)
      if (error.message && error.message.includes("Maximum")) {
        return { success: false, error: "screenshot_limit", message: "Max 2 Screenshots" }
      }
      return { success: false, error: "unknown", message: error.message || "Unknown error" }
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
    
    // Check if it's a URL (Firebase Storage) or local file path
    if (filePath.startsWith('https://') || filePath.startsWith('http://')) {
      // Handle Firebase Storage URL by downloading temporarily
      try {
        console.log(`[IPC Main] Downloading Firebase Storage file for drag: ${filePath}`);
        
        // Create a temporary file path
        const url = new URL(filePath);
        const fileName = path.basename(url.pathname) || 'audio.wav';
        const tempDir = path.join(os.tmpdir(), 'rubin-drag-temp');
        const tempFilePath = path.join(tempDir, fileName);
        
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Download the file to temp location
        const response = await fetch(filePath);
        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.statusText}`);
        }
        
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(tempFilePath, Buffer.from(buffer));
        
        console.log(`[IPC Main] Downloaded to temp file: ${tempFilePath}`);
        
        // Now drag the temp file
        const icon = await app.getFileIcon(tempFilePath);
        event.sender.startDrag({
          file: tempFilePath,
          icon: icon
        });
        
        // Clean up temp file after a delay (give time for drag to complete)
        setTimeout(() => {
          try {
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
              console.log(`[IPC Main] Cleaned up temp drag file: ${tempFilePath}`);
            }
          } catch (cleanupError) {
            console.error(`[IPC Main] Failed to clean up temp file: ${tempFilePath}`, cleanupError);
          }
        }, 30000); // Clean up after 30 seconds
        
      } catch (error) {
        console.error(`[IPC Main] Failed to download and drag Firebase Storage file: ${filePath}`, error);
        return;
      }
    } else {
      // Handle local file path (existing logic)
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
      }
    }
  });

  // Renamed IPC Handler, inputFilePath is now optional
  ipcMain.handle(
    "generate-music", // Renamed from generate-music-continuation
    async (event, operationId: string, promptText: string, inputFilePath?: string, durationSeconds?: number) => {
      if (!operationId) {
        console.error("[IPC Main] generate-music called without an operationId.");
        // Ensure a proper error object is thrown for the renderer to catch
        throw new Error("operationId is required for music generation.");
      }
      console.log(`[IPC Main] Received generate-music request for operationId: ${operationId}`);
      try {
        const result = await callReplicateMusicGeneration(operationId, promptText, inputFilePath, durationSeconds);
        return result;
      } catch (error: any) {
        console.error(`[IPC Main] Error in generate-music handler for operationId ${operationId}:`, error.message);
        // Rethrow so the renderer's .catch() block in ProcessingHelper can handle it
        throw new Error(error.message || "Unknown error during music generation.");
      }
    }
  );

  // NEW: Dedicated IPC Handler for Recording-based generation (MusicGen)
  ipcMain.handle(
    "generate-music-from-recording",
    async (event, operationId: string, promptText: string, inputFilePath: string, durationSeconds?: number) => {
      if (!operationId) {
        console.error("[IPC Main] generate-music-from-recording called without an operationId.");
        throw new Error("operationId is required for MusicGen generation.");
      }
      if (!inputFilePath) {
        console.error("[IPC Main] generate-music-from-recording called without an inputFilePath.");
        throw new Error("inputFilePath is required for MusicGen audio conditioning.");
      }
      console.log(`[IPC Main] Received generate-music-from-recording request for operationId: ${operationId}, input: ${inputFilePath}`);
      try {
        const result = await callMusicGenAudioConditioning(operationId, promptText, inputFilePath, durationSeconds);
        
        // CRITICAL: Trigger the generated-audio-ready event to save the audio to UI
        const mainWindow = appState.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log("[IPC Main] Broadcasting MusicGen 'generated-audio-ready' to renderer with data:", result);
          mainWindow.webContents.send("generated-audio-ready", { 
            generatedUrl: result.generatedUrl, 
            originalPath: inputFilePath, 
            features: result.features, 
            displayName: result.displayName, 
            originalPromptText: result.originalPromptText 
          });
        } else {
          console.warn("[IPC Main] No main window to send MusicGen 'generated-audio-ready' event to, or window destroyed.");
        }
        
        return result;
      } catch (error: any) {
        console.error(`[IPC Main] Error in generate-music-from-recording handler for operationId ${operationId}:`, error.message);
        throw new Error(error.message || "Unknown error during MusicGen generation.");
      }
    }
  );

  // NEW: Dedicated IPC Handler for Text-based generation (ACE-STEP)
  ipcMain.handle(
    "generate-music-from-text",
    async (event, operationId: string, promptText: string, durationSeconds?: number) => {
      if (!operationId) {
        console.error("[IPC Main] generate-music-from-text called without an operationId.");
        throw new Error("operationId is required for ACE-STEP generation.");
      }
      if (!promptText || promptText.trim() === "") {
        console.error("[IPC Main] generate-music-from-text called without a promptText.");
        throw new Error("promptText is required for ACE-STEP text conditioning.");
      }
      console.log(`[IPC Main] Received generate-music-from-text request for operationId: ${operationId}, prompt: "${promptText}"`);
      try {
        const result = await callACEStepTextConditioning(operationId, promptText, durationSeconds);
        
        // CRITICAL: Trigger the generated-audio-ready event to save the audio to UI
        const mainWindow = appState.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log("[IPC Main] Broadcasting ACE-STEP 'generated-audio-ready' to renderer with data:", result);
          mainWindow.webContents.send("generated-audio-ready", { 
            generatedUrl: result.generatedUrl, 
            originalPath: undefined, // No original path for text-based generation
            features: result.features, 
            displayName: result.displayName, 
            originalPromptText: result.originalPromptText 
          });
        } else {
          console.warn("[IPC Main] No main window to send ACE-STEP 'generated-audio-ready' event to, or window destroyed.");
        }
        
        return result;
      } catch (error: any) {
        console.error(`[IPC Main] Error in generate-music-from-text handler for operationId ${operationId}:`, error.message);
        throw new Error(error.message || "Unknown error during ACE-STEP generation.");
      }
    }
  );

  ipcMain.handle("cancel-music-generation", async (event, operationId: string) => {
    if (!operationId) {
        console.error("[IPC Main] cancel-music-generation called without an operationId.");
        return { success: false, message: "operationId is required for cancellation." };
    }
    console.log(`[IPC Main] Received cancel-music-generation request for operationId: ${operationId}`);
    try {
        const result = await cancelSpecificReplicatePrediction(operationId);
        return result;
    } catch (error: any) { // Catching potential errors from cancelSpecificReplicatePrediction itself
        console.error(`[IPC Main] Error in cancel-music-generation handler for operationId ${operationId}:`, error.message);
        return { success: false, message: error.message || "Unknown error during cancellation task." };
    }
  });

  ipcMain.on("notify-generated-audio-ready", (event, data: { generatedUrl: string, originalPath?: string, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string }) => {
    console.log(`[IPC Main] Received notify-generated-audio-ready. Data:`, data);
    const mainWindow = appState.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log("[IPC Main] Broadcasting 'generated-audio-ready' to renderer with data:", data);
      mainWindow.webContents.send("generated-audio-ready", data);
    } else {
      console.warn("[IPC Main] No main window to send 'generated-audio-ready' event to, or window destroyed.");
    }
  });

  // Handler for user-initiated follow-up responses
  ipcMain.handle("user-response-to-ai", async (_, userText, screenshots) => {
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
    } catch (error) {
      console.error("[IPC] Error processing user response:", error);
      return { success: false, error: (error as Error).message };
    }
  });

  // ADDED: Handler for starting a new chat
  ipcMain.handle("start-new-chat", async () => {
    console.log("[IPC] Received start-new-chat request.");
    try {
      // 1. Clear backend history
      appState.clearConversationHistory();
      
      // 2. Reset the LLM's internal chat state
      await appState.processingHelper.llmHelper.newChat();
      
      // 3. Just return success - no automatic welcome message
      console.log("[IPC] New chat started - no welcome message generated.");

      return { success: true };
    } catch (error) {
      console.error("[IPC] Error handling start-new-chat:", error);
      return { success: false, error: (error as Error).message };
    }
  });

  // ADDED: Handler for canceling queries
  ipcMain.handle("cancel-query", async () => {
    if (!appState) return { success: false, error: "AppState not initialized" };
    try {
      console.log("[IPC] Received cancel-query request");
      appState.processingHelper.cancelOngoingRequests();
      return { success: true };
    } catch (error: any) {
      console.error("Failed to cancel query via IPC:", error);
      return { success: false, error: error.message };
    }
  });

  // ADDED: IPC handler for moving the window to the right
  ipcMain.handle("move-window-right", async (event) => {
    try {
      appState.moveWindowRight();
      return { success: true };
    } catch (error: any) {
      console.error("Error moving window right:", error);
      return { success: false, error: error.message };
    }
  });

  // Example of a simple IPC handler (can be removed or modified)
  ipcMain.on("simple-message", (event, arg) => {
    console.log("Received simple message:", arg);
    event.reply("simple-message-reply", "Message received!");
  });

  ipcMain.on("set-recording-duration", (event, durationSeconds: number) => {
    if (typeof durationSeconds === 'number' && durationSeconds > 0) {
      setShortcutRecordingDuration(durationSeconds);
      console.log(`[IPC Main] Recording duration set to ${durationSeconds}s via IPC.`);
    } else {
      console.warn(`[IPC Main] Invalid recording duration received: ${durationSeconds}`);
    }
  });

  ipcMain.on("set-ui-preferred-generation-duration", (event, durationSeconds: number) => {
    if (typeof durationSeconds === 'number' && durationSeconds > 0 && durationSeconds <= 30) { // Max 30s like the slider
      uiPreferredGenerationDurationSeconds = durationSeconds;
      console.log(`[IPC Main] UI Preferred Generation Duration set to ${durationSeconds}s.`);
    } else {
      console.warn(`[IPC Main] Invalid UI preferred generation duration received: ${durationSeconds}`);
    }
  });

  // Handler for getting existing local recordings
  ipcMain.handle("get-local-recordings", async () => {
    try {
      const audioDir = path.join(app.getPath('userData'), "local_recordings");
      
      if (!fs.existsSync(audioDir)) {
        return [];
      }

      const files = fs.readdirSync(audioDir);
      const recordings = [];

      for (const file of files) {
        if (file.endsWith('.wav')) {
          const filePath = path.join(audioDir, file);
          const stats = fs.statSync(filePath);
          
          recordings.push({
            id: file.replace('.wav', ''),
            path: filePath,
            timestamp: stats.mtime.getTime()
          });
        }
      }

      // Sort by timestamp (newest first)
      recordings.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(`[IPC Main] Found ${recordings.length} existing local recordings`);
      return recordings;
    } catch (error) {
      console.error("Error getting local recordings:", error);
      return [];
    }
  });

  // Handler for cleaning up old local recordings (older than 7 days)
  ipcMain.handle("cleanup-old-local-recordings", async () => {
    try {
      const audioDir = path.join(app.getPath('userData'), "local_recordings");
      
      if (!fs.existsSync(audioDir)) {
        return;
      }

      const files = fs.readdirSync(audioDir);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.wav')) {
          const filePath = path.join(audioDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime.getTime() < sevenDaysAgo) {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`[IPC Main] Deleted old recording: ${file}`);
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`[IPC Main] Cleaned up ${deletedCount} old local recordings`);
      }
    } catch (error) {
      console.error("Error cleaning up old local recordings:", error);
    }
  });

  // Handler for deleting a specific local recording
  ipcMain.handle("delete-local-recording", async (event, filePath: string) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error("File path is invalid or file does not exist");
      }

      fs.unlinkSync(filePath);
      console.log(`[IPC Main] Deleted local recording: ${filePath}`);
    } catch (error) {
      console.error("Error deleting local recording:", error);
      throw error;
    }
  });
}
