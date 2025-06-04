// ProcessingHelper.ts

import { AppState, ConversationItem } from "./main"
import { LLMHelper } from "./LLMHelper"
import dotenv from "dotenv"
import { v4 as uuidv4 } from "uuid"
import { callReplicateToContinueMusic } from "./ipcHandlers"

dotenv.config()

// --- MODE SWITCH ---
// Set to true to always use 'audio/audio.wav' for music generation requests (debug mode)
// Set to false to attempt calling the Replicate API for music continuation
const FORCE_DEBUG_AUDIO_GENERATION = false;
// --- END MODE SWITCH ---

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

  public async startNewChat(): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    try {
      console.log("[ProcessingHelper] Starting new chat...")
      const initialAiResponse = await this.llmHelper.newChat()
      this.appState.clearConversationHistory()
      
      const messageToSendToUi = initialAiResponse && initialAiResponse.solution
        ? { id: uuidv4(), type: "ai_response", content: initialAiResponse, timestamp: Date.now() } as ConversationItem
        : { id: uuidv4(), type: "system_message", content: { message: "New chat started" }, timestamp: Date.now() } as ConversationItem
      
      if (messageToSendToUi.type === "ai_response") {
        this.appState.addToConversationHistory(messageToSendToUi)
      }
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, messageToSendToUi)
      console.log("[ProcessingHelper] New chat started and history cleared.")
    } catch (error: any) {
      console.error("[ProcessingHelper] Error starting new chat:", error)
      const errorItem: ConversationItem = {
        id: uuidv4(),
        type: "ai_response",
        content: { solution: { code: "Error starting new chat.", problem_statement: "Error", context: error.message, suggested_responses: [], reasoning: "Could not initialize AI chat." } },
        timestamp: Date.now(),
      }
      this.appState.addToConversationHistory(errorItem)
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, errorItem)
    }
  }

  public async processUserText(userText: string): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow || !userText.trim()) return

    console.log(`[ProcessingHelper] Processing user text: ${userText}`)
    const userMessageItem: ConversationItem = {
      id: uuidv4(),
      type: "user_text",
      content: userText,
      timestamp: Date.now(),
    }
    this.appState.addToConversationHistory(userMessageItem)
    mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, userMessageItem)

    try {
      const aiResponse = await this.llmHelper.sendMessage([{ text: userText }])
      let aiMessageItem: ConversationItem;
      const solution = aiResponse.solution;

      if (solution?.action === 'generate_music_request') {
        console.log('[ProcessingHelper] Detected "generate_music_request" action.');
        const musicPrompt = solution.musicGenerationPrompt || "";
        // For now, we'll use audio/audio.wav as the base for continuation.
        // Later, this could be a path to a user-recorded clip or another selection.
        const baseAudioForContinuation = 'audio/audio.wav'; 

        if (FORCE_DEBUG_AUDIO_GENERATION) {
          console.log('[ProcessingHelper] FORCE_DEBUG_AUDIO_GENERATION is true. Serving debug audio.');
          aiMessageItem = {
            id: uuidv4(),
            type: "ai_response",
            content: {
              solution: { 
                code: solution.code || "Here\'s a test track (debug mode)!",
                problem_statement: solution.problem_statement || "Music Generation Request (Debug)",
                context: solution.context || `Debug: Playing test file: ${baseAudioForContinuation}`,
                suggested_responses: solution.suggested_responses || [],
                reasoning: solution.reasoning || "Serving a predefined test audio file due to debug mode."
              },
              playableAudioPath: baseAudioForContinuation
            },
            timestamp: Date.now(),
          };
        } else {
          console.log(`[ProcessingHelper] Attempting Replicate music continuation with base: ${baseAudioForContinuation} and prompt: "${musicPrompt}"`);
          try {
            // ProcessingHelper is in the main process, so it can call callReplicateToContinueMusic directly.
            const { generatedPath, features } = await callReplicateToContinueMusic(baseAudioForContinuation, musicPrompt);
            console.log(`[ProcessingHelper] Replicate generated audio: ${generatedPath}, Features:`, features);

            aiMessageItem = {
              id: uuidv4(),
              type: "ai_response",
              content: {
                solution: { 
                  code: solution.code || `Generated some music for you (BPM: ${features.bpm}, Key: ${features.key})! Check it out:`,
                  problem_statement: solution.problem_statement || "Music Generation Request",
                  context: solution.context || `Generated from: ${baseAudioForContinuation} with prompt: "${musicPrompt}"`,
                  suggested_responses: solution.suggested_responses || [],
                  reasoning: solution.reasoning || "Called Replicate for music generation."
                },
                playableAudioPath: generatedPath 
              },
              timestamp: Date.now(),
            };
            // Notify renderer about the new generated audio so Queue.tsx can update its list
            if (mainWindow && !mainWindow.isDestroyed()) {
                 mainWindow.webContents.send("generated-audio-ready", { generatedPath, originalPath: baseAudioForContinuation, features });
            }
          } catch (replicateError: any) {
            console.error("[ProcessingHelper] Error calling Replicate for music continuation:", replicateError);
            aiMessageItem = {
              id: uuidv4(),
              type: "ai_response",
              content: {
                solution: { 
                  code: solution.code || "Sorry, I ran into an issue trying to make that music.",
                  problem_statement: solution.problem_statement || "Music Generation Request (Error)",
                  context: solution.context || `Error during music generation: ${replicateError.message}`,
                  suggested_responses: solution.suggested_responses || [],
                  reasoning: replicateError.message || "Failed to generate music via Replicate."
                }
              },
              timestamp: Date.now(),
            };
          }
        }
      } else if (solution?.context?.startsWith('TEST_AUDIO_REQUEST:')) { // Fallback for old test mechanism, if needed
        console.log('[ProcessingHelper] Detected legacy TEST_AUDIO_REQUEST.');
        const contextParts = solution.context.split(':');
        const audioFilePath = contextParts.slice(1).join(':'); 
        aiMessageItem = {
          id: uuidv4(),
          type: "ai_response",
          content: { 
            solution: {
                ...(solution || {}),
                code: solution.code || "Here is the test audio:",
                problem_statement: solution.problem_statement || "Test audio request",
                context: `Playing test file: ${audioFilePath}`,
                suggested_responses: solution.suggested_responses || [],
                reasoning: solution.reasoning || "Playing a pre-defined test audio file as requested."
            },
            playableAudioPath: audioFilePath
          },
          timestamp: Date.now(),
        };
      } else { // Standard AI response (no special action or old test request)
        aiMessageItem = {
          id: uuidv4(),
          type: "ai_response",
          content: aiResponse, // aiResponse contains the full { solution: { ... } } structure
          timestamp: Date.now(),
        };
      }
      this.appState.addToConversationHistory(aiMessageItem)
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, aiMessageItem)
    } catch (error: any) {
      console.error("[ProcessingHelper] Error sending text to LLM or processing response:", error)
      const errorItem: ConversationItem = {
        id: uuidv4(),
        type: "ai_response",
        content: { solution: { code: "Error processing message.", problem_statement: "Error", context: error.message, suggested_responses: [], reasoning: "Could not get AI response." } },
        timestamp: Date.now(),
      }
      this.appState.addToConversationHistory(errorItem)
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, errorItem)
    }
  }

  public async processUserFile(filePath: string, accompanyingText?: string): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    console.log(`[ProcessingHelper] Processing user file: ${filePath} with text: "${accompanyingText || ''}"`)
    let preview
    try {
      if (filePath.endsWith('.png') || filePath.endsWith('.jpeg') || filePath.endsWith('.jpg')) {
        preview = await this.appState.getImagePreview(filePath)
      }
    } catch (e) { console.warn(`Could not generate preview for file: ${filePath}`, e) }

    const userFileMessageItem: ConversationItem = {
      id: uuidv4(),
      type: "user_file",
      filePath: filePath,
      preview: preview,
      accompanyingText: accompanyingText,
      timestamp: Date.now(),
    }
    this.appState.addToConversationHistory(userFileMessageItem)
    mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, userFileMessageItem)

    try {
      const messageParts: Array<string | { filePath: string }> = []
      if (accompanyingText) {
        messageParts.push(accompanyingText)
      }
      messageParts.push({ filePath: filePath })

      const aiResponse = await this.llmHelper.sendMessage(messageParts)
      const aiMessageItem: ConversationItem = {
        id: uuidv4(),
        type: "ai_response",
        content: aiResponse,
        timestamp: Date.now(),
      }
      this.appState.addToConversationHistory(aiMessageItem)
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, aiMessageItem)
    } catch (error: any) {
      console.error("[ProcessingHelper] Error sending file to LLM:", error)
      const errorItem: ConversationItem = {
        id: uuidv4(),
        type: "ai_response",
        content: { solution: { code: "Error processing file.", problem_statement: "Error", context: error.message, suggested_responses: [], reasoning: "Could not get AI response for file." } },
        timestamp: Date.now(),
      }
      this.appState.addToConversationHistory(errorItem)
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, errorItem)
    }
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    const mainScreenshotQueue = this.appState.getScreenshotHelper().getScreenshotQueue()
    const extraScreenshotQueue = this.appState.getScreenshotHelper().getExtraScreenshotQueue()
    let screenshotProcessed = false
    let screenshotPathToProcess: string | undefined
    let accompanyingTextForFile: string | undefined

    if (mainScreenshotQueue.length > 0) {
      screenshotPathToProcess = mainScreenshotQueue[mainScreenshotQueue.length - 1]
      accompanyingTextForFile = "Analyze this screenshot in our current conversation context:"
      console.log(`[ProcessingHelper] processScreenshots: Identified from main queue: ${screenshotPathToProcess}`)
    } else if (extraScreenshotQueue.length > 0) {
      screenshotPathToProcess = extraScreenshotQueue[extraScreenshotQueue.length - 1]
      accompanyingTextForFile = "Regarding our conversation, also consider this extra screenshot:"
      console.log(`[ProcessingHelper] processScreenshots: Identified from extra queue: ${screenshotPathToProcess}`)
    }

    if (screenshotPathToProcess && accompanyingTextForFile) {
      try {
        await this.processUserFile(screenshotPathToProcess, accompanyingTextForFile)
        screenshotProcessed = true
      } catch (error) {
        console.error(`[ProcessingHelper] Error during processUserFile for ${screenshotPathToProcess}:`, error)
        // Decide if queue should be cleared even on error, or if item should remain for retry.
        // For now, let's clear to prevent loops with a problematic file.
      } finally {
        // Always clear queues after attempting to process a screenshot from them,
        // regardless of success or failure of processUserFile, to prevent reprocessing loops.
        this.appState.getScreenshotHelper().clearQueues()
        console.log("[ProcessingHelper] Queues cleared after screenshot processing attempt.")
      }
    }

    if (!screenshotProcessed && this.appState.getView() === "queue") {
      // This condition means no screenshot was identified in queues initially.
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS)
      console.log("[ProcessingHelper] processScreenshots: No screenshots in queues, view is queue. Sent NO_SCREENSHOTS.")
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
  }

  public async processAudioBase64(data: string, mimeType: string) {
    return this.llmHelper.analyzeAudioFromBase64(data, mimeType)
  }

  public async processAudioFile(filePath: string) {
    return this.llmHelper.analyzeAudioFile(filePath)
  }

  public getLLMHelper() {
    return this.llmHelper
  }
}
