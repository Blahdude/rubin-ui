import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"
import { LuSend } from "react-icons/lu"
import { HiStop } from "react-icons/hi2"

interface SolutionCommandsProps {
  onTooltipVisibilityChange?: (visible: boolean, height: number) => void
  isAiResponseActive?: boolean;
}

const SolutionCommands: React.FC<SolutionCommandsProps> = ({
  onTooltipVisibilityChange,
  isAiResponseActive = true
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [userInput, setUserInput] = useState("")
  const [isQueryInProgress, setIsQueryInProgress] = useState(false)

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
    if (userInput.trim() === "" || !isAiResponseActive || isQueryInProgress) return;
    
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
      console.log("Cancelling query...");
      if (electronAPI.cancelQuery) {
        await electronAPI.cancelQuery();
      }
      setIsQueryInProgress(false);
    } catch (error) {
      console.error("Error cancelling query:", error);
      // Reset state anyway
      setIsQueryInProgress(false);
    }
  };

  return (
    <div>
      <div className="w-full bg-neutral-800 border-t border-neutral-700 py-2 px-3 flex items-center gap-2 flex-wrap">
        {/* Show/Hide */}
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="text-[10px] leading-none font-normal text-neutral-400">Show/Hide</span>
          <div className="flex gap-0.5">
            <button className="bg-neutral-700 hover:bg-neutral-600 transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-neutral-300 font-medium">
              ⌘
            </button>
            <button className="bg-neutral-700 hover:bg-neutral-600 transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-neutral-300 font-medium">
              B
            </button>
          </div>
        </div>

        {/* Start Over */}
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="text-[10px] leading-none font-normal text-neutral-400">Start over</span>
          <div className="flex gap-0.5">
            <button className="bg-neutral-700 hover:bg-neutral-600 transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-neutral-300 font-medium">
              ⌘
            </button>
            <button className="bg-neutral-700 hover:bg-neutral-600 transition-colors rounded px-1 py-0.5 text-[10px] leading-none text-neutral-300 font-medium">
              R
            </button>
          </div>
        </div>

        {/* User Input for Follow-up */}
        {isAiResponseActive && (
          <div className="flex items-center gap-1.5 whitespace-nowrap flex-grow min-w-[150px] sm:min-w-[200px]">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Ask a follow-up..."
              className="px-2 py-1 text-xs text-neutral-200 bg-neutral-700 border border-neutral-600 rounded-md focus:ring-1 focus:ring-neutral-500 focus:border-neutral-500 outline-none transition-colors flex-grow placeholder-neutral-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendUserResponse();
                }
              }}
            />
            <button
              onClick={isQueryInProgress ? handleCancelQuery : handleSendUserResponse}
              title={isQueryInProgress ? "Cancel query" : "Send response"}
              className={`${
                isQueryInProgress 
                  ? "bg-neutral-600 hover:bg-neutral-500" 
                  : "bg-neutral-600 hover:bg-neutral-500"
              } text-neutral-200 rounded-md p-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center`}
              disabled={!isQueryInProgress && (!userInput.trim() || !isAiResponseActive)}
            >
              {isQueryInProgress ? (
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
          <div className="w-7 h-7 rounded-md bg-neutral-700 hover:bg-neutral-600 transition-colors flex items-center justify-center cursor-help z-10">
            <span className="text-xs text-neutral-300 font-medium">?</span>
          </div>
          {isTooltipVisible && (
            <div
              ref={tooltipRef}
              className="absolute bottom-full right-0 mb-2 w-72" 
              style={{ zIndex: 100 }}
            >
              <div className="p-2.5 text-[11px] bg-neutral-800/95 backdrop-blur-sm rounded-md border border-neutral-700 text-neutral-300 shadow-lg font-normal">
                <div className="space-y-3">
                  <h3 className="font-medium whitespace-nowrap text-xs text-neutral-200 border-b border-neutral-700 pb-1.5 mb-1.5">
                    Keyboard Shortcuts
                  </h3>
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="whitespace-nowrap font-normal text-neutral-300">
                          Toggle Window
                        </span>
                        <div className="flex gap-0.5">
                          <span className="bg-neutral-700 text-neutral-300 px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                            ⌘
                          </span>
                          <span className="bg-neutral-700 text-neutral-300 px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                            B
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] leading-snug text-neutral-400 font-normal">
                        Show or hide this window.
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="whitespace-nowrap font-normal text-neutral-300">Start Over</span>
                        <div className="flex gap-0.5">
                          <span className="bg-neutral-700 text-neutral-300 px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                            ⌘
                          </span>
                          <span className="bg-neutral-700 text-neutral-300 px-1 py-0.5 rounded text-[9px] leading-none font-medium">
                            R
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] leading-snug text-neutral-400 font-normal">
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
          className="text-neutral-400 hover:text-red-500 transition-colors hover:cursor-pointer font-medium ml-0.5 p-1 rounded-md hover:bg-neutral-700 flex items-center justify-center"
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
