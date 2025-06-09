import { app, BrowserWindow, protocol } from "electron"
import { initializeIpcHandlers } from "./ipcHandlers"
import { WindowHelper } from "./WindowHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { ProcessingHelper } from "./ProcessingHelper"
import path from "node:path"
import fs from "node:fs"
import dotenv from "dotenv"

// Load environment variables - handle both development and packaged app
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
if (isDev) {
  // Development: load from root .env
  dotenv.config();
} else {
  // Production: load from Resources/.env
  const envPath = path.join(process.resourcesPath, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    console.warn('Environment file not found in packaged app:', envPath);
  }
}

export class AppState {
  private static instance: AppState | null = null

  private windowHelper: WindowHelper
  private screenshotHelper: ScreenshotHelper
  public shortcutsHelper: ShortcutsHelper
  public processingHelper: ProcessingHelper

  // View management
  private view: "queue" | "solutions" = "queue"

  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  } | null = null // Allow null

  private hasDebugged: boolean = false
  private lastAiResponse: any | null = null; // Will be superseded by conversationHistory
  private conversationHistory: ConversationItem[] = []; // ADDED

  // Processing events
  public readonly PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",

    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",

    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error",

    // ADDED for follow-up
    FOLLOW_UP_SUCCESS: "follow-up-success", // To be replaced
    FOLLOW_UP_ERROR: "follow-up-error",   // To be replaced

    CHAT_UPDATED: "chat-updated" // ADDED - for new AI messages in chat
  } as const

  constructor() {
    // Initialize WindowHelper with this
    this.windowHelper = new WindowHelper(this)

    // Initialize ScreenshotHelper
    this.screenshotHelper = new ScreenshotHelper(this.view)

    // Initialize ProcessingHelper
    this.processingHelper = new ProcessingHelper(this)

    // Initialize ShortcutsHelper
    this.shortcutsHelper = new ShortcutsHelper(this)
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  // Getters and Setters
  public getMainWindow(): BrowserWindow | null {
    return this.windowHelper.getMainWindow()
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
    this.screenshotHelper.setView(view)
  }

  public isVisible(): boolean {
    return this.windowHelper.isVisible()
  }

  public getScreenshotHelper(): ScreenshotHelper {
    return this.screenshotHelper
  }

  public getProblemInfo(): any {
    return this.problemInfo
  }

  public setProblemInfo(problemInfo: any): void {
    this.problemInfo = problemInfo
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotHelper.getScreenshotQueue()
  }

  public getExtraScreenshotQueue(): string[] {
    return this.screenshotHelper.getExtraScreenshotQueue()
  }

  // ADDED: Method to get all screenshots (paths) for the shortcut handler check
  public getScreenshots(): Array<{ path: string }> { 
    const mainPaths = this.screenshotHelper.getScreenshotQueue().map(p => ({ path: p }));
    const extraPaths = this.screenshotHelper.getExtraScreenshotQueue().map(p => ({ path: p }));
    return [...mainPaths, ...extraPaths];
  }

  // Window management methods
  public createWindow(): void {
    this.windowHelper.createWindow()
  }

  public hideMainWindow(): void {
    this.windowHelper.hideMainWindow()
  }

  public showMainWindow(): void {
    this.windowHelper.showMainWindow()
  }

  public toggleMainWindow(): void {
    console.log(
      "Screenshots: ",
      this.screenshotHelper.getScreenshotQueue().length,
      "Extra screenshots: ",
      this.screenshotHelper.getExtraScreenshotQueue().length
    )
    this.windowHelper.toggleMainWindow()
  }

  public setWindowDimensions(width: number, height: number): void {
    this.windowHelper.setWindowDimensions(width, height)
  }

  public async clearQueues(): Promise<void> {
    await this.screenshotHelper.clearQueues()

    // Clear problem info
    this.problemInfo = null

    // Reset view to initial state
    this.setView("queue")
  }

  // Screenshot management methods
  public async takeScreenshot(): Promise<string> {
    return this.screenshotHelper.takeScreenshot(
      () => this.hideMainWindow(),
      () => this.showMainWindow()
    )
  }

  public async getImagePreview(filepath: string): Promise<string> {
    return this.screenshotHelper.getImagePreview(filepath)
  }

  public async deleteScreenshot(path: string): Promise<{ success: boolean; error?: string }> {
    return this.screenshotHelper.deleteScreenshot(path)
  }

  // New methods to move the window
  public moveWindowLeft(): void {
    this.windowHelper.moveWindowLeft()
  }

  public moveWindowRight(): void {
    this.windowHelper.moveWindowRight()
  }
  public moveWindowDown(): void {
    this.windowHelper.moveWindowDown()
  }
  public moveWindowUp(): void {
    this.windowHelper.moveWindowUp()
  }

  public setHasDebugged(value: boolean): void {
    this.hasDebugged = value
  }

  public getHasDebugged(): boolean {
    return this.hasDebugged
  }

  // ADDED getter and setter for lastAiResponse
  public getLastAiResponse(): any | null {
    return this.lastAiResponse;
  }

  public setLastAiResponse(response: any | null): void {
    this.lastAiResponse = response;
  }

  // ADDED Conversation History Methods
  public getConversationHistory(): ConversationItem[] {
    return this.conversationHistory;
  }

  public addToConversationHistory(item: ConversationItem): void {
    this.conversationHistory.push(item);
    // Optionally, could emit CHAT_UPDATED here if AppState manages UI updates directly
    // For now, ProcessingHelper will explicitly send the event with the new AI message.
  }

  public clearConversationHistory(): void {
    this.conversationHistory = [];
    this.lastAiResponse = null; // Also clear the old single response state
    // Optionally, emit CHAT_UPDATED here with an empty history or initial message
  }
}

