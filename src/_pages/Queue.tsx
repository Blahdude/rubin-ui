import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "react-query"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import {
  Toast,
  ToastTitle,
  ToastDescription,
  ToastVariant,
  ToastMessage
} from "../components/ui/toast"
import QueueCommands from "../components/Queue/QueueCommands"

interface QueueProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug">>
}

// Remove AudioQueueItem interface for now, will re-evaluate when integrating properly
// interface AudioQueueItem {
//   id: string; 
//   path: string;
//   type: "recorded" | "generated";
//   status?: "generating" | "failed" | "ready";
//   originalPath?: string; 
// }

const Queue: React.FC<QueueProps> = ({ setView }) => {
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  // Remove audioQueue state for now
  // const [audioQueue, setAudioQueue] = useState<AudioQueueItem[]>([])

  const { data: screenshots = [], refetch } = useQuery<
    Array<{ path: string; preview: string }>
    , Error>(
    ["screenshots"],
    async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        return existing
      } catch (error) {
        console.error("Error loading screenshots:", error)
        showToast("Error", "Failed to load existing screenshots", "error")
        return []
      }
    },
    {
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: true,
      refetchOnMount: true
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

  const handleDeleteScreenshot = async (index: number) => {
    const screenshotToDelete = screenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch()
      } else {
        console.error("Failed to delete screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot file", "error")
      }
    } catch (error) {
      console.error("Error deleting screenshot:", error)
    }
  }

  useEffect(() => {
    // This useEffect is for Queue.tsx internal logic and listeners.
    // The updateContentDimensions call is handled by App.tsx's useEffect based on containerRef there.

    const cleanupAudioListener = window.electronAPI.onAudioRecordingComplete(async (data: { path: string }) => {
      console.log("Audio recording complete (UI):", data.path);
      showToast("Recording Saved (UI)", `Audio saved to ${data.path}`, "success");
      
      try {
        showToast("Processing", "Generating music continuation...", "neutral");
        const { generatedPath, features } = await window.electronAPI.generateMusicContinuation(data.path);
        showToast("Success", `Generated audio saved to ${generatedPath}. BPM: ${features.bpm}, Key: ${features.key}`, "success");
        window.electronAPI.notifyGeneratedAudioReady(generatedPath, data.path, features);
      } catch (error: any) {
        console.error("Error generating music continuation (UI):", error);
        showToast("Generation Failed (UI)", error.message || "Could not generate audio continuation.", "error");
      }
    });

    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => refetch()),
      window.electronAPI.onSolutionError((error: string) => {
        showToast(
          "Processing Failed",
          "There was an error processing your screenshots.",
          "error"
        )
        setView("queue")
        console.error("Processing error:", error)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no screenshots to process.",
          "neutral"
        )
      }),
      cleanupAudioListener 
    ]

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  // Removed isTooltipVisible and tooltipHeight from dependencies as they don't directly relate to these listeners
  // The App.tsx useEffect handles resizes based on its own containerRef which Queue.tsx content affects.
  }, [refetch, setView]) 

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
    // App.tsx MutationObserver/ResizeObserver will handle any DOM changes that affect overall size.
  }

  return (
    // MODIFIED: Removed w-1/2. Class is now just bg-transparent.
    // The inner div with w-fit will determine content width.
    // App.tsx's containerRef will observe this and resize the window.
    <div ref={contentRef} className={`bg-transparent`}> 
      <div className="px-4 py-3">
        <Toast
          open={toastOpen}
          onOpenChange={setToastOpen}
          variant={toastMessage.variant}
          duration={3000}
        >
          <ToastTitle>{toastMessage.title}</ToastTitle>
          <ToastDescription>{toastMessage.description}</ToastDescription>
        </Toast>

        <div className="space-y-3 w-fit"> 
          <ScreenshotQueue
            isLoading={false}
            screenshots={screenshots}
            onDeleteScreenshot={handleDeleteScreenshot}
          />
          {/* The offensive audio queue UI has been removed from here */}
          <QueueCommands
            screenshots={screenshots}
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
          />
        </div>
      </div>
    </div>
  )
}

export default Queue;

// Remove the custom path.basename shim
// import path from "path"; // Avoid importing Node.js modules directly in renderer if not essential
