// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "react-query"
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
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug">>
  view: "queue" | "solutions" | "debug"
  showCommands?: boolean
  onProcessingStateChange?: (isProcessing: boolean) => void;
}

const Solutions: React.FC<SolutionsProps> = ({ setView, view, showCommands = true, onProcessingStateChange }) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)

  // State for the "current" or "latest" problem/solution being displayed
  const [currentProblemStatement, setCurrentProblemStatement] = useState<ProblemStatementData | null>(null);
  const [currentSolution, setCurrentSolution] = useState<string | null>(null);
  const [currentThoughts, setCurrentThoughts] = useState<string[] | null>(null);
  const [currentTimeComplexity, setCurrentTimeComplexity] = useState<string | null>(null);
  const [currentSpaceComplexity, setCurrentSpaceComplexity] = useState<string | null>(null);

  // State for the queue of past solutions
  const [pastSolutions, setPastSolutions] = useState<SolutionEntry[]>([]);
  
  // Audio recording state
  const [audioRecording, setAudioRecording] = useState(false)
  const [audioResult, setAudioResult] = useState<AudioResult | null>(null)

  const [debugProcessing, setDebugProcessing] = useState(false)
  const [customContent, setCustomContent] = useState<string | null>(null)

  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const [isResetting, setIsResetting] = useState(false)

  const { data: extraScreenshots = [], refetch } = useQuery<Array<{ path: string; preview: string }>, Error>(
    ["extras"],
    async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        return existing
      } catch (error) {
        console.error("Error loading extra screenshots:", error)
        return []
      }
    },
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
        refetch()
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
    }
  }

  useEffect(() => {
    const generateUniqueId = () => Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => {
        setIsResetting(true);
        queryClient.setQueryData(["problem_statement"], null);
        queryClient.setQueryData(["solution"], null);
        setCurrentProblemStatement(null);
        setCurrentSolution(null);
        setCurrentThoughts(null);
        setCurrentTimeComplexity(null);
        setCurrentSpaceComplexity(null);
        setPastSolutions([]);
        if (onProcessingStateChange) onProcessingStateChange(false);
        refetch();
        console.log("[Solutions.tsx] onResetView completed.");
        setTimeout(() => { setIsResetting(false); }, 0);
      }),
      window.electronAPI.onSolutionError((errorMessage: string) => {
        if (view === "solutions") {
          if (onProcessingStateChange) onProcessingStateChange(false);
          showToast("Processing Failed", errorMessage, "error");
          console.error("[Solutions.tsx] onSolutionError:", errorMessage);
        }
      }),
      window.electronAPI.onSolutionSuccess((data) => {
        console.log("[Solutions.tsx] onSolutionSuccess received data:", JSON.parse(JSON.stringify(data)));
        if (view !== "solutions") return;
        if (onProcessingStateChange) onProcessingStateChange(false); // Indicate processing has stopped

        if (!data?.solution) {
          console.error("[Solutions.tsx] onSolutionSuccess: data.solution is missing.");
          showToast("Error", "Received an incomplete solution payload.", "error");
          // Potentially set currentProblemStatement to an error state or clear solution fields
          setCurrentSolution(null); // Ensure we are not stuck in a partially solved state
          setCurrentThoughts(null);
          setCurrentTimeComplexity(null);
          setCurrentSpaceComplexity(null);
          return;
        }

        const newSolutionDetails = data.solution;

        // Archive the PREVIOUS solution if one was fully displayed.
        // A solution was fully displayed if currentSolution was not null (even if it was an empty string).
        if (currentSolution !== null && currentProblemStatement) { 
          const previousEntry: SolutionEntry = {
            id: generateUniqueId(), 
            problemStatementData: currentProblemStatement, 
            solutionData: currentSolution, // The actual string code
            thoughtsData: currentThoughts, 
            timeComplexityData: currentTimeComplexity,
            spaceComplexityData: currentSpaceComplexity,
          };
          setPastSolutions(prev => [previousEntry, ...prev]);
        }

        // Set the new solution details
        // The problem statement is taken from the cache, set by PROBLEM_EXTRACTED
        const problemForNewSolution = queryClient.getQueryData(["problem_statement"]) as ProblemStatementData | null;
        // Only update currentProblemStatement if it's different, to avoid unnecessary re-renders or stale data issues.
        // However, problemForNewSolution here is from the initial extraction, which is what we want for the problem context.
        setCurrentProblemStatement(problemForNewSolution); 
        console.log("[Solutions.tsx] onSolutionSuccess: Attempting to set currentSolution from:", newSolutionDetails?.code);
        setCurrentSolution(newSolutionDetails.code ?? null); // handles undefined/null code; empty string from LLM is fine.
        
        let thoughtsArray: string[] | null = null;
        if (newSolutionDetails.reasoning && typeof newSolutionDetails.reasoning === 'string') {
          const reasoningStr = newSolutionDetails.reasoning;
          if (reasoningStr.match(/\n\s*(\*|\d+\.|-)/)) {
              thoughtsArray = reasoningStr
              .split(/\n\s*\*\s*|\n\s*\d+\.\s*|\n\s*-\s*|\n+/g) 
              .map((thought: string) => thought.trim())
              .filter((thought: string) => thought.length > 0);
          } else if (reasoningStr.includes('\n')) {
              thoughtsArray = reasoningStr.split('\n').map((thought: string) => thought.trim()).filter((thought: string) => thought.length > 0);
          } else {
              thoughtsArray = [reasoningStr.trim()].filter(t => t.length > 0);
          }
        } else if (Array.isArray(newSolutionDetails.thoughts)) { // Fallback if LLM gives 'thoughts' array
          thoughtsArray = newSolutionDetails.thoughts.length > 0 ? newSolutionDetails.thoughts : null;
        }
        console.log("[Solutions.tsx] onSolutionSuccess: Attempting to set currentThoughts from reasoning (parsed):", thoughtsArray);
        setCurrentThoughts(thoughtsArray);

        setCurrentTimeComplexity(newSolutionDetails.time_complexity || null);
        setCurrentSpaceComplexity(newSolutionDetails.space_complexity || null);
      }),
      window.electronAPI.onDebugStart(() => {
        if (view === "solutions" || view === "debug") {
          console.log("[Solutions.tsx] onDebugStart");
          setDebugProcessing(true)
        }
      }),
      window.electronAPI.onDebugSuccess((debugData) => {
        console.log("[Solutions.tsx] onDebugSuccess received debugData:", JSON.parse(JSON.stringify(debugData)));
        if (view === "solutions" || view === "debug") {
          setDebugProcessing(false);
          if (onProcessingStateChange) onProcessingStateChange(false);

          if (!debugData?.solution) {
            console.error("[Solutions.tsx] onDebugSuccess: debugData.solution is missing.");
            showToast("Error", "Received an incomplete debug solution payload.", "error");
            return;
          }

          const debugSolutionDetails = debugData.solution;

          // Archive the CURRENT solution before updating with the debugged one.
          if (currentSolution !== null && currentProblemStatement) {
            const previousEntry: SolutionEntry = {
              id: generateUniqueId(),
              problemStatementData: currentProblemStatement,
              solutionData: currentSolution,
              thoughtsData: currentThoughts,
              timeComplexityData: currentTimeComplexity,
              spaceComplexityData: currentSpaceComplexity,
            };
            setPastSolutions(prev => [previousEntry, ...prev]);
            console.log("[Solutions.tsx] onDebugSuccess: Archived previous solution.");
          }
          
          // Problem statement should remain from the initial extraction
          const problemForDebugSolution = queryClient.getQueryData(["problem_statement"]) as ProblemStatementData | null;
          setCurrentProblemStatement(problemForDebugSolution);

          console.log("[Solutions.tsx] onDebugSuccess: Attempting to set currentSolution from debugData:", debugSolutionDetails?.code);
          setCurrentSolution(debugSolutionDetails.code ?? null);

          let debugThoughtsArray: string[] | null = null;
          if (debugSolutionDetails.reasoning && typeof debugSolutionDetails.reasoning === 'string') {
            const reasoningStr = debugSolutionDetails.reasoning;
             if (reasoningStr.match(/\n\s*(\*|\d+\.|-)/)) {
                debugThoughtsArray = reasoningStr
                .split(/\n\s*\*\s*|\n\s*\d+\.\s*|\n\s*-\s*|\n+/g)
                .map((thought: string) => thought.trim())
                .filter((thought: string) => thought.length > 0);
            } else if (reasoningStr.includes('\n')) {
                debugThoughtsArray = reasoningStr.split('\n').map((thought: string) => thought.trim()).filter((thought: string) => thought.length > 0);
            } else {
                debugThoughtsArray = [reasoningStr.trim()].filter(t => t.length > 0);
            }
          } else if (Array.isArray(debugSolutionDetails.thoughts)) {
            debugThoughtsArray = debugSolutionDetails.thoughts.length > 0 ? debugSolutionDetails.thoughts : null;
          }
          console.log("[Solutions.tsx] onDebugSuccess: Attempting to set currentThoughts from debugData (parsed):", debugThoughtsArray);
          setCurrentThoughts(debugThoughtsArray);

          setCurrentTimeComplexity(debugSolutionDetails.time_complexity || null);
          setCurrentSpaceComplexity(debugSolutionDetails.space_complexity || null);
          console.log("[Solutions.tsx] onDebugSuccess: Updated state with debug solution.");
        }
      }),
      window.electronAPI.onDebugError(() => {
        if (view === "solutions" || view === "debug") {
          showToast("Processing Failed", "There was an error debugging your code.", "error")
          setDebugProcessing(false)
        }
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        if (view === "solutions") {
           showToast("No Screenshots", "There are no extra screenshots to process.", "neutral")
        }
      })
    ]
    return () => cleanupFunctions.forEach((cleanup) => cleanup())
  }, [
    queryClient, refetch, setView, view, onProcessingStateChange, 
    currentProblemStatement, currentSolution, currentThoughts, currentTimeComplexity, currentSpaceComplexity
  ])

  useEffect(() => {
    const effectId = Math.random().toString(36).substr(2, 5);
    console.log(`[Solutions.tsx useEffect ${effectId}] Start. currentSolution:`, currentSolution !== null, "currentProblemStatement:", currentProblemStatement !== null);

    const problemFromCache = queryClient.getQueryData(["problem_statement"]) as ProblemStatementData | null;
    console.log(`[Solutions.tsx useEffect ${effectId}] problemFromCache exists:`, problemFromCache !== null);

    if (JSON.stringify(problemFromCache) !== JSON.stringify(currentProblemStatement)) {
        console.warn(`[Solutions.tsx useEffect ${effectId}] problemFromCache !== currentProblemStatement. Updating currentProblemStatement and RESETTING solution.`);
        setCurrentProblemStatement(problemFromCache);
        setCurrentSolution(null); 
        setCurrentThoughts(null);
        setCurrentTimeComplexity(null);
        setCurrentSpaceComplexity(null);
    }
    
    let processing = false;
    if (view === "solutions" && currentProblemStatement && !currentSolution && !isResetting) {
        processing = true;
    }
    console.log(`[Solutions.tsx useEffect ${effectId}] Calculated processing: ${processing}. Calling onProcessingStateChange.`);
    if (onProcessingStateChange) onProcessingStateChange(processing);

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      console.log(`[Solutions.tsx useEffect ${effectId} CACHE SUB] Event type: ${event?.type}, QueryKey: ${event?.query?.queryKey[0]}`);
      if (event?.query.queryKey[0] === "problem_statement") {
        const updatedProblemFromCache = queryClient.getQueryData(["problem_statement"]) as ProblemStatementData | null;
        if (JSON.stringify(updatedProblemFromCache) !== JSON.stringify(currentProblemStatement)) {
            console.warn(`[Solutions.tsx useEffect ${effectId} CACHE SUB] updatedProblemFromCache !== currentProblemStatement. Updating currentProblemStatement and RESETTING solution.`);
            setCurrentProblemStatement(updatedProblemFromCache);
            setCurrentSolution(null);
            setCurrentThoughts(null);
            setCurrentTimeComplexity(null);
            setCurrentSpaceComplexity(null);
        }
      }
      
      const latestProblem = currentProblemStatement;
      let latestProcessing = false;
      if (view === "solutions" && latestProblem && !currentSolution && !isResetting) { 
          latestProcessing = true;
      }
      console.log(`[Solutions.tsx useEffect ${effectId} CACHE SUB] Calculated latestProcessing: ${latestProcessing}. Calling onProcessingStateChange.`);
      if (onProcessingStateChange) onProcessingStateChange(latestProcessing);
    });
    return () => {
      console.log(`[Solutions.tsx useEffect ${effectId}] Cleanup.`);
      unsubscribe();
    }
  }, [queryClient, view, onProcessingStateChange, currentProblemStatement, currentSolution, isResetting]);

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  if (view !== "solutions" && view !== "debug") {
    return (
      <div className="h-full p-4 flex items-center justify-center text-neutral-500">
        <p>Solutions will appear here when a problem is being solved.</p>
      </div>
    );
  }

  if (isResetting) {
    return (
      <div className="h-full p-4 flex items-center justify-center text-neutral-500">
        <p>Resetting...</p>
      </div>
    );
  }

  const renderSolutionContent = (problem: ProblemStatementData | null, solution: string | null, thoughts: string[] | null, time: string | null, space: string | null, isCurrent: boolean) => {
    if (!problem && !solution && !isCurrent) return null;
    if (!problem && isCurrent && pastSolutions.length === 0 && !isResetting) {
        return (
            <div className="text-center py-12">
                <p className="text-sm text-black/40 font-medium">Solutions will appear here once processed.</p>
            </div>
        );
    }
    if (!problem && isCurrent) return null;

    return (
        <div className={`w-full rounded-md text-black/90 font-semibold ${isCurrent ? 'bg-white/60 backdrop-blur-md' : 'bg-white/40 backdrop-blur-sm border border-black/5 opacity-90 hover:opacity-100 transition-opacity'} ${showCommands && problem && isCurrent ? 'pt-24' : 'pt-2'}`}>
            <div className={`rounded-lg overflow-hidden ${isCurrent ? '' : 'p-3 space-y-3'}`}>
                {isCurrent ? (
                    <div className="px-4 py-3 space-y-4 max-w-full">
                        {problem?.validation_type === "manual" ? (
                            <ContentSection
                                title={problem?.output_format?.subtype === "voice" ? "Audio Result" : "Screenshot Result"}
                                content={problem.problem_statement}
                                isLoading={false}
                            />
                        ) : (
                            <>
                                <ContentSection
                                    title={problem?.output_format?.subtype === "voice" ? "Voice Input" : "Problem Statement"}
                                    content={problem?.problem_statement}
                                    isLoading={!problem}
                                />
                                {(view === "solutions" && problem && !solution && !isResetting && onProcessingStateChange) && (
                                    <div className="mt-4 flex">
                                        <p className="text-xs bg-gradient-to-r from-neutral-600 via-neutral-400 to-neutral-600 bg-clip-text text-transparent animate-pulse font-semibold">
                                            {problem?.output_format?.subtype === "voice" ? "Processing voice input..." : "Generating solution..."}
                                        </p>
                                    </div>
                                )}
                                {solution && (
                                    <>
                                        <ContentSection title="Analysis" content={thoughts && thoughts.map((thought, index) => ( <div key={index} className="flex items-start gap-1.5 text-neutral-700 text-[13px] leading-[1.4] font-semibold"><div className="w-1 h-1 rounded-full bg-blue-500/70 mt-[7px] shrink-0" /><div>{thought}</div></div> )) } isLoading={!thoughts} />
                                        <SolutionSection title={problem?.output_format?.subtype === "voice" ? "Response" : "Solution"} content={solution} isLoading={!solution} />
                                        {problem?.output_format?.subtype !== "voice" && (
                                            <ComplexitySection timeComplexity={time} spaceComplexity={space} isLoading={!time || !space} />
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        <h3 className="text-[11px] font-semibold text-black/50 tracking-wider uppercase pb-1 mb-1 border-b border-black/10">Previous Result</h3>
                        {problem?.validation_type === "manual" ? (
                             <ContentSection title={problem?.output_format?.subtype === "voice" ? "Input" : "Problem"} content={problem.problem_statement} isLoading={false} />
                        ) : (
                            <>
                                <ContentSection title={problem?.output_format?.subtype === "voice" ? "Input" : "Problem"} content={problem?.problem_statement} isLoading={false}/>
                                {solution && (
                                    <>
                                        <ContentSection title="Analysis" content={thoughts && thoughts.map((thought, index) => ( <div key={index} className="flex items-start gap-1.5 text-neutral-700 text-[13px] leading-[1.4] font-semibold"><div className="w-1 h-1 rounded-full bg-blue-500/70 mt-[7px] shrink-0" /><div>{thought}</div></div> )) } isLoading={!thoughts} />
                                        <SolutionSection title={problem?.output_format?.subtype === "voice" ? "Response" : "Solution"} content={solution} isLoading={!solution} />
                                        {problem?.output_format?.subtype !== "voice" && (
                                            <ComplexitySection timeComplexity={time} spaceComplexity={space} isLoading={!time || !space} />
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

  return (
    <>
      {view === "debug" && !isResetting && queryClient.getQueryData(["new_solution"]) ? (
        <Debug
          isProcessing={debugProcessing}
          setIsProcessing={setDebugProcessing}
        />
      ) : (
        <div ref={contentRef} className="h-full overflow-y-auto p-4 pt-2 space-y-3 bg-transparent text-sm">
          <Toast
            open={toastOpen}
            onOpenChange={setToastOpen}
            variant={toastMessage.variant}
            duration={3000}
          >
            <ToastTitle>{toastMessage.title}</ToastTitle>
            <ToastDescription>{toastMessage.description}</ToastDescription>
          </Toast>

          {showCommands && currentProblemStatement && (
            <div className="bg-transparent w-fit sticky top-0 z-10 py-1">
              <div className="pb-1">
                <div className="space-y-3 w-fit">
                  <ScreenshotQueue
                    isLoading={debugProcessing}
                    screenshots={extraScreenshots}
                    onDeleteScreenshot={handleDeleteExtraScreenshot}
                  />
                </div>
              </div>
            </div>
          )}

          {showCommands && currentProblemStatement && (
            <div className="sticky top-12 z-10 py-1 bg-transparent">
              <SolutionCommands
                extraScreenshots={extraScreenshots}
                onTooltipVisibilityChange={handleTooltipVisibilityChange}
              />
            </div>
          )}

          {/* Render Past Solutions */} 
          {pastSolutions.length > 0 && (
            <div className="space-y-3 mb-4">
              {pastSolutions.map(entry => (
                <div key={entry.id}>
                 {renderSolutionContent(entry.problemStatementData, entry.solutionData, entry.thoughtsData, entry.timeComplexityData, entry.spaceComplexityData, false)}
                </div>
              ))}
            </div>
          )}

          {/* Render Current Problem & Solution (or placeholder) */} 
          {renderSolutionContent(currentProblemStatement, currentSolution, currentThoughts, currentTimeComplexity, currentSpaceComplexity, true)}

        </div>
      )}
    </>
  )
}

export default Solutions
