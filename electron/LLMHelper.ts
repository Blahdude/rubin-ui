import { GoogleGenerativeAI, GenerativeModel, ChatSession, Part } from "@google/generative-ai"
import fs from "fs"

export class LLMHelper {
  private model: GenerativeModel
  private chat: ChatSession | null = null;
  private readonly systemPrompt = `You are Rick Rubin, you provide wisdom, solutions, and feedback to musicians and artists. You will have to analyze the user's input and provide a solution in a clear and simple format.`

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey)
    this.model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) // CHANGED from gemini-1.5-flash-latest
    this.initializeChat();
  }

  private initializeChat() {
    // Initialize the chat with the system prompt as the initial context from the model's perspective (or user, depending on desired behavior)
    // For a system prompt, it's often better to frame it as the first part of the first user message or as history.
    // Here, we'll prepend it to the first actual user message if the chat needs to be started.
    // More robustly, startChat can take an initial history. Let's use that.
    this.chat = this.model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: this.systemPrompt + "\nBegin interaction by analyzing the user's first message and responding in the specified JSON format." }]
        },
        {
          role: "model", // Prime the model with an empty successful-looking response structure to guide its output format.
          parts: [{ text: JSON.stringify({ solution: { code: "Waiting for user input.", problem_statement: "N/A", context: "N/A", suggested_responses: [], reasoning: "I am ready to assist." } }, null, 2) }]
        }
      ]
      // generationConfig: { ... } // Optional: add temperature, etc.
    });
  }

  public async newChat() { // Method to explicitly start a new chat
    this.initializeChat();
    console.log("[LLMHelper] New chat session started.");
    // Optionally return a confirmation or the initial primed model response
    return { solution: { code: "New chat started. How can I help?", problem_statement: "New Session", context: "", suggested_responses: [] as string[], reasoning: "Chat has been reset." } };
  }

  private async fileToGenerativePart(filePath: string): Promise<Part> {
    const data = await fs.promises.readFile(filePath);
    let mimeType = "";
    const extension = filePath.split('.').pop()?.toLowerCase();
    if (extension === 'png') mimeType = 'image/png';
    else if (extension === 'jpg' || extension === 'jpeg') mimeType = 'image/jpeg';
    else if (extension === 'mp3') mimeType = 'audio/mp3';
    else if (extension === 'wav') mimeType = 'audio/wav';
    // Add more mime types as needed or throw an error for unsupported types
    else throw new Error(`Unsupported file type: ${extension}`);

    return {
      inlineData: {
        data: data.toString("base64"),
        mimeType
      }
    };
  }
  
  private cleanJsonResponse(text: string): string {
    // Remove markdown code block syntax if present
    let cleanedText = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');

    // Attempt to extract the main JSON object if there's surrounding text
    const firstBrace = cleanedText.indexOf('{');
    const lastBrace = cleanedText.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      // Ensure we are extracting a string that at least starts and ends like an object.
      cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
    } else {
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
  public async sendMessage(messageContent: Array<string | { filePath: string } | { text: string }>): Promise<any> {
    if (!this.chat) {
      console.log("[LLMHelper] Chat not initialized. Initializing now.");
      this.initializeChat();
      if(!this.chat) throw new Error("Chat initialization failed critically.")
    }

    const messageParts: Part[] = [];
    for (const content of messageContent) {
      if (typeof content === 'string') {
        messageParts.push({ text: content });
      } else if ('filePath' in content) {
        try {
          const filePart = await this.fileToGenerativePart(content.filePath);
          messageParts.push(filePart);
        } catch (error) {
          console.error(`[LLMHelper] Error processing file ${content.filePath}:`, error);
          messageParts.push({ text: `(System: Failed to load file ${content.filePath})` });
        }
      } else if ('text' in content) {
        messageParts.push({ text: content.text });
      }
    }

    // Add an explicit instruction to respond in JSON to every message for consistency
    messageParts.push({ text: "\nImportant: Respond ONLY with the JSON object as specified in the initial instructions." });

    console.log("[LLMHelper] Sending message to chat with parts:", JSON.stringify(messageParts.map(p => p.text ? {text: p.text.substring(0,100) + "..."} : {inlineData: "..."})));
    try {
      const result = await this.chat.sendMessage(messageParts);
      const response = await result.response;
      const text = this.cleanJsonResponse(response.text());
      console.log("[LLMHelper] Raw chat response text:", text.substring(0, 200) + "...");
      const parsed = JSON.parse(text);
      console.log("[LLMHelper] Parsed chat response:", parsed);
      return parsed;
    } catch (error) {
      console.error("[LLMHelper] Error in sendMessage or parsing response:", error);
      // Fallback or error structure
      return { solution: { code: "Error processing request.", problem_statement: "Error", context: (error as Error).message, suggested_responses: [], reasoning: "An error occurred with the AI model or parsing its response." } };
    }
  }

  public async extractProblemFromAudio(audioPath: string) {
    try {
      const audioData = await fs.promises.readFile(audioPath);
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
    } catch (error) {
      console.error("Error extracting problem from audio:", error);
      throw error;
    }
  }

  public async extractProblemFromImages(imagePaths: string[]) {
    try {
      const imageParts = await Promise.all(imagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n{
  "problem_statement": "A clear statement of the problem or situation depicted in the images.",
  "context": "Relevant background or context from the images.",
  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate."
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      return JSON.parse(text)
    } catch (error) {
      console.error("Error extracting problem from images:", error)
      throw error
    }
  }

  public async generateSolution(problemInfo: any) {
    const prompt = `${this.systemPrompt}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

    console.log("[LLMHelper] Calling Gemini LLM for solution...");
    try {
      const result = await this.model.generateContent(prompt)
      console.log("[LLMHelper] Gemini LLM returned result.");
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("[LLMHelper] Error in generateSolution:", error);
      throw error;
    }
  }

  public async debugSolutionWithImages(problemInfo: any, currentCode: string, debugImagePaths: string[]) {
    try {
      const imageParts = await Promise.all(debugImagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed debug LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("Error debugging solution with images:", error)
      throw error
    }
  }

  public async analyzeAudioFile(audioPath: string) {
    try {
      const audioData = await fs.promises.readFile(audioPath);
      const audioPart = {
        inlineData: {
          data: audioData.toString("base64"),
          mimeType: "audio/mp3"
        }
      };
      const prompt = `${this.systemPrompt}\n\nDescribe this audio clip in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the audio. Do not return a structured JSON object, just answer naturally as you would to a user.`;
      const result = await this.model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio file:", error);
      throw error;
    }
  }

  public async analyzeAudioFromBase64(data: string, mimeType: string) {
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
    } catch (error) {
      console.error("Error analyzing audio from base64:", error);
      throw error;
    }
  }

  public async analyzeImageFile(imagePath: string) {
    try {
      const imageData = await fs.promises.readFile(imagePath);
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
    } catch (error) {
      console.error("Error analyzing image file:", error);
      throw error;
    }
  }

  public async generateFollowUp(previousAiResponse: any, userQuery: string) {
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
    } catch (error) {
      console.error("[LLMHelper] Error in generateFollowUp:", error);
      throw error;
    }
  }

  private getMimeTypeFromPath(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    if (extension === 'mp3') return 'audio/mp3';
    if (extension === 'wav') return 'audio/wav';
    // Default or throw error if necessary, for now, defaulting to mpeg as in analyzeAudioFile if not mp3
    console.warn(`Unknown audio extension: ${extension}, defaulting to audio/mpeg`);
    return 'audio/mpeg'; 
  }
} 