import sys
import json

# Try to print Python version and executable path for diagnostics early on
# This will go to stdout, hoping it gets captured before any import error kills the script
# or if the import error itself prevents stdout.
print(json.dumps({
    "diagnostic_python_executable": sys.executable,
    "diagnostic_python_version": sys.version,
    "diagnostic_sys_path": sys.path
}), file=sys.stderr) # Print to stderr to ensure it's captured if stdout is an issue with errors

try:
    import librosa
    import numpy as np
except ImportError as e:
    # If import fails, print detailed diagnostic info to stderr and exit
    error_output = {
        "error": f"ModuleNotFoundError: {str(e)}",
        "python_executable": sys.executable,
        "python_version": sys.version,
        "sys_path": sys.path
    }
    print(json.dumps(error_output), file=sys.stderr)
    sys.exit(1) # Exit with an error code

# Krumhansl-Schmuckler key profiles
KS_PROFILES = {
    'major': np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]),
    'minor': np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
}
NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def estimate_key_and_mode(y, sr):
    chromagram = librosa.feature.chroma_stft(y=y, sr=sr)
    # Sum chroma features across time
    chroma_vector_sum = np.sum(chromagram, axis=1)
    
    # Avoid issues with silence or very short audio
    if np.sum(chroma_vector_sum) == 0:
        return "N/A"

    # Normalize the chroma vector (important for correlation)
    chroma_vector_normalized = chroma_vector_sum / np.sum(chroma_vector_sum)

    max_corr = -np.inf
    best_key_idx = 0
    best_mode = ''

    for mode in ['major', 'minor']:
        profile = KS_PROFILES[mode]
        for i in range(12): # Iterate over 12 possible root notes
            # Roll the profile to match the current root note
            rolled_profile = np.roll(profile, i)
            # Normalize the rolled profile
            rolled_profile_normalized = rolled_profile / np.sum(rolled_profile)
            
            # Calculate Pearson correlation coefficient
            correlation = np.corrcoef(chroma_vector_normalized, rolled_profile_normalized)[0, 1]
            
            if correlation > max_corr:
                max_corr = correlation
                best_key_idx = i
                best_mode = mode
    
    if max_corr == -np.inf or np.isnan(max_corr): # Check for NaN as well if correlations are problematic
        return "N/A" # Could not determine key

    return f"{NOTES[best_key_idx]} {best_mode}"

def main(file_path):
    try:
        y, sr = librosa.load(file_path, sr=None) # Load with original sample rate
        
        # Estimate BPM
        # Ensure audio is long enough for beat tracking
        if len(y) / sr < 2.0: # If less than 2 seconds, BPM might be unreliable or fail
             bpm = "N/A" # Or some default, or skip
        else:
            # tempo, _ = librosa.beat.beat_track(y=y, sr=sr, units='bpm') # Specify units
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr) # Default unit is BPM
            bpm = round(float(tempo)) # tempo can be an array, ensure it's a scalar

        # Estimate Key and Mode
        estimated_key = estimate_key_and_mode(y, sr)
        
        output = {
            "bpm": bpm,
            "key": estimated_key
        }
        print(json.dumps(output))
        
    except Exception as e:
        error_output = {"error": str(e), "file_path": file_path}
        print(json.dumps(error_output), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        audio_file_path = sys.argv[1]
        main(audio_file_path)
    else:
        error_output = {"error": "No audio file path provided."}
        print(json.dumps(error_output), file=sys.stderr)
        sys.exit(1) 