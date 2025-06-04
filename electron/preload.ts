import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron"

// Types for the exposed Electron API
interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void

  onAudioRecordingComplete: (callback: (data: { path: string }) => void) => () => void
  onAudioRecordingError: (callback: (data: { message: string }) => void) => () => void

  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<void>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
  analyzeImageFile: (path: string) => Promise<void>
  quitApp: () => Promise<void>
  onVadWaiting: (callback: () => void) => () => void
  onVadRecordingStarted: (callback: () => void) => () => void
  onVadTimeout: (callback: () => void) => () => void
  startFileDrag: (filePath: string) => void
  generateMusic: (promptText: string, inputFilePath?: string, durationSeconds?: number) => Promise<{ generatedPath: string, features: { bpm: string | number, key: string } }>
  notifyGeneratedAudioReady: (generatedPath: string, originalPath: string, features: { bpm: string | number, key: string }) => void
  onGeneratedAudioReady: (callback: (data: { generatedPath: string, originalPath: string, features: { bpm: string | number, key: string } }) => void) => () => void

  // ADDED for user follow-up
  userResponseToAi: (userText: string) => Promise<{ success: boolean; error?: string }>;
  onFollowUpSuccess: (callback: (data: any) => void) => () => void;
  onFollowUpError: (callback: (error: string) => void) => () => void;

  // CHAT RELATED - NEW AND REVISED
  startNewChat: () => Promise<void>
  onChatUpdated: (callback: (data: any /* ConversationItem from main.ts */) => void) => () => void
}

export const PROCESSING_EVENTS = {
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
  DEBUG_ERROR: "debug-error"
} as const

// Expose the Electron API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  takeScreenshot: () => ipcRenderer.invoke("take-screenshot"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  deleteScreenshot: (path: string) =>
    ipcRenderer.invoke("delete-screenshot", path),

  // Event listeners
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data)
    ipcRenderer.on("screenshot-taken", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription)
    }
  },
  onSolutionsReady: (callback: (solutions: string) => void) => {
    const subscription = (_: any, solutions: string) => callback(solutions)
    ipcRenderer.on("solutions-ready", subscription)
    return () => {
      ipcRenderer.removeListener("solutions-ready", subscription)
    }
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("reset-view", subscription)
    return () => {
      ipcRenderer.removeListener("reset-view", subscription)
    }
  },
  onSolutionStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription)
    }
  },
  onDebugStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, subscription)
    }
  },

  onDebugSuccess: (callback: (data: any) => void) => {
    ipcRenderer.on("debug-success", (_event, data) => callback(data))
    return () => {
      ipcRenderer.removeListener("debug-success", (_event, data) =>
        callback(data)
      )
    }
  },
  onDebugError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    }
  },
  onSolutionError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
        subscription
      )
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    }
  },

  onProblemExtracted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.PROBLEM_EXTRACTED,
        subscription
      )
    }
  },
  onSolutionSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.SOLUTION_SUCCESS,
        subscription
      )
    }
  },
  onAudioRecordingComplete: (
    callback: (data: { path: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string }) => callback(data)
    ipcRenderer.on("audio-recording-complete", subscription)
    return () => {
      ipcRenderer.removeListener("audio-recording-complete", subscription)
    }
  },
  onAudioRecordingError: (
    callback: (data: { message: string }) => void
  ) => {
    const subscription = (_: any, data: { message: string }) => callback(data)
    ipcRenderer.on("audio-recording-error", subscription)
    return () => {
      ipcRenderer.removeListener("audio-recording-error", subscription)
    }
  },
  onVadWaiting: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("vad-waiting", subscription)
    return () => {
      ipcRenderer.removeListener("vad-waiting", subscription)
    }
  },
  onVadRecordingStarted: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("vad-recording-started", subscription)
    return () => {
      ipcRenderer.removeListener("vad-recording-started", subscription)
    }
  },
  onVadTimeout: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("vad-timeout", subscription)
    return () => {
      ipcRenderer.removeListener("vad-timeout", subscription)
    }
  },
  onUnauthorized: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    }
  },
  moveWindowLeft: () => ipcRenderer.invoke("move-window-left"),
  moveWindowRight: () => ipcRenderer.invoke("move-window-right"),
  analyzeAudioFromBase64: (data: string, mimeType: string) => ipcRenderer.invoke("analyze-audio-base64", data, mimeType),
  analyzeAudioFile: (path: string) => ipcRenderer.invoke("analyze-audio-file", path),
  analyzeImageFile: (path: string) => ipcRenderer.invoke("analyze-image-file", path),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  startFileDrag: (filePath: string) => {
    ipcRenderer.send("ondragstart-file", filePath)
  },
  generateMusic: (promptText: string, inputFilePath?: string, durationSeconds?: number) => 
    ipcRenderer.invoke("generate-music", promptText, inputFilePath, durationSeconds),
  notifyGeneratedAudioReady: (generatedPath: string, originalPath: string, features: { bpm: string | number, key: string }) => {
    ipcRenderer.send("notify-generated-audio-ready", { generatedPath, originalPath, features });
  },
  onGeneratedAudioReady: (callback) => {
    const channel = "generated-audio-ready";
    const handler = (event: IpcRendererEvent, data: { generatedPath: string, originalPath: string, features: { bpm: string | number, key: string } }) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },

  // ADDED for user follow-up
  userResponseToAi: (userText: string) => ipcRenderer.invoke('user-response-to-ai', userText),
  onFollowUpSuccess: (callback) => {
    const channel = "follow-up-success"; 
    ipcRenderer.on(channel, (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners(channel);
  },
  onFollowUpError: (callback) => {
    const channel = "follow-up-error"; 
    ipcRenderer.on(channel, (_event, error) => callback(error));
    return () => ipcRenderer.removeAllListeners(channel);
  },

  // CHAT RELATED - NEW AND REVISED
  startNewChat: () => ipcRenderer.invoke('start-new-chat'),
  onChatUpdated: (callback: (data: any /* ConversationItem from main.ts */) => void) => {
    const handler = (_event: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('chat-updated', handler);
    return () => ipcRenderer.removeListener('chat-updated', handler);
  },
} as ElectronAPI)
