declare module 'node-record-lpcm16' {
  interface RecordOptions {
    sampleRate?: number;
    channels?: number;
    threshold?: number | string; // Can be number or string like '0.5s'
    endOnSilence?: boolean;
    thresholdStart?: number | string;
    thresholdEnd?: number | string;
    silence?: string; // e.g., '1.0'
    recorder?: 'sox' | 'arecord' | 'rec' | 'aplay' | 'cmd';
    device?: string | null;
    audioType?: 'wav' | 'raw' | 'flac' | 'ogg';
    verbose?: boolean;
    [key: string]: any; // Allow other properties
  }

  interface Recording {
    stream: () => NodeJS.ReadableStream;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    isPaused: () => boolean;
    // Add other methods or properties if known
  }

  function record(options?: RecordOptions): Recording;

  // If there are other exports, declare them too.
  // For example, if there was a `stopAll` function:
  // export function stopAll(): void;

  const exports: {
    record: typeof record;
    // stopAll?: typeof stopAll;
  };
  export = exports;
} 