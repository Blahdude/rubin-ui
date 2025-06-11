import { ToastProvider } from "./components/ui/toast"
import { ToastViewport } from "@radix-ui/react-toast"
import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "react-query"
import { onAuthStateChanged, User } from "firebase/auth"
import { auth } from "./lib/firebase"
import LoginPage from "./_pages/LoginPage"
import Header from "./components/Header"
import MainView from "./components/layout/MainView"
import TutorialBanner from "./components/TutorialBanner"

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
      onScreenshotLimitReached: (callback: (data: { message: string }) => void) => () => void
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
      generateMusic: (promptText: string, inputFilePath?: string, durationSeconds?: number) => Promise<{ generatedUrl: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }>;
      generateMusicFromRecording: (operationId: string, promptText: string, inputFilePath: string, durationSeconds?: number) => Promise<{ generatedUrl: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }>;
      generateMusicFromText: (operationId: string, promptText: string, durationSeconds?: number) => Promise<{ generatedUrl: string, features: { bpm: string | number, key: string }, displayName: string, originalPromptText: string }>;

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
      notifyGeneratedAudioReady: (generatedUrl: string, originalPath: string | undefined, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string) => void;
      onGeneratedAudioReady: (callback: (data: { generatedUrl: string, originalPath?: string, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string }) => void) => () => void;

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

const LoadingScreen = () => (
  <div className="flex items-center justify-center h-screen bg-transparent backdrop-blur-3xl text-foreground">
    <div className="flex flex-col items-center gap-6">
      {/* Animated logo */}
      <div className="relative">
        <div className="w-16 h-16 bg-gradient-to-br from-primary via-primary/90 to-primary/80 rounded-xl flex items-center justify-center shadow-lg animate-scale-in">
          <span className="text-primary-foreground font-bold text-2xl">R</span>
        </div>
        <div className="absolute inset-0 w-16 h-16 bg-gradient-to-br from-primary/20 to-transparent rounded-xl animate-glow"></div>
      </div>
      
      {/* Loading text with shimmer effect */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gradient mb-2">Rubin</h2>
        <p className="text-sm text-muted-foreground animate-pulse">Initializing AI Assistant...</p>
      </div>
      
      {/* Loading animation */}
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const [isProcessingSolution, setIsProcessingSolution] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(true);

  const handleQuitApp = () => {
    if (window.electronAPI && typeof window.electronAPI.quitApp === 'function') {
      window.electronAPI.quitApp();
    }
  };

  const handleTooltipVisibilityChange = (_visible: boolean, _height: number) => {
    // Dummy function for now
  }

  const handleCloseTutorial = () => {
    setShowTutorial(false);
    // Mark that user has seen the tutorial
    localStorage.setItem('hasSeenTutorial', 'true');
  }

  const handleShowTutorial = () => {
    setShowTutorial(true);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        if (!sessionInitialized) {
          console.log('User authenticated, initializing session with welcome message.');
          window.electronAPI.startNewChat();
          setSessionInitialized(true);
          
          // Show tutorial on every sign-in (you can modify this logic as needed)
          // For now, let's show it every time, but you could check localStorage to only show once
          setShowTutorial(true);
          setIsFirstLogin(false);
        }
      } else {
        // User signed out, clear conversation and reset the session flag
        setConversation([]);
        setSessionInitialized(false);
        setIsFirstLogin(true);
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [sessionInitialized, isFirstLogin]);

  useEffect(() => {
    // Attempt to move the window to the right on startup
    if (window.electronAPI && typeof window.electronAPI.moveWindowRight === 'function') {
      window.electronAPI.moveWindowRight()
        .then(() => console.log("Attempted to move window right."))
        .catch(err => console.error("Error moving window right:", err));
    }

    const cleanupFunctions = [
      window.electronAPI.onChatUpdated((newItem: ConversationItem) => {
        console.log("CHAT_UPDATED received in App.tsx:", newItem);
        setConversation((prevConversation) => {
          const existingItemIndex = prevConversation.findIndex(item => item.id === newItem.id);
          if (existingItemIndex !== -1) {
            // Replace existing item
            const updatedConversation = [...prevConversation];
            updatedConversation[existingItemIndex] = newItem;
            return updatedConversation;
          } else {
            // Add new item
            return [...prevConversation, newItem];
          }
        });
      }),

      window.electronAPI.onResetView(() => {
        console.log("Received 'reset-view' message from main process");
        setConversation([]);
        window.electronAPI.startNewChat();
        console.log("View reset, new chat started via Command+R shortcut");
      }),
    ];

    return () => cleanupFunctions.forEach((cleanup) => cleanup());
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="theme-frosted-glass h-screen backdrop-blur-3xl text-foreground relative overflow-hidden">
          {/* Minimal white background */}
          <div className="absolute inset-0 bg-white/60 pointer-events-none"></div>
          
          {/* Subtle light accent */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/1 via-transparent to-primary/2 pointer-events-none"></div>
          
          {/* Header with minimal backdrop */}
          <div className="draggable fixed top-0 left-0 right-0 z-50 flex-shrink-0">
            <div className="bg-white/60 backdrop-blur-xl border-b border-border/20">
              <Header
                onTooltipVisibilityChange={handleTooltipVisibilityChange}
                isProcessingSolution={isProcessingSolution}
                quitApp={handleQuitApp}
              />
            </div>
          </div>
          
          {/* Main content area - Clean and minimal */}
          <div className="pt-[72px] h-full overflow-hidden">
            <div className="h-full animate-fade-in">
              <MainView
                conversation={conversation}
                onProcessingStateChange={setIsProcessingSolution}
                onShowTutorial={handleShowTutorial}
              />
            </div>
          </div>
          
          {/* Tutorial Banner */}
          <TutorialBanner
            isVisible={showTutorial}
            onClose={handleCloseTutorial}
          />
          
          {/* Floating action indicator */}
          {isProcessingSolution && (
            <div className="fixed bottom-6 right-6 z-40 animate-slide-up">
              <div className="flex items-center gap-3 px-4 py-3 bg-white/70 backdrop-blur-xl border border-border/30 rounded-xl shadow-lg">
                <div className="relative">
                  <div className="w-3 h-3 bg-primary rounded-full animate-pulse-slow"></div>
                  <div className="absolute inset-0 w-3 h-3 bg-primary rounded-full animate-ping opacity-75"></div>
                </div>
                <span className="text-sm font-medium text-foreground">AI is processing...</span>
              </div>
            </div>
          )}
        </div>
        <ToastViewport className="fixed top-0 right-0 flex flex-col gap-2 w-[390px] max-w-[100vw] m-0 list-none z-[100] outline-none p-6" />
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App
