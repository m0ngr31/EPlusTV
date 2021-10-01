FROM nikolaik/python-nodejs:python3.9-nodejs14-alpine

RUN mkdir /app
WORKDIR /app

COPY . .

RUN apk update && apk add --no-cache ffmpeg libxslt-dev libxml2-dev build-base libffi-dev
RUN pip install streamlink

RUN \
  cd /app && \
  npm install -g pm2 && \
  npm ci && \
  npm run build && \
  chmod +x pm2.sh

EXPOSE 8000
ENTRYPOINT "./pm2.sh"