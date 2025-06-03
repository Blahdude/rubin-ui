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
  <div className="space-y-2 font-semibold">
    <h2 className="text-[13px] font-semibold text-black/90 tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-4 flex">
        <p className="text-xs bg-gradient-to-r from-neutral-600 via-neutral-400 to-neutral-600 bg-clip-text text-transparent animate-pulse font-semibold">
          Loading...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-[1.4] text-neutral-700 max-w-[600px] font-semibold space-y-1">
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
  <div className="space-y-2 font-semibold">
    <h2 className="text-[13px] font-semibold text-black/90 tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="space-y-1.5">
        <div className="mt-4 flex">
          <p className="text-xs bg-gradient-to-r from-neutral-600 via-neutral-400 to-neutral-600 bg-clip-text text-transparent animate-pulse font-semibold">
            Loading...
          </p>
        </div>
      </div>
    ) : (
      <div className="w-full">
        <SyntaxHighlighter
          showLineNumbers
          language="python"
          style={dracula}
          customStyle={{
            maxWidth: "100%",
            margin: 0,
            padding: "1rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all"
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
  <div className="space-y-2 font-semibold">
    <h2 className="text-[13px] font-semibold text-black/90 tracking-wide">
      Complexity
    </h2>
    {isLoading ? (
      <p className="text-xs bg-gradient-to-r from-neutral-600 via-neutral-400 to-neutral-600 bg-clip-text text-transparent animate-pulse font-semibold">
        Calculating...
      </p>
    ) : (
      <div className="space-y-1">
        <div className="flex items-start gap-2 text-[13px] leading-[1.4] text-neutral-700 font-semibold">
          <div className="w-1 h-1 rounded-full bg-blue-500/80 mt-2 shrink-0" />
          <div>
            <strong className="font-bold">Time:</strong> {timeComplexity}
          </div>
        </div>
        <div className="flex items-start gap-2 text-[13px] leading-[1.4] text-neutral-700 font-semibold">
          <div className="w-1 h-1 rounded-full bg-blue-500/80 mt-2 shrink-0" />
          <div>
            <strong className="font-bold">Space:</strong> {spaceComplexity}
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
        <p>Clearing chat...</p>
      </div>
    );
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-grow h-full flex flex-col bg-neutral-50/50">
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
        className="flex-grow overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-thin scrollbar-thumb-neutral-300 hover:scrollbar-thumb-neutral-400 scrollbar-track-transparent scrollbar-thumb-rounded-full"
        style={{ paddingBottom: `${tooltipHeight + 10}px` }}
      >
        {(!conversation || conversation.length === 0) && (
          <div className="flex items-center justify-center h-full">
            <p className="text-center text-base text-neutral-500 font-medium p-6">
              Wingman AI is ready. Send a message or add a screenshot to begin.
            </p>
          </div>
        )}
        {conversation?.map((item: ConversationItem) => {
          if (item.type === 'user_text') {
            return (
              <div key={item.id} className="flex justify-end group">
                <div className="bg-blue-600 text-white rounded-xl rounded-br-lg px-4 py-2.5 text-sm shadow-md max-w-[75%] md:max-w-[65%] relative">
                  {item.content}
                  <span className="text-xs text-blue-200/80 absolute bottom-1.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
              </div>
            );
          } else if (item.type === 'ai_response') {
            const solution = item.content?.solution;
            return (
              <div key={item.id} className="flex justify-start group">
                <div className="bg-white border border-neutral-200/90 text-neutral-800 rounded-xl rounded-bl-lg px-4 py-2.5 text-sm shadow-md max-w-[75%] md:max-w-[70%] relative">
                  {solution?.problem_statement && 
                    <p className="text-xs italic text-neutral-500 mb-2 pb-1 border-b border-neutral-200">
                      Re: {solution.problem_statement.length > 100 ? solution.problem_statement.substring(0,97) + '...' : solution.problem_statement}
                    </p>
                  }
                  {solution?.code && (
                    <div className="my-2 bg-neutral-800/95 rounded-md shadow-sm overflow-hidden">
                      <SyntaxHighlighter language="python" style={dracula} customStyle={{margin:0, padding: "0.8rem 1rem", fontSize: "0.8rem"}} wrapLongLines={true}>
                        {solution.code}
                      </SyntaxHighlighter>
                    </div>
                  )}
                  {solution?.context && <p className="text-xs mt-2 text-neutral-700"><strong className="font-medium text-neutral-600">Context:</strong> {solution.context}</p>}
                  {solution?.reasoning && <p className="text-xs mt-1.5 text-neutral-700"><strong className="font-medium text-neutral-600">Reasoning:</strong> {solution.reasoning}</p>}
                  {solution?.suggested_responses && solution.suggested_responses.length > 0 && (
                     <div className="mt-2.5 pt-2 border-t border-neutral-200">
                        <p className="text-xs font-semibold text-neutral-600 mb-1.5">Suggestions:</p>
                        <ul className="space-y-1">
                            {solution.suggested_responses.map((s: string, i: number) => 
                              <li key={i} className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50/70 p-1.5 rounded-md transition-colors cursor-pointer">
                                {s}
                              </li>
                            )}
                        </ul>
                     </div>
                  )}
                  {!solution && <p className="text-xs text-red-500">AI response format error.</p>}
                  <span className="text-xs text-neutral-400/80 absolute bottom-1.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
              </div>
            );
          } else if (item.type === 'user_file') {
            return (
              <div key={item.id} className="flex justify-end group">
                <div className="bg-blue-500 text-white rounded-xl rounded-br-lg px-4 py-2.5 text-sm shadow-md max-w-[75%] md:max-w-[65%] relative">
                  <p className="font-medium mb-1">Sent: {item.filePath.split(/[\\/]/).pop()}</p>
                  {item.accompanyingText && <p className="text-xs italic opacity-90 mt-1 mb-1.5">{item.accompanyingText}</p>}
                  {item.preview && <img src={item.preview} alt="File preview" className="max-w-full max-h-48 rounded-lg mt-1.5 border-2 border-white/30 shadow-sm object-contain" />}
                  <span className="text-xs text-blue-200/80 absolute bottom-1.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
              </div>
            );
          } else if (item.type === 'system_message') {
            return (
              <div key={item.id} className="text-center my-3">
                <span className="text-xs text-neutral-500 italic bg-neutral-200/60 px-3 py-1.5 rounded-full shadow-sm">
                  {item.content.message}
                </span>
              </div>
            );
          } else {
            console.warn("Unsupported conversation item type:", item);
            return (
              <div key={`unknown-item-${Math.random().toString(36).substring(7)}`} className="text-red-500 text-xs p-2 text-center bg-red-50 rounded-md shadow">
                Warning: Unsupported message type encountered.
              </div>
            );
          }
        })}
      </div>

      {showCommands && (
        <div className="flex-shrink-0 border-t border-neutral-300/70 bg-neutral-100/70 backdrop-blur-md shadow-top-sm p-2 md:p-3">
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
