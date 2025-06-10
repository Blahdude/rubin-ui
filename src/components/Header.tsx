import React, { useState, useEffect, useRef } from "react"
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";

interface HeaderProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  isProcessingSolution?: boolean
  quitApp: () => void;
}

const Header: React.FC<HeaderProps> = ({
  onTooltipVisibilityChange,
  isProcessingSolution,
  quitApp
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let tooltipHeight = 0
    if (tooltipRef.current && isTooltipVisible) {
      tooltipHeight = tooltipRef.current.offsetHeight + 10
    }
    onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
  }, [isTooltipVisible, onTooltipVisibilityChange])

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
    <div className="w-full"> 
      <div ref={tooltipRef} className="bg-card/90 backdrop-blur-sm border-t border-border/20 rounded-md py-2.5 px-3 flex items-center flex-wrap justify-start gap-x-2 gap-y-1.5 text-xs">
        {/* Show/Hide */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] leading-none font-normal text-muted-foreground">Show/Hide</span>
          <div className="flex gap-0.5">
            <button className="bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-secondary-foreground font-medium">
              ⌘
            </button>
            <button className="bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-secondary-foreground font-medium">
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
              className={`bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none font-medium ${isProcessingSolution ? 'text-muted-foreground/50' : 'text-secondary-foreground'}`}
              disabled={isProcessingSolution}
            >
              ⌘
            </button>
            <button 
              className={`bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none font-medium ${isProcessingSolution ? 'text-muted-foreground/50' : 'text-secondary-foreground'}`}
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
            <button className="bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-secondary-foreground font-medium">
              ⌘
            </button>
            <button className="bg-secondary hover:bg-muted transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-secondary-foreground font-medium">
              ;
            </button>
          </div>
        </div>

        {/* Sign Out Button */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleSignOut}
            className="bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors rounded px-2 py-1 text-[10px] leading-none text-secondary-foreground font-medium">
            Sign Out
          </button>
        </div>
        
        {/* Quit Button */}
        <div className="flex items-center gap-1">
            <button 
              onClick={quitApp}
              className="bg-secondary hover:bg-muted transition-colors rounded px-2 py-1 text-[10px] leading-none text-secondary-foreground font-medium">
             Quit App
            </button>
        </div>

      </div>
    </div>
  )
}

export default Header 