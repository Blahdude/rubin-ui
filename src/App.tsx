import { ToastProvider } from "./components/ui/toast"
import Queue from "./_pages/Queue"
import { ToastViewport } from "@radix-ui/react-toast"
import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "react-query"

// Define ConversationItem type - should match electron/main.ts
export type ConversationItem =
  | { type: "user_text"; content: string; timestamp: number; id: string; }
  | { type: "user_file"; filePath: string; preview?: string; accompanyingText?: string; timestamp: number; id: string; }
  | { type: "ai_response"; content: any; timestamp: number; id: string; } // content is the structured AI JSON
  | { type: "system_message"; content: { message: string }; timestamp: number; id: string; };

declare global {
  interface Window {
    electronAPI: {
      //RANDOM GETTER/SETTERS
      updateContentDimensions: (dimensions: {
        width: number
        height: number
      }) => Promise<void>
      getScreenshots: () => Promise<Array<{ path: string; preview: string }>>

      //GLOBAL EVENTS
      onUnauthorized: (callback: () => void) => () => void
      onScreenshotTaken: (
        callback: (data: { path: string; preview: string }) => void
      ) => () => void
      onProcessingNoScreenshots: (callback: () => void) => () => void
      onResetView: (callback: () => void) => () => void
      takeScreenshot: () => Promise<void>

      //INITIAL SOLUTION EVENTS
      deleteScreenshot: (
        path: string
      ) => Promise<{ success: boolean; error?: string }>
      onSolutionStart: (callback: () => void) => () => void
      onSolutionError: (callback: (error: string) => void) => () => void
      onSolutionSuccess: (callback: (data: any) => void) => () => void
      onProblemExtracted: (callback: (data: any) => void) => () => void

      onDebugSuccess: (callback: (data: any) => void) => () => void

      onDebugStart: (callback: () => void) => () => void
      onDebugError: (callback: (error: string) => void) => () => void

      // Audio Processing
      analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
      analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
      // Audio Recording and Generation
      onAudioRecordingComplete: (callback: (data: { path: string }) => void) => () => void;
      onAudioRecordingError: (callback: (data: { message: string }) => void) => () => void;
      generateMusicContinuation: (inputFilePath: string) => Promise<{ generatedPath: string, features: { bpm: string | number, key: string } }>;

      // VAD Events
      onVadWaiting: (callback: () => void) => () => void;
      onVadRecordingStarted: (callback: () => void) => () => void;
      onVadTimeout: (callback: () => void) => () => void;

      // Window/App Controls
      moveWindowLeft: () => Promise<void>
      moveWindowRight: () => Promise<void>
      quitApp: () => Promise<void>

      // Drag and Drop
      startFileDrag: (filePath: string) => void;

      // For notifying about newly generated audio
      notifyGeneratedAudioReady: (generatedPath: string, originalPath: string, features: { bpm: string | number, key: string }) => void;
      onGeneratedAudioReady: (callback: (data: { generatedPath: string, originalPath: string, features: { bpm: string | number, key: string } }) => void) => () => void;

      // ADDED for user follow-up
      userResponseToAi: (userText: string) => Promise<{ success: boolean; error?: string }>;
      onFollowUpSuccess: (callback: (data: any) => void) => () => void;
      onFollowUpError: (callback: (error: string) => void) => () => void;

      // CHAT RELATED - NEW AND REVISED
      startNewChat: () => Promise<{ success: boolean; error?: string }>;
      onChatUpdated: (callback: (newItem: ConversationItem) => void) => () => void;
    }
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      cacheTime: Infinity
    }
  }
})

const App: React.FC = () => {
  const [conversation, setConversation] = useState<ConversationItem[]>([]);

  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onChatUpdated((newItem: ConversationItem) => {
        console.log("CHAT_UPDATED received in App.tsx:", newItem);
        setConversation((prevConversation) => {
          if (prevConversation.find(item => item.id === newItem.id)) {
            return prevConversation;
          }
          return [...prevConversation, newItem];
        });
      }),

      window.electronAPI.onUnauthorized(() => {
        setConversation([]);
        console.log("Unauthorized, conversation cleared.");
        window.electronAPI.startNewChat();
      }),

      window.electronAPI.onResetView(() => {
        console.log("Received 'reset-view' message from main process");
        setConversation([]);
        window.electronAPI.startNewChat();
        console.log("View reset, new chat started via Command+R shortcut");
      }),
    ];

    return () => cleanupFunctions.forEach((cleanup) => cleanup());
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="h-screen bg-transparent text-black/80 flex flex-col">
          <Queue conversation={conversation} />
        </div>
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App
