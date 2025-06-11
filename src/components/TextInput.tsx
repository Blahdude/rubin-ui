import React, { useState, useEffect, useRef } from "react"
import { LuSend, LuHelpCircle } from "react-icons/lu"
import { HiStop } from "react-icons/hi2"

interface TextInputProps {
  onTooltipVisibilityChange?: (visible: boolean, height: number) => void
  isAiResponseActive?: boolean;
  conversation?: any[];
  onShowTutorial?: () => void;
}

const TextInput: React.FC<TextInputProps> = ({
  onTooltipVisibilityChange,
  isAiResponseActive = true,
  conversation = [],
  onShowTutorial
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [userInput, setUserInput] = useState("")
  const [isQueryInProgress, setIsQueryInProgress] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Check if music generation is in progress
  const isMusicGenerationInProgress = conversation.some((item: any) => 
    item.content?.isLoadingAudio === true
  );

  // Determine overall processing state
  const isProcessing = isQueryInProgress || isMusicGenerationInProgress;

  useEffect(() => {
    if (onTooltipVisibilityChange) {
      let tooltipHeight = 0
      if (tooltipRef.current && isTooltipVisible) {
        tooltipHeight = tooltipRef.current.offsetHeight + 10
      }
      onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
    }
  }, [isTooltipVisible, onTooltipVisibilityChange])

  // Listen for chat updates to reset query in progress state
  useEffect(() => {
    const electronAPI = window.electronAPI as any;
    if (electronAPI.onChatUpdated) {
      const unsubscribe = electronAPI.onChatUpdated((data: any) => {
        // Reset query in progress when we receive an AI response
        if (data.type === "ai_response") {
          setIsQueryInProgress(false);
        }
      });
      return unsubscribe;
    }
  }, [])

  const handleMouseEnter = () => {
    setIsTooltipVisible(true)
  }

  const handleMouseLeave = () => {
    setIsTooltipVisible(false)
  }

  const handleSendUserResponse = async () => {
    if (userInput.trim() === "" || !isAiResponseActive || isProcessing) return;
    
    // Store the input value before clearing it
    const inputToSend = userInput;
    
    // Clear the input field immediately
    setUserInput("");
    
    // Set query in progress
    setIsQueryInProgress(true);
    
    const electronAPI = window.electronAPI as any;
    try {
      console.log(`Sending to AI: ${inputToSend}`);

      // Get pending screenshots
      const pendingScreenshots = await electronAPI.getScreenshots();
      // Log what is being fetched (optional, for debugging)
      if (pendingScreenshots && pendingScreenshots.length > 0) {
        console.log(`Attaching ${pendingScreenshots.length} screenshots to the user query.`);
      }

      // Send user input and screenshots to the AI
      // We'll pass pendingScreenshots even if empty, main process can handle it.
      const result = await electronAPI.userResponseToAi(inputToSend, pendingScreenshots);
      
      if (result.success) {
        console.log("User response sent successfully.");
        // We will handle clearing the screenshot queue in the main process (ipcHandlers.ts)
        // after the AI call is successfully initiated.
      } else {
        console.error("Failed to send user response:", result.error);
      }
    } catch (error) {
      console.error("Error calling userResponseToAi or getScreenshots:", error);
    } finally {
      // Always reset the query in progress state
      setIsQueryInProgress(false);
    }
  };

  const handleCancelQuery = async () => {
    const electronAPI = window.electronAPI as any;
    try {
      if (isMusicGenerationInProgress) {
        // Cancel music generation
        console.log("Cancelling music generation...");
        const musicGenerationItem = conversation.find((item: any) => 
          item.content?.isLoadingAudio === true
        );
        if (musicGenerationItem && electronAPI.cancelMusicGeneration) {
          const result = await electronAPI.cancelMusicGeneration(musicGenerationItem.id);
          console.log("Music generation cancellation result:", result);
        }
      } else if (isQueryInProgress) {
        // Cancel AI query
        console.log("Cancelling query...");
        if (electronAPI.cancelQuery) {
          await electronAPI.cancelQuery();
        }
        setIsQueryInProgress(false);
      }
    } catch (error) {
      console.error("Error cancelling operation:", error);
      // Reset state anyway
      setIsQueryInProgress(false);
    }
  };

  const KeyboardShortcut = ({ keys, label }: { keys: string[], label: string }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, index) => (
          <kbd
            key={index}
            className="px-2 py-1 text-[10px] font-semibold bg-secondary/50 border border-border/30 rounded text-muted-foreground"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );

  return (
    <div className="non-draggable">
      <div className="relative">
        {/* Main input container with modern styling */}
        <div className="flex items-center gap-3">
          {/* Chat input area */}
          {isAiResponseActive && (
            <div className="flex-1 relative">
              <div className="relative flex items-center gap-3 p-3 bg-background/60 backdrop-blur-xl border border-border/40 rounded-xl transition-all duration-300 focus-within:border-primary/50 focus-within:shadow-glow group">
                {/* Input field with enhanced styling */}
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Type your message..."
                    className="w-full bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendUserResponse();
                      }
                    }}
                    disabled={isProcessing}
                  />
                  
                  {/* Typing indicator */}
                  {userInput && !isProcessing && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 animate-fade-in">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse-slow"></div>
                    </div>
                  )}
                </div>
                
                {/* Send/Cancel button with enhanced states */}
                <button
                  onClick={isProcessing ? handleCancelQuery : handleSendUserResponse}
                  title={
                    isMusicGenerationInProgress 
                      ? "Cancel music generation" 
                      : isQueryInProgress 
                        ? "Cancel query" 
                        : "Send message (Enter)"
                  }
                  className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 shrink-0 ${
                    isProcessing 
                      ? "bg-error/10 hover:bg-error/20 border border-error/20 text-error hover:border-error/30 hover:scale-105" 
                      : userInput.trim()
                        ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:scale-105"
                        : "bg-secondary/30 border border-border/30 text-muted-foreground cursor-not-allowed opacity-50"
                  }`}
                  disabled={!isProcessing && (!userInput.trim() || !isAiResponseActive)}
                >
                  {isProcessing ? (
                    <div className="relative">
                      <HiStop className="w-4 h-4" />
                      <div className="absolute inset-0 border border-current border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <LuSend className="w-4 h-4" />
                  )}
                </button>
              </div>
              
              {/* Processing status indicator */}
              {isProcessing && (
                <div className="absolute left-3 -bottom-8 flex items-center gap-2 text-xs text-primary animate-slide-up">
                  <div className="flex gap-1">
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                  </div>
                  <span className="font-medium">
                    {isMusicGenerationInProgress ? 'Generating music...' : 'Processing...'}
                  </span>
                </div>
              )}
            </div>
          )}
          
          {!isAiResponseActive && <div className="flex-1"></div>}

          {/* Help button with enhanced tooltip */}
          <div
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <button className="w-10 h-10 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-border/30 hover:border-border/50 transition-all duration-200 flex items-center justify-center group focus-ring">
              <LuHelpCircle className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
            
            {/* Enhanced tooltip with modern styling */}
            {isTooltipVisible && (
              <div
                ref={tooltipRef}
                className="absolute bottom-full right-0 mb-3 z-50 animate-scale-in"
              >
                <div className="panel-cursor w-80 p-6">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-3 pb-3 border-b border-border/30">
                      <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                          <circle cx="9" cy="12" r="1"/>
                          <circle cx="15" cy="12" r="1"/>
                          <path d="M9 12h6"/>
                          <path d="M4 8h16"/>
                          <path d="M4 16h16"/>
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-foreground">Keyboard Shortcuts</h3>
                        <p className="text-xs text-muted-foreground">Quick actions</p>
                      </div>
                    </div>
                    
                    {/* Shortcuts list */}
                    <div className="space-y-1">
                      <KeyboardShortcut keys={['⌘', 'B']} label="Show/Hide App" />
                      <KeyboardShortcut keys={['⌘', '↵']} label="Take Screenshot" />
                      <KeyboardShortcut keys={['⌘', ';']} label="Record Audio" />
                      <KeyboardShortcut keys={['⌘', 'R']} label="New Chat" />
                      <KeyboardShortcut keys={['↵']} label="Send Message" />
                    </div>
                    
                    {/* Tips section */}
                    <div className="pt-3 border-t border-border/30 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-primary/20 to-primary/10 rounded-md flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs">💡</span>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground">Pro tip:</span> Take screenshots, ask questions, and generate music with natural language. Rubin adapts to your workflow!
                          </p>
                        </div>
                      </div>
                      
                      {onShowTutorial && (
                        <button
                          onClick={() => {
                            setIsTooltipVisible(false);
                            onShowTutorial();
                          }}
                          className="btn-secondary w-full text-xs py-2.5"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            <polyline points="7.5,15 12,18.5 16.5,15"/>
                            <polyline points="7.5,9 12,5.5 16.5,9"/>
                          </svg>
                          Show Tutorial
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Tooltip arrow */}
                  <div className="absolute bottom-0 right-6 transform translate-y-1/2 rotate-45 w-3 h-3 bg-panel border-r border-b border-border/50"></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TextInput 