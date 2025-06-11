import React, { useState, useEffect, useRef } from "react"
import { GlobalRecording, GeneratedAudioClip } from "../types/audio"
import { auth, storage, db } from "../lib/firebase"
import { ref, uploadBytes, getDownloadURL, listAll, getMetadata, deleteObject } from "firebase/storage"
import { doc, setDoc, deleteDoc, collection, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore"
import { v4 as uuidv4 } from 'uuid';
import { onAuthStateChanged, User } from "firebase/auth"

interface AudioSectionProps {
  onShowToast: (title: string, description: string, variant: "info" | "success" | "error") => void;
  onOpenPromptModal: (prompt: string) => void;
}

const AudioSection: React.FC<AudioSectionProps> = ({ onShowToast, onOpenPromptModal }) => {
  // State for collapsibility - set to false for collapsed by default
  const [isRecordedAudioOpen, setIsRecordedAudioOpen] = useState(false);
  const [isGeneratedAudioOpen, setIsGeneratedAudioOpen] = useState(false);

  // State for audio clips
  const [globalRecordings, setGlobalRecordings] = useState<GlobalRecording[]>([])
  const [generatedAudioClips, setGeneratedAudioClips] = useState<GeneratedAudioClip[]>([])
  const [globalRecordingError, setGlobalRecordingError] = useState<string | null>(null)
  const [vadStatusMessage, setVadStatusMessage] = useState<string | null>(null);
  const vadStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // State for recording and generation duration
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(5); // Default 5 seconds
  const [generationDurationSeconds, setGenerationDurationSeconds] = useState(8); // Default 8 seconds

  // State for current user
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingExistingFiles, setIsLoadingExistingFiles] = useState(false);

  // NEW: State for MusicGen loading management
  const [activeGenerations, setActiveGenerations] = useState<Set<string>>(new Set());
  const [generationProgress, setGenerationProgress] = useState<Map<string, string>>(new Map());

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
        onShowToast("Loaded", `Found ${existingClips.length} existing music files`, "success");
      }
      
    } catch (error) {
      console.error("Error loading existing music files:", error);
      onShowToast("Error", "Failed to load existing music files", "error");
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
      onShowToast("Error", "You must be logged in to delete files.", "error");
      return;
    }

    try {
      console.log("Deleting audio file:", clip.id);
      onShowToast("Deleting", `Deleting "${clip.displayName || 'audio file'}"...`, "info");
      
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
      
      onShowToast("Deleted", `"${clip.displayName || 'Audio file'}" has been deleted permanently.`, "success");
      
    } catch (error: any) {
      console.error("Error deleting audio file:", error);
      
      // Handle specific Firebase errors
      if (error.code === 'storage/object-not-found') {
        // File doesn't exist in storage, but remove from local state anyway
        setGeneratedAudioClips(prevClips => 
          prevClips.filter(existingClip => existingClip.id !== clip.id)
        );
        
        onShowToast("Deleted", `"${clip.displayName || 'Audio file'}" was already deleted from storage.`, "success");
      } else {
        onShowToast("Error", `Failed to delete "${clip.displayName || 'audio file'}": ${error.message}`, "error");
      }
    }
  };

  const getAudioSrc = (path: string) => {
    return path.startsWith('https://') || path.startsWith('http://') 
      ? path 
      : `clp://${path}`;
  };

  const handleGeneratedAudioReady = async (data: { generatedUrl: string, originalPath?: string, features: { bpm: string | number, key: string }, displayName?: string, originalPromptText?: string }) => {
    const user = auth.currentUser;
    if (!user) {
      console.error("No authenticated user found when trying to save generated audio");
      return;
    }

    const clipId = uuidv4();
    const timestamp = new Date();

    // Create a new GeneratedAudioClip object
    const newClip: GeneratedAudioClip = {
      id: clipId,
      path: data.generatedUrl,
      timestamp: timestamp,
      bpm: data.features.bpm,
      key: data.features.key,
      status: 'ready',
      displayName: data.displayName,
      originalPromptText: data.originalPromptText,
      originalPath: data.originalPath
    };

    // Always add to local state first - generation was successful
    setGeneratedAudioClips(prevClips => [newClip, ...prevClips]);

    // Show success message immediately since generation worked
    onShowToast("Generated", `"${data.displayName || 'Audio'}" is ready!`, "success");

    // Try to save to Firestore, but don't fail the whole operation if this fails
    try {
      const docRef = doc(db, "users", user.uid, "generations", clipId);
      await setDoc(docRef, {
        clipId: clipId,
        downloadURL: data.generatedUrl,
        timestamp: serverTimestamp(),
        bpm: data.features.bpm,
        key: data.features.key,
        displayName: data.displayName,
        originalPromptText: data.originalPromptText,
        originalPath: data.originalPath
      });

      console.log("Generated audio saved to Firestore:", clipId);

    } catch (error) {
      console.error("Error saving generated audio to Firestore (generation still succeeded):", error);
      // Only show a warning about cloud save failing, not a general error
      onShowToast("Warning", "Audio generated successfully but cloud save failed. File is available locally.", "info");
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
      clearVadStatusTimeout();
      setVadStatusMessage("Recording complete!");
      setGlobalRecordingError(null);
      
      vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 3000);
      
      const newRecording: GlobalRecording = {
        id: uuidv4(),
        path: data.path,
        timestamp: new Date()
      };
      setGlobalRecordings(prev => [newRecording, ...prev]);
    };

    const handleAudioRecordingError = (data: { message: string }) => { console.error("Global audio recording error:", data.message); setGlobalRecordingError(data.message); clearVadStatusTimeout(); setVadStatusMessage("Recording error."); vadStatusTimeoutRef.current = setTimeout(() => setVadStatusMessage(null), 5000); };

    const cleanupFunctions = [
      window.electronAPI.onVadWaiting(handleVadWaiting),
      window.electronAPI.onVadRecordingStarted(handleVadRecordingStarted),
      window.electronAPI.onVadTimeout(handleVadTimeout),
      window.electronAPI.onAudioRecordingComplete(handleAudioRecordingComplete),
      window.electronAPI.onAudioRecordingError(handleAudioRecordingError),
      window.electronAPI.onGeneratedAudioReady(handleGeneratedAudioReady),
    ];

    return () => {
      clearVadStatusTimeout();
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, []);

  const handleGenerateMusicFromRecording = async (recordingPath: string) => {
    if (!recordingPath) {
      console.error("No recording path provided for music generation");
      return;
    }

    // Generate a unique operation ID for this generation request
    const operationId = `recording-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      console.log("Generating music from recording:", recordingPath);
      
      // START LOADING STATE
      setActiveGenerations(prev => new Set(prev).add(recordingPath));
      setGenerationProgress(prev => new Map(prev).set(recordingPath, "Initializing MusicGen..."));
      onShowToast("Generating", "Creating music from your recording using MusicGen...", "info");
      
      // Update progress indicators
      setTimeout(() => {
        setGenerationProgress(prev => new Map(prev).set(recordingPath, "Processing audio with MusicGen..."));
      }, 2000);
      
      setTimeout(() => {
        setGenerationProgress(prev => new Map(prev).set(recordingPath, "Generating musical continuation..."));
      }, 5000);
      
      const result = await window.electronAPI.generateMusicFromRecording(
        operationId,
        "Generate music based on this audio recording",
        recordingPath,
        generationDurationSeconds
      );
      
      console.log("MusicGen generation result:", result);
      onShowToast("Success", "Music generated successfully using MusicGen!", "success");
      
    } catch (error) {
      console.error("Error generating music from recording:", error);
      onShowToast("Error", "Failed to generate music from recording using MusicGen", "error");
    } finally {
      // END LOADING STATE
      setActiveGenerations(prev => {
        const newSet = new Set(prev);
        newSet.delete(recordingPath);
        return newSet;
      });
      setGenerationProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(recordingPath);
        return newMap;
      });
    }
  };

  return (
    <div className="w-full bg-white/50 backdrop-blur-sm border border-border/20 rounded-lg overflow-hidden">
      {/* Compact Header */}
      <div className="bg-gradient-to-r from-primary/5 to-secondary/5 px-3 py-2 border-b border-border/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-primary text-sm">🎵</span>
            <h2 className="text-xs font-semibold text-foreground">Audio Studio</h2>
          </div>
          <div className="text-[10px] text-muted-foreground font-medium">
            {(globalRecordings.length + generatedAudioClips.length) > 0 ? 
              `${globalRecordings.length + generatedAudioClips.length} items` : 
              'Ready'
            }
          </div>
        </div>
        
        {/* Compact Duration Controls */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="bg-white/30 rounded px-2 py-1.5 border border-border/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">🎤 Rec</span>
              <span className="text-[10px] font-bold text-primary">{recordingDurationSeconds}s</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="30" 
              value={recordingDurationSeconds} 
              onChange={(e) => setRecordingDurationSeconds(parseInt(e.target.value, 10))} 
              className="w-full h-1 bg-secondary/50 rounded-full appearance-none cursor-pointer slider-minimal"
            />
          </div>
          
          <div className="bg-white/30 rounded px-2 py-1.5 border border-border/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">✨ Gen</span>
              <span className="text-[10px] font-bold text-primary">{generationDurationSeconds}s</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="30" 
              value={generationDurationSeconds} 
              onChange={(e) => setGenerationDurationSeconds(parseInt(e.target.value, 10))} 
              className="w-full h-1 bg-secondary/50 rounded-full appearance-none cursor-pointer slider-minimal"
            />
          </div>
        </div>
        
        {/* Compact Status Messages */}
        {vadStatusMessage && (
          <div className="mt-2 px-2 py-1 bg-primary/10 border border-primary/20 rounded">
            <div className="flex items-center gap-1 text-[10px] font-medium text-primary">
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
              {vadStatusMessage}
            </div>
          </div>
        )}
        
        {globalRecordingError && (
          <div className="mt-2 px-2 py-1 bg-destructive/10 border border-destructive/20 rounded">
            <div className="flex items-center gap-1 text-[10px] font-medium text-destructive">
              <span>⚠️</span>
              {globalRecordingError}
            </div>
          </div>
        )}
      </div>

      {/* Compact Content Area */}
      <div className="p-3 space-y-2">
        {/* Active MusicGen Generations */}
        {activeGenerations.size > 0 && (
          <div className="p-2 bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-4 h-4 bg-orange-500/20 rounded flex items-center justify-center">
                <div className="w-2 h-2 border border-orange-500/50 border-t-orange-500 rounded-full animate-spin"></div>
              </div>
              <h3 className="text-[10px] font-semibold text-foreground">MusicGen Processing</h3>
            </div>
            {Array.from(activeGenerations).map((recordingPath) => (
              <div key={recordingPath} className="flex items-center gap-1 text-[9px] text-orange-600">
                <span className="animate-pulse">🎵</span>
                <span>{generationProgress.get(recordingPath) || "Processing..."}</span>
              </div>
            ))}
          </div>
        )}

        {/* Compact Recorded Audio Section */}
        {globalRecordings.length > 0 && (
          <div className="space-y-1">
            <button
              onClick={() => setIsRecordedAudioOpen(!isRecordedAudioOpen)}
              className="w-full flex items-center justify-between p-2 bg-gradient-to-r from-orange-500/10 to-red-500/10 hover:from-orange-500/15 hover:to-red-500/15 border border-orange-500/20 rounded transition-all duration-200 group"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-orange-500/20 rounded flex items-center justify-center">
                  <span className="text-orange-500 text-[10px]">🎤</span>
                </div>
                <div className="text-left">
                  <h3 className="text-[10px] font-semibold text-foreground">Recordings</h3>
                  <p className="text-[8px] text-muted-foreground">{globalRecordings.length} item{globalRecordings.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <span className={`text-orange-500 text-[10px] transition-transform duration-200 ${isRecordedAudioOpen ? 'rotate-90' : ''}`}>
                ▶
              </span>
            </button>
            
            {isRecordedAudioOpen && (
              <div className="max-h-32 overflow-y-auto scrollbar-thin space-y-1">
                {globalRecordings.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-gradient-to-r from-orange-500/5 to-red-500/5 border border-orange-500/20 rounded p-2 hover:from-orange-500/10 hover:to-red-500/10 transition-all duration-200"
                    draggable={true}
                    onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (rec.path) {
                        window.electronAPI.startFileDrag(rec.path);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <span className="text-orange-500">⏰</span>
                        <span>{rec.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span>
                      </div>
                    </div>
                    
                    <div className="mb-1">
                      <audio 
                        controls 
                        src={getAudioSrc(rec.path)} 
                        className="w-full h-6 rounded opacity-90 hover:opacity-100 transition-opacity"
                      />
                    </div>
                    
                    {activeGenerations.has(rec.path) ? (
                      <div className="w-full px-2 py-1 text-[9px] font-semibold text-white bg-gradient-to-r from-orange-500/70 to-red-500/70 rounded flex items-center justify-center gap-1 cursor-default">
                        <div className="w-2 h-2 border border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Generating...</span>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateMusicFromRecording(rec.path);
                        }}
                        className="w-full px-2 py-1 text-[9px] font-semibold text-white bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded transition-all duration-200 flex items-center justify-center gap-1 group"
                      >
                        <span className="group-hover:rotate-12 transition-transform duration-200">🎵</span>
                        <span>Generate Music</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Compact Generated Audio Section */}
        {generatedAudioClips.length > 0 && (
          <div className="space-y-1">
            <button
              onClick={() => setIsGeneratedAudioOpen(!isGeneratedAudioOpen)}
              className="w-full flex items-center justify-between p-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10 hover:from-blue-500/15 hover:to-purple-500/15 border border-blue-500/20 rounded transition-all duration-200 group"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-blue-500/20 rounded flex items-center justify-center">
                  <span className="text-blue-500 text-[10px]">✨</span>
                </div>
                <div className="text-left">
                  <h3 className="text-[10px] font-semibold text-foreground">Generated</h3>
                  <p className="text-[8px] text-muted-foreground">{generatedAudioClips.length} track{generatedAudioClips.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <span className={`text-blue-500 text-[10px] transition-transform duration-200 ${isGeneratedAudioOpen ? 'rotate-90' : ''}`}>
                ▶
              </span>
            </button>
            
            {isGeneratedAudioOpen && (
              <div className="max-h-32 overflow-y-auto scrollbar-thin space-y-1">
                {generatedAudioClips.map((clip) => (
                  <div
                    key={clip.id}
                    className="bg-gradient-to-r from-blue-500/5 to-purple-500/5 border border-blue-500/20 rounded p-2 hover:from-blue-500/10 hover:to-purple-500/10 transition-all duration-200"
                    draggable={true}
                    onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (clip.path) {
                        window.electronAPI.startFileDrag(clip.path);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <span className="text-blue-500">⏰</span>
                        <span>{clip.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete "${clip.displayName}"?\n\nThis cannot be undone.`)) {
                            deleteAudioFile(clip);
                          }
                        }}
                        className="px-1 py-0.5 text-[8px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border/30 hover:border-destructive/30 rounded transition-all duration-200"
                      >
                        🗑️
                      </button>
                    </div>
                    
                    <div className="mb-1">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-blue-500 text-[10px]">🎵</span>
                        <h4 className="text-[10px] font-semibold text-foreground truncate flex-1">
                          {clip.displayName || 'Generated Track'}
                        </h4>
                        {clip.originalPromptText && clip.originalPromptText.length > 50 && (
                          <button
                            onClick={() => onOpenPromptModal(clip.originalPromptText || "")}
                            className="px-1 py-0.5 text-[8px] font-medium text-blue-500 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded transition-colors"
                          >
                            View
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[8px] text-muted-foreground mb-1">
                        <span className="flex items-center gap-0.5">
                          <span className="text-blue-500">🎼</span>
                          <span>{String(clip.bpm) !== 'undefined' ? `${clip.bpm}` : '?'} BPM</span>
                        </span>
                        <span className="flex items-center gap-0.5">
                          <span className="text-purple-500">🎹</span>
                          <span>{clip.key || '?'}</span>
                        </span>
                      </div>
                    </div>
                    
                    <audio 
                      controls 
                      src={getAudioSrc(clip.path)} 
                      className="w-full h-6 rounded opacity-90 hover:opacity-100 transition-opacity"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Compact Empty State */}
        {(!isLoadingExistingFiles && globalRecordings.length === 0 && generatedAudioClips.length === 0 && !vadStatusMessage && !globalRecordingError) && (
          <div className="text-center py-4 px-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-sm">🎵</span>
            </div>
            <h3 className="text-[10px] font-semibold text-foreground mb-1">Ready to Create</h3>
            <p className="text-[8px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
              Press <kbd className="px-1 py-0.5 bg-secondary rounded text-[8px] font-mono">⌘;</kbd> to record or type a prompt to generate music.
            </p>
          </div>
        )}

        {/* Compact Loading State */}
        {isLoadingExistingFiles && (
          <div className="text-center py-4">
            <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full flex items-center justify-center mx-auto mb-2 animate-pulse">
              <span className="text-sm">🎵</span>
            </div>
            <p className="text-[10px] text-muted-foreground font-medium">Loading...</p>
          </div>
        )}
      </div>
    </div>
    )
}

export default AudioSection; 
