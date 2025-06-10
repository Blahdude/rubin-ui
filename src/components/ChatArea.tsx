import React, { useRef, useEffect } from "react"
import { ConversationItem } from "../App"
import { Image as ImageIcon, X } from "lucide-react"

interface Screenshot {
  path: string;
  preview: string;
}

interface ChatAreaProps {
  conversation: ConversationItem[];
  queuedScreenshots: Screenshot[];
  viewingScreenshotPreview: string | null;
  onSetViewingScreenshotPreview: (preview: string | null) => void;
  onDeleteScreenshot: (path: string) => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  conversation,
  queuedScreenshots,
  viewingScreenshotPreview,
  onSetViewingScreenshotPreview,
  onDeleteScreenshot
}) => {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contentRef.current && contentRef.current.scrollHeight > contentRef.current.clientHeight) {
      try {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      } catch (e) {
        console.error("Error scrolling to bottom in ChatArea:", e);
      }
    }
  }, [conversation]);

  const formatTimestamp = (timestamp: number | undefined | null) => {
    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
      return '??:??';
    }
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={contentRef}
        className="flex-grow overflow-y-auto p-3 md:p-4 space-y-3 scrollbar-thin scrollbar-thumb-muted hover:scrollbar-thumb-muted-foreground scrollbar-track-secondary scrollbar-thumb-rounded-full non-draggable"
      >
        {conversation?.map((item: ConversationItem, index: number) => {
          if (item.type === 'user_text') {
            return (
              <div key={item.id} className="flex justify-end group">
                <div className="bg-card/90 backdrop-blur-sm border border-border/20 text-card-foreground rounded-lg px-3.5 py-2 text-sm max-w-[90%] md:max-w-[85%] relative w-full non-draggable">
                  {item.content}
                  <span className="text-[10px] text-muted-foreground absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
              </div>
            );
          } else if (item.type === 'ai_response') {
            const isLoading = item.content?.isLoading;
            const solution = item.content?.solution;

            if (isLoading) {
              return (
                <div key={item.id} className="flex justify-center group">
                  <div className="bg-card/90 backdrop-blur-sm border border-border/20 text-muted-foreground rounded-lg px-3.5 py-2 text-sm max-w-[90%] md:max-w-[85%] relative w-full italic non-draggable">
                    AI is thinking...
                    <span className="text-[10px] text-muted-foreground absolute bottom-1.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>
                </div>
              );
            }

            let suggestionsOutput: React.ReactNode = null;
            if (solution?.suggested_responses && solution.suggested_responses.length > 0) {
              suggestionsOutput = (
                <div className="mt-2.5 pt-2">
                  <ul className="space-y-1">
                      {solution.suggested_responses.map((s_item: any, i: number) => {
                        let suggestionText: string | null = null;
                        if (typeof s_item === 'string') {
                          suggestionText = s_item;
                        } else if (typeof s_item === 'object' && s_item !== null && typeof s_item.text === 'string') {
                          suggestionText = s_item.text;
                        } else if (typeof s_item === 'object' && s_item !== null && typeof s_item.suggestion === 'string') {
                          suggestionText = s_item.suggestion;
                        } else if (typeof s_item === 'object' && s_item !== null) {
                            console.warn("Unknown suggested response object structure:", s_item);
                            suggestionText = "[Invalid Suggestion Format]";
                        }

                        if (suggestionText !== null) {
                          return (
                            <li key={i} className="text-xs text-secondary-foreground hover:text-foreground hover:bg-secondary p-1.5 rounded-md transition-colors cursor-pointer">
                              {suggestionText}
                            </li>
                          );
                        }
                        return null;
                      })}
                  </ul>
                </div>
              );
            }

            let aiTextMessage: React.ReactNode = null;
            if (solution?.code) {
              const codeContent = Array.isArray(solution.code) ? solution.code.join('\n') : solution.code;
              aiTextMessage = <p className="whitespace-pre-wrap">{codeContent}</p>;
            } else if (solution?.reasoning) {
              aiTextMessage = <p className="whitespace-pre-wrap">{solution.reasoning}</p>;
            }

            let audioPlayer: React.ReactNode = null;
            let audioLoadingIndicator: React.ReactNode = null;
            let audioErrorIndicator: React.ReactNode = null;

            if (item.content?.isLoadingAudio === true) {
              audioLoadingIndicator = (
                <div className="mt-3 mb-2 flex flex-col items-center justify-center space-y-2">
                  <img src="/icon/image.png" alt="Loading audio..." className="w-10 h-10 animate-pulse opacity-75" />
                  <p className="text-xs text-muted-foreground italic">
                    Crafting your sound...
                  </p>
                </div>
              );
            } else if (item.content?.musicGenerationCancelled === true && item.content?.musicGenerationError) {
              audioErrorIndicator = (
                <div className="mt-2.5 text-xs text-muted-foreground bg-secondary p-2 rounded-md">
                  <p>{item.content.musicGenerationError}</p> 
                </div>
              );
            } else if (item.content?.musicGenerationError && typeof item.content.musicGenerationError === 'string') {
              audioErrorIndicator = (
                <div className="mt-2.5 text-xs text-red-400 bg-red-900/30 p-2 rounded-md">
                  <span className="font-semibold">Music Generation Error:</span> {item.content.musicGenerationError}
                </div>
              );
            }
            
            if (item.content?.playableAudioPath && typeof item.content.playableAudioPath === 'string') {
              const audioSrc = item.content.playableAudioPath.startsWith('https://') || item.content.playableAudioPath.startsWith('http://') 
                ? item.content.playableAudioPath 
                : `clp://${item.content.playableAudioPath}`;
              audioPlayer = (
                <div style={{ marginTop: aiTextMessage || suggestionsOutput ? '10px' : '0px', marginBottom: suggestionsOutput && !aiTextMessage ? '10px' : '0px' }}>
                  <audio controls src={audioSrc} className="w-full h-8 rounded-sm filter saturate-[0.8] opacity-80 hover:opacity-100 transition-opacity">
                    Your browser does not support the audio element.
                  </audio>
                </div>
              );
            }
            
            const hasContent = aiTextMessage || audioPlayer || audioLoadingIndicator || audioErrorIndicator || suggestionsOutput;

            return (
              <div key={item.id} className="flex justify-center group">
                <div className="bg-card/90 backdrop-blur-sm border border-border/20 text-card-foreground rounded-lg px-3.5 py-2 text-sm max-w-[90%] md:max-w-[85%] relative w-full non-draggable">
                  {hasContent ? (
                    <>
                      {aiTextMessage}
                      {audioLoadingIndicator}
                      {audioPlayer}
                      {audioErrorIndicator}
                      {suggestionsOutput}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">AI response received, but no displayable content found.</p>
                  )}
                  <span className="text-[10px] text-muted-foreground absolute bottom-1.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
              </div>
            );
          } else if (item.type === 'user_file') {
            return null; 
          } else if (item.type === 'system_message') {
            return (
              <div key={item.id} className="flex justify-center group">
                <div className="text-center my-2.5">
                  <span className="text-xs text-muted-foreground italic bg-secondary px-3 py-1 rounded-full">
                    {item.content.message}
                  </span>
                </div>
              </div>
            );
          } else {
            console.warn("Unsupported conversation item type:", item);
            return (
              <div key={`unknown-item-${index}`} className="flex justify-center group">
                <div className="text-red-400 text-xs p-2 text-center bg-red-900/30 rounded-md max-w-md">
                  Warning: Unsupported message type encountered.
                </div>
              </div>
            );
          }
        })}
      </div>
      
      {queuedScreenshots.length > 0 && (
        <div className="flex-shrink-0 border-t border-border/20 bg-card/90 backdrop-blur-sm px-2.5 py-1.5 flex items-center non-draggable">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Attached:</span>
            {queuedScreenshots.map((screenshot) => (
              <div key={screenshot.path} className="group relative">
                <button
                  onClick={() => onSetViewingScreenshotPreview(screenshot.preview)}
                  className="flex items-center gap-1 bg-secondary/80 backdrop-blur-sm text-secondary-foreground text-[11px] leading-none px-1.5 py-1 rounded-md border border-border/20 hover:bg-muted transition-colors shadow-md non-draggable"
                >
                  <ImageIcon className="w-2.5 h-2.5 text-muted-foreground" />
                  <span className="font-medium">Image</span>
                </button>
                <div 
                  className="absolute -top-1 -right-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onDeleteScreenshot(screenshot.path)}
                >
                  <div className="bg-foreground/80 rounded-full p-px">
                    <X className="w-2.5 h-2.5 text-background hover:text-background" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewingScreenshotPreview && (
        <div 
          className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-8 animate-in fade-in"
          onClick={() => onSetViewingScreenshotPreview(null)}
        >
          <img
            src={viewingScreenshotPreview}
            className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
            alt="Screenshot Preview"
            onClick={(e) => e.stopPropagation()}
          />
           <button
            onClick={() => onSetViewingScreenshotPreview(null)}
            className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
          >
            <X size={28} />
           </button>
        </div>
      )}
    </div>
  )
};

export default ChatArea; 