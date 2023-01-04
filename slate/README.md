## Handling slate

I've sliced the slate ahead of time with this command:

```bash
ffmpeg -f lavfi -i anullsrc -framerate .25 -i slate/static/static.png -c:v libx264 -r 30 -pix_fmt yuv420p -c:a aac -shortest -hls_flags omit_endlist -hls_playlist_type event -hls_segment_filename slate/static/%09d.ts slate/static/static.m3u8
```

This generates the ts files and m3u8 that the slate response handler is based off of. The `getSlate` function generates a m3u8 on the fly and is able to loop through the ts files without ffmpeg currently running.