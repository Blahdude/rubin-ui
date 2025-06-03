// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

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

export const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-1.5">
    <h2 className="text-[12px] font-medium text-neutral-300 tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-2 flex">
        <p className="text-xs text-neutral-500 animate-pulse font-medium">
          Loading...
        </p>
      </div>
    ) : (
      <div className="text-xs leading-[1.5] text-neutral-400 max-w-[600px] font-medium space-y-1">
        {content}
      </div>
    )}
  </div>
)
const SolutionSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-1.5">
    <h2 className="text-[12px] font-medium text-neutral-300 tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="space-y-1">
        <div className="mt-2 flex">
          <p className="text-xs text-neutral-500 animate-pulse font-medium">
            Loading...
          </p>
        </div>
      </div>
    ) : (
      <div className="w-full text-xs">
        <SyntaxHighlighter
          showLineNumbers
          language="python"
          style={dracula}
          customStyle={{
            maxWidth: "100%",
            margin: 0,
            padding: "0.75rem 1rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            fontSize: "0.75rem",
            borderRadius: "0.375rem"
          }}
          wrapLongLines={true}
        >
          {content as string}
        </SyntaxHighlighter>
      </div>
    )}
  </div>
)

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading
}: {
  timeComplexity: string | null
  spaceComplexity: string | null
  isLoading: boolean
}) => (
  <div className="space-y-1.5">
    <h2 className="text-[12px] font-medium text-neutral-300 tracking-wide">
      Complexity
    </h2>
    {isLoading ? (
      <p className="text-xs text-neutral-500 animate-pulse font-medium">
        Calculating...
      </p>
    ) : (
      <div className="space-y-0.5 text-xs">
        <div className="flex items-start gap-1.5 text-neutral-400 font-medium">
          <div className="w-1 h-1 rounded-full bg-neutral-500 mt-[5px] shrink-0" />
          <div>
            <strong className="font-semibold text-neutral-300">Time:</strong> {timeComplexity}
          </div>
        </div>
        <div className="flex items-start gap-1.5 text-neutral-400 font-medium">
          <div className="w-1 h-1 rounded-full bg-neutral-500 mt-[5px] shrink-0" />
          <div>
            <strong className="font-semibold text-neutral-300">Space:</strong> {spaceComplexity}
          </div>
        </div>
      </div>
    )}
  </div>
)

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
    console.log("Solutions.tsx: Conversation prop updated:", conversation);
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
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

  const formatTimestamp = (timestamp: number) => {
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
        <ToastTitle>{toastMessage.title}</ToastTitle>
        <ToastDescription>{toastMessage.description}</ToastDescription>
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
        {conversation?.map((item: ConversationItem) => {
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
            const solution = item.content?.solution;
            return (
              <div key={item.id} className="flex justify-center group">
                <div className="bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-3.5 py-2 text-sm max-w-[90%] md:max-w-[85%] relative">
                  {solution?.problem_statement && 
                    <p className="text-xs italic text-neutral-400 mb-2 pb-1.5 border-b border-neutral-700">
                      Re: {solution.problem_statement.length > 100 ? solution.problem_statement.substring(0,97) + '...' : solution.problem_statement}
                    </p>
                  }
                  {solution?.code && (
                    <div className="my-2 bg-neutral-900 rounded-md overflow-hidden">
                      <SyntaxHighlighter language="python" style={dracula} customStyle={{margin:0, padding: "0.75rem 1rem", fontSize: "0.75rem", background: "transparent"}} wrapLongLines={true}>
                        {solution.code}
                      </SyntaxHighlighter>
                    </div>
                  )}
                  {solution?.context && <p className="text-xs mt-2 text-neutral-400"><strong className="font-medium text-neutral-300">Context:</strong> {solution.context}</p>}
                  {solution?.reasoning && <p className="text-xs mt-1.5 text-neutral-400"><strong className="font-medium text-neutral-300">Reasoning:</strong> {solution.reasoning}</p>}
                  {solution?.suggested_responses && solution.suggested_responses.length > 0 && (
                     <div className="mt-2.5 pt-2 border-t border-neutral-700">
                        <p className="text-xs font-medium text-neutral-400 mb-1.5">Suggestions:</p>
                        <ul className="space-y-1">
                            {solution.suggested_responses.map((s: string, i: number) => 
                              <li key={i} className="text-xs text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700/60 p-1.5 rounded-md transition-colors cursor-pointer">
                                {s}
                              </li>
                            )}
                        </ul>
                     </div>
                  )}
                  {!solution && <p className="text-xs text-red-400">AI response format error.</p>}
                  <span className="text-[10px] text-neutral-500 absolute bottom-1.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
              </div>
            );
          } else if (item.type === 'user_file') {
            return (
              <div key={item.id} className="flex justify-center group">
                <div className="text-left my-1">
                  <span className="text-[10px] text-neutral-600 italic px-2 py-0.5 rounded-full">
                    Initial context provided to AI.
                    <span className="text-[9px] text-neutral-600/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-1">
                      ({formatTimestamp(item.timestamp)})
                    </span>
                  </span>
                </div>
              </div>
            );
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
              <div key={`unknown-item-${Math.random().toString(36).substring(7)}`} className="flex justify-center group">
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
