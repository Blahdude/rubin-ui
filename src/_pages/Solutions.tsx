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
          Extracting problem statement...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-[1.4] text-neutral-700 max-w-[600px] font-semibold">
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
            Loading solutions...
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
      Complexity (Updated)
    </h2>
    {isLoading ? (
      <p className="text-xs bg-gradient-to-r from-neutral-600 via-neutral-400 to-neutral-600 bg-clip-text text-transparent animate-pulse font-semibold">
        Calculating complexity...
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

interface SolutionsProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug">>
  view: "queue" | "solutions" | "debug"
  showCommands?: boolean
}
const Solutions: React.FC<SolutionsProps> = ({ setView, view, showCommands = true }) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)

  // Audio recording state
  const [audioRecording, setAudioRecording] = useState(false)
  const [audioResult, setAudioResult] = useState<AudioResult | null>(null)

  const [debugProcessing, setDebugProcessing] = useState(false)
  const [problemStatementData, setProblemStatementData] =
    useState<ProblemStatementData | null>(null)
  const [solutionData, setSolutionData] = useState<string | null>(null)
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  )
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  )
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
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => {
        setIsResetting(true)
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["new_solution"])
        setProblemStatementData(null)
        setSolutionData(null)
        setThoughtsData(null)
        setTimeComplexityData(null)
        setSpaceComplexityData(null)
        refetch()
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),
      window.electronAPI.onSolutionError((error: string) => {
        if (view === "solutions") {
          showToast(
            "Processing Failed",
            "There was an error processing your extra screenshots.",
            "error"
          )
          const solution = queryClient.getQueryData(["solution"]) as { code: string; thoughts: string[]; time_complexity: string; space_complexity: string; } | null;
          if (!solution) {
            // setView("queue") // App.tsx handles view changes primarily
          }
          setSolutionData(solution?.code || null);
          setThoughtsData(solution?.thoughts || null);
          setTimeComplexityData(solution?.time_complexity || null);
          setSpaceComplexityData(solution?.space_complexity || null);
          console.error("Processing error:", error);
        }
      }),
      window.electronAPI.onSolutionSuccess((data) => {
        if (view === "solutions") {
          if (!data?.solution) {
            console.warn("Received empty or invalid solution data")
            return
          }
          console.log({ solution: data.solution })
          const solutionDataVal = {
            code: data.solution.code,
            thoughts: data.solution.thoughts,
            time_complexity: data.solution.time_complexity,
            space_complexity: data.solution.space_complexity
          }
          queryClient.setQueryData(["solution"], solutionDataVal)
          setSolutionData(solutionDataVal.code || null)
          setThoughtsData(solutionDataVal.thoughts || null)
          setTimeComplexityData(solutionDataVal.time_complexity || null)
          setSpaceComplexityData(solutionDataVal.space_complexity || null)
        }
      }),
      window.electronAPI.onDebugStart(() => {
        if (view === "solutions" || view === "debug") setDebugProcessing(true)
      }),
      window.electronAPI.onDebugSuccess((data) => {
        if (view === "solutions" || view === "debug") {
          console.log({ debug_data: data })
          queryClient.setQueryData(["new_solution"], data.solution)
          setDebugProcessing(false)
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
  }, [queryClient, refetch, setView, view])

  useEffect(() => {
    const problemStatementFromCache = queryClient.getQueryData(["problem_statement"]) as ProblemStatementData | null;
    setProblemStatementData(problemStatementFromCache || null);

    const solutionFromCache = queryClient.getQueryData(["solution"]) as { code: string; thoughts: string[]; time_complexity: string; space_complexity: string; } | null;
    setSolutionData(solutionFromCache?.code ?? null);
    setThoughtsData(solutionFromCache?.thoughts ?? null);
    setTimeComplexityData(solutionFromCache?.time_complexity ?? null);
    setSpaceComplexityData(solutionFromCache?.space_complexity ?? null);

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query.queryKey[0] === "problem_statement") {
        setProblemStatementData(queryClient.getQueryData(["problem_statement"]) || null)
      }
      if (event?.query.queryKey[0] === "solution") {
        const solution = queryClient.getQueryData(["solution"]) as { code: string; thoughts: string[]; time_complexity: string; space_complexity: string; } | null
        setSolutionData(solution?.code ?? null)
        setThoughtsData(solution?.thoughts ?? null)
        setTimeComplexityData(solution?.time_complexity ?? null)
        setSpaceComplexityData(solution?.space_complexity ?? null)
      }
    })
    return () => unsubscribe()
  }, [queryClient])

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

  return (
    <>
      {view === "debug" && !isResetting && queryClient.getQueryData(["new_solution"]) ? (
        <Debug
          isProcessing={debugProcessing}
          setIsProcessing={setDebugProcessing}
        />
      ) : (
        <div ref={contentRef} className="h-full overflow-y-auto p-4 space-y-3 bg-transparent text-sm">
          <Toast
            open={toastOpen}
            onOpenChange={setToastOpen}
            variant={toastMessage.variant}
            duration={3000}
          >
            <ToastTitle>{toastMessage.title}</ToastTitle>
            <ToastDescription>{toastMessage.description}</ToastDescription>
          </Toast>

          {showCommands && problemStatementData && (
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

          {showCommands && problemStatementData && (
            <div className="sticky top-12 z-10 py-1 bg-transparent">
              <SolutionCommands
                extraScreenshots={extraScreenshots}
                onTooltipVisibilityChange={handleTooltipVisibilityChange}
              />
            </div>
          )}

          <div className={`w-full bg-white/60 backdrop-blur-md rounded-md text-black/90 font-semibold ${showCommands && problemStatementData ? 'pt-24' : 'pt-2'}`}>
            <div className="rounded-lg overflow-hidden">
              <div className="px-4 py-3 space-y-4 max-w-full">
                {problemStatementData?.validation_type === "manual" ? (
                  <ContentSection
                    title={problemStatementData?.output_format?.subtype === "voice" ? "Audio Result" : "Screenshot Result"}
                    content={problemStatementData.problem_statement}
                    isLoading={false}
                  />
                ) : (
                  <>
                    <ContentSection
                      title={problemStatementData?.output_format?.subtype === "voice" ? "Voice Input" : "Problem Statement"}
                      content={problemStatementData?.problem_statement}
                      isLoading={!problemStatementData}
                    />
                    {problemStatementData && !solutionData && (
                      <div className="mt-4 flex">
                        <p className="text-xs bg-gradient-to-r from-neutral-600 via-neutral-400 to-neutral-600 bg-clip-text text-transparent animate-pulse font-semibold">
                          {problemStatementData?.output_format?.subtype === "voice" 
                            ? "Processing voice input..." 
                            : "Generating solutions..."}
                        </p>
                      </div>
                    )}
                    {solutionData && (
                      <>
                        <ContentSection
                          title="Analysis"
                          content={
                            thoughtsData && (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  {thoughtsData.map((thought, index) => (
                                    <div
                                      key={index}
                                      className="flex items-start gap-2 text-neutral-700 font-semibold"
                                    >
                                      <div className="w-1 h-1 rounded-full bg-blue-500/80 mt-2 shrink-0" />
                                      <div>{thought}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          }
                          isLoading={!thoughtsData}
                        />
                        <SolutionSection
                          title={problemStatementData?.output_format?.subtype === "voice" ? "Response" : "Solution"}
                          content={solutionData}
                          isLoading={!solutionData}
                        />
                        {problemStatementData?.output_format?.subtype !== "voice" && (
                          <ComplexitySection
                            timeComplexity={timeComplexityData}
                            spaceComplexity={spaceComplexityData}
                            isLoading={!timeComplexityData || !spaceComplexityData}
                          />
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Solutions
