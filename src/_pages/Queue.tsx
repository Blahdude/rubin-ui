import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "react-query"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import {
  Toast,
  ToastTitle,
  ToastDescription,
  ToastVariant,
  ToastMessage
} from "../components/ui/toast"
import QueueCommands from "../components/Queue/QueueCommands"
import Solutions from "./Solutions"
import { GlobalRecording, GeneratedAudioClip } from "../types/audio"
import { ConversationItem } from "../App"

interface QueueProps {
  conversation: ConversationItem[]
}

// Remove AudioQueueItem interface for now, will re-evaluate when integrating properly
// interface AudioQueueItem {
//   id: string; 
//   path: string;
//   type: "recorded" | "generated";
//   status?: "generating" | "failed" | "ready";
//   originalPath?: string; 
// }

const Queue: React.FC<QueueProps> = ({ conversation }) => {
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "info"
  })

  // State for collapsibility - set to false for collapsed by default
  const [isRecordedAudioOpen, setIsRecordedAudioOpen] = useState(false);
  const [isGeneratedAudioOpen, setIsGeneratedAudioOpen] = useState(false);

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  // State for audio clips (MOVED FROM QueueCommands.tsx)
  const [globalRecordings, setGlobalRecordings] = useState<GlobalRecording[]>([])
  const [generatedAudioClips, setGeneratedAudioClips] = useState<GeneratedAudioClip[]>([])
  const [globalRecordingError, setGlobalRecordingError] = useState<string | null>(null)
  const [vadStatusMessage, setVadStatusMessage] = useState<string | null>(null);
  const vadStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isProcessingSolution, setIsProcessingSolution] = useState(false);

  const { data: screenshots = [], refetch } = useQuery<
    Array<{ path: string; preview: string }>
    , Error>(
    ["screenshots"],
    async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        return existing
      } catch (error) {
        console.error("Error loading screenshots:", error)
        showToast("Error", "Failed to load existing screenshots", "error")
        return []
      }
    },
    {
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: true,
      refetchOnMount: true
    }
  )

  const showToast = (
    title: string,
    description: string,
    variant: ToastVariant
  ) => {
    setToastMessage({ title, description, variant })
    setToastOpen(true)
  }

  const handleDeleteScreenshot = async (index: number) => {
    const screenshotToDelete = screenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch()
      } else {
        console.error("Failed to delete screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot file", "error")
      }
    } catch (error) {
      console.error("Error deleting screenshot:", error)
    }
  }

  useEffect(() => {
    const clearVadStatusTimeout = () => {
      if (vadStatusTimeoutRef.current) {
        clearTimeout(vadStatusTimeoutRef.current);
        vadStatusTimeoutRef.current = null;
      }
    };
    const handleVadWaiting = () => { clearVadStatusTimeout(); setVadStatusMessage("Waiting for audio..."); setGlobalRecordingError(null); };
    const handleVadRecordingStarted = () => { clearVadStatusTimeout(); setVadStatusMessage("Recording audio..."); };
    const handleVadTimeout = () => { setVadStatusMessage("No sound detected. Recording timed out."); vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 5000); };
    
    const handleAudioRecordingComplete = async (data: { path: string }) => {
      console.log("Global audio recording complete (Queue.tsx):", data.path);
      const newRecording: GlobalRecording = { id: `global-rec-${Date.now()}`, path: data.path, timestamp: new Date() };
      setGlobalRecordings(prevRecordings => [newRecording, ...prevRecordings]);
      setGlobalRecordingError(null);
      clearVadStatusTimeout();
      setVadStatusMessage(null);
      showToast("Recording Saved", `Audio saved to ${data.path}`, "success");
      try {
        showToast("Processing", "Attempting to generate music from recording...", "info");
        
        let generationFunction: any = undefined;
        if (window.electronAPI && typeof window.electronAPI.generateMusic === 'function') {
          generationFunction = window.electronAPI.generateMusic;
          console.log("[Queue.tsx] Found window.electronAPI.generateMusic");
        } else if (window.electronAPI && typeof (window.electronAPI as any).generateMusicContinuation === 'function') {
          generationFunction = (window.electronAPI as any).generateMusicContinuation;
          console.warn("[Queue.tsx] Found legacy window.electronAPI.generateMusicContinuation");
        } else {
          console.error("[Queue.tsx] No valid music generation function found on window.electronAPI (tried generateMusic, generateMusicContinuation).");
          showToast("Generation Error", "Music generation API function not found.", "error");
          return;
        }

        // For continuation, the first argument (prompt) can be generic.
        // The second argument is the inputFilePath (the recording).
        // If generateMusicContinuation only took one arg (path), this would need adjustment
        const { generatedPath, features } = await generationFunction("Continue this recording", data.path);
        
        showToast("Success", `Generated audio saved. BPM: ${features.bpm}, Key: ${features.key}`, "success");
        console.log(`[Queue.tsx] Calling window.electronAPI.notifyGeneratedAudioReady with:`, { generatedPath, originalPath: data.path, features });
        
        // Check if notifyGeneratedAudioReady exists before calling
        if (window.electronAPI && typeof window.electronAPI.notifyGeneratedAudioReady === 'function') {
            window.electronAPI.notifyGeneratedAudioReady(generatedPath, data.path, features);
        } else {
            console.warn("[Queue.tsx] window.electronAPI.notifyGeneratedAudioReady is not a function. State update for generated clips might be missed if not handled by 'onGeneratedAudioReady' event alone.")
            // Fallback: directly update state here if notify doesn't exist, though event-driven is preferred.
            // This might cause issues if other components rely on the event.
            // For robustness, this component already listens to onGeneratedAudioReady, so this direct call
            // might be redundant if the main process correctly emits the event after generation.
            // However, notifyGeneratedAudioReady is intended to be called by the process that INITIATED the generation.
            const newGeneratedClip: GeneratedAudioClip = { 
                id: `gen-clip-direct-${Date.now()}`,
                path: generatedPath,
                originalPath: data.path || "",
                timestamp: new Date(),
                bpm: features.bpm,
                key: features.key
            };
            setGeneratedAudioClips(prevClips => [newGeneratedClip, ...prevClips]);
        }

      } catch (error: any) {
        console.error("Error generating music (Queue.tsx):", error);
        showToast("Generation Failed", error.message || "Could not generate audio.", "error");
      }
    };
    const handleAudioRecordingError = (data: { message: string }) => { console.error("Global audio recording error:", data.message); setGlobalRecordingError(data.message); clearVadStatusTimeout(); setVadStatusMessage("Recording error."); vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 5000); };
    const handleGeneratedAudioReady = (data: { generatedPath: string, originalPath?: string, features: { bpm: string | number, key: string } }) => {
      console.log("[Queue.tsx] handleGeneratedAudioReady triggered. Data:", data);
      const newGeneratedClip: GeneratedAudioClip = { 
        id: `gen-clip-${Date.now()}`,
        path: data.generatedPath,
        originalPath: data.originalPath || "",
        timestamp: new Date(),
        bpm: data.features.bpm,
        key: data.features.key
      };
      setGeneratedAudioClips(prevClips => {
        const updatedClips = [newGeneratedClip, ...prevClips];
        console.log("[Queue.tsx] Updated generatedAudioClips state:", updatedClips);
        return updatedClips;
      });
    };

    const unsubscribes = [
      window.electronAPI.onVadWaiting(handleVadWaiting),
      window.electronAPI.onVadRecordingStarted(handleVadRecordingStarted),
      window.electronAPI.onVadTimeout(handleVadTimeout),
      window.electronAPI.onAudioRecordingComplete(handleAudioRecordingComplete),
      window.electronAPI.onAudioRecordingError(handleAudioRecordingError),
      window.electronAPI.onGeneratedAudioReady(handleGeneratedAudioReady),
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => { 
        console.log("[Queue.tsx] onResetView triggered. Clearing audio lists.");
        refetch(); 
      }),
      window.electronAPI.onSolutionError((error: string) => { showToast("Solution Error", error, "error"); }),
      window.electronAPI.onProcessingNoScreenshots(() => { showToast("No Screenshots", "No screenshots to process.", "info"); })
    ];
    return () => { unsubscribes.forEach(unsub => unsub()); clearVadStatusTimeout(); };
  }, [refetch]);

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
    // App.tsx MutationObserver/ResizeObserver will handle any DOM changes that affect overall size.
  }

  // Log conversation changes for debugging
  useEffect(() => {
    console.log("[Queue.tsx] Conversation updated (for main chat view):", conversation);
    console.log("[Queue.tsx] Current globalRecordings state:", globalRecordings);
    console.log("[Queue.tsx] Current generatedAudioClips state:", generatedAudioClips);
  }, [conversation, globalRecordings, generatedAudioClips]);

  return (
    <div className="flex flex-col h-full bg-neutral-850 pt-0 pb-2 px-2 space-y-1.5">
      <Toast
        open={toastOpen}
        onOpenChange={setToastOpen}
        variant={toastMessage.variant}
        duration={3000}
      >
        <ToastTitle>{toastMessage.title}</ToastTitle>
        <ToastDescription>{toastMessage.description}</ToastDescription>
      </Toast>
      
      <div className="flex-shrink-0 pt-0 pb-0.5 px-1">
        <QueueCommands
          screenshots={screenshots}
          onTooltipVisibilityChange={handleTooltipVisibilityChange} 
          isProcessingSolution={isProcessingSolution}
        />
      </div>

      <div className="flex flex-col flex-grow min-h-0 space-y-2 p-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-600 hover:scrollbar-thumb-neutral-500 scrollbar-track-neutral-700 scrollbar-thumb-rounded-full">
        <div className="w-full space-y-3 p-3 bg-neutral-800 border border-neutral-700 rounded-lg">
          {vadStatusMessage && (
            <div className={`mx-0.5 mb-2 p-1 rounded text-xs font-medium text-neutral-400`}>
              {vadStatusMessage}
            </div>
          )}
          {globalRecordings.length > 0 && (
            <div className="space-y-2">
              <div 
                className="flex items-center justify-between cursor-pointer py-1 hover:bg-neutral-750/50 rounded px-1" 
                onClick={() => setIsRecordedAudioOpen(!isRecordedAudioOpen)}
              >
                <h4 className="font-medium text-xs text-neutral-400 tracking-wider uppercase">Recorded Audio</h4>
                <span className="text-neutral-400 text-xs">
                  {isRecordedAudioOpen ? '▼' : '▶'}
                </span>
              </div>
              {isRecordedAudioOpen && (
                <div className="space-y-2 pl-1 pr-0.5 pt-1">
                  {globalRecordings.map((rec) => (
                    <div key={rec.id} className="flex flex-col p-2.5 bg-neutral-750 rounded-lg border border-neutral-600/70">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center text-[10px] text-neutral-400"><span className="mr-1.5 opacity-70">⏰</span><span>{rec.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span></div>
                      </div>
                      <p className="text-[11px] font-medium text-neutral-300 mb-2 flex items-center"><span className="mr-1.5 opacity-80">🎤</span><span className="truncate">User Recording</span></p>
                      <audio controls src={`clp://${rec.path}`} className="w-full h-8 rounded-sm filter saturate-[0.8] opacity-80 hover:opacity-100 transition-opacity"></audio>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {globalRecordingError && (
            <div className="mx-0.5 mt-2 p-2 bg-red-800/40 rounded text-red-300 text-xs border border-red-700/50 font-medium">
              <span className="font-semibold">Audio Error:</span> {globalRecordingError}
            </div>
          )}
          {generatedAudioClips.length > 0 && (
            <div className="space-y-2 pt-1.5">
              <div 
                className="flex items-center justify-between cursor-pointer py-1 hover:bg-neutral-750/50 rounded px-1" 
                onClick={() => setIsGeneratedAudioOpen(!isGeneratedAudioOpen)}
              >
                <h4 className="font-medium text-xs text-neutral-400 tracking-wider uppercase">Generated Audio</h4>
                <span className="text-neutral-400 text-xs">
                  {isGeneratedAudioOpen ? '▼' : '▶'}
                </span>
              </div>
              {isGeneratedAudioOpen && (
                <div className="space-y-2 pl-1 pr-0.5 pt-1">
                  {generatedAudioClips.map((clip) => (
                    <div key={clip.id} className="flex flex-col p-2.5 bg-neutral-750 rounded-lg border border-neutral-600/70">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center text-[10px] text-neutral-400"><span className="mr-1.5 opacity-70">⏰</span><span>{clip.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span></div>
                      </div>
                      <p className="text-[11px] font-medium text-neutral-300 mb-1 flex items-center"><span className="mr-1.5 opacity-80">🎵</span><span className="truncate">Generated Track</span></p>
                      <p className="text-[10px] text-neutral-400 truncate mb-1.5"><span className="mr-1.5 opacity-70">🔙</span>Based on {clip.originalPath ? 'User Recording' : 'Text Prompt'}</p>
                      <div className="text-[10px] text-neutral-300 mb-2 flex justify-between font-medium"><span>BPM: {String(clip.bpm) !== 'undefined' ? clip.bpm : 'N/A'}</span><span>Key: {clip.key || 'N/A'}</span></div>
                      <audio controls src={`clp://${clip.path}`} className="w-full h-8 rounded-sm filter saturate-[0.8] opacity-80 hover:opacity-100 transition-opacity"></audio>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {(globalRecordings.length === 0 && generatedAudioClips.length === 0 && !vadStatusMessage && !globalRecordingError) && (
             <div className="text-center py-8">
                <p className="text-sm text-neutral-500 font-medium">Record or generate audio to see it here.</p>
             </div>
          )}
        </div>

        <div className="w-full p-0.5 flex-grow flex flex-col min-h-0">
          <Solutions 
            showCommands={true}
            onProcessingStateChange={setIsProcessingSolution}
            conversation={conversation}
          />
        </div>
      </div>
    </div>
  )
}

export default Queue;

// Remove the custom path.basename shim
// import path from "path"; // Avoid importing Node.js modules directly in renderer if not essential
