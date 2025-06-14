import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"
import { LuSend } from "react-icons/lu"
import { HiStop } from "react-icons/hi2"

interface SolutionCommandsProps {
  onTooltipVisibilityChange?: (visible: boolean, height: number) => void
  isAiResponseActive?: boolean;
  conversation?: any[];
}

const SolutionCommands: React.FC<SolutionCommandsProps> = ({
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
        tooltipHeight = tooltipRef.current.offsetHeight + 10 // Adjust if necessary
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
      <div className="w-full bg-card/90 backdrop-blur-sm border-t border-border/20 py-2 px-3 flex items-center gap-2 flex-wrap">
        {/* User Input for Follow-up */}
        {isAiResponseActive && (
          <div className="flex items-center gap-1.5 whitespace-nowrap flex-grow min-w-[150px] sm:min-w-[200px]">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Ask a follow-up..."
              className="px-2 py-1 text-xs text-foreground bg-input/80 backdrop-blur-sm border border-border/20 rounded-md focus:ring-1 focus:ring-ring focus:border-ring outline-none transition-colors flex-grow placeholder-muted-foreground non-draggable"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendUserResponse();
                }
              }}
            />
            <button
              onClick={isProcessing ? handleCancelQuery : handleSendUserResponse}
              title={
                isMusicGenerationInProgress 
                  ? "Cancel music generation" 
                  : isQueryInProgress 
                    ? "Cancel query" 
                    : "Send response"
              }
              className={`${
                isProcessing 
                  ? "bg-secondary hover:bg-muted" 
                  : "bg-secondary hover:bg-muted"
              } text-secondary-foreground rounded-md p-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center non-draggable`}
              disabled={!isProcessing && (!userInput.trim() || !isAiResponseActive)}
            >
              {isProcessing ? (
                <HiStop className="w-3.5 h-3.5" />
              ) : (
                <LuSend className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
        
        {!isAiResponseActive && <div className="flex-grow"></div>}

        {/* Question Mark with Tooltip */}
        <div
          className="relative inline-block ml-auto"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="w-7 h-7 rounded-md bg-secondary hover:bg-muted transition-colors flex items-center justify-center cursor-help z-10 non-draggable">
            <span className="text-xs text-secondary-foreground font-medium">?</span>
          </div>
          {isTooltipVisible && (
            <div
              ref={tooltipRef}
              className="absolute bottom-full right-0 mb-2 w-72" 
              style={{ zIndex: 100 }}
            >
              <div className="p-2.5 text-[11px] bg-card/95 backdrop-blur-md rounded-md border border-border/20 text-card-foreground shadow-lg font-normal non-draggable">
                <div className="space-y-3">
                  <h3 className="font-medium whitespace-nowrap text-xs text-card-foreground border-b border-border pb-1.5 mb-1.5">
                    Keyboard Shortcuts
                  </h3>
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="whitespace-nowrap font-normal text-card-foreground">
                          Take a Screenshot
                        </span>
                        <div className="flex gap-0.5">
                          <span className="bg-secondary text-secondary-foreground px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                            ⌘
                          </span>
                          <span className="bg-secondary text-secondary-foreground px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                            Enter
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] leading-snug text-muted-foreground font-normal">
                        Add a screenshot to the user query.
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="whitespace-nowrap font-normal text-card-foreground">
                          Toggle Window
                        </span>
                        <div className="flex gap-0.5">
                          <span className="bg-secondary text-secondary-foreground px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                            ⌘
                          </span>
                          <span className="bg-secondary text-secondary-foreground px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                            B
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] leading-snug text-muted-foreground font-normal">
                        Show or hide this window.
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="whitespace-nowrap font-normal text-card-foreground">Start Over</span>
                        <div className="flex gap-0.5">
                          <span className="bg-secondary text-secondary-foreground px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                            ⌘
                          </span>
                          <span className="bg-secondary text-secondary-foreground px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                            R
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] leading-snug text-muted-foreground font-normal">
                        Start fresh with a new question.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sign Out Button */}
        <button
          className="text-muted-foreground hover:text-primary transition-colors hover:cursor-pointer font-medium ml-0.5 p-1 rounded-md hover:bg-secondary flex items-center justify-center non-draggable"
          title="Sign Out"
          onClick={() => window.electronAPI.quitApp()}
        >
          <IoLogOutOutline className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default SolutionCommands
