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
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const KeyboardShortcut = ({ keys, label, isActive = false, isLoading = false }: { 
    keys: string[], 
    label: string, 
    isActive?: boolean,
    isLoading?: boolean 
  }) => (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
      isActive ? 'bg-primary/10 border border-primary/20' : 'bg-secondary/50 hover:bg-secondary/80'
    }`}>
      <span className={`text-xs font-medium ${
        isLoading ? 'text-primary animate-pulse' : 'text-muted-foreground'
      }`}>
        {isLoading ? 'Solving...' : label}
      </span>
      <div className="flex gap-1">
        {keys.map((key, index) => (
          <kbd
            key={index}
            className={`px-2 py-1 text-[10px] font-bold rounded border transition-all duration-200 ${
              isActive || isLoading 
                ? 'bg-primary/20 border-primary/30 text-primary' 
                : 'bg-background border-border text-foreground hover:bg-muted'
            }`}
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );

  return (
    <div className="w-full px-4 py-4">
      <div className="flex items-center justify-between">
        {/* Left side - App branding */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center shadow-lg">
              <span className="text-primary-foreground font-bold text-sm">R</span>
            </div>
            <h1 className="font-bold text-lg bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Rubin
            </h1>
          </div>
          {isProcessingSolution && (
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-primary">AI thinking...</span>
            </div>
          )}
        </div>

        {/* Center - Keyboard shortcuts */}
        <div className="flex items-center gap-2">
          <KeyboardShortcut 
            keys={['⌘', 'B']} 
            label="Show/Hide" 
          />
          <KeyboardShortcut 
            keys={['⌘', '↵']} 
            label="Screenshot"
            isActive={isProcessingSolution}
            isLoading={isProcessingSolution}
          />
          <KeyboardShortcut 
            keys={['⌘', ';']} 
            label="Record" 
          />
        </div>

        {/* Right side - Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSignOut}
            className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary/80 border border-border/50 hover:border-border rounded-lg transition-all duration-200 flex items-center gap-2"
          >
            <span>👤</span>
            <span>Sign Out</span>
          </button>
          
          <button 
            onClick={quitApp}
            className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-destructive bg-secondary/50 hover:bg-destructive/10 border border-border/50 hover:border-destructive/30 rounded-lg transition-all duration-200 flex items-center gap-2"
          >
            <span>⨯</span>
            <span>Quit</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Header 