FROM mcr.microsoft.com/playwright:focal

RUN \
  npm install -g npm && \
  npx playwright install chrome

RUN apt install python3-pip -y && \
  pip install streamlink

RUN mkdir /app
WORKDIR /app

COPY . .

RUN \
  cd /app && \
  npm ci

EXPOSE 8000

RUN chmod +x stream_channel.sh
RUN chmod +x kill_chrome_processes.sh

RUN chown pwuser:pwuser /app

USER pwuser

ENTRYPOINT ["npx", "ts-node", "index.ts"]