FROM mcr.microsoft.com/playwright:focal

RUN mkdir /app
WORKDIR /app

COPY . .

RUN apt update && apt install ffmpeg -y && pip install streamlink

RUN \
  cd /app && \
  npm ci

EXPOSE 8000
ENTRYPOINT ["npx", "ts-node", "index.ts"]