FROM alpine:3.16.2

RUN mkdir -p /etc/udhcpc ; echo 'RESOLV_CONF="no"' >> /etc/udhcpc/udhcpc.conf

RUN apk add --update nodejs npm su-exec shadow

RUN rm -rf /var/cache/apk/*

RUN mkdir /app
WORKDIR /app

COPY . .

RUN \
  cd /app && \
  npm ci

RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
