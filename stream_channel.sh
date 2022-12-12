#!/bin/sh

cond() {
  if [ "${1}" ] ; then
    echo "-map ${1}"
  else
    echo ""
  fi
}

ffmpeg \
  -user_agent "${USER_AGENT}" \
  -threads 1 \
  -headers "${AUTH_TOKEN}" \
  -protocol_whitelist http,https,tcp,tls,crypto \
  -rtbufsize 100M \
  -i "${URL}" \
  $(cond "$VIDEO_MAP") \
  -c:v copy \
  $(cond "$AUDIO_MAP") \
  -c:a copy \
  -f 'hls' \
  -hls_segment_type mpegts \
  -hls_base_url "${APP_URL}/channels/${CHANNEL}/" \
  -hls_flags append_list+omit_endlist \
  -hls_segment_filename tmp/eplustv/${CHANNEL}/%09d.ts tmp/eplustv/${CHANNEL}/${CHANNEL}.m3u8
