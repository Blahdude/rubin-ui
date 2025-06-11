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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-[100] animate-fade-in">
      <div className="panel-cursor w-full max-w-2xl mx-auto relative animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Original Prompt</h3>
              <p className="text-sm text-muted-foreground">View the complete prompt text</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="btn-ghost w-10 h-10 p-0 rounded-lg group"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-foreground transition-colors">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <div className="bg-editor/50 border border-border/30 rounded-xl p-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-primary">
            <pre className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed font-mono">
              {promptText}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

interface QueueProps {
  conversation: ConversationItem[];
  onProcessingStateChange: (isProcessing: boolean) => void;
  onShowTutorial?: () => void;
}

interface ScreenshotItem {
  path: string;
  preview: string;
}

const Queue: React.FC<QueueProps> = ({ conversation, onProcessingStateChange, onShowTutorial }) => {
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
      {/* Audio Studio Section - Direct Component */}
      <div className="flex-shrink-0 p-4 pb-0">
        <AudioSection 
          onShowToast={showToast}
          onOpenPromptModal={handleOpenPromptModal}
        />
      </div>
      
      {/* Main Chat Area - NO HEADER, MUCH BIGGER */}
      <div className="flex-grow min-h-0 overflow-hidden relative p-4 pt-3">
        <div className="bg-transparent h-full animate-slide-up" style={{animationDelay: '100ms'}}>
          <div className="h-full overflow-hidden">
            <Solutions 
              onProcessingStateChange={onProcessingStateChange}
              conversation={conversation}
            />
          </div>
        </div>
      </div>

      {/* Input Area - Enhanced Bottom Panel */}
      <div className="flex-shrink-0 relative p-6 pt-0">
        <div className="panel-glass p-4 animate-slide-up" style={{animationDelay: '200ms'}}>
          <TextInput
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
            isAiResponseActive={true}
            conversation={conversation}
            onShowTutorial={onShowTutorial}
          />
        </div>
      </div>

      {/* Enhanced Toast Notifications */}
      <Toast
        open={toastOpen}
        onOpenChange={setToastOpen}
        variant={toastMessage.variant}
        duration={4000}
        className="data-[state=open]:animate-slide-in-from-right data-[state=closed]:animate-slide-out-to-right shadow-cursor-lg border-l-4 border-l-primary"
      >
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 ${
            toastMessage.variant === 'success' ? 'bg-success' :
            toastMessage.variant === 'error' ? 'bg-error' :
            'bg-primary'
          }`}></div>
          <div className="flex-1">
            <ToastTitle className="font-semibold text-foreground">{toastMessage.title}</ToastTitle>
            <ToastDescription className="text-muted-foreground text-sm">{toastMessage.description}</ToastDescription>
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
