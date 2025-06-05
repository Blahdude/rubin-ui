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

// Import the new function from shortcuts.ts
import { setRecordingDuration as setShortcutRecordingDuration } from "./shortcuts";

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

// Corrected callReplicateMusicGeneration function
export async function callReplicateMusicGeneration(
  operationId: string,
  promptText: string,
  inputFilePath?: string,
  durationFromCaller?: number // This is the UI slider value for "new segment length" in continuation, or desired total length if passed for text-to-music (though usually undefined for text-to-music now)
): Promise<{ generatedUrl: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }> {
  
  let finalApiDuration: number;
  let originalInputDurationForLog: number | string = "N/A";

  if (inputFilePath && typeof inputFilePath === 'string' && fs.existsSync(inputFilePath)) {
    // CONTINUATION LOGIC
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
    } catch (e) { console.error(`[Replicate] ffprobe error for op ${operationId}:`, e); knownInputAudioDurationSeconds = undefined; }
    
    originalInputDurationForLog = knownInputAudioDurationSeconds ?? "N/A";
    const newSegmentDuration = durationFromCaller ?? uiPreferredGenerationDurationSeconds; // Length of the part to add
    finalApiDuration = (knownInputAudioDurationSeconds || 0) + newSegmentDuration;
    // Round to nearest integer for the API
    finalApiDuration = Math.round(finalApiDuration);
    console.log(`[Replicate] CONTINUATION for op ${operationId}. Input: ${inputFilePath}, Input Duration: ~${originalInputDurationForLog}s. New Segment Desired: ${newSegmentDuration}s. Rounded Total API Duration: ${finalApiDuration}s.`);

  } else {
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

  const replicate = new Replicate({ auth: replicateApiKey });

  function sanitizePromptForFilename(prompt: string, maxLength: number = 50): string {
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
        truncated = truncated.substring(0, truncated.length -1);
    }
    if (!truncated) {
      return "generated_audio";
    }
    return truncated;
  }

  const modelInputs: any = {
    model_version: "stereo-melody-large",
    prompt: promptText,
    duration: finalApiDuration, // Use the calculated final API duration
    output_format: "wav"
  };

  if (inputFilePath && typeof inputFilePath === 'string' && fs.existsSync(inputFilePath)) {
    console.log(`[Replicate] Operation ${operationId}: Operating in CONTINUATION mode.`);
    modelInputs.continuation = true;
    modelInputs.continuation_start = 0;

    let inputAudioDurationSeconds: number | undefined;
    try {
      const durationOutput = await new Promise<string>((resolve, reject) => {
        exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`, (err, stdout, stderr) => {
          if (err) { console.error(`[Replicate] ffprobe stderr for op ${operationId}: ${stderr}`); return reject(err); }
          resolve(stdout.trim());
        });
      });
      inputAudioDurationSeconds = parseFloat(durationOutput);
      if (isNaN(inputAudioDurationSeconds)) inputAudioDurationSeconds = undefined;
    } catch (e) { console.error(`[Replicate] ffprobe error for op ${operationId}:`, e); inputAudioDurationSeconds = undefined; }
    
    modelInputs.continuation_end = Math.round(inputAudioDurationSeconds ? Math.min(inputAudioDurationSeconds, 2.0) : 2.0);
    modelInputs.input_audio = fs.readFileSync(inputFilePath);
    console.log(`[Replicate] Operation ${operationId}: Added continuation parameters and input_audio.`);
  } else {
    console.log(`[Replicate] Operation ${operationId}: Operating in TEXT-TO-MUSIC (from scratch) mode.`);
  }

  console.log(`[Replicate] Calling Replicate API for operation ${operationId} with inputs:`, { ...modelInputs, input_audio: modelInputs.input_audio ? `<Buffer for ${inputFilePath}>` : 'N/A' });
  
  let predictionId: string | null = null;

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
      const outputUrl = finalPrediction.output as string;
      console.log(`[Replicate] Prediction ${predictionId} (operation ${operationId}) succeeded. Output URL: ${outputUrl}`);
      console.log("THIS IS THE FINAL ATTEMPT")
      
      const baseName = inputFilePath 
        ? path.basename(inputFilePath, path.extname(inputFilePath)) 
        : sanitizePromptForFilename(promptText);

      return { generatedUrl: outputUrl, features: { bpm: "N/A", key: "N/A" }, displayName: baseName, originalPromptText: promptText };
    } else if (finalPrediction.status === "canceled") {
        console.log(`[Replicate] Music generation canceled for operation ${operationId}, prediction ${predictionId}.`);
        throw new Error(`Music generation for operation ${operationId} was canceled.`);
    } else { // failed
        console.error(`[Replicate] Music generation failed for operation ${operationId}, prediction ${predictionId}. Status: ${finalPrediction.status}, Error: ${finalPrediction.error}`);
        throw new Error(`Music generation failed for operation ${operationId}: ${finalPrediction.error || finalPrediction.status}`);
    }
  } catch (error: any) {
    console.error(`[Replicate] Overall error in callReplicateMusicGeneration for operation ${operationId} (prediction ${predictionId || 'N/A'}):`, error.message);
    // Ensure the error thrown has a message property, as ProcessingHelper expects it.
    throw (error instanceof Error ? error : new Error(String(error.message || error)));
  } finally {
    if (operationId) { // Ensure operationId was provided
      activeReplicatePredictions.delete(operationId);
      console.log(`[Replicate] Cleaned up operation ${operationId} (prediction ${predictionId || 'N/A'}) from active predictions map in finally block.`);
    }
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
    if (!appState) return { success: false, error: "AppState not initialized" };
    try {
      await appState.processingHelper.startNewChat();
      return { success: true };
    } catch (error: any) {
      console.error("Failed to start new chat via IPC:", error);
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

  ipcMain.handle("set-recording-duration", (event, durationSeconds: number) => {
    if (typeof durationSeconds === 'number' && durationSeconds > 0) {
      setShortcutRecordingDuration(durationSeconds);
      console.log(`[IPC Main] Recording duration set to ${durationSeconds}s via IPC.`);
      return { success: true };
    } else {
      console.warn(`[IPC Main] Invalid recording duration received: ${durationSeconds}`);
      return { success: false, error: "Invalid duration provided." };
    }
  });

  ipcMain.handle("set-ui-preferred-generation-duration", (event, durationSeconds: number) => {
    if (typeof durationSeconds === 'number' && durationSeconds > 0 && durationSeconds <= 30) { // Max 30s like the slider
      uiPreferredGenerationDurationSeconds = durationSeconds;
      console.log(`[IPC Main] UI Preferred Generation Duration set to ${durationSeconds}s.`);
      return { success: true };
    } else {
      console.warn(`[IPC Main] Invalid UI preferred generation duration received: ${durationSeconds}`);
      return { success: false, error: "Invalid or out-of-range duration provided." };
    }
  });
}
