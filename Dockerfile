FROM mcr.microsoft.com/playwright:v1.25.0-jammy

RUN apt-get update && apt-get install -y wget psmisc python3 python3-pip nano

RUN pip3 install streamlink

RUN mkdir /app
WORKDIR /app

COPY . .

RUN npm install -g npm

RUN \
  cd /app && \
  npm ci

RUN npx playwright install firefox

EXPOSE 8000

RUN chmod +x stream_channel.sh
RUN chmod +x kill_browser_processes.sh

RUN chown pwuser:pwuser /app

USER pwuser

ENTRYPOINT ["npx", "ts-node", "index.ts"]