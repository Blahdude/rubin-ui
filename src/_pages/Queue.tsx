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

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptText: string;
}

const PromptModal: React.FC<PromptModalProps> = ({ isOpen, onClose, promptText }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-neutral-900 bg-opacity-80 flex items-start justify-center p-4 pt-20 z-50 transition-opacity duration-300 ease-in-out">
      <div className="bg-neutral-750 p-5 rounded-lg shadow-2xl w-full max-w-md mx-auto border border-neutral-600 relative">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-neutral-200">Full Prompt</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 transition-colors text-2xl leading-none">&times;</button>
        </div>
        <p 
          className="text-xs text-neutral-300 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-neutral-600 hover:scrollbar-thumb-neutral-500 scrollbar-track-neutral-700 rounded"
        >
          {promptText}
        </p>
      </div>
    </div>
  );
};

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

// Type for individual screenshot items, if not already globally defined
interface ScreenshotItem {
  path: string;
  preview: string;
}

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

  // State for recording and generation duration
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(5); // Default 5 seconds
  const [generationDurationSeconds, setGenerationDurationSeconds] = useState(8); // Default 8 seconds

  // State for the prompt modal
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [modalPromptText, setModalPromptText] = useState("");

  // Effect to update recording duration in main process when slider changes (debounced)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (window.electronAPI && typeof window.electronAPI.setRecordingDuration === 'function') {
        console.log(`[Queue.tsx] Sending recording duration to main (debounced): ${recordingDurationSeconds}s`);
        window.electronAPI.setRecordingDuration(recordingDurationSeconds)
          .then((result: { success: boolean; error?: string }) => {
            if (!result.success) {
              console.warn(`[Queue.tsx] Failed to set recording duration in main process: ${result.error}`);
            }
          })
          .catch((err: any) => {
            console.error(`[Queue.tsx] Error calling setRecordingDuration:`, err);
          });
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [recordingDurationSeconds]);

  // Effect to update UI preferred generation duration in main process when slider changes (debounced)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (window.electronAPI && typeof window.electronAPI.setUiPreferredGenerationDuration === 'function') {
        console.log(`[Queue.tsx] Sending UI preferred generation duration to main (debounced): ${generationDurationSeconds}s`);
        window.electronAPI.setUiPreferredGenerationDuration(generationDurationSeconds)
          .then((result: { success: boolean; error?: string }) => {
            if (!result.success) {
              console.warn(`[Queue.tsx] Failed to set UI preferred generation duration in main process: ${result.error}`);
            }
          })
          .catch((err: any) => {
            console.error(`[Queue.tsx] Error calling setUiPreferredGenerationDuration:`, err);
          });
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [generationDurationSeconds]);

  const { data: screenshots = [], refetch } = useQuery<
    Array<ScreenshotItem> // Use the defined ScreenshotItem type
    , Error>(
    ["screenshots"],
    async () => {
      try {
        // Ensure electronAPI and getScreenshots are available
        if (window.electronAPI && typeof window.electronAPI.getScreenshots === 'function') {
          const existing = await window.electronAPI.getScreenshots()
          return existing
        }
        return []; // Return empty if API not ready
      } catch (error) {
        console.error("Error loading screenshots:", error)
        showToast("Error", "Failed to load existing screenshots", "error")
        return []
      }
    },
    {
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: false, // Adjusted from true to prevent too frequent refetches if not desired
      refetchOnMount: true
    }
  )

  // useEffect to listen for new screenshots being taken
  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.onScreenshotTaken === 'function') {
      const unsubscribe = window.electronAPI.onScreenshotTaken(() => {
        console.log("[Queue.tsx] Received onScreenshotTaken event, refetching screenshots.");
        refetch();
      });
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [refetch]);

  // useEffect to listen for the screenshot queue being cleared
  useEffect(() => {
    // Assuming onScreenshotQueueCleared will be added to electronAPI
    if (window.electronAPI && typeof (window.electronAPI as any).onScreenshotQueueCleared === 'function') {
      const unsubscribe = (window.electronAPI as any).onScreenshotQueueCleared(() => {
        console.log("[Queue.tsx] Received onScreenshotQueueCleared event, refetching screenshots.");
        refetch();
      });
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [refetch]);

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

  // Helper function to format display names
  const formatDisplayName = (name?: string, originalPrompt?: string, maxLength: number = 50): string => {
    if (!name || name === "generated_audio") return 'Generated Track'; // Default if no name or it's the generic one
    
    let formattedName = name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    if (originalPrompt && originalPrompt.length > maxLength) {
      // Check if the formatted name already ends with ... (e.g. if sanitizePromptForFilename added it, though it currently doesn't)
      // Or if the name itself is short enough that the original prompt being long is the main point.
      // For simplicity, if original was long, and name isn't the default, append ellipsis.
      if (!formattedName.endsWith('...')) {
        formattedName += '...';
      }
    }
    return formattedName;
  };

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
        // The generationFunction now returns displayName and originalPromptText as well.
        const operationId = `cont-${Date.now()}`; // Generate a unique operation ID
        const continuationPrompt = "Continue this audio"; // Generic prompt for continuation
        const { generatedPath, features, displayName, originalPromptText } = await generationFunction(
          operationId, 
          continuationPrompt, 
          data.path, // This is the inputFilePath for continuation
          generationDurationSeconds // This is the duration for the new segment
        );
        
        showToast("Success", `Generated audio saved. BPM: ${features.bpm}, Key: ${features.key}`, "success");
        console.log(`[Queue.tsx] Calling window.electronAPI.notifyGeneratedAudioReady with:`, { generatedPath, originalPath: data.path, features, displayName, originalPromptText });
        
        // Check if notifyGeneratedAudioReady exists before calling
        if (window.electronAPI && typeof window.electronAPI.notifyGeneratedAudioReady === 'function') {
            window.electronAPI.notifyGeneratedAudioReady(generatedPath, data.path, features, displayName, originalPromptText); // Pass originalPromptText (5th arg)
        } else {
            console.warn("[Queue.tsx] window.electronAPI.notifyGeneratedAudioReady is not a function. State update for generated clips might be missed if not handled by 'onGeneratedAudioReady' event alone.")
            // Fallback: directly update state here if notify doesn't exist
            const newGeneratedClip: GeneratedAudioClip = { 
                id: `gen-clip-direct-${Date.now()}`,
                path: generatedPath,
                originalPath: data.path || "",
                timestamp: new Date(),
                bpm: features.bpm,
                key: features.key,
                displayName: displayName,
                originalPromptText: originalPromptText // Add originalPromptText in fallback too
            };
            setGeneratedAudioClips(prevClips => [newGeneratedClip, ...prevClips]);
        }

      } catch (error: any) {
        console.error("Error generating music (Queue.tsx):", error);
        showToast("Generation Failed", error.message || "Could not generate audio.", "error");
      }
    };
    const handleAudioRecordingError = (data: { message: string }) => { console.error("Global audio recording error:", data.message); setGlobalRecordingError(data.message); clearVadStatusTimeout(); setVadStatusMessage("Recording error."); vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 5000); };
    const handleGeneratedAudioReady = (data: { generatedPath: string, originalPath?: string, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string }) => {
      console.log("[Queue.tsx] handleGeneratedAudioReady triggered. Data:", data);
      const newGeneratedClip: GeneratedAudioClip = { 
        id: `gen-clip-${Date.now()}`,
        path: data.generatedPath,
        originalPath: data.originalPath || "",
        timestamp: new Date(),
        bpm: data.features.bpm,
        key: data.features.key,
        displayName: data.displayName, // Store displayName
        originalPromptText: data.originalPromptText // Store originalPromptText
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

  const handleOpenPromptModal = (prompt: string) => {
    setModalPromptText(prompt);
    setIsPromptModalOpen(true);
  };

  const handleClosePromptModal = () => {
    setIsPromptModalOpen(false);
  };

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
      
      <PromptModal 
        isOpen={isPromptModalOpen} 
        onClose={handleClosePromptModal} 
        promptText={modalPromptText} 
      />
      
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
                    <div 
                      key={rec.id} 
                      className="flex flex-col p-2.5 bg-neutral-750 rounded-lg border border-neutral-600/70"
                      draggable={true}
                      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                        e.preventDefault(); // Prevent default HTML drag behavior
                        e.stopPropagation(); // Stop event propagation
                        if (rec.path) {
                          // Set dataTransfer properties for robustness
                          e.dataTransfer.setData('text/plain', rec.path); // Using path as dummy data
                          e.dataTransfer.effectAllowed = 'copy';
                          window.electronAPI.startFileDrag(rec.path);
                        }
                      }}
                    >
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
          {/* Duration Controls */}
          <div className="mx-0.5 mt-3 p-3 bg-neutral-800 rounded-lg border border-neutral-700/60 space-y-3">
            <div>
              <label htmlFor="recordingDuration" className="block text-xs font-medium text-neutral-300 mb-1">
                Recording Duration: {recordingDurationSeconds}s
              </label>
              <input
                type="range"
                id="recordingDuration"
                name="recordingDuration"
                min="1"
                max="30" // Max 30 seconds for recording
                value={recordingDurationSeconds}
                onChange={(e) => setRecordingDurationSeconds(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>
            <div>
              <label htmlFor="generationDuration" className="block text-xs font-medium text-neutral-300 mb-1">
                Generation Length: {generationDurationSeconds}s
              </label>
              <input
                type="range"
                id="generationDuration"
                name="generationDuration"
                min="1"
                max="30" // Max 30 seconds for generation
                value={generationDurationSeconds}
                onChange={(e) => setGenerationDurationSeconds(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
              />
            </div>
          </div>
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
                    <div 
                      key={clip.id} 
                      className="flex flex-col p-2.5 bg-neutral-750 rounded-lg border border-neutral-600/70"
                      draggable={true}
                      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                        e.preventDefault(); // Prevent default HTML drag behavior
                        e.stopPropagation(); // Stop event propagation
                        if (clip.path) {
                          // Set dataTransfer properties for robustness
                          e.dataTransfer.setData('text/plain', clip.path); // Using path as dummy data
                          e.dataTransfer.effectAllowed = 'copy';
                          window.electronAPI.startFileDrag(clip.path);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center text-[10px] text-neutral-400"><span className="mr-1.5 opacity-70">⏰</span><span>{clip.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span></div>
                      </div>
                      
                      {/* Container for Track Name and View Prompt Button - using justify-between */}
                      <div className="flex items-center justify-between mb-0.5">
                        {/* Group for Icon and Track Name - this group will shrink and truncate */}
                        <div className="flex items-center min-w-0 mr-2">
                          <span className="mr-1.5 opacity-80 flex-shrink-0">🎵</span>
                          <span className="text-sm font-semibold text-neutral-100 truncate">
                            {formatDisplayName(clip.displayName, clip.originalPromptText)}
                          </span>
                        </div>

                        {/* View Prompt Button - should not shrink and stays to the right */}
                        {clip.originalPromptText && clip.originalPromptText.length > 50 && (
                          <button 
                            onClick={() => { handleOpenPromptModal(clip.originalPromptText || "No prompt available"); }}
                            className="px-2.5 py-1 text-[9px] font-medium text-neutral-300 bg-neutral-700 hover:bg-neutral-650 border border-neutral-600 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                          >
                            View Full Prompt
                          </button>
                        )}
                      </div>
                      
                      {/* Based on line */}
                      <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1.5">
                        <span className="truncate"><span className="mr-1 opacity-70">🔙</span>Based on {clip.originalPath ? `Recording` : (clip.originalPromptText || clip.displayName) ? 'Text Prompt' : 'Unknown Source'}</span>
                      </div>
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
