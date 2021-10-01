## Handling slate

Ideally you don't want to have to spin up ffmpeg to start slicing the slates into HLS streams. So I've sliced the slates ahead of time with this command:

```bash
ffmpeg -i slate/mp4/soon.mp4 -c:a copy -c:v copy -hls_flags omit_endlist -hls_playlist_type vod -hls_segment_filename slate/soon/%09d.ts slate/soon/soon.m3u8
ffmpeg -i slate/mp4/starting.mp4 -c:a copy -c:v copy -hls_flags omit_endlist -hls_playlist_type vod -hls_segment_filename slate/starting/%09d.ts slate/starting/starting.m3u8
```

This generates the ts files and m3u8 that the slate response handler is based off of. The `SlateStream` class generates a m3u8 on the fly and is able to loop through the ts files without ffmpeg currently running.