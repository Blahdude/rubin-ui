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
    if (!isRecording) {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        recorder.ondataavailable = (e) => chunks.current.push(e.data)
        recorder.onstop = async () => {
          const blob = new Blob(chunks.current, { type: chunks.current[0]?.type || 'audio/webm' })
          chunks.current = []
          const reader = new FileReader()
          reader.onloadend = async () => {
            const base64Data = (reader.result as string).split(',')[1]
            try {
              const result = await window.electronAPI.analyzeAudioFromBase64(base64Data, blob.type)
              setAudioResult(result.text)
            } catch (err) {
              setAudioResult('Audio analysis failed.')
            }
          }
          reader.readAsDataURL(blob)
        }
        setMediaRecorder(recorder)
        recorder.start()
        setIsRecording(true)
      } catch (err) {
        setAudioResult('Could not start recording.')
      }
    } else {
      // Stop recording
      mediaRecorder?.stop()
      setIsRecording(false)
      setMediaRecorder(null)
    }
  }

  return (
    <div className="w-full font-semibold">
      <div className="text-xs text-black/80 backdrop-blur-md bg-white/50 rounded-lg py-1.5 px-2.5 flex items-center flex-wrap justify-start gap-x-2.5 gap-y-1.5">
        {/* Show/Hide */}
        <div className="flex items-center gap-1">
          <span className="text-[10.5px] leading-none font-medium text-black/70">Show/Hide</span>
          <div className="flex gap-0.5">
            <button className="hover:bg-black/10 transition-colors rounded-md px-1.5 py-0.5 text-[10.5px] leading-none text-black/60 font-semibold">
              ⌘
            </button>
            <button className="hover:bg-black/10 transition-colors rounded-md px-1.5 py-0.5 text-[10.5px] leading-none text-black/60 font-semibold">
              B
            </button>
          </div>
        </div>

        {/* Solve Command */}
        <div className="flex items-center gap-1">
          <span className={`text-[10.5px] leading-none font-medium ${isProcessingSolution ? 'text-black/40 animate-pulse' : 'text-black/70'}`}>
            {isProcessingSolution ? 'Solving...' : 'Solve'}
          </span>
          <div className={`flex gap-0.5 ${isProcessingSolution ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <button 
              className={`hover:bg-black/10 transition-colors rounded-md px-1.5 py-0.5 text-[10.5px] leading-none font-semibold ${isProcessingSolution ? 'text-black/40' : 'text-black/60'}`}
              disabled={isProcessingSolution}
            >
              ⌘
            </button>
            <button 
              className={`hover:bg-black/10 transition-colors rounded-md px-1.5 py-0.5 text-[10.5px] leading-none font-semibold ${isProcessingSolution ? 'text-black/40' : 'text-black/60'}`}
              disabled={isProcessingSolution}
            >
              ↵
            </button>
          </div>
        </div>

        {/* Record Audio (2s) */}
        <div className="flex items-center gap-1">
          <span className="text-[10.5px] leading-none font-medium text-black/70">
            Record Audio (2s)
          </span>
          <div className="flex gap-0.5">
            <button className="hover:bg-black/10 transition-colors rounded-md px-1.5 py-0.5 text-[10.5px] leading-none text-black/60 font-semibold">
              ⌘
            </button>
            <button className="hover:bg-black/10 transition-colors rounded-md px-1.5 py-0.5 text-[10.5px] leading-none text-black/60 font-semibold">
              ;
            </button>
          </div>
        </div>

        {/* Voice Recording Button - Icon only */}
        <div className="flex items-center">
          <button
            title={isRecording ? "Stop Recording" : "Record Voice"}
            className={`hover:bg-black/10 transition-colors rounded-md p-1.5 text-black/70 flex items-center justify-center ${isRecording ? 'bg-red-500/20 hover:bg-red-500/30 text-red-600' : 'text-black/60'}`}
            onClick={handleRecordClick}
            type="button"
            style={{ width: '26px', height: '26px' }} 
          >
            {isRecording ? (
              <span className="animate-pulse text-md">●</span>
            ) : (
              <span className="text-md">🎤</span>
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
            <div className="w-6 h-6 rounded-full hover:bg-black/10 backdrop-blur-sm transition-colors flex items-center justify-center cursor-help z-10">
              <span className="text-xs text-black/60 font-semibold">?</span>
            </div>
            {isTooltipVisible && (
              <div
                ref={tooltipRef}
                className="absolute top-full right-0 mt-2 w-80 z-20" // Ensure tooltip is above other elements
              >
                <div className="p-3 text-xs bg-white/80 backdrop-blur-md rounded-lg border border-black/10 text-black/90 shadow-xl font-medium">
                  {/* Tooltip content styling can also be refined if needed */}
                  <h3 className="font-semibold text-black/80 mb-2 pb-1 border-b border-black/10">Keyboard Shortcuts</h3>
                  {/* ... simplified tooltip items ... */}
                   <div className="space-y-2.5">
                    {[ 
                      { label: "Toggle Window", keys: ["⌘", "B"], desc: "Show or hide this window." },
                      { label: "Solve Problem", keys: ["⌘", "↵"], desc: "Generate solution (auto-takes screenshot)." },
                      { label: "Record Audio (2s)", keys: ["⌘", ";"], desc: "Record 2s audio for music generation." },
                    ].map(item => (
                      <div key={item.label} className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-black/80 font-medium">{item.label}</span>
                          <div className="flex gap-0.5">
                            {item.keys.map(key => (
                              <span key={key} className="bg-black/5 text-black/60 px-1.5 py-0.5 rounded text-[10px] leading-none font-semibold">
                                {key}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] leading-snug text-black/60">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            className="text-red-500/70 hover:text-red-500/90 hover:bg-red-500/10 transition-colors rounded-md p-1 flex items-center justify-center"
            title="Sign Out"
            onClick={() => window.electronAPI.quitApp()}
            style={{ width: '26px', height: '26px' }} 
          >
            <IoLogOutOutline className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default QueueCommands

