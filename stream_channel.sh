#!/bin/sh

./kill_browser_processes.sh

streamlink \
  --http-header "Authorization=${AUTH_TOKEN}" \
  "hlsvariant://${URL}" \
  --default-stream "720p_alt2,best" \
  --stdout \
  | ffmpeg -i pipe:0 -c copy -hls_base_url "${APP_URL}/channels/${CHANNEL}/" -hls_flags append_list+omit_endlist -hls_segment_filename tmp/eplustv/${CHANNEL}/%09d.ts tmp/eplustv/${CHANNEL}/${CHANNEL}.m3u8