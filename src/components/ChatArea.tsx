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
        className="flex-grow overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/40 scrollbar-track-transparent scrollbar-thumb-rounded-full non-draggable"
      >
        {conversation?.map((item: ConversationItem, index: number) => {
          if (item.type === 'user_text') {
            return (
              <div key={item.id} className="flex justify-end group animate-in slide-in-from-right duration-300">
                <div className="relative max-w-[85%] md:max-w-[75%]">
                  <div className="bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-2xl rounded-br-md px-4 py-3 shadow-lg shadow-primary/20 backdrop-blur-sm border border-primary/20">
                    <p className="text-sm leading-relaxed">{item.content}</p>
                  </div>
                  <div className="flex justify-end mt-1">
                    <span className="text-[10px] text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-2">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          } else if (item.type === 'ai_response') {
            const isLoading = item.content?.isLoading;
            const solution = item.content?.solution;

            if (isLoading) {
              return (
                <div key={item.id} className="flex justify-start group animate-in slide-in-from-left duration-300">
                  <div className="relative max-w-[85%] md:max-w-[75%]">
                    <div className="bg-card/90 backdrop-blur-sm border border-border/20 text-card-foreground rounded-2xl rounded-bl-md px-4 py-3 shadow-lg shadow-black/5">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                        <p className="text-sm text-muted-foreground italic">AI is thinking...</p>
                      </div>
                    </div>
                    <div className="flex justify-start mt-1">
                      <span className="text-[10px] text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-2">
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            let suggestionsOutput: React.ReactNode = null;
            if (solution?.suggested_responses && solution.suggested_responses.length > 0) {
              suggestionsOutput = (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">💡 Suggestions:</p>
                  <div className="space-y-2">
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
                          <div 
                            key={i} 
                            className="px-3 py-2 text-xs bg-secondary/50 hover:bg-secondary/80 border border-border/30 hover:border-border/60 rounded-lg transition-all duration-200 cursor-pointer hover:shadow-md transform hover:scale-[1.02] active:scale-[0.98]"
                          >
                            {suggestionText}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              );
            }

            let aiTextMessage: React.ReactNode = null;
            if (solution?.code) {
              const codeContent = Array.isArray(solution.code) ? solution.code.join('\n') : solution.code;
              aiTextMessage = (
                <div className="bg-secondary/30 border border-border/30 rounded-lg p-3 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-primary">📝 Code:</span>
                  </div>
                  <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-foreground">{codeContent}</pre>
                </div>
              );
            } else if (solution?.reasoning) {
              aiTextMessage = <p className="whitespace-pre-wrap text-sm leading-relaxed">{solution.reasoning}</p>;
            }

            let audioPlayer: React.ReactNode = null;
            let audioLoadingIndicator: React.ReactNode = null;
            let audioErrorIndicator: React.ReactNode = null;

            if (item.content?.isLoadingAudio === true) {
              audioLoadingIndicator = (
                <div className="mt-4 p-4 bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/20 rounded-xl">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center animate-pulse">
                        <span className="text-xl">🎵</span>
                      </div>
                      <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-xl blur opacity-30 animate-pulse"></div>
                    </div>
                    <p className="text-sm font-medium text-primary">
                      Crafting your sound...
                    </p>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              );
            } else if (item.content?.musicGenerationCancelled === true && item.content?.musicGenerationError) {
              audioErrorIndicator = (
                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-500">⚠️</span>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">{item.content.musicGenerationError}</p>
                  </div>
                </div>
              );
            } else if (item.content?.musicGenerationError && typeof item.content.musicGenerationError === 'string') {
              audioErrorIndicator = (
                <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-destructive">❌</span>
                    <div>
                      <p className="text-xs font-medium text-destructive">Music Generation Error:</p>
                      <p className="text-xs text-destructive/80 mt-1">{item.content.musicGenerationError}</p>
                    </div>
                  </div>
                </div>
              );
            }
            
            if (item.content?.playableAudioPath && typeof item.content.playableAudioPath === 'string') {
              const audioSrc = item.content.playableAudioPath.startsWith('https://') || item.content.playableAudioPath.startsWith('http://') 
                ? item.content.playableAudioPath 
                : `clp://${item.content.playableAudioPath}`;
              audioPlayer = (
                <div className="mt-4 p-3 bg-gradient-to-r from-green-500/5 to-blue-500/5 border border-green-500/20 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-green-500">🎵</span>
                    <span className="text-xs font-medium text-green-700 dark:text-green-300">Generated Audio</span>
                  </div>
                  <audio 
                    controls 
                    src={audioSrc} 
                    className="w-full h-10 rounded-lg opacity-90 hover:opacity-100 transition-opacity"
                  >
                    Your browser does not support the audio element.
                  </audio>
                </div>
              );
            }
            
            const hasContent = aiTextMessage || audioPlayer || audioLoadingIndicator || audioErrorIndicator || suggestionsOutput;

            return (
              <div key={item.id} className="flex justify-start group animate-in slide-in-from-left duration-300">
                <div className="relative max-w-[85%] md:max-w-[75%]">
                  <div className="bg-card/90 backdrop-blur-sm border border-border/20 text-card-foreground rounded-2xl rounded-bl-md px-4 py-3 shadow-lg shadow-black/5">
                    {hasContent ? (
                      <div className="space-y-2">
                        {aiTextMessage}
                        {audioLoadingIndicator}
                        {audioPlayer}
                        {audioErrorIndicator}
                        {suggestionsOutput}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">AI response received, but no displayable content found.</p>
                    )}
                  </div>
                  <div className="flex justify-start mt-1">
                    <span className="text-[10px] text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-2">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          } else if (item.type === 'user_file') {
            return null; 
          } else if (item.type === 'system_message') {
            return (
              <div key={item.id} className="flex justify-center group animate-in fade-in duration-500">
                <div className="px-4 py-2 bg-gradient-to-r from-secondary/30 to-secondary/20 border border-border/30 rounded-full">
                  <span className="text-xs text-muted-foreground font-medium">
                    {item.content.message}
                  </span>
                </div>
              </div>
            );
          } else {
            console.warn("Unsupported conversation item type:", item);
            return (
              <div key={`unknown-item-${index}`} className="flex justify-center group">
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg max-w-md">
                  <div className="flex items-center gap-2">
                    <span>⚠️</span>
                    <span className="text-xs font-medium">Unsupported message type encountered.</span>
                  </div>
                </div>
              </div>
            );
          }
        })}

        {/* Enhanced Screenshot Preview Modal */}
        {viewingScreenshotPreview && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="relative max-w-4xl max-h-[90vh] bg-card rounded-2xl overflow-hidden shadow-2xl border border-border/20">
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={() => onSetViewingScreenshotPreview(null)}
                  className="w-10 h-10 bg-background/80 backdrop-blur-sm hover:bg-background border border-border/50 hover:border-border rounded-full flex items-center justify-center transition-all duration-200 group"
                >
                  <X className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                </button>
              </div>
              <img
                src={viewingScreenshotPreview}
                alt="Screenshot preview"
                className="w-full h-full object-contain"
                style={{ maxHeight: '90vh' }}
              />
            </div>
          </div>
        )}

        {/* Enhanced Screenshot Queue */}
        {queuedScreenshots.length > 0 && (
          <div className="border-t border-border/20 pt-4 mt-6">
            <div className="flex items-center gap-2 mb-3">
              <ImageIcon className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium text-foreground">
                Queued Screenshots ({queuedScreenshots.length})
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {queuedScreenshots.map((screenshot, index) => (
                <div
                  key={index}
                  className="relative group bg-card border border-border/20 rounded-xl overflow-hidden hover:border-border/40 transition-all duration-200 hover:shadow-lg transform hover:scale-[1.02]"
                >
                  <div
                    className="aspect-video bg-muted cursor-pointer overflow-hidden"
                    onClick={() => onSetViewingScreenshotPreview(screenshot.preview)}
                  >
                    <img
                      src={screenshot.preview}
                      alt={`Screenshot ${index + 1}`}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  </div>
                  <button
                    onClick={() => onDeleteScreenshot(screenshot.path)}
                    className="absolute top-2 right-2 w-6 h-6 bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 transform scale-90 hover:scale-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-xs text-white font-medium truncate">
                      Screenshot {index + 1}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
};

export default ChatArea; 