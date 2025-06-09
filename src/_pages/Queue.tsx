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
import Solutions from "./Solutions"
import { GlobalRecording, GeneratedAudioClip } from "../types/audio"
import { ConversationItem } from "../App"
import { auth, storage, db } from "../lib/firebase"
import { ref, uploadBytes, getDownloadURL, listAll, getMetadata, deleteObject } from "firebase/storage"
import { doc, setDoc, deleteDoc, collection, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore"
import { v4 as uuidv4 } from 'uuid';
import { onAuthStateChanged, User } from "firebase/auth"

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
  conversation: ConversationItem[]
}

// Remove AudioQueueItem interface for now, will re-evaluate when integrating properly
// interface AudioQueueItem {
//   id: string; 
//   path: string;
//   type: "recorded" | "generated";
//   status?: "generating" | "failed" | "ready";
//   originalPath?: string; 
// }

// Type for individual screenshot items, if not already globally defined
interface ScreenshotItem {
  path: string;
  preview: string;
}

const Queue: React.FC<QueueProps> = ({ conversation }) => {
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "info"
  })

  // State for collapsibility - set to false for collapsed by default
  const [isRecordedAudioOpen, setIsRecordedAudioOpen] = useState(false);
  const [isGeneratedAudioOpen, setIsGeneratedAudioOpen] = useState(false);

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  // State for audio clips (MOVED FROM QueueCommands.tsx)
  const [globalRecordings, setGlobalRecordings] = useState<GlobalRecording[]>([])
  const [generatedAudioClips, setGeneratedAudioClips] = useState<GeneratedAudioClip[]>([])
  const [globalRecordingError, setGlobalRecordingError] = useState<string | null>(null)
  const [vadStatusMessage, setVadStatusMessage] = useState<string | null>(null);
  const vadStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isProcessingSolution, setIsProcessingSolution] = useState(false);

  // State for recording and generation duration
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(5); // Default 5 seconds
  const [generationDurationSeconds, setGenerationDurationSeconds] = useState(8); // Default 8 seconds

  // State for the prompt modal
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [modalPromptText, setModalPromptText] = useState("");

  // State for current user
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingExistingFiles, setIsLoadingExistingFiles] = useState(false);

  const handleQuitApp = () => {
    if (window.electronAPI && typeof window.electronAPI.quitApp === 'function') {
      window.electronAPI.quitApp();
    }
  };

  // Function to load existing audio files from Firebase Storage
  const loadExistingMusicFiles = async (user: User) => {
    if (!user) return;

    setIsLoadingExistingFiles(true);
    try {
      console.log("Loading existing music files for user:", user.uid);
      
      const generationsRef = collection(db, "users", user.uid, "generations");
      const q = query(generationsRef, orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);

      const existingClips: GeneratedAudioClip[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const clip: GeneratedAudioClip = {
          id: data.clipId,
          path: data.downloadURL,
          timestamp: data.timestamp.toDate(),
          bpm: data.bpm,
          key: data.key,
          status: 'ready',
          displayName: data.displayName,
          originalPromptText: data.originalPromptText,
          originalPath: data.originalPath
        };
        existingClips.push(clip);
      });
      
      // Update the state with existing clips
      setGeneratedAudioClips(existingClips);
      
      if (existingClips.length > 0) {
        showToast("Loaded", `Found ${existingClips.length} existing music files`, "success");
      }
      
    } catch (error) {
      console.error("Error loading existing music files:", error);
      showToast("Error", "Failed to load existing music files", "error");
    } finally {
      setIsLoadingExistingFiles(false);
    }
  };

  // useEffect to handle authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("Auth state changed:", user ? `User logged in: ${user.uid}` : "User logged out");
      setCurrentUser(user);
      
      if (user) {
        // User is logged in, load their existing music files
        await loadExistingMusicFiles(user);
      } else {
        // User is logged out, clear the generated audio clips
        setGeneratedAudioClips([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Function to delete an audio file from Firebase Storage and local state
  const deleteAudioFile = async (clip: GeneratedAudioClip) => {
    const user = auth.currentUser;
    if (!user) {
      showToast("Error", "You must be logged in to delete files.", "error");
      return;
    }

    try {
      console.log("Deleting audio file:", clip.id);
      showToast("Deleting", `Deleting "${clip.displayName || 'audio file'}"...`, "info");
      
      // Create a reference to the file in Firebase Storage
      const fileRef = ref(storage, `users/${user.uid}/audio/${clip.id}.wav`);
      
      // Delete the file from Firebase Storage
      await deleteObject(fileRef);

      // Delete the corresponding Firestore document
      const docRef = doc(db, "users", user.uid, "generations", clip.id);
      await deleteDoc(docRef);
      
      // Remove the clip from local state
      setGeneratedAudioClips(prevClips => 
        prevClips.filter(existingClip => existingClip.id !== clip.id)
      );
      
      showToast("Deleted", `"${clip.displayName || 'Audio file'}" has been deleted permanently.`, "success");
      
    } catch (error: any) {
      console.error("Error deleting audio file:", error);
      
      // Handle specific Firebase errors
      if (error.code === 'storage/object-not-found') {
        // File doesn't exist in storage, but remove from local state anyway
        setGeneratedAudioClips(prevClips => 
          prevClips.filter(existingClip => existingClip.id !== clip.id)
        );
        showToast("Removed", "File was already deleted from storage. Removed from list.", "info");
      } else if (error.code === 'storage/unauthorized') {
        showToast("Permission Denied", "You don't have permission to delete this file.", "error");
      } else {
        showToast("Delete Failed", `Could not delete the audio file: ${error.message || 'Unknown error'}`, "error");
      }
    }
  };

  // Effect to update recording duration in main process when slider changes (debounced)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (window.electronAPI && typeof (window.electronAPI as any).setRecordingDuration === 'function') {
        console.log(`[Queue.tsx] Sending recording duration to main (debounced): ${recordingDurationSeconds}s`);
        (window.electronAPI as any).setRecordingDuration(recordingDurationSeconds);
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [recordingDurationSeconds]);

  // Effect to update UI preferred generation duration in main process when slider changes (debounced)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (window.electronAPI && typeof (window.electronAPI as any).setUiPreferredGenerationDuration === 'function') {
        console.log(`[Queue.tsx] Sending UI preferred generation duration to main (debounced): ${generationDurationSeconds}s`);
        (window.electronAPI as any).setUiPreferredGenerationDuration(generationDurationSeconds);
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [generationDurationSeconds]);

  // Effect to sync initial generation duration on mount
  useEffect(() => {
    if (window.electronAPI && typeof (window.electronAPI as any).setUiPreferredGenerationDuration === 'function') {
      console.log(`[Queue.tsx] Setting initial UI preferred generation duration: ${generationDurationSeconds}s`);
      (window.electronAPI as any).setUiPreferredGenerationDuration(generationDurationSeconds);
    }
  }, []); // Empty dependency array = runs once on mount

  const { data: screenshots = [], refetch } = useQuery<
    Array<ScreenshotItem> // Use the defined ScreenshotItem type
    , Error>(
    ["screenshots"],
    async () => {
      try {
        // Ensure electronAPI and getScreenshots are available
        if (window.electronAPI && typeof window.electronAPI.getScreenshots === 'function') {
          const existing = await window.electronAPI.getScreenshots()
          return existing
        }
        return []; // Return empty if API not ready
      } catch (error) {
        console.error("Error loading screenshots:", error)
        showToast("Error", "Failed to load existing screenshots", "error")
        return []
      }
    },
    {
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: false, // Adjusted from true to prevent too frequent refetches if not desired
      refetchOnMount: true
    }
  )

  // useEffect to listen for new screenshots being taken
  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.onScreenshotTaken === 'function') {
      const unsubscribe = window.electronAPI.onScreenshotTaken(() => {
        console.log("[Queue.tsx] Received onScreenshotTaken event, refetching screenshots.");
        refetch();
      });
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [refetch]);

  // useEffect to listen for the screenshot queue being cleared
  useEffect(() => {
    // Assuming onScreenshotQueueCleared will be added to electronAPI
    if (window.electronAPI && typeof (window.electronAPI as any).onScreenshotQueueCleared === 'function') {
      const unsubscribe = (window.electronAPI as any).onScreenshotQueueCleared(() => {
        console.log("[Queue.tsx] Received onScreenshotQueueCleared event, refetching screenshots.");
        refetch();
      });
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [refetch]);

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

  const getAudioSrc = (path: string) => {
    if (path.startsWith('https://') || path.startsWith('http://')) {
      return path;
    }
    return `clp://${path}`;
  };

  const handleGeneratedAudioReady = async (data: { generatedUrl: string, originalPath?: string, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string }) => {
    console.log("Generated audio is ready to be uploaded:", data);
    const user = auth.currentUser;
    if (!user) {
      showToast("Error", "You must be logged in to save music.", "error");
      return;
    }

    showToast("Uploading", "Uploading generated music to the cloud...", "info");

    try {
      // Fetch audio from the generated URL
      const response = await fetch(data.generatedUrl);
      const audioBlob = await response.blob();
      
      const clipId = uuidv4();
      const storagePath = `users/${user.uid}/audio/${clipId}.wav`;
      const storageRef = ref(storage, storagePath);

      // Create metadata to store with the file
      const fileMetadata = {
        contentType: 'audio/wav',
      };

      // Upload to Firebase Storage with metadata
      await uploadBytes(storageRef, audioBlob, fileMetadata);
      const downloadURL = await getDownloadURL(storageRef);

      console.log("Uploaded to Firebase Storage:", downloadURL);

      const newClipData = {
        storagePath: storagePath,
        downloadURL: downloadURL,
        clipId: clipId,
        userId: user.uid,
        timestamp: serverTimestamp(),
        bpm: data.features.bpm,
        key: data.features.key,
        status: 'ready' as const,
        displayName: data.displayName ?? 'Generated Track',
        originalPromptText: data.originalPromptText ?? '',
        originalPath: data.originalPath ?? null
      };

      // Save metadata to Firestore
      const userDocRef = doc(db, "users", user.uid, "generations", clipId);
      await setDoc(userDocRef, newClipData);
      
      console.log("Saved generation metadata to Firestore");
      
      const newClipUI: GeneratedAudioClip = {
        id: clipId,
        path: downloadURL,
        timestamp: new Date(), // Use client-side date for immediate UI update. It will be correct on next load from server.
        bpm: data.features.bpm,
        key: data.features.key,
        status: 'ready',
        originalPath: data.originalPath,
        displayName: data.displayName,
        originalPromptText: data.originalPromptText
      };

      setGeneratedAudioClips(prevClips => [newClipUI, ...prevClips]);
      showToast("Music Ready", `Generated music "${data.displayName || 'track'}" is ready.`, "success");

    } catch (error: any) {
      console.error("Error uploading or saving to Firebase:", error);
      const errorMessage = error.code ? ` (Code: ${error.code})` : '';
      showToast("Cloud Save Failed", `Could not save music: ${error.message}${errorMessage}`, "error");
    }
  };

  useEffect(() => {
    const clearVadStatusTimeout = () => {
      if (vadStatusTimeoutRef.current) {
        clearTimeout(vadStatusTimeoutRef.current);
        vadStatusTimeoutRef.current = null;
      }
    };
    const handleVadWaiting = () => { clearVadStatusTimeout(); setVadStatusMessage("Waiting for audio..."); setGlobalRecordingError(null); };
    const handleVadRecordingStarted = () => { clearVadStatusTimeout(); setVadStatusMessage("Recording audio..."); };
          const handleVadTimeout = () => { setVadStatusMessage("No sound detected. Recording timed out."); vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 5000); };

      const handleAudioRecordingComplete = async (data: { path: string }) => {
      console.log("Global audio recording complete (Queue.tsx):", data.path);
      const newRecording: GlobalRecording = { id: `global-rec-${Date.now()}`, path: data.path, timestamp: new Date() };
      setGlobalRecordings(prevRecordings => [newRecording, ...prevRecordings]);
      setGlobalRecordingError(null);
      clearVadStatusTimeout();
      setVadStatusMessage(null);
      showToast("Recording Saved", `Audio saved to ${data.path}`, "success");
    };
    const handleAudioRecordingError = (data: { message: string }) => { console.error("Global audio recording error:", data.message); setGlobalRecordingError(data.message); clearVadStatusTimeout(); setVadStatusMessage("Recording error."); vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 5000); };
    
    const unsubscribes = [
      window.electronAPI.onVadWaiting(handleVadWaiting),
      window.electronAPI.onVadRecordingStarted(handleVadRecordingStarted),
      window.electronAPI.onVadTimeout(handleVadTimeout),
      window.electronAPI.onAudioRecordingComplete(handleAudioRecordingComplete),
      window.electronAPI.onAudioRecordingError(handleAudioRecordingError),
      window.electronAPI.onGeneratedAudioReady(handleGeneratedAudioReady),
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => { 
        console.log("[Queue.tsx] onResetView triggered. Clearing audio lists.");
        refetch(); 
      }),
      window.electronAPI.onSolutionError((error: string) => { showToast("Solution Error", error, "error"); }),
      window.electronAPI.onProcessingNoScreenshots(() => { showToast("No Screenshots", "No screenshots to process.", "info"); }),
      window.electronAPI.onScreenshotLimitReached((data: { message: string }) => { 
        showToast("Screenshot Limit", data.message, "error"); 
      })
    ];
    return () => { unsubscribes.forEach(unsub => unsub()); clearVadStatusTimeout(); };
  }, [refetch]);

  const handleGenerateMusicFromRecording = async (recordingPath: string) => {
    try {
      showToast("Processing", "Generating music from recording...", "info");
      
      let generationFunction: any = undefined;
      if (window.electronAPI && typeof window.electronAPI.generateMusic === 'function') {
        generationFunction = window.electronAPI.generateMusic;
        console.log("[Queue.tsx] Found window.electronAPI.generateMusic");
      } else if (window.electronAPI && typeof (window.electronAPI as any).generateMusicContinuation === 'function') {
        generationFunction = (window.electronAPI as any).generateMusicContinuation;
        console.warn("[Queue.tsx] Found legacy window.electronAPI.generateMusicContinuation");
      } else {
        console.error("[Queue.tsx] No valid music generation function found on window.electronAPI (tried generateMusic, generateMusicContinuation).");
        showToast("Generation Error", "Music generation API function not found.", "error");
        return;
      }

      // For continuation, the first argument (prompt) can be generic.
      // The second argument is the inputFilePath (the recording).
      // The generationFunction now returns displayName and originalPromptText as well.
      const operationId = `cont-${Date.now()}`; // Generate a unique operation ID
      const continuationPrompt = "Continue this audio"; // Generic prompt for continuation
              const { generatedUrl, features, displayName, originalPromptText } = await generationFunction(
        operationId, 
        continuationPrompt, 
        recordingPath, // This is the inputFilePath for continuation
        generationDurationSeconds // This is the duration for the new segment
      );
      
      showToast("Success", `Generated audio saved. BPM: ${features.bpm}, Key: ${features.key}`, "success");
              console.log(`[Queue.tsx] Calling window.electronAPI.notifyGeneratedAudioReady with:`, { generatedUrl, originalPath: recordingPath, features, displayName, originalPromptText });
        
        // Check if notifyGeneratedAudioReady exists before calling
        if (window.electronAPI && typeof window.electronAPI.notifyGeneratedAudioReady === 'function') {
            window.electronAPI.notifyGeneratedAudioReady(generatedUrl, recordingPath, features, displayName, originalPromptText);
        } else {
            console.warn("[Queue.tsx] window.electronAPI.notifyGeneratedAudioReady is not a function. State update for generated clips might be missed if not handled by 'onGeneratedAudioReady' event alone.")
            // Fallback: directly update state here if notify doesn't exist
            const newGeneratedClip: GeneratedAudioClip = { 
                id: `gen-clip-direct-${Date.now()}`,
                path: generatedUrl,
                originalPath: recordingPath || "",
                timestamp: new Date(),
                bpm: features.bpm,
                key: features.key,
                displayName: displayName,
                originalPromptText: originalPromptText,
                status: 'ready'
            };
            setGeneratedAudioClips(prevClips => [newGeneratedClip, ...prevClips]);
        }

    } catch (error: any) {
      console.error("Error generating music (Queue.tsx):", error);
      showToast("Generation Failed", error.message || "Could not generate audio.", "error");
    }
  };

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
    // App.tsx MutationObserver/ResizeObserver will handle any DOM changes that affect overall size.
  }

  // Log conversation changes for debugging
  useEffect(() => {
    console.log("[Queue.tsx] Conversation updated (for main chat view):", conversation);
    console.log("[Queue.tsx] Current globalRecordings state:", globalRecordings);
    console.log("[Queue.tsx] Current generatedAudioClips state:", generatedAudioClips);
  }, [conversation, globalRecordings, generatedAudioClips]);

  const handleOpenPromptModal = (prompt: string) => {
    setModalPromptText(prompt);
    setIsPromptModalOpen(true);
  };

  const handleClosePromptModal = () => {
    setIsPromptModalOpen(false);
  };

  return (
          <div className="flex flex-col h-screen text-foreground">
      {/* Main Content */}
      <div className="flex-grow flex flex-col overflow-hidden">
        {/* Top bar with commands */}
        <div className="flex-none">
          <QueueCommands
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
            screenshots={screenshots}
            isProcessingSolution={isProcessingSolution}
            quitApp={handleQuitApp}
          />
        </div>

        {/* Scrollable area for solutions */}
        <div className="flex flex-col flex-grow min-h-0 space-y-2 p-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted hover:scrollbar-thumb-muted-foreground scrollbar-track-secondary scrollbar-thumb-rounded-full non-draggable">
          <div className="w-full space-y-3 p-3 bg-card/90 backdrop-blur-sm border border-border/20 rounded-lg">
            {vadStatusMessage && (
              <div className={`mx-0.5 mb-2 p-1 rounded text-xs font-medium text-muted-foreground`}>
                {vadStatusMessage}
              </div>
            )}
            {globalRecordings.length > 0 && (
              <div className="space-y-2">
                <div 
                  className="flex items-center justify-between cursor-pointer py-1 hover:bg-secondary rounded px-1" 
                  onClick={() => setIsRecordedAudioOpen(!isRecordedAudioOpen)}
                >
                  <h4 className="font-medium text-xs text-muted-foreground tracking-wider uppercase">Recorded Audio</h4>
                  <span className="text-muted-foreground text-xs">
                    {isRecordedAudioOpen ? '▼' : '▶'}
                  </span>
                </div>
                {isRecordedAudioOpen && (
                  <div className="space-y-2 pl-1 pr-0.5 pt-1">
                    {globalRecordings.map((rec) => (
                      <div 
                        key={rec.id} 
                        className="flex flex-col p-2.5 bg-secondary/80 backdrop-blur-sm rounded-lg border border-border/20 non-draggable"
                        draggable={true}
                        onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                          e.preventDefault(); // Prevent default HTML drag behavior
                          e.stopPropagation(); // Stop event propagation
                          if (rec.path) {
                            // Set dataTransfer properties for robustness
                            e.dataTransfer.setData('text/plain', rec.path); // Using path as dummy data
                            e.dataTransfer.effectAllowed = 'copy';
                            window.electronAPI.startFileDrag(rec.path);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center text-[10px] text-muted-foreground"><span className="mr-1.5 opacity-70">⏰</span><span>{rec.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span></div>
                        </div>
                        <p className="text-[11px] font-medium text-secondary-foreground mb-2 flex items-center"><span className="mr-1.5 opacity-80">🎤</span><span className="truncate">User Recording</span></p>
                        <audio controls src={getAudioSrc(rec.path)} className="w-full h-8 rounded-sm filter saturate-[0.8] opacity-80 hover:opacity-100 transition-opacity mb-2 non-draggable"></audio>
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent triggering drag events
                            handleGenerateMusicFromRecording(rec.path);
                          }}
                          className="w-full px-3 py-2 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-all duration-200 flex items-center justify-center gap-2 group shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] non-draggable"
                          title="Generate music based on this recording"
                        >
                          <span className="group-hover:rotate-12 transition-transform duration-200">🎵</span>
                          <span>Generate Music</span>
                          <span className="opacity-60 group-hover:opacity-100 transition-opacity">✨</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {globalRecordingError && (
              <div className="mx-0.5 mt-2 p-2 bg-background rounded text-foreground text-xs border border-foreground font-medium">
                <span className="font-semibold">Audio Error:</span> {globalRecordingError}
              </div>
            )}
            {/* Duration Controls - Minimal Design */}
            <div className="mx-0.5 mt-3 space-y-2">
              <div className="flex items-center justify-between px-2 py-1.5 bg-secondary/80 backdrop-blur-sm rounded-md border border-border/20">
                <label htmlFor="recordingDuration" className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                  Recording
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    id="recordingDuration"
                    name="recordingDuration"
                    min="1"
                    max="30"
                    value={recordingDurationSeconds}
                    onChange={(e) => setRecordingDurationSeconds(parseInt(e.target.value, 10))}
                    className="w-16 h-1 bg-input rounded-full appearance-none cursor-pointer slider-minimal non-draggable"
                  />
                  <span className="text-xs font-medium text-secondary-foreground w-6 text-right">{recordingDurationSeconds}s</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 bg-secondary/80 backdrop-blur-sm rounded-md border border-border/20">
                <label htmlFor="generationDuration" className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                  Generation
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    id="generationDuration"
                    name="generationDuration"
                    min="1"
                    max="30"
                    value={generationDurationSeconds}
                    onChange={(e) => setGenerationDurationSeconds(parseInt(e.target.value, 10))}
                    className="w-16 h-1 bg-input rounded-full appearance-none cursor-pointer slider-minimal non-draggable"
                  />
                  <span className="text-xs font-medium text-secondary-foreground w-6 text-right">{generationDurationSeconds}s</span>
                </div>
              </div>
            </div>
            {generatedAudioClips.length > 0 && (
              <div className="space-y-2 pt-1.5">
                <div 
                  className="flex items-center justify-between cursor-pointer py-1 hover:bg-secondary rounded px-1" 
                  onClick={() => setIsGeneratedAudioOpen(!isGeneratedAudioOpen)}
                >
                  <h4 className="font-medium text-xs text-muted-foreground tracking-wider uppercase">Generated Audio</h4>
                  <span className="text-muted-foreground text-xs">
                    {isGeneratedAudioOpen ? '▼' : '▶'}
                  </span>
                </div>
                {isGeneratedAudioOpen && (
                  <div className="space-y-2 pl-1 pr-0.5 pt-1">
                    {generatedAudioClips.map((clip) => (
                      <div 
                        key={clip.id} 
                        className="flex flex-col p-2.5 bg-secondary/80 backdrop-blur-sm rounded-lg border border-border/20 non-draggable"
                        draggable={true}
                        onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                          e.preventDefault(); // Prevent default HTML drag behavior
                          e.stopPropagation(); // Stop event propagation
                          if (clip.path) {
                            // Set dataTransfer properties for robustness
                            e.dataTransfer.setData('text/plain', clip.path); // Using path as dummy data
                            e.dataTransfer.effectAllowed = 'copy';
                            window.electronAPI.startFileDrag(clip.path);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center text-[10px] text-muted-foreground"><span className="mr-1.5 opacity-70">⏰</span><span>{clip.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span></div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent triggering drag events
                              if (window.confirm(`Are you sure you want to delete "${clip.displayName || 'this audio file'}"?\n\nThis action cannot be undone.`)) {
                                deleteAudioFile(clip);
                              }
                            }}
                            className="group px-1.5 py-0.5 text-[9px] font-medium text-foreground hover:text-primary hover:bg-secondary border border-border hover:border-primary rounded transition-all duration-200 flex-shrink-0 focus:outline-none focus:ring-1 focus:ring-ring active:scale-95 non-draggable"
                            title="Delete this audio file permanently"
                          >
                            <span className="group-hover:scale-110 transition-transform duration-200 inline-block">🗑️</span>
                          </button>
                        </div>
                        
                        {/* Container for Track Name and View Prompt Button - using justify-between */}
                        <div className="flex items-center justify-between mb-0.5">
                          {/* Group for Icon and Track Name - this group will shrink and truncate */}
                          <div className="flex items-center min-w-0 mr-2">
                            <span className="mr-1.5 opacity-80 flex-shrink-0">🎵</span>
                            <span className="text-sm font-semibold text-secondary-foreground truncate">
                              {clip.displayName}
                            </span>
                          </div>

                          {/* View Prompt Button - should not shrink and stays to the right */}
                          {clip.originalPromptText && clip.originalPromptText.length > 50 && (
                            <button 
                              onClick={() => { handleOpenPromptModal(clip.originalPromptText || "No prompt available"); }}
                              className="px-2.5 py-1 text-[9px] font-medium text-muted-foreground bg-background hover:bg-secondary border border-border rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-1 focus:ring-ring non-draggable"
                            >
                              View Full Prompt
                            </button>
                          )}
                        </div>
                        
                        {/* Based on line */}
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                          <span className="truncate"><span className="mr-1 opacity-70">🔙</span>Based on {clip.originalPath ? `Recording` : (clip.originalPromptText || clip.displayName) ? 'Text Prompt' : 'Unknown Source'}</span>
                        </div>
                        <div className="text-[10px] text-secondary-foreground mb-2 flex justify-between font-medium"><span>BPM: {String(clip.bpm) !== 'undefined' ? clip.bpm : 'N/A'}</span><span>Key: {clip.key || 'N/A'}</span></div>
                        <audio controls src={getAudioSrc(clip.path)} className="w-full h-8 rounded-sm filter saturate-[0.8] opacity-80 hover:opacity-100 transition-opacity non-draggable"></audio>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isLoadingExistingFiles && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground font-medium">Loading your music files...</p>
              </div>
            )}
            {(!isLoadingExistingFiles && globalRecordings.length === 0 && generatedAudioClips.length === 0 && !vadStatusMessage && !globalRecordingError) && (
               <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground font-medium">Record or generate audio to see it here.</p>
               </div>
            )}
          </div>

          <div className="w-full p-0.5 flex-grow flex flex-col min-h-0">
            <Solutions 
              showCommands={true}
              onProcessingStateChange={setIsProcessingSolution}
              conversation={conversation}
            />
          </div>
        </div>
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

// Remove the custom path.basename shim
// import path from "path"; // Avoid importing Node.js modules directly in renderer if not essential
