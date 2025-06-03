import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"
import { LuSend } from "react-icons/lu"

interface SolutionCommandsProps {
  extraScreenshots: any[]
  onTooltipVisibilityChange?: (visible: boolean, height: number) => void
  isAiResponseActive?: boolean;
}

const SolutionCommands: React.FC<SolutionCommandsProps> = ({
  extraScreenshots,
  onTooltipVisibilityChange,
  isAiResponseActive = true
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [userInput, setUserInput] = useState("")

  useEffect(() => {
    if (onTooltipVisibilityChange) {
      let tooltipHeight = 0
      if (tooltipRef.current && isTooltipVisible) {
        tooltipHeight = tooltipRef.current.offsetHeight + 10 // Adjust if necessary
      }
      onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
    }
  }, [isTooltipVisible, onTooltipVisibilityChange])

  const handleMouseEnter = () => {
    setIsTooltipVisible(true)
  }

  const handleMouseLeave = () => {
    setIsTooltipVisible(false)
  }

  const handleSendUserResponse = async () => {
    if (userInput.trim() === "" || !isAiResponseActive) return;
    try {
      console.log(`Sending to AI: ${userInput}`);
      // Assuming window.electronAPI.userResponseToAi is available globally
      // and was set up in App.tsx and preload.ts
      const result = await window.electronAPI.userResponseToAi(userInput);
      if (result.success) {
        console.log("User response sent successfully.");
      } else {
        console.error("Failed to send user response:", result.error);
        // Optionally, show a toast or error message to the user here
      }
      setUserInput(""); // Clear input after sending
    } catch (error) {
      console.error("Error calling userResponseToAi:", error);
      // Optionally, show a toast or error message to the user here
    }
  };

  return (
    <div>
      <div className="pt-2 w-fit font-semibold">
        <div className="text-xs text-black/80 backdrop-blur-md bg-white/60 rounded-lg py-2 px-3 flex items-center justify-center gap-3 flex-wrap">
          {/* Show/Hide */}
          <div className="flex items-center gap-2 whitespace-nowrap">
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
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[11px] leading-none truncate font-semibold">
              {extraScreenshots.length === 0
                ? "Screenshot your code"
                : "Screenshot"}
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
          {extraScreenshots.length > 0 && (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[11px] leading-none font-semibold">Debug</span>
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

          {/* Start Over */}
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[11px] leading-none font-semibold">Start over</span>
            <div className="flex gap-1">
              <button className="bg-black/10 hover:bg-black/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-black/70 font-semibold">
                ⌘
              </button>
              <button className="bg-black/10 hover:bg-black/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-black/70 font-semibold">
                R
              </button>
            </div>
          </div>

          {/* User Input for Follow-up - Conditionally rendered and styled */}
          {isAiResponseActive && (
            <div className="flex items-center gap-2 whitespace-nowrap flex-grow min-w-[150px]">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Ask a follow-up..."
                className="px-2 py-[5px] text-xs text-black/90 bg-white/70 border border-black/15 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors flex-grow placeholder-black/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendUserResponse();
                  }
                }}
              />
              <button
                onClick={handleSendUserResponse}
                title="Send response"
                className="bg-blue-500 hover:bg-blue-600 text-white rounded-md p-[5px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                disabled={!userInput.trim() || !isAiResponseActive}
              >
                <LuSend className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          
          {/* Spacer to push question mark and sign out to the right if input is not active*/}
          {!isAiResponseActive && <div className="flex-grow"></div>}

          {/* Question Mark with Tooltip */}
          <div
            className="relative inline-block ml-auto"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="w-6 h-6 rounded-full bg-black/10 hover:bg-black/20 backdrop-blur-sm transition-colors flex items-center justify-center cursor-help z-10">
              <span className="text-xs text-black/70 font-semibold">?</span>
            </div>
            {isTooltipVisible && (
              <div
                ref={tooltipRef}
                className="absolute top-full right-0 mt-2 w-80"
                style={{ zIndex: 100 }}
              >
                <div className="p-3 text-xs bg-white/80 backdrop-blur-md rounded-lg border border-black/10 text-black/90 shadow-lg font-semibold">
                  <div className="space-y-4">
                    <h3 className="font-semibold whitespace-nowrap">
                      Keyboard Shortcuts
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="whitespace-nowrap font-semibold">
                            Toggle Window
                          </span>
                          <div className="flex gap-1">
                            <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                              ⌘
                            </span>
                            <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                              B
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] leading-relaxed text-black/70 whitespace-nowrap truncate font-semibold">
                          Show or hide this window.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="whitespace-nowrap font-semibold">
                            Take Screenshot
                          </span>
                          <div className="flex gap-1">
                            <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                              ⌘
                            </span>
                            <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                              H
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] leading-relaxed text-black/70 whitespace-nowrap truncate font-semibold">
                          Capture additional parts of the question or your
                          solution for debugging help. Up to 5 extra screenshots
                          are saved.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="whitespace-nowrap font-semibold">Debug</span>
                          <div className="flex gap-1">
                            <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                              ⌘
                            </span>
                            <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                              ↵
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] leading-relaxed text-black/70 whitespace-nowrap truncate font-semibold">
                          Generate new solutions based on all previous and newly
                          added screenshots.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="whitespace-nowrap font-semibold">Start Over</span>
                          <div className="flex gap-1">
                            <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                              ⌘
                            </span>
                            <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] leading-none text-black/70 font-semibold">
                              R
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] leading-relaxed text-black/70 whitespace-nowrap truncate font-semibold">
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
            className="text-red-500/70 hover:text-red-500/90 transition-colors hover:cursor-pointer font-semibold ml-1"
            title="Sign Out"
            onClick={() => window.electronAPI.quitApp()}
          >
            <IoLogOutOutline className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default SolutionCommands
