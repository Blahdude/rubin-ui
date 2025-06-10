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
import Solutions from "./Solutions"
import { ConversationItem } from "../App"
import TextInput from "../components/TextInput"
import AudioSection from "../components/AudioSection"

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptText: string;
}

const PromptModal: React.FC<PromptModalProps> = ({ isOpen, onClose, promptText }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-foreground/80 flex items-start justify-center p-4 pt-20 z-50 transition-opacity duration-300 ease-in-out">
      <div className="bg-card/95 backdrop-blur-md p-5 rounded-lg shadow-2xl w-full max-w-md mx-auto border border-border/20 relative non-draggable">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-card-foreground">Full Prompt</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-2xl leading-none non-draggable">&times;</button>
        </div>
        <p 
          className="text-xs text-card-foreground whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-muted hover:scrollbar-thumb-muted-foreground scrollbar-track-secondary rounded"
        >
          {promptText}
        </p>
      </div>
    </div>
  );
};

interface QueueProps {
  conversation: ConversationItem[];
  onProcessingStateChange: (isProcessing: boolean) => void;
}

interface ScreenshotItem {
  path: string;
  preview: string;
}

const Queue: React.FC<QueueProps> = ({ conversation, onProcessingStateChange }) => {
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "info"
  })

  const [tooltipHeight, setTooltipHeight] = useState(0)

  // State for the prompt modal
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [modalPromptText, setModalPromptText] = useState("");

  const handleTooltipVisibilityChange = (_visible: boolean, height: number) => {
    setTooltipHeight(height)
  }

  const { data: screenshots = [], refetch } = useQuery<ScreenshotItem[]>(
    "screenshots",
    () => window.electronAPI.getScreenshots(),
    {
      onError: (error) => {
        console.error("Error fetching screenshots:", error)
        showToast("Error", "Failed to load screenshots", "error")
      },
      refetchOnWindowFocus: false,
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
      await window.electronAPI.deleteScreenshot(screenshotToDelete.path)
      refetch()
      showToast("Deleted", "Screenshot deleted successfully", "success")
    } catch (error) {
      console.error("Error deleting screenshot:", error)
      showToast("Error", "Failed to delete screenshot", "error")
    }
  }

  useEffect(() => {
    const unsubscribes = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => { 
        console.log("[Queue.tsx] onResetView triggered.");
        refetch(); 
      }),
      window.electronAPI.onSolutionError((error: string) => { showToast("Solution Error", error, "error"); }),
      window.electronAPI.onProcessingNoScreenshots(() => { showToast("No Screenshots", "No screenshots to process.", "info"); }),
      window.electronAPI.onScreenshotLimitReached((data: { message: string }) => { 
        showToast("Screenshot Limit", data.message, "error"); 
      })
    ];
    return () => { unsubscribes.forEach(unsub => unsub()); };
  }, [refetch]);

  const handleOpenPromptModal = (prompt: string) => {
    setModalPromptText(prompt);
    setIsPromptModalOpen(true);
  };

  const handleClosePromptModal = () => {
    setIsPromptModalOpen(false);
  };

  return (
    <div className="flex flex-col h-full text-foreground">
      {/* Top Audio Section */}
      <div className="flex-shrink-0 p-1">
        <AudioSection 
          onShowToast={showToast}
          onOpenPromptModal={handleOpenPromptModal}
        />
      </div>
      
      {/* Middle Chat Section (scrollable) */}
      <div className="flex-grow min-h-0 overflow-hidden">
        <Solutions 
          onProcessingStateChange={onProcessingStateChange}
          conversation={conversation}
        />
      </div>

      {/* Bottom Command Bar (fixed) */}
      <div className="flex-shrink-0">
        <TextInput
          onTooltipVisibilityChange={handleTooltipVisibilityChange}
          isAiResponseActive={true}
          conversation={conversation}
        />
      </div>

      <Toast
        open={toastOpen}
        onOpenChange={setToastOpen}
        variant={toastMessage.variant}
        duration={3000}
      >
        <ToastTitle>{toastMessage.title}</ToastTitle>
        <ToastDescription>{toastMessage.description}</ToastDescription>
      </Toast>
      
      <PromptModal 
        isOpen={isPromptModalOpen} 
        onClose={handleClosePromptModal} 
        promptText={modalPromptText} 
      />
    </div>
  )
}

export default Queue;
