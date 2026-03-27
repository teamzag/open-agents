#!/bin/bash
# Template: Narrated Screencast
# Purpose: Record a browser demo with a synchronized VTT voiceover script
# Usage: ./narrated-screencast.sh <url> [output-dir]
#
# Outputs:
#   - demo.webm:  Silent screencast video
#   - demo.vtt:   Timestamped voiceover script (WebVTT)
#
# The VTT file can be used as HTML5 subtitles, fed to TTS, or read as docs.
# Customize the narration cues below for your specific demo.

set -euo pipefail

TARGET_URL="${1:?Usage: $0 <url> [output-dir]}"
OUTPUT_DIR="${2:-.}"

mkdir -p "$OUTPUT_DIR"

VIDEO_PATH="$OUTPUT_DIR/demo.webm"
VTT_PATH="$OUTPUT_DIR/demo.vtt"

# --- Recording infrastructure ---

RECORDING_START=""
PENDING_CUE=""
PENDING_START=""

init_narration() {
  RECORDING_START=$(date +%s%3N)
  echo "WEBVTT" > "$VTT_PATH"
}

# Compute elapsed time from recording start, formatted as MM:SS.mmm
_elapsed() {
  local now=$(date +%s%3N)
  local elapsed_ms=$(( now - RECORDING_START ))
  local secs=$(( elapsed_ms / 1000 ))
  local ms=$(( elapsed_ms % 1000 ))
  local mins=$(( secs / 60 ))
  local s=$(( secs % 60 ))
  printf "%02d:%02d.%03d" $mins $s $ms
}

# Write a narration cue. Call BEFORE the action it describes.
# The previous cue's end time is set to this cue's start time.
# Call with empty string to flush the final cue.
narrate() {
  local timestamp=$(_elapsed)

  if [ -n "$PENDING_CUE" ]; then
    printf "\n%s --> %s\n%s\n" "$PENDING_START" "$timestamp" "$PENDING_CUE" >> "$VTT_PATH"
  fi

  PENDING_START="$timestamp"
  PENDING_CUE="$1"
}

cleanup() {
  agent-browser record stop 2>/dev/null || true
  agent-browser close 2>/dev/null || true
}
trap cleanup EXIT

# --- Demo script (customize below) ---

echo "Starting narrated recording: $TARGET_URL"

init_narration
agent-browser record start "$VIDEO_PATH"

# Scene 1: Open the page
narrate "Opening the application to walk through the demo."
agent-browser open "$TARGET_URL"
agent-browser wait --load networkidle
agent-browser wait 2000

# Scene 2: Explore the page
narrate "Here's the main page. Let me take a look at what's available."
agent-browser snapshot -i
agent-browser wait 1500

# Scene 3: Interact (customize these actions for your demo)
# narrate "Clicking on the first call-to-action to show the next step."
# agent-browser click @e1
# agent-browser wait --load networkidle
# agent-browser wait 1500

# narrate "Filling in the form with sample data."
# agent-browser fill @e3 "Demo input"
# agent-browser wait 1000

# narrate "Submitting to show the result."
# agent-browser click @e5
# agent-browser wait --load networkidle
# agent-browser wait 2000

# Scene N: Wrap up
narrate "That's the end of the demo."
agent-browser wait 2000

# Flush final cue and stop
narrate ""
agent-browser record stop

echo ""
echo "Narrated recording complete:"
echo "  Video:  $VIDEO_PATH"
echo "  Script: $VTT_PATH"
echo ""
echo "Preview the VTT:"
cat "$VTT_PATH"
