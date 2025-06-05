// src/components/FloatingScreenshotQueue.tsx
import React, { useState, useEffect } from 'react';
import { X, Image as ImageIcon } from 'lucide-react';

interface Screenshot {
  path: string;
  preview: string;
}

const FloatingScreenshotQueue: React.FC = () => {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [viewingScreenshotPreview, setViewingScreenshotPreview] = useState<string | null>(null);

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
    <>
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        {screenshots.map((screenshot) => (
          <div key={screenshot.path} className="group relative">
            <button
              onClick={() => setViewingScreenshotPreview(screenshot.preview)}
              className="flex items-center gap-1.5 bg-neutral-700 text-white text-sm px-3 py-1.5 rounded-lg border border-neutral-600 hover:bg-neutral-600 transition-colors"
            >
              <ImageIcon className="w-4 h-4 text-neutral-400" />
              <span>Image</span>
            </button>
            <div 
              className="absolute -top-1 -right-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleDelete(screenshot.path)}
            >
              <div className="bg-neutral-800 rounded-full p-0.5">
                <X className="w-3 h-3 text-neutral-400 hover:text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {viewingScreenshotPreview && (
        <div 
          className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-8 animate-in fade-in"
          onClick={() => setViewingScreenshotPreview(null)}
        >
          <img
            src={viewingScreenshotPreview}
            className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
            alt="Screenshot Preview"
            onClick={(e) => e.stopPropagation()}
          />
           <button
            onClick={() => setViewingScreenshotPreview(null)}
            className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
          >
            <X size={28} />
          </button>
        </div>
      )}
    </>
  );
};

export default FloatingScreenshotQueue; 