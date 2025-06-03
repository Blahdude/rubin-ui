import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"
import { FiClock, FiFileText } from "react-icons/fi"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshots: Array<{ path: string; preview: string }>
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
  screenshots
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

    const handleAudioRecordingComplete = (data: { path: string }) => {
      console.log("Global audio recording complete:", data.path)
      const newRecording: GlobalRecording = {
        id: `global-rec-${Date.now()}`,
        path: data.path,
        timestamp: new Date()
      };
      setGlobalRecordings(prevRecordings => [newRecording, ...prevRecordings]);
      setGlobalRecordingError(null);
      clearVadStatusTimeout();
      setVadStatusMessage(null); // Clear VAD status on completion
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
      <div className="text-xs text-black/80 backdrop-blur-md bg-white/60 rounded-lg py-2 px-4 flex items-center justify-center gap-4">
        {/* Show/Hide */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] leading-none font-semibold">Show/Hide</span>
          <div className="flex gap-1">
            <button className="bg-black/10 hover:bg-black/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-black/70 font-semibold">
              ⌘
            </button>
            <button className="bg-black/10 hover:bg-black/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-black/70 font-semibold">
              B
            </button>
          </div>
        </div>

        {/* Solve Command - Now always visible */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] leading-none font-semibold">Solve</span>
          <div className="flex gap-1">
            <button className="bg-black/10 hover:bg-black/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-black/70 font-semibold">
              ⌘
            </button>
            <button className="bg-black/10 hover:bg-black/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-black/70 font-semibold">
              ↵
            </button>
          </div>
        </div>

        {/* Record Audio (2s) - Global Shortcut */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] leading-none truncate font-semibold">
            Record Audio (2s)
          </span>
          <div className="flex gap-1">
            <button className="bg-black/10 hover:bg-black/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-black/70 font-semibold">
              ⌘
            </button>
            <button className="bg-black/10 hover:bg-black/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-black/70 font-semibold">
              ;
            </button>
          </div>
        </div>

        {/* MODIFIED Voice Recording Button - Icon only */}
        <div className="flex items-center">
          <button
            title={isRecording ? "Stop Recording" : "Record Voice"} // Tooltip for accessibility
            className={`bg-black/10 hover:bg-black/20 transition-colors rounded-md p-1.5 text-[13px] leading-none text-black/70 flex items-center justify-center font-semibold ${isRecording ? 'bg-red-500/70 hover:bg-red-500/90 text-white' : ''}`}
            onClick={handleRecordClick}
            type="button"
            style={{ width: '28px', height: '28px' }} // Explicit size for a more compact button
          >
            {isRecording ? (
              <span className="animate-pulse text-lg">●</span>
            ) : (
              <span className="text-lg">🎤</span>
            )}
          </button>
        </div>

        {/* Question mark with tooltip */}
        <div
          className="relative inline-block"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="w-6 h-6 rounded-full bg-black/10 hover:bg-black/20 backdrop-blur-sm transition-colors flex items-center justify-center cursor-help z-10">
            <span className="text-xs text-black/70 font-semibold">?</span>
          </div>

          {/* Tooltip Content - Screenshot shortcut description remains removed */}
          {isTooltipVisible && (
            <div
              ref={tooltipRef}
              className="absolute top-full right-0 mt-2 w-80"
            >
              <div className="p-3 text-xs bg-white/80 backdrop-blur-md rounded-lg border border-black/10 text-black/90 shadow-lg font-semibold">
                <div className="space-y-4">
                  <h3 className="font-semibold truncate">Keyboard Shortcuts</h3>
                  <div className="space-y-3">
                    {/* Toggle Command */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate font-semibold">Toggle Window</span>
                        <div className="flex gap-1 flex-shrink-0">
                          <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                            ⌘
                          </span>
                          <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                            B
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] leading-relaxed text-black/70 truncate font-semibold">
                        Show or hide this window.
                      </p>
                    </div>

                    {/* Solve Command */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate font-semibold">Solve Problem</span>
                        <div className="flex gap-1 flex-shrink-0">
                          <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                            ⌘
                          </span>
                          <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                            ↵
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] leading-relaxed text-black/70 truncate font-semibold">
                        Generate a solution based on the current problem. (Now auto-takes screenshot)
                      </p>
                    </div>
                     {/* Record Audio (2s) Global Shortcut */}
                     <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate font-semibold">Record Audio (2s)</span>
                        <div className="flex gap-1 flex-shrink-0"><span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">⌘</span><span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">;</span></div>
                      </div>
                      <p className="text-[10px] leading-relaxed text-black/70 truncate font-semibold">Record 2s of audio using VAD for music generation.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="mx-2 h-4 w-px bg-black/20" />

        {/* Sign Out Button - Moved to end */}
        <button
          className="text-red-500/70 hover:text-red-500/90 transition-colors hover:cursor-pointer font-semibold"
          title="Sign Out"
          onClick={() => window.electronAPI.quitApp()}
        >
          <IoLogOutOutline className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default QueueCommands
