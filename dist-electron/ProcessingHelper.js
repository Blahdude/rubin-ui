"use strict";
// ProcessingHelper.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessingHelper = void 0;
const LLMHelper_1 = require("./LLMHelper");
const dotenv_1 = __importDefault(require("dotenv"));
const uuid_1 = require("uuid");
const ipcHandlers_1 = require("./ipcHandlers");
dotenv_1.default.config();
// --- MODE SWITCH ---
// Set to true to always use 'audio/audio.wav' for music generation requests (debug mode)
// Set to false to attempt calling the Replicate API for music continuation
const FORCE_DEBUG_AUDIO_GENERATION = false;
// --- END MODE SWITCH ---
const isDev = process.env.NODE_ENV === "development";
const isDevTest = process.env.IS_DEV_TEST === "true";
const MOCK_API_WAIT_TIME = Number(process.env.MOCK_API_WAIT_TIME) || 500;
class ProcessingHelper {
    appState;
    llmHelper;
    currentProcessingAbortController = null;
    currentExtraProcessingAbortController = null;
    constructor(appState) {
        this.appState = appState;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn("GEMINI_API_KEY not found in environment variables - AI features will be disabled");
            // Don't create LLMHelper if no API key - will be checked when needed
        }
        else {
            this.llmHelper = new LLMHelper_1.LLMHelper(apiKey);
        }
    }
    async startNewChat() {
        const mainWindow = this.appState.getMainWindow();
        if (!mainWindow)
            return;
        if (!this.llmHelper) {
            console.error("[ProcessingHelper] Cannot start chat - GEMINI_API_KEY not configured");
            return;
        }
        try {
            console.log("[ProcessingHelper] Starting new chat...");
            const initialAiResponse = await this.llmHelper.newChat();
            this.appState.clearConversationHistory();
            const messageToSendToUi = initialAiResponse && initialAiResponse.solution
                ? { id: (0, uuid_1.v4)(), type: "ai_response", content: initialAiResponse, timestamp: Date.now() }
                : { id: (0, uuid_1.v4)(), type: "system_message", content: { message: "New chat started" }, timestamp: Date.now() };
            if (messageToSendToUi.type === "ai_response") {
                this.appState.addToConversationHistory(messageToSendToUi);
            }
            mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, messageToSendToUi);
            console.log("[ProcessingHelper] New chat started and history cleared.");
        }
        catch (error) {
            console.error("[ProcessingHelper] Error starting new chat:", error);
            const errorItem = {
                id: (0, uuid_1.v4)(),
                type: "ai_response",
                content: { solution: { code: "Error starting new chat.", problem_statement: "Error", context: error.message, suggested_responses: [], reasoning: "Could not initialize AI chat." } },
                timestamp: Date.now(),
            };
            this.appState.addToConversationHistory(errorItem);
            mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, errorItem);
        }
    }
    async processUserText(userText, screenshots) {
        const mainWindow = this.appState.getMainWindow();
        if (!mainWindow || (!userText.trim() && (!screenshots || screenshots.length === 0))) {
            console.log("[ProcessingHelper] processUserText: Called with no text and no screenshots. Aborting.");
            return;
        }
        if (!this.llmHelper) {
            console.error("[ProcessingHelper] Cannot process user text - GEMINI_API_KEY not configured");
            return;
        }
        // Add user text to conversation history if present
        if (userText.trim()) {
            const userMessageItem = {
                id: (0, uuid_1.v4)(),
                type: "user_text",
                content: userText,
                timestamp: Date.now(),
            };
            this.appState.addToConversationHistory(userMessageItem);
            mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, userMessageItem);
        }
        try {
            // Use the strict union type expected by LlmHelper.sendMessage
            const messageParts = [];
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
            const aiLLMResponse = await this.llmHelper.sendMessage(messageParts);
            const aiMessageId = (0, uuid_1.v4)(); // Unique ID for this whole AI interaction turn
            const solution = aiLLMResponse.solution; // Assuming aiLLMResponse structure
            if (solution?.action === 'generate_music_from_text') {
                console.log(`[ProcessingHelper] Detected "generate_music_from_text" action for AI Message ID: ${aiMessageId}`);
                const musicPrompt = solution.musicGenerationPrompt || "";
                // --- Send Initial AI Textual Response with Loading Indicator --- 
                const initialAiMessageItem = {
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
                };
                this.appState.addToConversationHistory(initialAiMessageItem);
                mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, initialAiMessageItem);
                // --- End Initial AI Response ---
                let finalAudioMessageContentUpdate;
                if (FORCE_DEBUG_AUDIO_GENERATION) {
                    console.log('[ProcessingHelper] FORCE_DEBUG_AUDIO_GENERATION is true. Serving debug audio.');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    finalAudioMessageContentUpdate = {
                        isLoadingAudio: false,
                        playableAudioPath: "audio/audio.wav"
                    };
                }
                else {
                    console.log(`[ProcessingHelper] Attempting Replicate text-to-music for AI Message ID: ${aiMessageId} with prompt: "${musicPrompt}". UI preferred duration will be used.`);
                    try {
                        const { generatedPath, features, displayName, originalPromptText } = await (0, ipcHandlers_1.callReplicateMusicGeneration)(aiMessageId, musicPrompt, undefined /* inputFilePath */, undefined /* durationFromCaller - force use of UI preference */);
                        console.log(`[ProcessingHelper] Replicate generated audio (text-to-music) for AI Message ID: ${aiMessageId}: ${generatedPath}, Features:`, features, `DisplayName: ${displayName}`, `OriginalPrompt: ${originalPromptText}`);
                        finalAudioMessageContentUpdate = {
                            isLoadingAudio: false,
                            playableAudioPath: generatedPath
                        };
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send("generated-audio-ready", { generatedPath, originalPath: undefined, features, displayName, originalPromptText });
                        }
                    }
                    catch (replicateError) {
                        console.error(`[ProcessingHelper] Error calling Replicate for text-to-music for AI Message ID: ${aiMessageId}:`, replicateError);
                        // Check if the error indicates cancellation
                        if (replicateError.message && replicateError.message.includes("was canceled")) {
                            finalAudioMessageContentUpdate = {
                                isLoadingAudio: false,
                                musicGenerationError: "Music generation was canceled by the user.", // User-friendly message
                                musicGenerationCancelled: true // Optional flag for more specific UI handling
                            };
                        }
                        else {
                            finalAudioMessageContentUpdate = {
                                isLoadingAudio: false,
                                musicGenerationError: replicateError.message || "Unknown error during music generation."
                            };
                        }
                    }
                }
                // Create the updated message item maintaining the original text response part
                const updatedAiMessageItem = {
                    id: aiMessageId, // CRITICAL: Use the same ID
                    type: "ai_response",
                    content: {
                        ...initialAiMessageItem.content, // Carry over initial content (like solution text)
                        ...finalAudioMessageContentUpdate // Apply updates (isLoadingAudio, path/error)
                    },
                    timestamp: Date.now(), // Update timestamp to reflect when audio processing finished
                };
                this.appState.addToConversationHistory(updatedAiMessageItem);
                mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, updatedAiMessageItem);
            }
            else if (solution?.action === 'generate_music_request') {
                // This is legacy continuation logic. It sends a single message after generation.
                // If this needs the two-step display, it would need similar refactoring.
                console.log('[ProcessingHelper] Detected legacy "generate_music_request" (continuation) action.');
                const musicPrompt = solution.musicGenerationPrompt || "";
                const baseAudioForContinuation = 'audio/audio.wav';
                const duration = solution.durationSeconds ? parseInt(String(solution.durationSeconds), 10) : 8;
                let continuationMessageItem;
                // For simplicity, this legacy path still sends one message post-generation.
                // If two-step (text then audio update) is desired here, it needs the same ID logic.
                const tempContinuationAiMessageId = (0, uuid_1.v4)();
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
                    };
                }
                else {
                    try {
                        // This legacy call does not currently support cancellation as it doesn't use an operationId. Consider refactoring.
                        const { generatedPath, features, displayName, originalPromptText } = await (0, ipcHandlers_1.callReplicateMusicGeneration)(tempContinuationAiMessageId, musicPrompt, baseAudioForContinuation, duration);
                        continuationMessageItem = {
                            id: tempContinuationAiMessageId, type: "ai_response",
                            content: {
                                solution: {
                                    code: solution.code || `Continuation generated (BPM: ${features.bpm}, Key: ${features.key})!`,
                                    problem_statement: solution.problem_statement || "Music Continuation",
                                    context: solution.context || `Generated from: ${baseAudioForContinuation} with prompt: "${musicPrompt}"`,
                                    suggested_responses: solution.suggested_responses || [],
                                    reasoning: solution.reasoning || "Called Replicate for music continuation."
                                },
                                playableAudioPath: generatedPath
                            },
                            timestamp: Date.now()
                        };
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send("generated-audio-ready", { generatedPath, originalPath: baseAudioForContinuation, features, displayName, originalPromptText });
                        }
                    }
                    catch (replicateError) {
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
                        };
                    }
                }
                this.appState.addToConversationHistory(continuationMessageItem);
                mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, continuationMessageItem);
            }
            else if (solution?.context?.startsWith('TEST_AUDIO_REQUEST:')) {
                // Legacy test audio - single message
                const contextParts = solution.context.split(':');
                const audioFilePath = contextParts.slice(1).join(':');
                const testAudioMessageItem = {
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
                };
                this.appState.addToConversationHistory(testAudioMessageItem);
                mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, testAudioMessageItem);
            }
            else { // Standard AI response (no special action)
                const standardAiMessageItem = {
                    id: aiMessageId,
                    type: "ai_response",
                    content: aiLLMResponse,
                    timestamp: Date.now(),
                };
                this.appState.addToConversationHistory(standardAiMessageItem);
                mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, standardAiMessageItem);
            }
        }
        catch (error) {
            console.error("[ProcessingHelper] Error in processUserText:", error);
            const errorItem = {
                id: (0, uuid_1.v4)(), // New ID for a distinct error message
                type: "ai_response",
                content: { solution: { code: "Error processing message.", problem_statement: "Error", context: error.message, suggested_responses: [], reasoning: "Could not get AI response or process action." } },
                timestamp: Date.now(),
            };
            this.appState.addToConversationHistory(errorItem);
            mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, errorItem);
        }
    }
    async processUserFile(filePath, accompanyingText) {
        const mainWindow = this.appState.getMainWindow();
        if (!mainWindow)
            return;
        console.log(`[ProcessingHelper] Processing user file: ${filePath} with text: "${accompanyingText || ''}"`);
        let preview;
        try {
            if (filePath.endsWith('.png') || filePath.endsWith('.jpeg') || filePath.endsWith('.jpg')) {
                preview = await this.appState.getImagePreview(filePath);
            }
        }
        catch (e) {
            console.warn(`Could not generate preview for file: ${filePath}`, e);
        }
        const userFileMessageItem = {
            id: (0, uuid_1.v4)(),
            type: "user_file",
            filePath: filePath,
            preview: preview,
            accompanyingText: accompanyingText,
            timestamp: Date.now(),
        };
        this.appState.addToConversationHistory(userFileMessageItem);
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, userFileMessageItem);
        try {
            const messageParts = [];
            if (accompanyingText) {
                messageParts.push(accompanyingText);
            }
            messageParts.push({ filePath: filePath });
            const aiResponse = await this.llmHelper.sendMessage(messageParts);
            const aiMessageItem = {
                id: (0, uuid_1.v4)(),
                type: "ai_response",
                content: aiResponse,
                timestamp: Date.now(),
            };
            this.appState.addToConversationHistory(aiMessageItem);
            mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, aiMessageItem);
        }
        catch (error) {
            console.error("[ProcessingHelper] Error sending file to LLM:", error);
            const errorItem = {
                id: (0, uuid_1.v4)(),
                type: "ai_response",
                content: { solution: { code: "Error processing file.", problem_statement: "Error", context: error.message, suggested_responses: [], reasoning: "Could not get AI response for file." } },
                timestamp: Date.now(),
            };
            this.appState.addToConversationHistory(errorItem);
            mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, errorItem);
        }
    }
    async processScreenshots() {
        const mainWindow = this.appState.getMainWindow();
        if (!mainWindow)
            return;
        const mainScreenshotQueue = this.appState.getScreenshotHelper().getScreenshotQueue();
        const extraScreenshotQueue = this.appState.getScreenshotHelper().getExtraScreenshotQueue();
        let screenshotProcessed = false;
        let screenshotPathToProcess;
        let accompanyingTextForFile;
        if (mainScreenshotQueue.length > 0) {
            screenshotPathToProcess = mainScreenshotQueue[mainScreenshotQueue.length - 1];
            accompanyingTextForFile = "Analyze this screenshot in our current conversation context:";
            console.log(`[ProcessingHelper] processScreenshots: Identified from main queue: ${screenshotPathToProcess}`);
        }
        else if (extraScreenshotQueue.length > 0) {
            screenshotPathToProcess = extraScreenshotQueue[extraScreenshotQueue.length - 1];
            accompanyingTextForFile = "Regarding our conversation, also consider this extra screenshot:";
            console.log(`[ProcessingHelper] processScreenshots: Identified from extra queue: ${screenshotPathToProcess}`);
        }
        if (screenshotPathToProcess && accompanyingTextForFile) {
            try {
                await this.processUserFile(screenshotPathToProcess, accompanyingTextForFile);
                screenshotProcessed = true;
            }
            catch (error) {
                console.error(`[ProcessingHelper] Error during processUserFile for ${screenshotPathToProcess}:`, error);
                // Decide if queue should be cleared even on error, or if item should remain for retry.
                // For now, let's clear to prevent loops with a problematic file.
            }
            finally {
                // Always clear queues after attempting to process a screenshot from them,
                // regardless of success or failure of processUserFile, to prevent reprocessing loops.
                this.appState.getScreenshotHelper().clearQueues();
                console.log("[ProcessingHelper] Queues cleared after screenshot processing attempt.");
            }
        }
        if (!screenshotProcessed && this.appState.getView() === "queue") {
            // This condition means no screenshot was identified in queues initially.
            mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS);
            console.log("[ProcessingHelper] processScreenshots: No screenshots in queues, view is queue. Sent NO_SCREENSHOTS.");
        }
    }
    cancelOngoingRequests() {
        if (this.currentProcessingAbortController) {
            this.currentProcessingAbortController.abort();
            this.currentProcessingAbortController = null;
        }
        if (this.currentExtraProcessingAbortController) {
            this.currentExtraProcessingAbortController.abort();
            this.currentExtraProcessingAbortController = null;
        }
        this.appState.setHasDebugged(false);
    }
    async processAudioBase64(data, mimeType) {
        return this.llmHelper.analyzeAudioFromBase64(data, mimeType);
    }
    async processAudioFile(filePath) {
        return this.llmHelper.analyzeAudioFile(filePath);
    }
    getLLMHelper() {
        return this.llmHelper || null;
    }
}
exports.ProcessingHelper = ProcessingHelper;
//# sourceMappingURL=ProcessingHelper.js.map