// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "react-query"

import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import {
  Toast,
  ToastDescription,
  ToastMessage,
  ToastTitle,
  ToastVariant
} from "../components/ui/toast"
import { ProblemStatementData } from "../types/solutions"
import { AudioResult } from "../types/audio"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import Debug from "./Debug"
import { ConversationItem } from "../App"

// (Using global ElectronAPI type from src/types/electron.d.ts)

// Define SolutionEntry interface
interface SolutionEntry {
  id: string;
  problemStatementData: ProblemStatementData | null;
  solutionData: string | null;
  thoughtsData: string[] | null;
  timeComplexityData: string | null;
  spaceComplexityData: string | null;
  // Optional: If you want to associate specific screenshots with each entry
  // extraScreenshots?: Array<{ path: string; preview: string }>;
}

interface SolutionsProps {
  showCommands?: boolean;
  onProcessingStateChange?: (isProcessing: boolean) => void;
  conversation?: ConversationItem[];
}

const Solutions: React.FC<SolutionsProps> = ({ showCommands = true, onProcessingStateChange, conversation }) => {
  const contentRef = useRef<HTMLDivElement>(null)

  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const [isResetting, setIsResetting] = useState(false)

  const { data: extraScreenshots = [] } = useQuery<Array<{ path: string; preview: string }>, Error>(
    ["extras"],
    async () => window.electronAPI.getScreenshots ? await window.electronAPI.getScreenshots() : [],
    {
      staleTime: Infinity,
      cacheTime: Infinity
    }
  )

  const showToast = (
    title: string,
    description: string,
    variant: ToastVariant
  ) => {
    setToastMessage({ title, description, variant })
    setToastOpen(true)
  }

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = extraScreenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        // Refetch extra screenshots
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
    }
  }

  useEffect(() => {
    // console.log("Solutions.tsx: Conversation prop updated:", conversation);
    if (contentRef.current && contentRef.current.scrollHeight > contentRef.current.clientHeight) {
      try {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      } catch (e) {
        console.error("Error scrolling to bottom in Solutions.tsx:", e);
      }
    }
    if (onProcessingStateChange && conversation && conversation.length > 0) {
      const lastMessage = conversation[conversation.length - 1];
      if (lastMessage.type === 'ai_response' || lastMessage.type === 'system_message') {
        onProcessingStateChange(false);
      } else if (lastMessage.type === 'user_text' || lastMessage.type === 'user_file') {
        onProcessingStateChange(true);
      }
    }
  }, [conversation, onProcessingStateChange]);

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  if (isResetting) {
    return (
      <div className="flex-grow h-full flex items-center justify-center text-neutral-500">
        <p className="text-sm">Clearing chat...</p>
      </div>
    );
  }

  const formatTimestamp = (timestamp: number | undefined | null) => {
    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
      // It might be useful to log an error here if this case is unexpected
      return '??:??'; // Fallback for invalid or missing timestamp
    }
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-grow h-full flex flex-col bg-neutral-850">
      <Toast
        open={toastOpen}
        onOpenChange={setToastOpen}
        variant={toastMessage.variant}
        duration={3000}
      >
      </Toast>

      <div
        ref={contentRef}
        className="flex-grow overflow-y-auto p-3 md:p-4 space-y-3 scrollbar-thin scrollbar-thumb-neutral-600 hover:scrollbar-thumb-neutral-500 scrollbar-track-neutral-700 scrollbar-thumb-rounded-full"
        style={{ paddingBottom: `${tooltipHeight + 10}px` }}
      >
        {(!conversation || conversation.length === 0) && (
          <div className="flex items-center justify-center h-full">
            <p className="text-center text-sm text-neutral-500 font-medium p-6">
              Context captured. Ask a follow-up, or the AI will begin processing.
            </p>
          </div>
        )}
        {conversation?.map((item: ConversationItem, index: number) => {
          if (item.type === 'user_text') {
            return (
              <div key={item.id} className="flex justify-center group">
                <div className="text-neutral-300 px-3.5 py-2 text-sm max-w-[85%] md:max-w-[75%] relative">
                  {item.content}
                  <span className="text-[10px] text-neutral-500 absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
              </div>
            );
          } else if (item.type === 'ai_response') {
            const isLoading = item.content?.isLoading;
            const solution = item.content?.solution;

            if (isLoading) {
              return (
                <div key={item.id} className="flex justify-center group">
                  <div className="bg-neutral-800 border border-neutral-700 text-neutral-400 rounded-lg px-3.5 py-2 text-sm max-w-[90%] md:max-w-[85%] relative w-full italic">
                    AI is thinking...
                    <span className="text-[10px] text-neutral-500 absolute bottom-1.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>
                </div>
              );
            }

            let suggestionsOutput: React.ReactNode = null;
            if (solution?.suggested_responses && solution.suggested_responses.length > 0) {
              suggestionsOutput = (
                <div className="mt-2.5 pt-2">
                  <ul className="space-y-1">
                      {solution.suggested_responses.map((s_item: any, i: number) => {
                        let suggestionText: string | null = null;
                        if (typeof s_item === 'string') {
                          suggestionText = s_item;
                        } else if (typeof s_item === 'object' && s_item !== null && typeof s_item.text === 'string') {
                          suggestionText = s_item.text;
                        } else if (typeof s_item === 'object' && s_item !== null && typeof s_item.suggestion === 'string') {
                          suggestionText = s_item.suggestion; // Fallback for another common property name
                        } else if (typeof s_item === 'object' && s_item !== null) {
                            console.warn("Unknown suggested response object structure:", s_item);
                            suggestionText = "[Invalid Suggestion Format]";
                        }

                        if (suggestionText !== null) {
                          return (
                            <li key={i} className="text-xs text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700/60 p-1.5 rounded-md transition-colors cursor-pointer">
                              {suggestionText}
                            </li>
                          );
                        }
                        return null;
                      })}
                  </ul>
                </div>
              );
            }

            let aiTextMessage: React.ReactNode = null;
            if (solution?.code) {
              // If solution.code is an array (e.g. from a multi-line code block), join it. Otherwise, display as is.
              // This assumes 'code' might sometimes be a string and sometimes an array of strings.
              // Adjust if 'code' has a more specific structure.
              const codeContent = Array.isArray(solution.code) ? solution.code.join('\n') : solution.code;
              aiTextMessage = <p className="whitespace-pre-wrap">{codeContent}</p>;
            } else if (solution?.reasoning) { // Fallback if no 'code'
              aiTextMessage = <p className="whitespace-pre-wrap">{solution.reasoning}</p>;
            }

            let audioPlayer: React.ReactNode = null;
            if (item.content?.playableAudioPath && typeof item.content.playableAudioPath === 'string') {
              const audioSrc = `clp://${item.content.playableAudioPath}`;
              audioPlayer = (
                <div style={{ marginTop: aiTextMessage ? '10px' : '0px', marginBottom: suggestionsOutput ? '10px' : '0px' }}>
                  <audio controls src={audioSrc} className="w-full h-8 rounded-sm filter saturate-[0.8] opacity-80 hover:opacity-100 transition-opacity">
                    Your browser does not support the audio element.
                  </audio>
                </div>
              );
            }
            
            // Determine if there's any content to display at all
            const hasContent = aiTextMessage || audioPlayer || suggestionsOutput;

            return (
              <div key={item.id} className="flex justify-center group">
                <div className="bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-3.5 py-2 text-sm max-w-[90%] md:max-w-[85%] relative w-full">
                  {hasContent ? (
                    <>
                      {aiTextMessage}
                      {audioPlayer}
                      {suggestionsOutput}
                    </>
                  ) : (
                    <p className="text-xs text-neutral-500 italic">AI response received, but no displayable content found.</p>
                  )}
                  <span className="text-[10px] text-neutral-500 absolute bottom-1.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
              </div>
            );
          } else if (item.type === 'user_file') {
            // Completely remove rendering for user_file items
            return null; 
          } else if (item.type === 'system_message') {
            return (
              <div key={item.id} className="flex justify-center group">
                <div className="text-center my-2.5">
                  <span className="text-xs text-neutral-500 italic bg-neutral-800/60 px-3 py-1 rounded-full">
                    {item.content.message}
                  </span>
                </div>
              </div>
            );
          } else {
            console.warn("Unsupported conversation item type:", item);
            return (
              <div key={`unknown-item-${index}`} className="flex justify-center group">
                <div className="text-red-400 text-xs p-2 text-center bg-red-900/30 rounded-md max-w-md">
                  Warning: Unsupported message type encountered.
                </div>
              </div>
            );
          }
        })}
      </div>

      {showCommands && (
        <div className="flex-shrink-0 border-t border-neutral-700 bg-neutral-800 p-0">
          <SolutionCommands 
            extraScreenshots={extraScreenshots}
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
            isAiResponseActive={true}
          />
        </div>
      )}
    </div>
  )
}

export default Solutions