// Define ConversationItem type (can be moved to a types file later if preferred)
export type ConversationItem =
  | { type: "user_text"; content: string; timestamp: number; id: string; }
  | { type: "user_file"; filePath: string; preview?: string; accompanyingText?: string; timestamp: number; id: string; }
  | { type: "ai_response"; content: any; timestamp: number; id: string; }
  | { type: "system_message"; content: { message: string }; timestamp: number; id: string; };

// Application initialization
async function initializeApp() {
  const appState = AppState.getInstance()

  // Initialize IPC handlers before window creation
  initializeIpcHandlers(appState)

  app.whenReady().then(() => {
    appState.createWindow()
    console.log("App is ready")

    // Register custom protocol for local audio files
    protocol.registerFileProtocol("clp", (request, callback) => {
      console.log(`[CLP Protocol] Received request for URL: ${request.url}`);
      let rawPath = request.url.slice("clp://".length);

      // Check if the path is a full URL (like from Firebase Storage)
      if (rawPath.startsWith('https://') || rawPath.startsWith('http://')) {
        // For remote URLs, we can't use `callback({ path })`.
        // The renderer should be updated to not use `clp://` for remote URLs.
        // As a temporary measure, we will return an error to prevent a crash.
        console.warn(`[CLP Protocol] Attempting to load a remote URL (${rawPath}) via the 'clp' protocol. This should be handled in the renderer.`);
        callback({ error: -6 }); // -6 is net::ERR_FILE_NOT_FOUND
        return;
      }
      
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch (e) {
        console.error(`[CLP Protocol] Error decoding URI component for path: ${rawPath}`, e);
        return callback({ error: -2 }); // Consider a more specific error code if available
      }
      console.log(`[CLP Protocol] Decoded path: ${decodedPath}`);

      let finalResolvedPath;
      if (path.isAbsolute(decodedPath)) {
        finalResolvedPath = decodedPath;
        console.log(`[CLP Protocol] Path is absolute: ${finalResolvedPath}`);
      } else {
        // If path is relative, resolve it from the app's root directory.
        // app.getAppPath() points to the app root in dev, and resources/app(.asar) in prod.
        finalResolvedPath = path.join(app.getAppPath(), decodedPath);
        console.log(`[CLP Protocol] Path is relative. Resolved from app root to: ${finalResolvedPath}`);
      }

      // IMPORTANT: Add security checks here if necessary!
      // For example, ensure the path is within an allowed directory.

      try {
        const fileExists = fs.existsSync(finalResolvedPath);
        console.log(`[CLP Protocol] Checking existence of (final path): ${finalResolvedPath}. Exists: ${fileExists}`);
        if (fileExists) {
          callback({ path: finalResolvedPath });
        } else {
          console.error(`[CLP Protocol] File not found (final path): ${finalResolvedPath}`);
          callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
        }
      } catch (error) {
        console.error(`[CLP Protocol] Error accessing file ${finalResolvedPath}:`, error);
        callback({ error: -2 }); // net::ERR_FAILED or a more specific error
      }
    })

    appState.shortcutsHelper.registerGlobalShortcuts()
    appState.shortcutsHelper.registerAudioShortcut()
  })

  app.on("activate", () => {
    console.log("App activated")
    if (appState.getMainWindow() === null) {
      appState.createWindow()
    }
  })

  // Quit when all windows are closed, except on macOS
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  app.dock?.hide() // Hide dock icon for overlay app
  app.commandLine.appendSwitch("disable-background-timer-throttling")
}

// Start the application
initializeApp().catch(console.error)
