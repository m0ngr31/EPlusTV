FROM alpine:3.16.2

RUN mkdir -p /etc/udhcpc ; echo 'RESOLV_CONF="no"' >> /etc/udhcpc/udhcpc.conf

RUN apk update && apk add nodejs npm ffmpeg

RUN pw="$(head -c 20 /dev/urandom | base64 | head -c 10)"; ( echo "$pw"; echo "$pw" ) | adduser abc

RUN mkdir /app
WORKDIR /app

COPY . .

RUN \
  cd /app && \
  npm ci

EXPOSE 8000

RUN chmod +x stream_channel.sh
RUN chown abc:abc /app

USER abc

ENTRYPOINT ["npx", "ts-node", "index.ts"]