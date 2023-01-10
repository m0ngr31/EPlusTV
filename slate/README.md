## Handling slate

I've sliced the slate ahead of time with this command:

```bash
ffmpeg -i slate/starting.mp4 -c:a copy -c:v copy -hls_flags omit_endlist -hls_playlist_type event -hls_segment_filename slate/starting/%09d.ts slate/starting/starting.m3u8
```