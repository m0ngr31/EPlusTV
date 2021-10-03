FROM mcr.microsoft.com/playwright:focal

RUN \
  npm install -g npm && \
  npx playwright install chrome

RUN pip install streamlink

RUN mkdir /app
WORKDIR /app

COPY . .

RUN \
  cd /app && \
  npm ci

EXPOSE 8000

RUN chmod +x stream_channel.sh
RUN chown pwuser:pwuser /app

USER pwuser

ENTRYPOINT ["npx", "ts-node", "index.ts"]