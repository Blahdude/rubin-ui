// Solutions.tsx
import React, { useState, useEffect } from "react"
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
import { ConversationItem } from "../App"
import ChatArea from "../components/ChatArea"

interface Screenshot {
  path: string;
  preview: string;
}

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
  onProcessingStateChange?: (isProcessing: boolean) => void;
  conversation?: ConversationItem[];
}

const Solutions: React.FC<SolutionsProps> = ({ onProcessingStateChange, conversation }) => {
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "info"
  })

  const [queuedScreenshots, setQueuedScreenshots] = useState<Screenshot[]>([])
  const [viewingScreenshotPreview, setViewingScreenshotPreview] = useState<string | null>(null);

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
    const electronAPI = window.electronAPI as any;

    const cleanupOnScreenshotTaken = electronAPI.onScreenshotTaken((data: Screenshot) => {
      setQueuedScreenshots((prev) => [...prev, data]);
    });

    const cleanupOnQueueCleared = electronAPI.onScreenshotQueueCleared(() => {
      setQueuedScreenshots([]);
    });

    const fetchInitialScreenshots = async () => {
      try {
        const initialScreenshots = await electronAPI.getScreenshots();
        if (initialScreenshots) {
          setQueuedScreenshots(initialScreenshots);
        }
      } catch (error) {
        console.error('Failed to fetch initial screenshots:', error);
      }
    };

    fetchInitialScreenshots();

    return () => {
      cleanupOnScreenshotTaken();
      cleanupOnQueueCleared();
    };
  }, []);

  const handleDeleteScreenshot = async (pathToDelete: string) => {
    const electronAPI = window.electronAPI as any;
    try {
      const result = await electronAPI.deleteScreenshot(pathToDelete);
      if (result.success) {
        setQueuedScreenshots((prev) => prev.filter((s) => s.path !== pathToDelete));
      } else {
        console.error('Failed to delete screenshot:', result.error);
      }
    } catch (error) {
      console.error('Error calling deleteScreenshot:', error);
    }
  };

  useEffect(() => {
    if (onProcessingStateChange && conversation && conversation.length > 0) {
      const lastMessage = conversation[conversation.length - 1];
      if (lastMessage.type === 'ai_response' || lastMessage.type === 'system_message') {
        onProcessingStateChange(false);
      } else if (lastMessage.type === 'user_text' || lastMessage.type === 'user_file') {
        onProcessingStateChange(true);
      }
    }
  }, [conversation, onProcessingStateChange]);

  if (isResetting) {
    return (
      <div className="flex-grow h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Clearing chat...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Toast
        open={toastOpen}
        onOpenChange={setToastOpen}
        variant={toastMessage.variant}
        duration={3000}
      >
      </Toast>

      <ChatArea
        conversation={conversation || []}
        queuedScreenshots={queuedScreenshots}
        viewingScreenshotPreview={viewingScreenshotPreview}
        onSetViewingScreenshotPreview={setViewingScreenshotPreview}
        onDeleteScreenshot={handleDeleteScreenshot}
      />
    </div>
  )
};

export default Solutions;
