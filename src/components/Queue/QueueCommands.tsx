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
  }, [isTooltipVisible])

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
    <div className="pt-2 w-fit font-semibold">
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

        {/* Screenshot */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] leading-none truncate font-semibold">
            {screenshots.length === 0 ? "Take first screenshot" : "Screenshot"}
          </span>
          <div className="flex gap-1">
            <button className="bg-black/10 hover:bg-black/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-black/70 font-semibold">
              ⌘
            </button>
            <button className="bg-black/10 hover:bg-black/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-black/70 font-semibold">
              H
            </button>
          </div>
        </div>

        {/* Solve Command */}
        {screenshots.length > 0 && (
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
        )}

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

        {/* Voice Recording Button */}
        <div className="flex items-center gap-2">
          <button
            className={`bg-black/10 hover:bg-black/20 transition-colors rounded-md px-2 py-1 text-[11px] leading-none text-black/70 flex items-center gap-1 font-semibold ${isRecording ? 'bg-red-500/70 hover:bg-red-500/90 text-white' : ''}`}
            onClick={handleRecordClick}
            type="button"
          >
            {isRecording ? (
              <span className="animate-pulse font-semibold">● Stop Recording</span>
            ) : (
              <span className="font-semibold">🎤 Record Voice</span>
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

          {/* Tooltip Content */}
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
                    {/* Screenshot Command */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate font-semibold">Take Screenshot</span>
                        <div className="flex gap-1 flex-shrink-0">
                          <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                            ⌘
                          </span>
                          <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                            H
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] leading-relaxed text-black/70 truncate font-semibold">
                        Take a screenshot of the problem description. The tool
                        will extract and analyze the problem. The 5 latest
                        screenshots are saved.
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
                        Generate a solution based on the current problem.
                      </p>
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
      {/* Audio Result Display for in-app recording */}
      {audioResult && (
        <div className="mt-2 p-2 bg-stone-100/70 border border-stone-300/50 rounded text-stone-700 text-xs max-w-md font-semibold">
          <span className="font-semibold">Audio Analysis Result (In-app):</span> {audioResult}
        </div>
      )}
      {/* VAD Status Message */}
      {vadStatusMessage && (
        <div className={`mt-2 p-2 rounded text-xs max-w-md font-semibold ${vadStatusMessage.includes("Error") || vadStatusMessage.includes("error") || vadStatusMessage.includes("timed out") ? 'bg-yellow-400/30 border border-yellow-500/50 text-yellow-800' : 'bg-blue-400/30 border border-blue-500/50 text-blue-800'}`}>
          {vadStatusMessage}
        </div>
      )}
      {/* Global Shortcut Audio Recording Status Display */}
      {globalRecordings.length > 0 && (
         <div className="mt-4 p-3 bg-white/70 backdrop-blur-md rounded-lg text-black text-xs max-w-md space-y-3 shadow-lg border border-black/10 font-semibold">
          <h4 className="font-semibold text-[11px] text-black/80 border-b border-black/20 pb-1 mb-2">Recorded Audio Clips (⌘;)</h4>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1.5">
            {globalRecordings.map((rec) => (
              <div 
                key={rec.id} 
                className="flex flex-col p-3 bg-neutral-100/80 rounded-lg shadow hover:bg-neutral-200/80 transition-colors duration-150 ease-in-out border border-neutral-300/50 cursor-grab font-semibold"
                draggable="true"
                onDragStart={(event) => {
                  event.preventDefault(); // Important to allow Electron to take over
                  console.log(`[Dragger] Dragging: ${rec.path}`);
                  window.electronAPI.startFileDrag(rec.path);
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center text-[10px] text-neutral-600 font-semibold">
                    <span className="mr-1">⏰</span>
                    <span>{rec.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                </div>
                <p className="text-[11px] font-medium text-neutral-700 truncate mb-2 flex items-center font-semibold">
                  <span className="mr-1.5">📄</span>
                  <span className="truncate">{rec.path.split(/[\\/]/).pop()}</span>
                </p>
                <audio controls src={`clp://${rec.path}`} className="w-full h-8 rounded-md"> 
                  Your browser does not support the audio element.
                </audio>
              </div>
            ))}
          </div>
        </div>
      )}
      {globalRecordingError && (
        <div className="mt-2 p-2 bg-red-500/30 rounded text-white text-xs max-w-md border border-red-500/50 font-semibold">
          <span className="font-semibold">Audio Recording Error:</span> {globalRecordingError}
        </div>
      )}
      {/* Generated Audio Clips Display */}
      {generatedAudioClips.length > 0 && (
         <div className="mt-4 p-3 bg-white/70 backdrop-blur-md rounded-lg text-black text-xs max-w-md space-y-3 shadow-lg border border-black/10 font-semibold">
          <h4 className="font-semibold text-[11px] text-black/80 border-b border-black/20 pb-1 mb-2">Generated Audio Clips</h4>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1.5">
            {generatedAudioClips.map((clip) => (
              <div 
                key={clip.id} 
                className="flex flex-col p-3 bg-teal-100/60 rounded-lg shadow hover:bg-teal-200/60 transition-colors duration-150 ease-in-out border border-teal-300/50 cursor-grab font-semibold"
                draggable="true"
                onDragStart={(event) => {
                  event.preventDefault(); 
                  console.log(`[Dragger] Dragging generated: ${clip.path}`);
                  window.electronAPI.startFileDrag(clip.path);
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center text-[10px] text-teal-700 font-semibold">
                    <span className="mr-1">⏰</span>
                    <span>{clip.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                </div>
                <p className="text-[11px] font-medium text-teal-800 truncate mb-1 flex items-center font-semibold">
                  <span className="mr-1.5">🎵</span>
                  <span className="truncate" title={clip.path}>{clip.path.split(/[\\/]/).pop()}</span>
                </p>
                 <p className="text-[9px] text-teal-700 truncate mb-2 flex items-center font-semibold">
                  <span className="mr-1.5">🔙</span>
                  <span className="truncate">Orig: {clip.originalPath.split(/[\\/]/).pop()}</span>
                </p>
                <div className="text-[9px] text-teal-800 mb-2 flex justify-between font-semibold">
                  <span>BPM: {clip.bpm}</span>
                  <span>Key: {clip.key}</span>
                </div>
                <audio controls src={`clp://${clip.path}`} className="w-full h-8 rounded-md"> 
                  Your browser does not support the audio element.
                </audio>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default QueueCommands
