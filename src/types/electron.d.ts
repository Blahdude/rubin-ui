export interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (callback: (data: { path: string; preview: string }) => void) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<void>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
  quitApp: () => Promise<void>
  onAudioAnalysisError: (callback: (error: string) => void) => () => void
  onAudioRecordingComplete: (callback: (data: { path: string }) => void) => () => void
  onAudioRecordingError: (callback: (data: { message: string }) => void) => () => void
  onVadWaiting: (callback: () => void) => () => void
  onVadRecordingStarted: (callback: () => void) => () => void
  onVadTimeout: (callback: () => void) => () => void
  startFileDrag: (filePath: string) => void

  // MUSIC GENERATION
  generateMusic: (operationId: string, promptText: string, inputFilePath?: string, durationSeconds?: number) => Promise<{ generatedUrl: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }>
  generateMusicFromRecording: (operationId: string, promptText: string, inputFilePath: string, durationSeconds?: number) => Promise<{ generatedUrl: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }>
  generateMusicFromText: (operationId: string, promptText: string, durationSeconds?: number) => Promise<{ generatedUrl: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }>
  cancelMusicGeneration: (operationId: string) => Promise<{ success: boolean, message: string }>
  notifyGeneratedAudioReady: (generatedUrl: string, originalPath: string | undefined, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string) => void
  onGeneratedAudioReady: (callback: (data: { generatedUrl: string, originalPath?: string, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string }) => void) => () => void
  setRecordingDuration: (durationSeconds: number) => void
  setUiPreferredGenerationDuration: (durationSeconds: number) => void

  userResponseToAi: (userText: string, screenshots?: Array<{ path: string; preview?: string }>) => Promise<{ success: boolean; error?: string }>;
  cancelQuery: () => Promise<{ success: boolean; error?: string }>;
  onFollowUpSuccess: (callback: (data: any) => void) => () => void;
  onFollowUpError: (callback: (error: string) => void) => () => void;
  startNewChat: () => Promise<void>
  onChatUpdated: (callback: (data: any) => void) => () => void
  onScreenshotQueueCleared: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
} 