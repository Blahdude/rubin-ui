import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"
import { FiClock, FiFileText } from "react-icons/fi"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshots: Array<{ path: string; preview: string }>
  isProcessingSolution?: boolean
}

interface GlobalRecording {
  id: string;
  path: string;
  timestamp: Date;
}

// Interface for generated audio clips
interface GeneratedAudioClip {
  id: string;
  path: string; // Path to the generated audio
  originalPath: string; // Path to the original audio it was based on
  timestamp: Date;
  bpm: string | number;
  key: string;
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  screenshots,
  isProcessingSolution
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [audioResult, setAudioResult] = useState<string | null>(null)
  const chunks = useRef<Blob[]>([])

  // State for the new global audio recording shortcut
  const [globalRecordings, setGlobalRecordings] = useState<GlobalRecording[]>([])
  // State for generated audio clips
  const [generatedAudioClips, setGeneratedAudioClips] = useState<GeneratedAudioClip[]>([])
  const [globalRecordingError, setGlobalRecordingError] = useState<string | null>(null)
  const [vadStatusMessage, setVadStatusMessage] = useState<string | null>(null); // New state for VAD status
  const vadStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for managing vadStatusMessage timeout

  useEffect(() => {
    let tooltipHeight = 0
    if (tooltipRef.current && isTooltipVisible) {
      tooltipHeight = tooltipRef.current.offsetHeight + 10
    }
    onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
  }, [isTooltipVisible, onTooltipVisibilityChange])

  // Effect for global audio recording events & VAD events
  useEffect(() => {
    const clearVadStatusTimeout = () => {
      if (vadStatusTimeoutRef.current) {
        clearTimeout(vadStatusTimeoutRef.current);
        vadStatusTimeoutRef.current = null;
      }
    };

    const handleVadWaiting = () => {
      clearVadStatusTimeout();
      setVadStatusMessage("Waiting for audio...");
      setGlobalRecordingError(null); // Clear previous errors
    };
    const unsubscribeVadWaiting = window.electronAPI.onVadWaiting(handleVadWaiting);

    const handleVadRecordingStarted = () => {
      clearVadStatusTimeout();
      setVadStatusMessage("Recording audio...");
    };
    const unsubscribeVadRecordingStarted = window.electronAPI.onVadRecordingStarted(handleVadRecordingStarted);

    const handleVadTimeout = () => {
      setVadStatusMessage("No sound detected. Recording timed out.");
      clearVadStatusTimeout(); // Clear any existing timeout before setting a new one
      vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 5000); // Clear message after 5s
    };
    const unsubscribeVadTimeout = window.electronAPI.onVadTimeout(handleVadTimeout);

    const handleAudioRecordingComplete = async (data: { path: string }) => {
      console.log("Global audio recording complete, path:", data.path);
      const newRecording: GlobalRecording = {
        id: `global-rec-${Date.now()}`,
        path: data.path,
        timestamp: new Date()
      };
      setGlobalRecordings(prevRecordings => [newRecording, ...prevRecordings]);
      setGlobalRecordingError(null);
      clearVadStatusTimeout();
      setVadStatusMessage(null); // Clear VAD status on completion

      // ---- ADDED: Call to generate music continuation ----
      if (data.path) {
        console.log(`[QueueCommands] Calling generateMusicContinuation with path: ${data.path}`);
        try {
          await window.electronAPI.generateMusicContinuation(data.path);
          console.log("[QueueCommands] generateMusicContinuation IPC call successful (renderer side)");
        } catch (error) {
          console.error("[QueueCommands] Error calling generateMusicContinuation IPC:", error);
          setGlobalRecordingError("Failed to start music generation. See console.");
          // Optionally, update VAD status message for this error too
          setVadStatusMessage("Music generation error.");
          if (vadStatusTimeoutRef.current) clearTimeout(vadStatusTimeoutRef.current);
          vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 5000);
        }
      } else {
        console.error("[QueueCommands] No path received in handleAudioRecordingComplete, cannot generate music.");
        setGlobalRecordingError("Audio recording path missing.");
      }
      // ---- END ADDED ----
    };
    const unsubscribeComplete = window.electronAPI.onAudioRecordingComplete(handleAudioRecordingComplete);

