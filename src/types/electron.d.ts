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

  // MUSIC GENERATION
  generateMusic: (operationId: string, promptText: string, inputFilePath?: string, durationSeconds?: number) => Promise<{ generatedPath: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }>
  cancelMusicGeneration: (operationId: string) => Promise<{ success: boolean, message: string }>
  notifyGeneratedAudioReady: (generatedPath: string, originalPath: string | undefined, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string) => void
  onGeneratedAudioReady: (callback: (data: { generatedPath: string, originalPath?: string, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
} 