FROM mcr.microsoft.com/playwright:v1.15.0-focal

RUN pip install streamlink

RUN mkdir /app
WORKDIR /app

COPY . .

RUN apt-get update && apt-get install wget -y

RUN npm install -g npm@^7

RUN \
  cd /app && \
  npm ci

RUN npx playwright install chrome

EXPOSE 8000

RUN chmod +x stream_channel.sh
RUN chmod +x kill_chrome_processes.sh

RUN chown pwuser:pwuser /app

USER pwuser

ENTRYPOINT ["npx", "ts-node", "index.ts"]