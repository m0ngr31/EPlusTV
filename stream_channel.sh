#!/bin/sh

ffmpeg \
  -user_agent "${USER_AGENT}" \
  -headers "Authorization: ${AUTH_TOKEN}" \
  -protocol_whitelist http,https,tcp,tls,crypto \
  -rtbufsize 100M \
  -i "${URL}" \
  -map ${VIDEO_MAP} \
  -c:v copy \
  -map ${AUDIO_MAP} \
  -c:a copy \
  -f 'hls' \
  -hls_time 6 \
  -hls_segment_type mpegts \
  -hls_base_url "${APP_URL}/channels/${CHANNEL}/" \
  -hls_flags append_list+omit_endlist \
  -hls_segment_filename tmp/eplustv/${CHANNEL}/%09d.ts tmp/eplustv/${CHANNEL}/${CHANNEL}.m3u8