    const handleAudioRecordingError = (data: { message: string }) => {
      console.error("Global audio recording error:", data.message)
      setGlobalRecordingError(data.message)
      clearVadStatusTimeout();
      setVadStatusMessage("Recording error. See console."); // Or use data.message if appropriate
      vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 5000); // Clear message after 5s
    };
    const unsubscribeError = window.electronAPI.onAudioRecordingError(handleAudioRecordingError);

    // Listener for newly generated audio clips
    const handleGeneratedAudioReady = (data: { generatedPath: string, originalPath: string, features: { bpm: string | number, key: string } }) => {
      console.log("Generated audio ready (QueueCommands):", data.generatedPath, "from original:", data.originalPath, "Features:", data.features);
      const newGeneratedClip: GeneratedAudioClip = {
        id: `gen-clip-${Date.now()}`,
        path: data.generatedPath,
        originalPath: data.originalPath,
        timestamp: new Date(),
        bpm: data.features.bpm,
        key: data.features.key
      };
      setGeneratedAudioClips(prevClips => [newGeneratedClip, ...prevClips]);
    };
    const unsubscribeGeneratedAudio = window.electronAPI.onGeneratedAudioReady(handleGeneratedAudioReady);

    return () => {
      unsubscribeVadWaiting();
      unsubscribeVadRecordingStarted();
      unsubscribeVadTimeout();
      unsubscribeComplete();
      unsubscribeError();
      unsubscribeGeneratedAudio(); // Unsubscribe from generated audio listener
      clearVadStatusTimeout(); // Clear timeout on unmount
    }
  }, [])

  const handleMouseEnter = () => {
    setIsTooltipVisible(true)
  }

  const handleMouseLeave = () => {
    setIsTooltipVisible(false)
  }

  const handleRecordClick = async () => {
    // This function now primarily toggles the visual state in this component.
    // The actual recording logic is initiated via Electron events handled in Queue.tsx or main process.
    // For instance, a global shortcut might trigger recording, or this button could send an IPC message.
    // For UI purposes, we just toggle `isRecording` state for the button's appearance.
    // window.electronAPI.toggleGlobalRecording(); // Example IPC call
    setIsRecording(prev => !prev); // Simulate toggling for UI, actual state might be driven by Electron events.

    // The old MediaRecorder logic is removed from here as it's handled globally / in main process now.
  }

  return (
    <div className="w-full"> {/* Removed font-semibold from outer container */}
      <div className="bg-neutral-800 border-t border-neutral-700 py-2 px-3 flex items-center flex-wrap justify-start gap-x-2 gap-y-1.5 text-xs">
        {/* Show/Hide */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] leading-none font-normal text-neutral-400">Show/Hide</span>
          <div className="flex gap-0.5">
            <button className="bg-neutral-700 hover:bg-neutral-600 transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-neutral-300 font-medium">
              ⌘
            </button>
            <button className="bg-neutral-700 hover:bg-neutral-600 transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-neutral-300 font-medium">
              B
            </button>
          </div>
        </div>

        {/* Solve Command */}
        <div className="flex items-center gap-1">
          <span className={`text-[10px] leading-none font-normal ${isProcessingSolution ? 'text-neutral-500 animate-pulse' : 'text-neutral-400'}`}>
            {isProcessingSolution ? 'Solving...' : 'Solve'}
          </span>
          <div className={`flex gap-0.5 ${isProcessingSolution ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <button 
              className={`bg-neutral-700 hover:bg-neutral-600 transition-colors rounded px-1 py-0.5 text-[10px] leading-none font-medium ${isProcessingSolution ? 'text-neutral-500' : 'text-neutral-300'}`}
              disabled={isProcessingSolution}
            >
              ⌘
            </button>
            <button 
              className={`bg-neutral-700 hover:bg-neutral-600 transition-colors rounded px-1 py-0.5 text-[10px] leading-none font-medium ${isProcessingSolution ? 'text-neutral-500' : 'text-neutral-300'}`}
              disabled={isProcessingSolution}
            >
              ↵
            </button>
          </div>
        </div>

        {/* Record Audio (2s) - Assuming this triggers a specific type of recording via Electron */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] leading-none font-normal text-neutral-400">
            Record Audio (2s)
          </span>
          <div className="flex gap-0.5">
            <button className="bg-neutral-700 hover:bg-neutral-600 transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-neutral-300 font-medium">
              ⌘
            </button>
            <button className="bg-neutral-700 hover:bg-neutral-600 transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-neutral-300 font-medium">
              ;
            </button>
          </div>
        </div>

        {/* Voice Recording Button - Icon only */}
        <div className="flex items-center">
          <button
            title={isRecording ? "Stop Recording" : "Start Voice Recording"} // Updated title
            className={`transition-colors rounded-md p-1.5 flex items-center justify-center w-[28px] h-[28px] ${isRecording ? 'bg-red-700/80 hover:bg-red-600/80 text-red-200 animate-pulse' : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'}`}
            onClick={handleRecordClick} // This now just toggles UI state
            type="button"
          >
            {isRecording ? (
              <span className="text-sm">●</span> // Simpler pulse or just filled circle
            ) : (
              <span className="text-sm">🎤</span>
            )}
          </button>
        </div>

        {/* Right-aligned icons: Question mark & Sign Out */}
        <div className="flex items-center gap-1.5 ml-auto">
          <div
            className="relative inline-block"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="w-7 h-7 rounded-md bg-neutral-700 hover:bg-neutral-600 transition-colors flex items-center justify-center cursor-help z-10">
              <span className="text-xs text-neutral-300 font-medium">?</span>
            </div>
            {isTooltipVisible && (
              <div
                ref={tooltipRef}
                className="absolute bottom-full right-0 mb-2 w-72 z-20" // Ensure tooltip is above other elements
              >
                <div className="p-2.5 text-[11px] bg-neutral-800/95 backdrop-blur-sm rounded-md border border-neutral-700 text-neutral-300 shadow-lg font-normal">
                  <h3 className="font-medium whitespace-nowrap text-xs text-neutral-200 border-b border-neutral-700 pb-1.5 mb-1.5">
                    Keyboard Shortcuts
                  </h3>
                   <div className="space-y-2">
                    {[ 
                      { label: "Toggle Window", keys: ["⌘", "B"], desc: "Show or hide this window." },
                      { label: "Solve Problem", keys: ["⌘", "↵"], desc: "Generate solution (auto-takes screenshot)." },
                      { label: "Record Audio (2s)", keys: ["⌘", ";"], desc: "Record 2s audio for music generation." },
                      // Add other relevant shortcuts for QueueCommands if any
                    ].map(item => (
                      <div key={item.label} className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-300 font-normal">{item.label}</span>
                          <div className="flex gap-0.5">
                            {item.keys.map(key => (
                              <span key={key} className="bg-neutral-700 text-neutral-300 px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                                {key}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] leading-snug text-neutral-400 font-normal">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            className="text-neutral-400 hover:text-red-500 transition-colors hover:cursor-pointer font-medium ml-0.5 p-1 rounded-md hover:bg-neutral-700 flex items-center justify-center w-[28px] h-[28px]"
            title="Sign Out"
            onClick={() => window.electronAPI.quitApp()}
          >
            <IoLogOutOutline className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default QueueCommands

