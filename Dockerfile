FROM mcr.microsoft.com/playwright:focal

RUN mkdir /app
WORKDIR /app

COPY . .

RUN pip install streamlink

RUN \
  cd /app && \
  npm install -g npm && \
  npm ci

EXPOSE 8000
ENTRYPOINT ["npx", "ts-node", "index.ts"]