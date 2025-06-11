import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Mic, Settings, Headphones } from 'lucide-react';

interface TutorialBannerProps {
  isVisible: boolean;
  onClose: () => void;
}

const TutorialBanner: React.FC<TutorialBannerProps> = ({ isVisible, onClose }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = 2;

  useEffect(() => {
    // Reset to first slide when banner becomes visible
    if (isVisible) {
      setCurrentSlide(0);
    }
  }, [isVisible]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card/95 backdrop-blur-xl border border-border/20 rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <span className="text-primary font-bold">🎵</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Welcome to Rubin</h2>
              <p className="text-sm text-muted-foreground">Your AI music assistant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slide Content */}
        <div className="relative overflow-hidden flex-grow min-h-0">
          <div 
            className="flex transition-transform duration-300 ease-in-out h-full"
            style={{ transform: `translateX(-${currentSlide * 100}%)` }}
          >
            {/* Slide 1: Welcome & Tools Overview */}
            <div className="w-full flex-shrink-0 h-full min-h-0">
              <div className="h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    🎼 What can I do?
                  </h3>
                  <p className="text-muted-foreground">
                    I'm here to help with coming up with new ideas, overseeing production, and giving advice!
                  </p>
                </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Generate Music */}
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                      <span className="text-primary">🎵</span>
                    </div>
                    <h4 className="font-semibold text-foreground">Generate Music</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Describe the music you want to hear and I'll create it for you
                  </p>
                </div>

                {/* Record & Analyze */}
                <div className="bg-secondary/5 border border-secondary/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center">
                      <Mic className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <h4 className="font-semibold text-foreground">Record & Analyze</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Record audio and get insights or generate variations
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <kbd className="px-2 py-1 text-[10px] bg-background border rounded">⌘</kbd>
                    <kbd className="px-2 py-1 text-[10px] bg-background border rounded">;</kbd>
                  </div>
                </div>

                {/* Visual Analysis */}
                <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
                      <span className="text-accent">📸</span>
                    </div>
                    <h4 className="font-semibold text-foreground">Visual Analysis</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Take screenshots and ask questions about what you see
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <kbd className="px-2 py-1 text-[10px] bg-background border rounded">⌘</kbd>
                    <kbd className="px-2 py-1 text-[10px] bg-background border rounded">↵</kbd>
                  </div>
                </div>

                {/* Chat */}
                <div className="bg-muted/5 border border-muted/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-muted/10 rounded-lg flex items-center justify-center">
                      <span className="text-muted-foreground">💬</span>
                    </div>
                    <h4 className="font-semibold text-foreground">Ask Questions</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Chat with me about music theory, production tips, and more
                  </p>
                </div>
              </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <p className="text-sm text-center text-muted-foreground">
                    💡 <span className="font-medium">Pro tip:</span> Use <kbd className="px-2 py-1 text-[10px] bg-background border rounded mx-1">⌘</kbd><kbd className="px-2 py-1 text-[10px] bg-background border rounded">B</kbd> to show/hide the app anytime!
                  </p>
                </div>

                {/* Additional Keyboard Shortcuts */}
                <div className="mt-6 space-y-3">
                  <h4 className="font-semibold text-foreground text-center">🎹 Keyboard Shortcuts</h4>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between bg-background/50 rounded-lg p-2">
                      <span className="text-muted-foreground">Show/Hide App</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 text-[10px] bg-secondary border rounded">⌘</kbd>
                        <kbd className="px-2 py-1 text-[10px] bg-secondary border rounded">B</kbd>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between bg-background/50 rounded-lg p-2">
                      <span className="text-muted-foreground">Take Screenshot</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 text-[10px] bg-secondary border rounded">⌘</kbd>
                        <kbd className="px-2 py-1 text-[10px] bg-secondary border rounded">↵</kbd>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between bg-background/50 rounded-lg p-2">
                      <span className="text-muted-foreground">Start Recording</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 text-[10px] bg-secondary border rounded">⌘</kbd>
                        <kbd className="px-2 py-1 text-[10px] bg-secondary border rounded">;</kbd>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between bg-background/50 rounded-lg p-2">
                      <span className="text-muted-foreground">New Chat</span>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 text-[10px] bg-secondary border rounded">⌘</kbd>
                        <kbd className="px-2 py-1 text-[10px] bg-secondary border rounded">R</kbd>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Slide 2: Recording Setup Instructions */}
            <div className="w-full flex-shrink-0 h-full min-h-0">
              <div className="h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-foreground mb-2">
                  🎙️ Set up Audio Recording
                </h3>
                <p className="text-muted-foreground">
                  Follow these steps to enable high-quality audio recording with Blackhole 2ch
                </p>
              </div>

              <div className="space-y-4 mb-6">
                {/* Step 1 */}
                <div className="flex gap-4 p-4 bg-secondary/5 border border-secondary/20 rounded-xl">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    1
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download Blackhole 2ch
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Download and install Blackhole 2ch from the internet (it's free!)
                    </p>
                    <div className="bg-background/50 border border-border/20 rounded-lg p-2">
                      <code className="text-xs text-muted-foreground">
                        Search: "Blackhole 2ch download" or visit existential.audio
                      </code>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-4 p-4 bg-secondary/5 border border-secondary/20 rounded-xl">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    2
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Configure Audio MIDI Setup
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Open Audio MIDI Setup (in Applications/Utilities) and create a Multi-Output Device
                    </p>
                    <div className="bg-background/50 border border-border/20 rounded-lg p-2">
                      <code className="text-xs text-muted-foreground">
                        Click "+" → Create Multi-Output Device → Add your speakers/headphones + Blackhole 2ch
                      </code>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4 p-4 bg-secondary/5 border border-secondary/20 rounded-xl">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    3
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                      <Headphones className="w-4 h-4" />
                      Set System Audio Output
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Go to System Settings → Sound → Output and select your Multi-Output Device
                    </p>
                    <div className="bg-background/50 border border-border/20 rounded-lg p-2">
                      <code className="text-xs text-muted-foreground">
                        This allows Rubin to record your computer's audio while you still hear it
                      </code>
                    </div>
                  </div>
                </div>
              </div>

                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <p className="text-sm text-center text-green-600 dark:text-green-400">
                    ✅ <span className="font-medium">Ready to go!</span> Press <kbd className="px-2 py-1 text-[10px] bg-background border rounded mx-1">⌘</kbd><kbd className="px-2 py-1 text-[10px] bg-background border rounded">;</kbd> to start recording anytime
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between p-6 border-t border-border/20">
          <button
            onClick={prevSlide}
            disabled={currentSlide === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              currentSlide === 0
                ? 'text-muted-foreground cursor-not-allowed'
                : 'text-foreground hover:bg-secondary'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          {/* Slide Indicators */}
          <div className="flex gap-2">
            {Array.from({ length: totalSlides }).map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentSlide ? 'bg-primary' : 'bg-muted'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>

          {currentSlide === totalSlides - 1 ? (
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Get Started
            </button>
          ) : (
            <button
              onClick={nextSlide}
              className="flex items-center gap-2 px-4 py-2 text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TutorialBanner; 