FROM mcr.microsoft.com/playwright:v1.26.0-jammy
ARG x=y
RUN apt-get update && apt-get install -y wget python3 python3-pip

RUN pip3 install streamlink

RUN mkdir /app
WORKDIR /app

COPY . .

RUN npm install -g npm

RUN \
  cd /app && \
  npm ci

RUN npx playwright install chromium

EXPOSE 8000

RUN chmod +x stream_channel.sh
RUN chmod +x kill_chrome_processes.sh

RUN chown pwuser:pwuser /app

USER pwuser

ENTRYPOINT ["npx", "ts-node", "index.ts"]