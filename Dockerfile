FROM alpine:3.16.2

RUN mkdir -p /etc/udhcpc ; echo 'RESOLV_CONF="no"' >> /etc/udhcpc/udhcpc.conf

RUN apk add --update unzip build-base curl nasm nodejs npm \
  zlib-dev openssl-dev yasm-dev lame-dev libogg-dev x264-dev libvpx-dev libvorbis-dev x265-dev freetype-dev libass-dev libwebp-dev rtmpdump-dev libtheora-dev opus-dev

RUN  DIR=$(mktemp -d) && cd ${DIR}

RUN curl -L -o ffmpeg.zip https://github.com/jjustman/ffmpeg-hls-pts-discontinuity-reclock/archive/refs/heads/master.zip && \
  unzip ffmpeg.zip && \
  cd ffmpeg-hls-pts-discontinuity-reclock-master && \
  ./configure \
  --enable-version3 --enable-gpl --enable-nonfree --enable-small --enable-libmp3lame --enable-libx264 --enable-libx265 --enable-libvpx --enable-libtheora --enable-libvorbis --enable-libopus --enable-libass --enable-libwebp --enable-librtmp --enable-postproc --enable-avresample --enable-libfreetype --enable-openssl --disable-debug && \
  make && \
  make install && \
  make distclean

RUN ffmpeg -hide_banner -encoders
RUN which ffmpeg

RUN  rm -rf ${DIR} && \
  apk del build-base curl unzip x264 openssl nasm && rm -rf /var/cache/apk/*

# RUN apk update && apk add nodejs npm ffmpeg

RUN pw="$(head -c 20 /dev/urandom | base64 | head -c 10)"; ( echo "$pw"; echo "$pw" ) | adduser abc

RUN mkdir /app
WORKDIR /app

COPY . .

RUN \
  cd /app && \
  npm ci

RUN cp /usr/local/bin/ff* /usr/bin

EXPOSE 8000

RUN chmod +x stream_channel.sh
RUN chown abc:abc /app

USER abc

ENTRYPOINT ["npx", "ts-node", "index.ts"]