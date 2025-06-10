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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-card/95 backdrop-blur-xl p-6 rounded-2xl shadow-2xl w-full max-w-lg mx-auto border border-border/20 relative animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground text-sm">📝</span>
          </div>
          <h3 className="text-lg font-semibold text-foreground">Original Prompt</h3>
          <button 
            onClick={onClose} 
            className="ml-auto w-8 h-8 rounded-lg bg-secondary/50 hover:bg-secondary/80 border border-border/30 hover:border-border/60 transition-all duration-200 flex items-center justify-center group"
          >
            <span className="text-muted-foreground group-hover:text-foreground text-lg leading-none">&times;</span>
          </button>
        </div>
        <div className="bg-background/50 border border-border/30 rounded-xl p-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 hover:scrollbar-thumb-primary/50 scrollbar-track-transparent">
          <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {promptText}
          </p>
        </div>
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
    <div className="flex flex-col h-full text-foreground overflow-hidden">
      {/* Audio Studio Section */}
      <div className="flex-shrink-0 p-4 pb-2">
        <div className="animate-in slide-in-from-top duration-500">
          <AudioSection 
            onShowToast={showToast}
            onOpenPromptModal={handleOpenPromptModal}
          />
        </div>
      </div>
      
      {/* Chat Area with smooth divider */}
      <div className="flex-grow min-h-0 overflow-hidden relative">
        {/* Subtle gradient divider */}
        <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent"></div>
        
        <div className="h-full pt-2 animate-in slide-in-from-bottom duration-500 delay-100">
          <Solutions 
            onProcessingStateChange={onProcessingStateChange}
            conversation={conversation}
          />
        </div>
      </div>

      {/* Input Area with enhanced styling */}
      <div className="flex-shrink-0 relative">
        {/* Subtle gradient separator */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/30 to-transparent"></div>
        
        <div className="animate-in slide-in-from-bottom duration-500 delay-200">
          <TextInput
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
            isAiResponseActive={true}
            conversation={conversation}
          />
        </div>
      </div>

      {/* Enhanced Toast with beautiful styling */}
      <Toast
        open={toastOpen}
        onOpenChange={setToastOpen}
        variant={toastMessage.variant}
        duration={3000}
        className="data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${
            toastMessage.variant === 'success' ? 'bg-green-500' :
            toastMessage.variant === 'error' ? 'bg-red-500' :
            'bg-blue-500'
          }`}></div>
          <div>
            <ToastTitle className="font-semibold">{toastMessage.title}</ToastTitle>
            <ToastDescription className="text-muted-foreground">{toastMessage.description}</ToastDescription>
          </div>
        </div>
      </Toast>
      
      {/* Enhanced Prompt Modal */}
      <PromptModal 
        isOpen={isPromptModalOpen} 
        onClose={handleClosePromptModal} 
        promptText={modalPromptText} 
      />
    </div>
  )
}

export default Queue;
