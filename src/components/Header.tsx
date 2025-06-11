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
    <div className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all duration-200 ${
      isActive || isLoading 
        ? 'bg-primary/10 border border-primary/20 shadow-glow' 
        : 'bg-secondary/30 hover:bg-secondary/50 border border-border/30 hover:border-border/50'
    }`}>
      <span className={`text-xs font-medium transition-colors duration-200 ${
        isLoading 
          ? 'text-primary animate-pulse' 
          : isActive 
            ? 'text-primary'
            : 'text-muted-foreground group-hover:text-foreground'
      }`}>
        {isLoading ? 'Processing...' : label}
      </span>
      <div className="flex gap-1">
        {keys.map((key, index) => (
          <kbd
            key={index}
            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-all duration-200 ${
              isActive || isLoading 
                ? 'bg-primary/20 border-primary/30 text-primary shadow-sm' 
                : 'bg-background/50 border-border/50 text-muted-foreground group-hover:bg-background group-hover:text-foreground group-hover:border-border'
            }`}
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );

  const StatusIndicator = () => (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border border-primary/10 rounded-md animate-fade-in">
      <div className="relative">
        <div className="w-2 h-2 bg-primary rounded-full animate-pulse-slow"></div>
        <div className="absolute inset-0 w-2 h-2 bg-primary rounded-full animate-ping opacity-75"></div>
      </div>
      <span className="text-xs font-medium text-primary">AI thinking</span>
      <div className="flex gap-0.5">
        <div className="w-1 h-1 bg-primary/60 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
        <div className="w-1 h-1 bg-primary/60 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
        <div className="w-1 h-1 bg-primary/60 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
      </div>
    </div>
  );

  return (
    <div className="w-full px-6 py-3 border-b border-border/30">
      <div className="flex items-center justify-between">
        {/* Left side - App branding with enhanced styling */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {/* App icon with gradient and glow effect */}
            <div className="relative group">
              <div className="w-9 h-9 bg-gradient-to-br from-primary via-primary/90 to-primary/80 rounded-lg flex items-center justify-center shadow-cursor transition-all duration-300 group-hover:shadow-glow group-hover:scale-105">
                <span className="text-primary-foreground font-bold text-base">R</span>
              </div>
              <div className="absolute inset-0 w-9 h-9 bg-gradient-to-br from-primary/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-glow"></div>
            </div>
            
            {/* App name with enhanced typography */}
            <div className="flex flex-col">
              <h1 className="font-bold text-xl text-gradient-animated bg-gradient-to-r from-primary via-primary/90 to-primary bg-[length:200%_100%]">
                Rubin
              </h1>
              <span className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">
                AI Assistant
              </span>
            </div>
          </div>
          
          {/* Processing indicator with enhanced animations */}
          {isProcessingSolution && <StatusIndicator />}
        </div>

        {/* Center - Enhanced keyboard shortcuts */}
        <div className="flex items-center gap-2">
          <KeyboardShortcut 
            keys={['⌘', 'B']} 
            label="Toggle" 
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
          <KeyboardShortcut 
            keys={['⌘', 'R']} 
            label="Reset" 
          />
        </div>

        {/* Right side - Enhanced action buttons */}
        <div className="flex items-center gap-2">
          {/* User profile button */}
          <button
            onClick={handleSignOut}
            className="group flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 border border-border/30 hover:border-border/50 rounded-md transition-all duration-200 focus-ring"
          >
            <div className="w-5 h-5 bg-gradient-to-br from-muted to-muted-foreground rounded-full flex items-center justify-center text-[10px] font-bold text-background group-hover:scale-105 transition-transform duration-200">
              👤
            </div>
            <span>Sign Out</span>
          </button>
          
          {/* Quit button with enhanced hover state */}
          <button 
            onClick={quitApp}
            className="group flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-error bg-secondary/30 hover:bg-error/5 border border-border/30 hover:border-error/20 rounded-md transition-all duration-200 focus-ring"
          >
            <div className="w-4 h-4 flex items-center justify-center text-muted-foreground group-hover:text-error transition-colors duration-200">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </div>
            <span>Quit</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Header 