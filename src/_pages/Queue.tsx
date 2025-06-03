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

interface QueueProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug">>
  view: "queue" | "solutions" | "debug"
}

// Remove AudioQueueItem interface for now, will re-evaluate when integrating properly
// interface AudioQueueItem {
//   id: string; 
//   path: string;
//   type: "recorded" | "generated";
//   status?: "generating" | "failed" | "ready";
//   originalPath?: string; 
// }

const Queue: React.FC<QueueProps> = ({ setView, view }) => {
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

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
        showToast("Processing", "Generating music continuation...", "neutral");
        const { generatedPath, features } = await window.electronAPI.generateMusicContinuation(data.path);
        showToast("Success", `Generated audio saved. BPM: ${features.bpm}, Key: ${features.key}`, "success");
        window.electronAPI.notifyGeneratedAudioReady(generatedPath, data.path, features);
      } catch (error: any) {
        console.error("Error generating music continuation (Queue.tsx):", error);
        showToast("Generation Failed", error.message || "Could not generate audio continuation.", "error");
      }
    };
    const handleAudioRecordingError = (data: { message: string }) => { console.error("Global audio recording error:", data.message); setGlobalRecordingError(data.message); clearVadStatusTimeout(); setVadStatusMessage("Recording error."); vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 5000); };
    const handleGeneratedAudioReady = (data: { generatedPath: string, originalPath: string, features: { bpm: string | number, key: string } }) => {
      console.log("Generated audio ready (Queue.tsx):", data.generatedPath);
      const newGeneratedClip: GeneratedAudioClip = { id: `gen-clip-${Date.now()}`, path: data.generatedPath, originalPath: data.originalPath, timestamp: new Date(), bpm: data.features.bpm, key: data.features.key };
      setGeneratedAudioClips(prevClips => [newGeneratedClip, ...prevClips]);
    };

    const unsubscribes = [
      window.electronAPI.onVadWaiting(handleVadWaiting),
      window.electronAPI.onVadRecordingStarted(handleVadRecordingStarted),
      window.electronAPI.onVadTimeout(handleVadTimeout),
      window.electronAPI.onAudioRecordingComplete(handleAudioRecordingComplete),
      window.electronAPI.onAudioRecordingError(handleAudioRecordingError),
      window.electronAPI.onGeneratedAudioReady(handleGeneratedAudioReady),
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => { refetch(); setGlobalRecordings([]); setGeneratedAudioClips([]); }), // Also clear local audio lists on reset
      window.electronAPI.onSolutionError((error: string) => { showToast("Solution Error", error, "error"); }),
      window.electronAPI.onProcessingNoScreenshots(() => { showToast("No Screenshots", "No screenshots to process.", "neutral"); })
    ];
    return () => { unsubscribes.forEach(unsub => unsub()); clearVadStatusTimeout(); };
  }, [refetch]); // Removed setView from dependencies for this specific effect

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
    // App.tsx MutationObserver/ResizeObserver will handle any DOM changes that affect overall size.
  }

  return (
    <div className="flex flex-col h-full bg-transparent pt-0 pb-2 px-2 space-y-1.5">
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

      <div className="flex flex-col flex-grow min-h-0 space-y-1.5 p-1 overflow-y-auto">
        <div className="w-full space-y-3 p-2 bg-white/50 backdrop-blur-md rounded-lg">
          {vadStatusMessage && (
            <div className={`mx-0.5 mb-1.5 p-2 rounded text-xs font-medium ${vadStatusMessage.includes("Error") || vadStatusMessage.includes("error") || vadStatusMessage.includes("timed out") ? 'bg-yellow-400/25 border border-yellow-500/40 text-yellow-700' : 'bg-blue-400/20 border border-blue-500/30 text-blue-700'}`}>
              {vadStatusMessage}
            </div>
          )}
          {globalRecordings.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="font-semibold text-xs text-black/50 tracking-wider uppercase mx-0.5 mb-1">Recorded Audio</h4>
              <div className="space-y-2">
                {globalRecordings.map((rec) => (
                  <div key={rec.id} className="flex flex-col p-2 bg-white/70 rounded-md shadow-[0_1px_2px_0_rgba(0,0,0,0.03)] hover:bg-neutral-50/80 transition-colors duration-100 ease-in-out border border-black/5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center text-[10px] text-black/60"><span className="mr-1 opacity-80">⏰</span><span>{rec.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span></div>
                    </div>
                    <p className="text-[11px] font-medium text-black/80 truncate mb-1.5 flex items-center"><span className="mr-1.5 opacity-80">📄</span><span className="truncate">{rec.path.split(/[\\/]/).pop()}</span></p>
                    <audio controls src={`clp://${rec.path}`} className="w-full h-7 rounded-sm filter saturate-[0.9] opacity-90 hover:opacity-100 transition-opacity"></audio>
                  </div>
                ))}
              </div>
            </div>
          )}
          {globalRecordingError && (
            <div className="mx-0.5 mt-1.5 p-2 bg-red-500/20 rounded text-red-700 text-xs border border-red-500/30 font-medium">
              <span className="font-semibold">Audio Error:</span> {globalRecordingError}
            </div>
          )}
          {generatedAudioClips.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <h4 className="font-semibold text-xs text-black/50 tracking-wider uppercase mx-0.5 mb-1">Generated Audio</h4>
              <div className="space-y-2">
                {generatedAudioClips.map((clip) => (
                  <div key={clip.id} className="flex flex-col p-2 bg-teal-50/60 rounded-md shadow-[0_1px_2px_0_rgba(0,0,0,0.03)] hover:bg-teal-50/80 transition-colors duration-100 ease-in-out border border-teal-500/10">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center text-[10px] text-teal-800/80"><span className="mr-1 opacity-80">⏰</span><span>{clip.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span></div>
                    </div>
                    <p className="text-[11px] font-medium text-teal-900/90 truncate mb-1 flex items-center"><span className="mr-1.5 opacity-80">🎵</span><span className="truncate" title={clip.path}>{clip.path.split(/[\\/]/).pop()}</span></p>
                    <p className="text-[10px] text-teal-800/70 truncate mb-1.5"><span className="mr-1.5 opacity-80">🔙</span>Orig: {clip.originalPath.split(/[\\/]/).pop()}</p>
                    <div className="text-[10px] text-teal-900/80 mb-1.5 flex justify-between"><span>BPM: {clip.bpm}</span><span>Key: {clip.key}</span></div>
                    <audio controls src={`clp://${clip.path}`} className="w-full h-7 rounded-sm filter saturate-[0.9] opacity-90 hover:opacity-100 transition-opacity"></audio>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(globalRecordings.length === 0 && generatedAudioClips.length === 0 && !vadStatusMessage && !globalRecordingError) && (
             <div className="text-center py-8">
                <p className="text-sm text-black/40 font-medium">Record or generate audio to see it here.</p>
             </div>
          )}
        </div>

        <div className="w-full p-0.5">
          <Solutions 
            view={view} 
            setView={setView} 
            showCommands={false} 
            onProcessingStateChange={setIsProcessingSolution}
          />
        </div>
      </div>
    </div>
  )
}

export default Queue;

// Remove the custom path.basename shim
// import path from "path"; // Avoid importing Node.js modules directly in renderer if not essential
