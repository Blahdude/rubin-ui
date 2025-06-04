export interface AudioResult {
  text: string;
  timestamp: number;
}

export interface GlobalRecording {
  id: string;
  path: string;
  timestamp: Date;
}

export interface GeneratedAudioClip {
  id: string;
  path: string; // Path to the generated audio
  originalPath?: string; // Path of the original audio if it's a continuation
  timestamp: Date;
  bpm: string | number;
  key: string;
  displayName?: string; // Name to be displayed in the UI, derived from sanitized prompt or original filename
  originalPromptText?: string; // The full, original prompt text if generated from text
} 