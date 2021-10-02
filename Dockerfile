FROM mcr.microsoft.com/playwright:focal

RUN mkdir /app
WORKDIR /app

COPY . .

RUN apt update && apt install ffmpeg -y && pip install streamlink

RUN \
  cd /app && \
  npm ci && \
  npm run build

EXPOSE 8000
ENTRYPOINT ["node", "dist/index.js"]