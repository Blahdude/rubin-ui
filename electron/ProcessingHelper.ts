// ProcessingHelper.ts

import { AppState, ConversationItem } from "./main"
import { LLMHelper } from "./LLMHelper"
import dotenv from "dotenv"
import { v4 as uuidv4 } from "uuid"
import { callReplicateMusicGeneration, callACEStepTextConditioning, callMusicGenAudioConditioning } from "./ipcHandlers"

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
  public llmHelper: LLMHelper | undefined
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(appState: AppState) {
    this.appState = appState
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.warn("GEMINI_API_KEY not found in environment variables - AI features will be disabled")
      // Don't create LLMHelper if no API key - will be checked when needed
    } else {
      this.llmHelper = new LLMHelper(apiKey)
    }
  }

  public async startNewChat(): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    if (!this.llmHelper) {
      console.error("[ProcessingHelper] Cannot start chat - GEMINI_API_KEY not configured")
      return
    }

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

  public async processUserText(userText: string, screenshots?: Array<{ path: string; preview?: string }>): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow || (!userText.trim() && (!screenshots || screenshots.length === 0))) {
      console.log("[ProcessingHelper] processUserText: Called with no text and no screenshots. Aborting.");
      return;
    }

    if (!this.llmHelper) {
      console.error("[ProcessingHelper] Cannot process user text - GEMINI_API_KEY not configured")
      return
    }

    // Create an abort controller for this request
    this.currentProcessingAbortController = new AbortController();

    // Add user text to conversation history if present
    if (userText.trim()) {
      const userMessageItem: ConversationItem = {
        id: uuidv4(),
        type: "user_text",
        content: userText,
        timestamp: Date.now(),
      }
      this.appState.addToConversationHistory(userMessageItem)
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, userMessageItem)
    }

    try {
      // Use the strict union type expected by LlmHelper.sendMessage
      const messageParts: Array<{ text: string } | { filePath: string }> = [];

      if (userText.trim()) {
        messageParts.push({ text: userText }); // This creates an object with only the 'text' property
      }

      if (screenshots && screenshots.length > 0) {
        console.log(`[ProcessingHelper] Attaching ${screenshots.length} screenshots to LLM call.`);
        for (const screenshot of screenshots) {
          // This creates an object with only the 'filePath' property
          messageParts.push({ filePath: screenshot.path }); 
        }
      }
      
      if (messageParts.length === 0) {
        console.warn("[ProcessingHelper] processUserText: No message parts to send to LLM (empty text and no screenshots). Aborting AI call.");
        return;
      }

      // Check if the request was cancelled before making the LLM call
      if (this.currentProcessingAbortController?.signal.aborted) {
        console.log("[ProcessingHelper] Request was cancelled before LLM call");
        return;
      }

      const aiLLMResponse = await this.llmHelper.sendMessage(messageParts);

      // Check if the request was cancelled after the LLM call
      if (this.currentProcessingAbortController?.signal.aborted) {
        console.log("[ProcessingHelper] Request was cancelled after LLM call");
        return;
      }
   
      const aiMessageId = uuidv4(); // Unique ID for this whole AI interaction turn
      const solution = aiLLMResponse.solution; // Assuming aiLLMResponse structure

      if (solution?.action === 'generate_music_from_text') {
        console.log(`[ProcessingHelper] Detected "generate_music_from_text" action for AI Message ID: ${aiMessageId}`)
        const musicPrompt = solution.musicGenerationPrompt || ""

        // --- Send Initial AI Textual Response with Loading Indicator --- 
        const initialAiMessageItem: ConversationItem = {
          id: aiMessageId, // Use the master ID for this interaction
          type: "ai_response",
          content: {
            solution: { 
              code: solution.code || "Got it, working on that music for you...",
              problem_statement: solution.problem_statement || "Music Generation Request",
              context: solution.context || `Preparing to generate music with prompt: "${musicPrompt}"`,
              suggested_responses: solution.suggested_responses || [],
              reasoning: solution.reasoning || "Acknowledged request, starting generation."
            },
            isLoadingAudio: true, 
          },
          timestamp: Date.now(),
        }
        this.appState.addToConversationHistory(initialAiMessageItem)
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, initialAiMessageItem)
        // --- End Initial AI Response ---

        let finalAudioMessageContentUpdate: Partial<typeof initialAiMessageItem.content>

        if (FORCE_DEBUG_AUDIO_GENERATION) {
          console.log('[ProcessingHelper] FORCE_DEBUG_AUDIO_GENERATION is true. Serving debug audio.')
          await new Promise(resolve => setTimeout(resolve, 1000)) 
          finalAudioMessageContentUpdate = {
            isLoadingAudio: false,
          }
        } else {
          console.log(`[ProcessingHelper] Attempting Replicate text-to-music for AI Message ID: ${aiMessageId} with prompt: "${musicPrompt}". UI preferred duration will be used.`)
          try {
            const { generatedUrl, features, displayName, originalPromptText } = await callACEStepTextConditioning(aiMessageId, musicPrompt, undefined /* durationFromCaller - force use of UI preference */);
            console.log(`[ProcessingHelper] ACE-STEP generated audio URL (text-to-music) for AI Message ID: ${aiMessageId}: ${generatedUrl}, Features:`, features, `DisplayName: ${displayName}`, `OriginalPrompt: ${originalPromptText}`)
            
            finalAudioMessageContentUpdate = {
              isLoadingAudio: false,
              playableAudioPath: generatedUrl
            }

            // The critical step: Notify the queue that new audio is ready to be processed and uploaded.
            if (mainWindow && !mainWindow.isDestroyed()) {
                 mainWindow.webContents.send("generated-audio-ready", { generatedUrl, originalPath: undefined, features, displayName, originalPromptText })
            }

          } catch (replicateError: any) {
            console.error(`[ProcessingHelper] Error calling ACE-STEP for text-to-music for AI Message ID: ${aiMessageId}:`, replicateError)
            // Check if the error indicates cancellation
            if (replicateError.message && replicateError.message.includes("was canceled")) {
              finalAudioMessageContentUpdate = {
                isLoadingAudio: false,
                musicGenerationError: "Music generation was canceled by the user.", // User-friendly message
                musicGenerationCancelled: true // Optional flag for more specific UI handling
              }
            } else {
              finalAudioMessageContentUpdate = {
                isLoadingAudio: false,
                musicGenerationError: replicateError.message || "Unknown error during music generation."
              }
            }
          }
        }
        
        // Create the updated message item maintaining the original text response part
        const updatedAiMessageItem: ConversationItem = {
            id: aiMessageId, // CRITICAL: Use the same ID
            type: "ai_response",
            content: {
                ...initialAiMessageItem.content, // Carry over initial content (like solution text)
                ...finalAudioMessageContentUpdate // Apply updates (isLoadingAudio, path/error)
            },
            timestamp: Date.now(), // Update timestamp to reflect when audio processing finished
        }

        this.appState.addToConversationHistory(updatedAiMessageItem)
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, updatedAiMessageItem)

      } else if (solution?.action === 'generate_music_request') { 
        // This is legacy continuation logic. It sends a single message after generation.
        // If this needs the two-step display, it would need similar refactoring.
        console.log('[ProcessingHelper] Detected legacy "generate_music_request" (continuation) action.')
        const musicPrompt = solution.musicGenerationPrompt || ""
        const baseAudioForContinuation = 'audio/audio.wav' 
        const duration = solution.durationSeconds ? parseInt(String(solution.durationSeconds), 10) : 8
        let continuationMessageItem: ConversationItem

        // For simplicity, this legacy path still sends one message post-generation.
        // If two-step (text then audio update) is desired here, it needs the same ID logic.
        const tempContinuationAiMessageId = uuidv4()
        
        // Send a preliminary text message if we were to refactor this fully
        // For now, it sends one message after the fact.

        if (FORCE_DEBUG_AUDIO_GENERATION) {
          continuationMessageItem = {
            id: tempContinuationAiMessageId, type: "ai_response",
            content: { 
                solution: { 
                    code: solution.code || "Debug continuation created!", 
                    problem_statement: solution.problem_statement || "Music Continuation (Debug)",
                    context: solution.context || `Debug continuation based on ${baseAudioForContinuation} for prompt: "${musicPrompt}"`,
                    suggested_responses: solution.suggested_responses || [],
                    reasoning: solution.reasoning || "Serving debug audio for continuation."
                }, 
                playableAudioPath: baseAudioForContinuation 
            },
            timestamp: Date.now()
          }
        } else {
          try {
            // Use dedicated MusicGen function for audio conditioning
            const { generatedUrl, features, displayName, originalPromptText } = await callMusicGenAudioConditioning(tempContinuationAiMessageId, musicPrompt, baseAudioForContinuation, duration)
            continuationMessageItem = {
              id: tempContinuationAiMessageId, type: "ai_response",
              content: { 
                  solution: { 
                      code: solution.code || `MusicGen continuation generated (BPM: ${features.bpm}, Key: ${features.key})!`,
                      problem_statement: solution.problem_statement || "Music Continuation (MusicGen)",
                      context: solution.context || `Generated from: ${baseAudioForContinuation} with prompt: "${musicPrompt}"`,
                      suggested_responses: solution.suggested_responses || [],
                      reasoning: solution.reasoning || "Called MusicGen for audio conditioning."
                    }, 
                  playableAudioPath: generatedUrl
                },
              timestamp: Date.now()
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
                 mainWindow.webContents.send("generated-audio-ready", { generatedUrl, originalPath: baseAudioForContinuation, features, displayName, originalPromptText })
            }
          } catch (replicateError: any) {
            console.error("[ProcessingHelper] Error calling Replicate for continuation:", replicateError);
            continuationMessageItem = { 
                id: tempContinuationAiMessageId, 
                type: "ai_response", 
                content: { 
                    solution: { 
                        code: solution.code || "Sorry, couldn't continue that music.", 
                        problem_statement: solution.problem_statement || "Music Continuation (Error)",
                        context: solution.context || `Error during continuation: ${replicateError.message}`,
                        suggested_responses: solution.suggested_responses || [],
                        reasoning: replicateError.message || "Failed to continue music." 
                    },
                    musicGenerationError: replicateError.message || "Error during continuation."
                }, 
                timestamp: Date.now() 
            }
          }
        }
        this.appState.addToConversationHistory(continuationMessageItem)
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, continuationMessageItem)

      } else if (solution?.context?.startsWith('TEST_AUDIO_REQUEST:')) {
        // Legacy test audio - single message
        const contextParts = solution.context.split(':')
        const audioFilePath = contextParts.slice(1).join(':') 
        const testAudioMessageItem: ConversationItem = {
          id: aiMessageId, // Use the main ID for this interaction
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
          timestamp: Date.now()
        }
        this.appState.addToConversationHistory(testAudioMessageItem)
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, testAudioMessageItem)

      } else { // Standard AI response (no special action)
        const standardAiMessageItem: ConversationItem = {
          id: aiMessageId, 
          type: "ai_response",
          content: aiLLMResponse, 
          timestamp: Date.now(),
        }
        this.appState.addToConversationHistory(standardAiMessageItem)
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, standardAiMessageItem)
      }
    } catch (error: any) {
      console.error("[ProcessingHelper] Error in processUserText:", error)
      
      // Check if this was a cancellation
      if (this.currentProcessingAbortController?.signal.aborted) {
        console.log("[ProcessingHelper] Request was cancelled during processing");
        return;
      }
      
      const errorItem: ConversationItem = {
        id: uuidv4(), // New ID for a distinct error message
        type: "ai_response",
        content: { solution: { code: "Error processing message.", problem_statement: "Error", context: error.message, suggested_responses: [], reasoning: "Could not get AI response or process action." } },
        timestamp: Date.now(),
      }
      this.appState.addToConversationHistory(errorItem)
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, errorItem)
    } finally {
      // Clean up the abort controller
      this.currentProcessingAbortController = null;
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
    return this.llmHelper || null
  }
}
