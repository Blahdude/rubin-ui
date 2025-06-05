// src/components/FloatingScreenshotQueue.tsx
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface Screenshot {
  path: string;
  preview: string;
}

const FloatingScreenshotQueue: React.FC = () => {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);

  useEffect(() => {
    const electronAPI = window.electronAPI as any;

    // Listener for when a new screenshot is taken and automatically added
    const cleanupOnScreenshotTaken = electronAPI.onScreenshotTaken((data: Screenshot) => {
      console.log('FloatingScreenshotQueue: screenshot-taken received', data);
      setScreenshots((prev) => [...prev, data]);
    });

    // Listener for when the queue is cleared (e.g., after sending a query)
    const cleanupOnQueueCleared = electronAPI.onScreenshotQueueCleared(() => {
      console.log('FloatingScreenshotQueue: screenshot-queue-cleared received');
      setScreenshots([]);
    });

    // Initial fetch of any screenshots that might already be in the queue when the app starts
    const fetchInitialScreenshots = async () => {
      try {
        const initialScreenshots = await electronAPI.getScreenshots();
        if (initialScreenshots) {
          console.log('FloatingScreenshotQueue: fetched initial screenshots', initialScreenshots);
          setScreenshots(initialScreenshots);
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

  const handleDelete = async (pathToDelete: string) => {
    const electronAPI = window.electronAPI as any;
    try {
      const result = await electronAPI.deleteScreenshot(pathToDelete);
      if (result.success) {
        setScreenshots((prev) => prev.filter((s) => s.path !== pathToDelete));
      } else {
        console.error('Failed to delete screenshot:', result.error);
      }
    } catch (error) {
      console.error('Error calling deleteScreenshot:', error);
    }
  };

  if (screenshots.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 p-2 bg-black/10 backdrop-blur-md rounded-lg shadow-2xl border border-white/10">
      <div className="flex items-center space-x-2">
        {screenshots.map((screenshot) => (
          <div key={screenshot.path} className="group relative w-28 h-16 rounded-md overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all duration-200">
            <img src={screenshot.preview} className="w-full h-full object-cover" alt="Screenshot preview" />
            <div 
              className="absolute top-0 right-0 p-1 bg-black/50 rounded-bl-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleDelete(screenshot.path)}
            >
              <X className="w-4 h-4 text-white" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FloatingScreenshotQueue; 