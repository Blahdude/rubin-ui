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
dotenv_1.default.config();
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
            throw new Error("GEMINI_API_KEY not found in environment variables");
        }
        this.llmHelper = new LLMHelper_1.LLMHelper(apiKey);
    }
    async startNewChat() {
        const mainWindow = this.appState.getMainWindow();
        if (!mainWindow)
            return;
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
    async processUserText(userText) {
        const mainWindow = this.appState.getMainWindow();
        if (!mainWindow || !userText.trim())
            return;
        console.log(`[ProcessingHelper] Processing user text: ${userText}`);
        const userMessageItem = {
            id: (0, uuid_1.v4)(),
            type: "user_text",
            content: userText,
            timestamp: Date.now(),
        };
        this.appState.addToConversationHistory(userMessageItem);
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.CHAT_UPDATED, userMessageItem);
        try {
            const aiResponse = await this.llmHelper.sendMessage([{ text: userText }]);
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
            console.error("[ProcessingHelper] Error sending text to LLM:", error);
            const errorItem = {
                id: (0, uuid_1.v4)(),
                type: "ai_response",
                content: { solution: { code: "Error processing message.", problem_statement: "Error", context: error.message, suggested_responses: [], reasoning: "Could not get AI response." } },
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
        return this.llmHelper;
    }
}
exports.ProcessingHelper = ProcessingHelper;
//# sourceMappingURL=ProcessingHelper.js.map