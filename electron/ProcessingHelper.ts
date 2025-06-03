// ProcessingHelper.ts

import { AppState } from "./main"
import { LLMHelper } from "./LLMHelper"
import dotenv from "dotenv"

dotenv.config()

const isDev = process.env.NODE_ENV === "development"
const isDevTest = process.env.IS_DEV_TEST === "true"
const MOCK_API_WAIT_TIME = Number(process.env.MOCK_API_WAIT_TIME) || 500

export class ProcessingHelper {
  private appState: AppState
  private llmHelper: LLMHelper
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(appState: AppState) {
    this.appState = appState
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not found in environment variables")
    }
    this.llmHelper = new LLMHelper(apiKey)
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    const mainScreenshotQueue = this.appState.getScreenshotHelper().getScreenshotQueue()
    const currentViewFromState = this.appState.getView()

    // Priority 1: If mainScreenshotQueue has items, process them as a new problem definition.
    if (mainScreenshotQueue.length > 0) {
      const screenshotPath = mainScreenshotQueue[mainScreenshotQueue.length - 1] // Get the last one to process

      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START)
      this.currentProcessingAbortController = new AbortController()
      try {
        let problemInfoFromExtraction: any; // Define structure based on previous versions

        if (screenshotPath.endsWith(".mp3") || screenshotPath.endsWith(".wav")) {
          const extractedAudioInfo = await this.llmHelper.extractProblemFromAudio(screenshotPath)
          problemInfoFromExtraction = {
            problem_statement: extractedAudioInfo.problem_statement,
            input_format: { description: extractedAudioInfo.context || "Context from audio", parameters: [] as any[] },
            output_format: { description: "Output based on audio analysis", type: "string", subtype: "text" },
            complexity: { time: "N/A", space: "N/A" },
            test_cases: [] as any[],
            constraints: [] as any[],
            validation_type: "manual",
            difficulty: "custom",
            // Optional: Store original LLM outputs if needed elsewhere
            // context_from_llm: extractedAudioInfo.context,
            // suggested_responses_from_llm: extractedAudioInfo.suggested_responses,
            // reasoning_from_llm: extractedAudioInfo.reasoning
          }
        } else {
          const extractedImageInfo = await this.llmHelper.extractProblemFromImages([screenshotPath])
          problemInfoFromExtraction = {
            problem_statement: extractedImageInfo.problem_statement,
            input_format: { description: extractedImageInfo.context || "Context from image", parameters: [] as any[] },
            output_format: { description: "Output based on image analysis", type: "string", subtype: "text" },
            complexity: { time: "N/A", space: "N/A" },
            test_cases: [] as any[],
            constraints: [] as any[],
            validation_type: "manual",
            difficulty: "custom",
            // Optional: Store original LLM outputs if needed elsewhere
            // context_from_llm: extractedImageInfo.context,
            // suggested_responses_from_llm: extractedImageInfo.suggested_responses,
            // reasoning_from_llm: extractedImageInfo.reasoning
          }
        }
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED, problemInfoFromExtraction)
        this.appState.setProblemInfo(problemInfoFromExtraction)
        this.appState.getScreenshotHelper().clearQueues() // Clear ALL queues after new problem is defined
      } catch (error: any) {
        console.error("Initial problem extraction error (image/audio):", error)
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, error.message)
        // Potentially clear queues here too, or ensure screenshot isn't stuck if extraction fails
        this.appState.getScreenshotHelper().clearQueues();
      } finally {
        this.currentProcessingAbortController = null
      }
      return; // Done for this call, new problem defined.
    }
    // Priority 2: If mainScreenshotQueue is empty, proceed based on current appState.view.
    else if (currentViewFromState === "solutions") {
      // This is the "solve existing problem" or "debug existing problem" path.
      // Ensure problemInfo exists.
      const problemInfo = this.appState.getProblemInfo()
      if (!problemInfo) {
        console.error("Cannot process in 'solutions' view: Problem information is missing.")
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.DEBUG_ERROR, // Or a more generic error
          "Cannot process: Problem information is missing."
        )
        return
      }

      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.DEBUG_START) // Signify start of this phase
      this.currentExtraProcessingAbortController = new AbortController()

      try {
        // TODO: Optimize: Avoid re-generating solution if it already exists and we are only debugging.
        // For now, keeping original logic which always generates solution first here.
        const solutionResult = await this.llmHelper.generateSolution(problemInfo)
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS, solutionResult)

        const extraScreenshotQueue = this.appState.getScreenshotHelper().getExtraScreenshotQueue()
        if (extraScreenshotQueue.length > 0) {
          const currentCode = solutionResult.solution.code
          const debugResult = await this.llmHelper.debugSolutionWithImages(
            problemInfo,
            currentCode,
            extraScreenshotQueue
          )
          this.appState.setHasDebugged(true)
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.DEBUG_SUCCESS, debugResult)
          this.appState.getScreenshotHelper().clearQueues() // Clear extra queue and main (which should be empty)
        } else {
          // No extra screenshots to debug with. Solution already sent.
          // Main queue is empty, extra queue is empty. No specific clear needed here
          // if previous steps guarantee clearance. However, to be safe:
          if(this.appState.getScreenshotHelper().getExtraScreenshotQueue().length > 0 || this.appState.getScreenshotHelper().getScreenshotQueue().length > 0){
             // This case implies queues were not empty as expected. Clear them to prevent loops.
             console.warn("Queues were not empty in solutions view without debug images, clearing them.")
             this.appState.getScreenshotHelper().clearQueues();
          }
        }
      } catch (error: any) {
        console.error("Solution/Debug processing error:", error)
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.DEBUG_ERROR, error.message)
        // Clear queues on error to prevent stuck states
        this.appState.getScreenshotHelper().clearQueues();
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
    // Priority 3: If main queue empty and view is "queue" (i.e., no new screenshots for problem def)
    else if (currentViewFromState === "queue" && mainScreenshotQueue.length === 0) {
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }

  public cancelOngoingRequests(): void {
    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
    }

    this.appState.setHasDebugged(false)
    // Potentially clear queues on cancel too, to prevent reprocessing of stale items
    // this.appState.getScreenshotHelper().clearQueues();
  }

  public async processAudioBase64(data: string, mimeType: string) {
    return this.llmHelper.analyzeAudioFromBase64(data, mimeType);
  }

  public async processAudioFile(filePath: string) {
    return this.llmHelper.analyzeAudioFile(filePath);
  }

  public getLLMHelper() {
    return this.llmHelper;
  }
}
