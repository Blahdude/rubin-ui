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
  originalPath: string; // Path to the original audio it was based on
  timestamp: Date;
  bpm: string | number;
  key: string;
} 