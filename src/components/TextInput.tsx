import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"
import { LuSend } from "react-icons/lu"
import { HiStop } from "react-icons/hi2"

interface TextInputProps {
  onTooltipVisibilityChange?: (visible: boolean, height: number) => void
  isAiResponseActive?: boolean;
  conversation?: any[];
}

const TextInput: React.FC<TextInputProps> = ({
  onTooltipVisibilityChange,
  isAiResponseActive = true,
  conversation = []
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [userInput, setUserInput] = useState("")
  const [isQueryInProgress, setIsQueryInProgress] = useState(false)

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

  return (
    <div className="non-draggable">
      <div className="w-full bg-card/90 backdrop-blur-xl border-t border-border/20 px-4 py-3 shadow-lg shadow-black/5">
        <div className="flex items-center gap-3">
          {/* Enhanced User Input */}
          {isAiResponseActive && (
            <div className="flex-grow flex items-center gap-3">
              <div className="relative flex-grow">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Ask a follow-up question..."
                  className="w-full px-4 py-3 text-sm text-foreground bg-background/50 backdrop-blur-sm border border-border/30 hover:border-border/60 focus:border-primary/50 rounded-xl outline-none transition-all duration-200 placeholder-muted-foreground focus:ring-4 focus:ring-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendUserResponse();
                    }
                  }}
                  disabled={isProcessing}
                />
                {userInput && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>
              
              <button
                onClick={isProcessing ? handleCancelQuery : handleSendUserResponse}
                title={
                  isMusicGenerationInProgress 
                    ? "Cancel music generation" 
                    : isQueryInProgress 
                      ? "Cancel query" 
                      : "Send message"
                }
                className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isProcessing 
                    ? "bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive hover:border-destructive/50" 
                    : userInput.trim()
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 border border-primary/20"
                      : "bg-secondary/50 hover:bg-secondary/80 border border-border/30 text-muted-foreground cursor-not-allowed"
                }`}
                disabled={!isProcessing && (!userInput.trim() || !isAiResponseActive)}
              >
                {isProcessing ? (
                  <div className="relative">
                    <HiStop className="w-5 h-5" />
                    <div className="absolute inset-0 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (
                  <LuSend className="w-5 h-5" />
                )}
              </button>
            </div>
          )}
          
          {!isAiResponseActive && <div className="flex-grow"></div>}

          {/* Enhanced Help Button */}
          <div
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <button className="w-10 h-10 rounded-xl bg-secondary/50 hover:bg-secondary/80 border border-border/30 hover:border-border/60 transition-all duration-200 flex items-center justify-center cursor-help group">
              <span className="text-sm text-muted-foreground group-hover:text-foreground font-medium transition-colors">?</span>
            </button>
            
            {isTooltipVisible && (
              <div
                ref={tooltipRef}
                className="absolute bottom-full right-0 mb-3 z-50 animate-in slide-in-from-bottom-2 duration-200"
              >
                <div className="w-80 p-4 bg-card/95 backdrop-blur-xl rounded-xl border border-border/20 shadow-2xl shadow-black/10">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-border/20">
                      <span className="text-primary">⌨️</span>
                      <h3 className="font-semibold text-sm text-foreground">
                        Keyboard Shortcuts
                      </h3>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Show/Hide App</span>
                        <div className="flex items-center gap-1">
                          <kbd className="px-2 py-1 text-[10px] font-mono bg-secondary border border-border rounded text-foreground">⌘</kbd>
                          <kbd className="px-2 py-1 text-[10px] font-mono bg-secondary border border-border rounded text-foreground">B</kbd>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Solve Problem</span>
                        <div className="flex items-center gap-1">
                          <kbd className="px-2 py-1 text-[10px] font-mono bg-secondary border border-border rounded text-foreground">⌘</kbd>
                          <kbd className="px-2 py-1 text-[10px] font-mono bg-secondary border border-border rounded text-foreground">↵</kbd>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Record Audio</span>
                        <div className="flex items-center gap-1">
                          <kbd className="px-2 py-1 text-[10px] font-mono bg-secondary border border-border rounded text-foreground">⌘</kbd>
                          <kbd className="px-2 py-1 text-[10px] font-mono bg-secondary border border-border rounded text-foreground">;</kbd>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Send Message</span>
                        <div className="flex items-center gap-1">
                          <kbd className="px-2 py-1 text-[10px] font-mono bg-secondary border border-border rounded text-foreground">↵</kbd>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">New Chat</span>
                        <div className="flex items-center gap-1">
                          <kbd className="px-2 py-1 text-[10px] font-mono bg-secondary border border-border rounded text-foreground">⌘</kbd>
                          <kbd className="px-2 py-1 text-[10px] font-mono bg-secondary border border-border rounded text-foreground">R</kbd>
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-border/20">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        💡 <span className="font-medium">Tips:</span> Take screenshots, ask questions, and generate music with natural language. Rubin is your AI coding and creative assistant!
                      </p>
                    </div>
                  </div>
                  
                  {/* Tooltip arrow */}
                  <div className="absolute bottom-0 right-4 transform translate-y-1/2 rotate-45 w-2 h-2 bg-card border-r border-b border-border/20"></div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Processing indicator */}
        {isProcessing && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg animate-in slide-in-from-bottom duration-200">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-xs font-medium text-primary">
              {isMusicGenerationInProgress ? 'Generating music...' : 'Processing your request...'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default TextInput 