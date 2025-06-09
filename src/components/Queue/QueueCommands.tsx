import React, { useState, useEffect, useRef } from "react"
import { auth } from "../../lib/firebase";
import { signOut } from "firebase/auth";
// Removed IoLogOutOutline as it's not used after sign out button removal
// import { FiClock, FiFileText } from "react-icons/fi"; // Not used

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  // screenshots prop is kept as it's used for display logic if any (currently not directly, but good to keep signature)
  screenshots: Array<{ path: string; preview: string }>
  isProcessingSolution?: boolean
  quitApp: () => void;
}

// Removed GlobalRecording interface (managed in Queue.tsx)
// Removed GeneratedAudioClip interface (managed in Queue.tsx)

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  // screenshots, // Not directly used in the simplified version
  isProcessingSolution,
  quitApp
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  // Removed isRecording, mediaRecorder, audioResult, chunks states (local recording UI state, not global)

  // Removed all state related to global recordings, VAD, and generated clips as it's handled in Queue.tsx
  // const [globalRecordings, setGlobalRecordings] = useState<GlobalRecording[]>([])
  // const [generatedAudioClips, setGeneratedAudioClips] = useState<GeneratedAudioClip[]>([])
  // const [globalRecordingError, setGlobalRecordingError] = useState<string | null>(null)
  // const [vadStatusMessage, setVadStatusMessage] = useState<string | null>(null);
  // const vadStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let tooltipHeight = 0
    if (tooltipRef.current && isTooltipVisible) {
      tooltipHeight = tooltipRef.current.offsetHeight + 10
    }
    onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
  }, [isTooltipVisible, onTooltipVisibilityChange])

  // Removed the entire useEffect hook that subscribed to Electron events
  // (onVadWaiting, onVadRecordingStarted, onVadTimeout, onAudioRecordingComplete, 
  //  onAudioRecordingError, onGeneratedAudioReady).
  // This logic is now centralized in Queue.tsx.

  // const handleMouseEnter = () => { // Kept if needed for tooltip, but not used in current command display
  //   setIsTooltipVisible(true)
  // }

  // const handleMouseLeave = () => { // Kept if needed for tooltip
  //   setIsTooltipVisible(false)
  // }

  // Removed handleRecordClick as it was for local UI state / old recording logic

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      // The onAuthStateChanged listener in App.tsx will handle the UI update
    } catch (error) {
      console.error("Error signing out: ", error);
      // Optionally, show a toast message on error
    }
  };

  return (
    <div className="w-full non-draggable"> 
      <div ref={tooltipRef} className="bg-card/90 backdrop-blur-sm border-t border-border/20 rounded-md py-2.5 px-3 flex items-center flex-wrap justify-start gap-x-2 gap-y-1.5 text-xs">
        {/* Show/Hide */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] leading-none font-normal text-muted-foreground">Show/Hide</span>
          <div className="flex gap-0.5">
            <button className="bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-secondary-foreground font-medium non-draggable">
              ⌘
            </button>
            <button className="bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-secondary-foreground font-medium non-draggable">
              B
            </button>
          </div>
        </div>

        {/* Solve Command */}
        <div className="flex items-center gap-1">
          <span className={`text-[10px] leading-none font-normal ${isProcessingSolution ? 'text-muted-foreground/50 animate-pulse' : 'text-muted-foreground'}`}>
            {isProcessingSolution ? 'Solving...' : 'Solve'}
          </span>
          <div className={`flex gap-0.5 ${isProcessingSolution ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <button 
              className={`bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none font-medium non-draggable ${isProcessingSolution ? 'text-muted-foreground/50' : 'text-secondary-foreground'}`}
              disabled={isProcessingSolution}
            >
              ⌘
            </button>
            <button 
              className={`bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none font-medium non-draggable ${isProcessingSolution ? 'text-muted-foreground/50' : 'text-secondary-foreground'}`}
              disabled={isProcessingSolution}
            >
              ↵
            </button>
          </div>
        </div>

        {/* Record Audio (triggers global VAD recording shortcut handled in main.ts -> Queue.tsx) */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] leading-none font-normal text-muted-foreground">
            Record Audio
          </span>
          <div className="flex gap-0.5">
            <button className="bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-secondary-foreground font-medium non-draggable">
              ⌘
            </button>
            <button className="bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-secondary-foreground font-medium non-draggable">
              ;
            </button>
          </div>
        </div>

        {/* Sign Out Button */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleSignOut}
            className="bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors rounded px-2 py-1 text-[10px] leading-none text-secondary-foreground font-medium non-draggable"
          >
            Sign Out
          </button>
        </div>
        
        {/* Quit Button */}
        <div className="flex items-center gap-1">
            <button 
              onClick={quitApp}
              className="bg-secondary hover:bg-muted transition-colors rounded px-2 py-1 text-[10px] leading-none text-secondary-foreground font-medium non-draggable"
            >
             Quit App
            </button>
        </div>

      </div>
    </div>
  )
}

export default QueueCommands

