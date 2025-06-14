"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMHelper = void 0;
const generative_ai_1 = require("@google/generative-ai");
const fs_1 = __importDefault(require("fs"));
const cyanite_tags_parser_1 = require("./cyanite-tags-parser");
class LLMHelper {
    model;
    chat = null;
    systemPrompt = `You are Rick Rubin (however you go by Rubin and if someone asks you what your name is, you say Rubin, not Rick), you provide wisdom, solutions, and feedback to musicians and artists. You will have to analyze the user's input and provide a solution in a clear and simple format.`;
    constructor(apiKey) {
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // CHANGED from gemini-1.5-flash-latest
        this.initializeChat();
    }
    initializeChat() {
        // Initialize the chat with the system prompt as the initial context from the model's perspective (or user, depending on desired behavior)
        // For a system prompt, it's often better to frame it as the first part of the first user message or as history.
        // Here, we'll prepend it to the first actual user message if the chat needs to be started.
        // More robustly, startChat can take an initial history. Let's use that.
        // Get valid tags from the CSV file
        const validTags = (0, cyanite_tags_parser_1.getAllValidTags)();
        const validTagsList = validTags.slice(0, 100).join(', '); // Show first 100 tags as examples
        const totalTagsCount = validTags.length;
        const musicGenerationInstruction = `\n\nSPECIAL INSTRUCTION FOR MUSIC GENERATION REQUESTS:\nYour primary role is to be Rick Rubin (however you go by Rubin and if someone asks you what your name is, you say Rubin, not Rick), offering wisdom and feedback. You should engage in conversation about music, artists, genres, etc. However, if the user expresses a clear intent or desire for you to *actually generate an audio track*, you MUST handle this as a specific action.
Signals for this include:
- Explicit requests like "generate music", "make a ...", "create a song".
- User confirming a choice after you've presented options for generation
- Strong affirmative statements about generation
- Expressions of excitement or decision to proceed with a previously discussed musical idea

If such intent is detected, your JSON response MUST include:
1. In the 'solution' object, an 'action' field with the exact string value 'generate_music_from_text'.
2. In the 'solution' object, a 'musicGenerationPrompt' field containing a descriptive text prompt suitable for a music generation model, derived from the user's request and any preceding discussion. 

CRITICAL CONSTRAINT FOR MUSIC GENERATION PROMPTS:
- You MUST ONLY use tags from this approved list of ${totalTagsCount} valid tags: ${validTagsList}... (and more)
- NEVER include, artists, or any tags not in this approved list
- NEVER include vocals, lyrics, or vocal-related terms
- Format as comma-separated tags only
- Example: if user says 'make a sad blues track', use only approved tags like 'Blues, Sad, Melancholy'
- If user mentions specific artists, translate to appropriate genre/mood tags from the approved list only
- You may include instruments but limit to one or two instruments at most

3. Your textual response (in 'solution.code' or 'solution.reasoning') should acknowledge the user's request *and* answer any other questions they might have asked in the same message. For example, if the user says "Let's do Schubert! Also, what was his origin story in one sentence?", your 'code' field should contain the answer about Schubert's origin *and* an acknowledgement that you're about to generate Schubert-style music. Example: "Okay, creating a Schubert-esque piece! Franz Schubert was an Austrian composer of the late Classical and early Romantic eras. I'm thinking a prompt like: [your derived musicGenerationPrompt].".
4. Focus only on instrumental generation using approved tags.

If the user is merely discussing music, asking for opinions, or exploring ideas *without* a clear signal to generate audio *right now*, then DO NOT include the 'action', 'musicGenerationPrompt', or 'durationSeconds' fields. Continue the conversation normally as Rick Rubin (however you go by Rubin and if someone asks you what your name is, you say Rubin, not Rick).
Remember to ONLY return the JSON object.`;
        this.chat = this.model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: this.systemPrompt + "\nBegin interaction by analyzing the user\'s first message and responding in the specified JSON format." + musicGenerationInstruction }]
                },
                {
                    role: "model", // Prime the model with an empty successful-looking response structure to guide its output format.
                    parts: [{ text: JSON.stringify({ solution: { code: "Waiting for user input.", problem_statement: "N/A", context: "N/A", suggested_responses: [], reasoning: "I am ready to assist." } }, null, 2) }]
                }
            ]
            // generationConfig: { ... } // Optional: add temperature, etc.
        });
    }
    async generateWelcomeMessage() {
        if (!this.chat) {
            this.initializeChat();
        }
        console.log("[LLMHelper] Generating welcome message...");
        const prompt = "Introduce yourself to the user! Explain that you can generate music by (1) describing the music you want to hear, (2) listen to their music and generate/sample from existing music (⌘ + ;), or (3) answer questions based on visual conditioning that you provide me (⌘ + Enter). Keep it concise and welcoming. Respond ONLY with the JSON object format specified in our instructions. *when there are numbers, make bullets*";
        try {
            // Use the existing chat session to send the message
            const result = await this.chat.sendMessage(prompt);
            const response = await result.response;
            const text = this.cleanJsonResponse(response.text());
            const parsed = JSON.parse(text);
            console.log("[LLMHelper] Parsed welcome message response:", parsed);
            return parsed;
        }
        catch (error) {
            console.error("[LLMHelper] Error in generateWelcomeMessage:", error);
            return { solution: { code: "Hi! I'm Rubin. Something went wrong on my end, but I'm here to help. Feel free to ask me anything about your music.", problem_statement: "Error", context: error.message, suggested_responses: [], reasoning: "An error occurred with the AI model while generating a welcome message." } };
        }
    }
    async newChat() {
        this.initializeChat();
        console.log("[LLMHelper] New chat session started.");
        // Optionally return a confirmation or the initial primed model response
        return { solution: { code: "New chat started. How can I help?", problem_statement: "New Session", context: "", suggested_responses: [], reasoning: "Chat has been reset." } };
    }
    async fileToGenerativePart(filePath) {
        const data = await fs_1.default.promises.readFile(filePath);
        let mimeType = "";
        const extension = filePath.split('.').pop()?.toLowerCase();
        if (extension === 'png')
            mimeType = 'image/png';
        else if (extension === 'jpg' || extension === 'jpeg')
            mimeType = 'image/jpeg';
        else if (extension === 'mp3')
            mimeType = 'audio/mp3';
        else if (extension === 'wav')
            mimeType = 'audio/wav';
        // Add more mime types as needed or throw an error for unsupported types
        else
            throw new Error(`Unsupported file type: ${extension}`);
        return {
            inlineData: {
                data: data.toString("base64"),
                mimeType
            }
        };
    }
    cleanJsonResponse(text) {
        // Remove markdown code block syntax if present
        let cleanedText = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
        // Attempt to extract the main JSON object if there's surrounding text
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            // Ensure we are extracting a string that at least starts and ends like an object.
            cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
        }
        else {
            // If no clear braces are found, or they are in the wrong order, 
            // this might not be JSON, or it's severely malformed.
            // Log this situation, as trim() alone might not be enough.
            console.warn("[LLMHelper.cleanJsonResponse] Could not find clear JSON braces, proceeding with basic trim. Original text prefix:", text.substring(0, 100));
        }
        // Remove any leading/trailing whitespace from the potentially extracted JSON
        cleanedText = cleanedText.trim();
        return cleanedText;
    }
    // New primary method for sending messages to the chat
    async sendMessage(messageContent) {
        if (!this.chat) {
            console.log("[LLMHelper] Chat not initialized. Initializing now.");
            this.initializeChat();
            if (!this.chat)
                throw new Error("Chat initialization failed critically.");
        }
        const messageParts = [];
        for (const content of messageContent) {
            if (typeof content === 'string') {
                messageParts.push({ text: content });
            }
            else if ('filePath' in content) {
                try {
                    const filePart = await this.fileToGenerativePart(content.filePath);
                    messageParts.push(filePart);
                }
                catch (error) {
                    console.error(`[LLMHelper] Error processing file ${content.filePath}:`, error);
                    messageParts.push({ text: `(System: Failed to load file ${content.filePath})` });
                }
            }
            else if ('text' in content) {
                messageParts.push({ text: content.text });
            }
        }
        // Add an explicit instruction to respond in JSON to every message for consistency
        messageParts.push({ text: "\nImportant: Respond ONLY with the JSON object as specified in the initial instructions." });
        console.log("[LLMHelper] Sending message to chat with parts:", JSON.stringify(messageParts.map(p => p.text ? { text: p.text.substring(0, 100) + "..." } : { inlineData: "..." })));
        try {
            const result = await this.chat.sendMessage(messageParts);
            const response = await result.response;
            const text = this.cleanJsonResponse(response.text());
            console.log("[LLMHelper] Raw chat response text:", text.substring(0, 200) + "...");
            const parsed = JSON.parse(text);
            console.log("[LLMHelper] Parsed chat response:", parsed);
            return parsed;
        }
        catch (error) {
            console.error("[LLMHelper] Error in sendMessage or parsing response:", error);
            // Fallback or error structure
            return { solution: { code: "Error processing request.", problem_statement: "Error", context: error.message, suggested_responses: [], reasoning: "An error occurred with the AI model or parsing its response." } };
        }
    }
    async extractProblemFromAudio(audioPath) {
        try {
            const audioData = await fs_1.default.promises.readFile(audioPath);
            const mimeType = this.getMimeTypeFromPath(audioPath);
            const audioPart = {
                inlineData: {
                    data: audioData.toString("base64"),
                    mimeType: mimeType
                }
            };
            const prompt = `${this.systemPrompt}\n\nPlease analyze this audio and extract the following information in JSON format:\n{
  "problem_statement": "A clear statement of the problem or situation revealed in the audio.",
  "context": "Relevant background or context from the audio.",
  "suggested_responses": ["First possible answer or action based on the audio", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate based on the audio."
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`;
            const result = await this.model.generateContent([prompt, audioPart]);
            const response = await result.response;
            const text = this.cleanJsonResponse(response.text());
            return JSON.parse(text);
        }
        catch (error) {
            console.error("Error extracting problem from audio:", error);
            throw error;
        }
    }
    async extractProblemFromImages(imagePaths) {
        try {
            const imageParts = await Promise.all(imagePaths.map(path => this.fileToGenerativePart(path)));
            const prompt = `${this.systemPrompt}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n{
  "problem_statement": "A clear statement of the problem or situation depicted in the images.",
  "context": "Relevant background or context from the images.",
  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate."
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`;
            const result = await this.model.generateContent([prompt, ...imageParts]);
            const response = await result.response;
            const text = this.cleanJsonResponse(response.text());
            return JSON.parse(text);
        }
        catch (error) {
            console.error("Error extracting problem from images:", error);
            throw error;
        }
    }
    async generateSolution(problemInfo) {
        const prompt = `${this.systemPrompt}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`;
        console.log("[LLMHelper] Calling Gemini LLM for solution...");
        try {
            const result = await this.model.generateContent(prompt);
            console.log("[LLMHelper] Gemini LLM returned result.");
            const response = await result.response;
            const text = this.cleanJsonResponse(response.text());
            const parsed = JSON.parse(text);
            console.log("[LLMHelper] Parsed LLM response:", parsed);
            return parsed;
        }
        catch (error) {
            console.error("[LLMHelper] Error in generateSolution:", error);
            throw error;
        }
    }
    async debugSolutionWithImages(problemInfo, currentCode, debugImagePaths) {
        try {
            const imageParts = await Promise.all(debugImagePaths.map(path => this.fileToGenerativePart(path)));
            const prompt = `${this.systemPrompt}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`;
            const result = await this.model.generateContent([prompt, ...imageParts]);
            const response = await result.response;
            const text = this.cleanJsonResponse(response.text());
            const parsed = JSON.parse(text);
            console.log("[LLMHelper] Parsed debug LLM response:", parsed);
            return parsed;
        }
        catch (error) {
            console.error("Error debugging solution with images:", error);
            throw error;
        }
    }
    async analyzeAudioFile(audioPath) {
        try {
            const audioData = await fs_1.default.promises.readFile(audioPath);
            const audioPart = {
                inlineData: {
                    data: audioData.toString("base64"),
                    mimeType: this.getMimeTypeFromPath(audioPath)
                }
            };
            const prompt = `${this.systemPrompt}\n\nDescribe this audio clip in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the audio. Do not return a structured JSON object, just answer naturally as you would to a user.`;
            const result = await this.model.generateContent([prompt, audioPart]);
            const response = await result.response;
            const text = response.text();
            return { text, timestamp: Date.now() };
        }
        catch (error) {
            console.error("Error analyzing audio file:", error);
            throw error;
        }
    }
    async analyzeAudioFromBase64(data, mimeType) {
        try {
            const audioPart = {
                inlineData: {
                    data,
                    mimeType
                }
            };
            const prompt = `${this.systemPrompt}\n\nDescribe this audio clip in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the audio. Do not return a structured JSON object, just answer naturally as you would to a user and be concise.`;
            const result = await this.model.generateContent([prompt, audioPart]);
            const response = await result.response;
            const text = response.text();
            return { text, timestamp: Date.now() };
        }
        catch (error) {
            console.error("Error analyzing audio from base64:", error);
            throw error;
        }
    }
    async analyzeImageFile(imagePath) {
        try {
            const imageData = await fs_1.default.promises.readFile(imagePath);
            const imagePart = {
                inlineData: {
                    data: imageData.toString("base64"),
                    mimeType: "image/png"
                }
            };
            const prompt = `${this.systemPrompt}\n\nDescribe the content of this image in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the image. Do not return a structured JSON object, just answer naturally as you would to a user. Be concise and brief.`;
            const result = await this.model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const text = response.text();
            return { text, timestamp: Date.now() };
        }
        catch (error) {
            console.error("Error analyzing image file:", error);
            throw error;
        }
    }
    async generateFollowUp(previousAiResponse, userQuery) {
        const prompt = `${this.systemPrompt}

You previously provided the following information/solution:
${JSON.stringify(previousAiResponse, null, 2)}

The user has now responded with:
${userQuery}

Please provide an updated or follow-up response based on the user's input. Maintain the same JSON output format as your previous response, focusing on addressing the user's specific feedback, question, or correction. For example:
{
  "solution": {
    "code": "Updated code or main answer, if applicable, based on user feedback.",
    "problem_statement": "Restate or confirm the problem/situation, potentially clarified by user.",
    "context": "Updated or relevant background/context, incorporating user input.",
    "suggested_responses": ["New suggestions based on user feedback...", "Further actions..."],
    "reasoning": "Explanation for this follow-up, addressing the user's query."
  }
}
Important: Return ONLY the JSON object, without any markdown formatting or code blocks. If the user's query is a simple question not requiring a full structured update, you can put the answer primarily in the 'reasoning' or 'context' field, and reiterate previous relevant fields.`;
        console.log("[LLMHelper] Calling Gemini LLM for follow-up...");
        try {
            const result = await this.model.generateContent(prompt);
            console.log("[LLMHelper] Gemini LLM returned result for follow-up.");
            const response = await result.response;
            const text = this.cleanJsonResponse(response.text());
            const parsed = JSON.parse(text);
            console.log("[LLMHelper] Parsed follow-up LLM response:", parsed);
            return parsed;
        }
        catch (error) {
            console.error("[LLMHelper] Error in generateFollowUp:", error);
            throw error;
        }
    }
    getMimeTypeFromPath(filePath) {
        const extension = filePath.split('.').pop()?.toLowerCase();
        if (extension === 'mp3')
            return 'audio/mp3';
        if (extension === 'wav')
            return 'audio/wav';
        // Default or throw error if necessary, for now, defaulting to mpeg as in analyzeAudioFile if not mp3
        console.warn(`Unknown audio extension: ${extension}, defaulting to audio/mpeg`);
        return 'audio/mpeg';
    }
}
exports.LLMHelper = LLMHelper;
//# sourceMappingURL=LLMHelper.js.map