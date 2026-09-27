#!/bin/sh
# Downloads the stock footage the videos use (not committed; public domain).
#   "Okeanos Explorer PR and USVI Dive 8: Psychedelic Medusa", NOAA Office of Ocean Exploration and Research.
#   Public domain (US government work), via Wikimedia Commons.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/footage
curl -L -A "FuciVideo/1.0 (https://www.fuci.family)" -o public/footage/medusa.webm \
  "https://upload.wikimedia.org/wikipedia/commons/9/9f/Okeanos_Explorer_PR_and_USVI_Dive_8-_Psychedelic_Medusa-NOAA-1280x720.webm" \
  || echo "Download failed: get the file from Wikimedia Commons (search 'Psychedelic Medusa NOAA') and save it as public/footage/medusa.webm"
