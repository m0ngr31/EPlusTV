#!/bin/sh

streamlink \
  --http-header "Authorization=${AUTH_TOKEN}" \
  "hlsvariant://${URL}" \
  best \
  --stdout \
  | ffmpeg -i pipe:0 -c copy -hls_base_url "${APP_URL}/channels/${CHANNEL}/" -hls_flags append_list+omit_endlist -hls_segment_filename tmp/${CHANNEL}/%09d.ts tmp/${CHANNEL}/${CHANNEL}.m3u8