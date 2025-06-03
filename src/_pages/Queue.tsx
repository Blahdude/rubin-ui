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
    <div className="flex flex-col h-full bg-transparent pt-0 pb-2 px-2 space-y-2">
      <Toast
        open={toastOpen}
        onOpenChange={setToastOpen}
        variant={toastMessage.variant}
        duration={3000}
      >
        <ToastTitle>{toastMessage.title}</ToastTitle>
        <ToastDescription>{toastMessage.description}</ToastDescription>
      </Toast>
      
      {/* Top Section: QueueCommands */}
      <div className="flex-shrink-0 pt-0 pb-1 px-1">
        <QueueCommands
          screenshots={screenshots}
          onTooltipVisibilityChange={handleTooltipVisibilityChange} 
        />
      </div>

      {/* MODIFIED: Main content area - now flex-col for vertical stacking */}
      {/* This container will grow and allow its content (Audio + Solutions) to scroll if too tall */}
      <div className="flex flex-col flex-grow min-h-0 space-y-2 p-1 overflow-y-auto">
        {/* Section 1: Audio Lists (full width) */}
        <div className="w-full space-y-3 p-1 bg-white/60 backdrop-blur-md rounded-lg">
          {vadStatusMessage && (
            <div className={`mx-1 mt-1 p-2 rounded text-xs font-semibold ${vadStatusMessage.includes("Error") || vadStatusMessage.includes("error") || vadStatusMessage.includes("timed out") ? 'bg-yellow-400/30 border border-yellow-500/50 text-yellow-800' : 'bg-blue-400/30 border border-blue-500/50 text-blue-800'}`}>
              {vadStatusMessage}
            </div>
          )}
          {globalRecordings.length > 0 && (
            <div className="p-2 space-y-2">
              <h4 className="font-semibold text-xs text-black/80 border-b border-black/20 pb-1">Recorded Audio</h4>
              <div className="space-y-2 pr-1">
                {globalRecordings.map((rec) => (
                  <div key={rec.id} className="flex flex-col p-2.5 bg-neutral-100/90 rounded-md shadow-sm hover:bg-neutral-200/90 transition-colors duration-150 ease-in-out border border-neutral-300/60 cursor-grab font-semibold text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center text-[10px] text-neutral-600"><span className="mr-1">⏰</span><span>{rec.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span></div>
                    </div>
                    <p className="text-[11px] font-medium text-neutral-800 truncate mb-1.5 flex items-center"><span className="mr-1.5">📄</span><span className="truncate">{rec.path.split(/[\\/]/).pop()}</span></p>
                    <audio controls src={`clp://${rec.path}`} className="w-full h-7 rounded-sm">Audio not supported.</audio>
                  </div>
                ))}
              </div>
            </div>
          )}
          {globalRecordingError && (
            <div className="mx-1 p-2 bg-red-500/30 rounded text-white text-xs border border-red-500/50 font-semibold">
              <span className="font-semibold">Audio Error:</span> {globalRecordingError}
            </div>
          )}
          {generatedAudioClips.length > 0 && (
            <div className="p-2 space-y-2">
              <h4 className="font-semibold text-xs text-black/80 border-b border-black/20 pb-1">Generated Audio</h4>
              <div className="space-y-2 pr-1">
                {generatedAudioClips.map((clip) => (
                  <div key={clip.id} className="flex flex-col p-2.5 bg-teal-50/90 rounded-md shadow-sm hover:bg-teal-100/90 transition-colors duration-150 ease-in-out border border-teal-300/60 cursor-grab font-semibold text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center text-[10px] text-teal-700"><span className="mr-1">⏰</span><span>{clip.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span></div>
                    </div>
                    <p className="text-[11px] font-medium text-teal-800 truncate mb-1 flex items-center"><span className="mr-1.5">🎵</span><span className="truncate" title={clip.path}>{clip.path.split(/[\\/]/).pop()}</span></p>
                    <p className="text-[10px] text-teal-700/90 truncate mb-1.5"><span className="mr-1.5">🔙</span>Orig: {clip.originalPath.split(/[\\/]/).pop()}</p>
                    <div className="text-[10px] text-teal-800/90 mb-1.5 flex justify-between"><span>BPM: {clip.bpm}</span><span>Key: {clip.key}</span></div>
                    <audio controls src={`clp://${clip.path}`} className="w-full h-7 rounded-sm">Audio not supported.</audio>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Solutions Panel (Text Generation - full width, below audio) */}
        {/* The Solutions component itself has overflow-y-auto when showCommands is false */}
        <div className="w-full p-0.5">
          <Solutions view={view} setView={setView} showCommands={false} />
        </div>
      </div>
    </div>
  )
}

export default Queue;

// Remove the custom path.basename shim
// import path from "path"; // Avoid importing Node.js modules directly in renderer if not essential
