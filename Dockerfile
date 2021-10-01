FROM nikolaik/python-nodejs:python3.9-nodejs14-alpine

RUN mkdir /app
WORKDIR /app

COPY . .

RUN apk update && apk add --no-cache ffmpeg libxslt-dev libxml2-dev build-base libffi-dev
RUN pip install streamlink

RUN \
  cd /app && \
  npm install -g pm2 typescript && \
  npm ci && \
  npm run build

RUN echo '#!/bin/sh\npm2 start pm2.json --no-daemon' > run.sh
RUN echo 'chmod +x run.sh'

EXPOSE 8000
ENTRYPOINT "./run.sh"