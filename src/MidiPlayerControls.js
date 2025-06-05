import React, { useState, useEffect, useRef } from 'react';
import './MidiPlayerControls.css'; // We'll create this CSS file next

// Props:
// - midiFileUrl: URL to the .mid file (e.g., "/midi/chords.mid")

const MidiPlayerControls = ({ midiFileUrl }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  // const [duration, setDuration] = useState(0); // Duration can be useful for a progress bar later
  const playerRef = useRef(null); // To store the MIDIPlayer instance from the external library

  useEffect(() => {
    // Ensure the MIDIPlayer library (from fraigo/javascript-midi-player) is loaded and available globally
    if (typeof MIDIPlayer === 'undefined') {
      setStatus('Error: MIDIPlayer library not found.');
      console.error('MIDIPlayer global object not found. Ensure WebAudioFontPlayer.js, MIDIFile.js, and MIDIPlayer.js are loaded, e.g., in your public/index.html.');
      setIsLoaded(false);
      return;
    }

    setStatus(`Loading: ${midiFileUrl}`);
    // `MIDIPlayer` is expected to be a global constructor from the loaded scripts
    const newPlayer = new MIDIPlayer(midiFileUrl);
    newPlayer.autoReplay = false; // Don't loop automatically
    // newPlayer.debug = true; // Uncomment for verbose logging from the library

    newPlayer.onload = (song) => {
      let durationText = 'N/A';
      // Try to get duration from song object or player instance
      if (song && typeof song.duration === 'number' && isFinite(song.duration)) {
          durationText = song.duration.toFixed(2);
      } else if (newPlayer && typeof newPlayer.duration === 'number' && isFinite(newPlayer.duration)) {
          durationText = newPlayer.duration.toFixed(2);
      }
      // setDuration(parseFloat(durationText) || 0);
      setStatus(`Ready (Duration: ${durationText}s)`);
      setIsLoaded(true);
      setIsPlaying(false);
    };

    newPlayer.onend = () => {
      setStatus('Finished.');
      setIsPlaying(false);
      // Consider resetting to allow play again, or add a replay button
      // For now, play button will be enabled again.
    };

    newPlayer.onerror = (e) => {
      const errorMessage = (e && e.message) ? e.message : (typeof e === 'string' ? e : 'Unknown error');
      setStatus(`Error: ${errorMessage}`);
      console.error('MIDI Player Error:', e);
      setIsLoaded(false);
      setIsPlaying(false);
    };

    playerRef.current = newPlayer;

    // Cleanup function when the component unmounts
    return () => {
      if (playerRef.current) {
        console.log('MidiPlayerControls: Cleaning up player instance.');
        playerRef.current.stop(); // Stop playback
        // The library doesn't seem to have an explicit destroy/cleanup method for the player instance itself.
        // Nullifying the ref helps with garbage collection and prevents stale calls.
        playerRef.current = null;
      }
    };
  }, [midiFileUrl]); // Re-run effect if midiFileUrl changes

  const handlePlay = () => {
    if (playerRef.current && isLoaded && !isPlaying) {
      playerRef.current.play();
      setIsPlaying(true);
      setStatus('Playing...');
    }
  };

  const handlePause = () => {
    if (playerRef.current && isPlaying) {
      playerRef.current.pause();
      setIsPlaying(false);
      setStatus('Paused.');
    }
  };

  const handleStop = () => {
    if (playerRef.current && (isLoaded || isPlaying)) { // Can stop if loaded or playing
      playerRef.current.stop(); // Resets to beginning
      setIsPlaying(false);
      setStatus('Stopped.');
    }
  };

  return (
    <div className="midi-player-controls">
      <div className="midi-buttons">
        <button onClick={handlePlay} disabled={!isLoaded || isPlaying}>Play</button>
        <button onClick={handlePause} disabled={!isLoaded || !isPlaying}>Pause</button>
        <button onClick={handleStop} disabled={!isLoaded}>Stop</button>
      </div>
      <p className="midi-status">Status: {status}</p>
      {/* 
        Future enhancement: Progress bar
        To implement a progress bar, you would use player.ontick = (song, position) => { ... }
        and update a state variable for the current position.
        Then render a <progress value={currentPosition} max={duration} />
      */}
    </div>
  );
};

export default MidiPlayerControls; 