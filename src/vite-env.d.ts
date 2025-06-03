/// <reference types="vite/client" />

// Import the type from its original location if possible, or redefine if necessary
// Assuming PROCESSING_EVENTS is a const enum or similar, it might not be directly importable
// For simplicity here, if it's complex, you might need to redefine or simplify its type for the global scope.

// Define the ElectronAPI interface for the renderer process
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
  onVadWaiting: (callback: () => void) => () => void
  onVadRecordingStarted: (callback: () => void) => () => void
  onVadTimeout: (callback: () => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<void>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
  analyzeImageFile: (path: string) => Promise<void>
  quitApp: () => Promise<void>
}

// Extend the global Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// If PROCESSING_EVENTS is used by ElectronAPI in a way that its type needs to be known globally,
// you might need to declare it here as well. For now, ElectronAPI itself doesn't seem to expose it directly in its method signatures.
// Example:
// declare const PROCESSING_EVENTS: { readonly [key: string]: string };
// However, it's better if types exposed on `window` are self-contained.
