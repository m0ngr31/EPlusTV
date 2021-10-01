FROM nikolaik/python-nodejs:python3.9-nodejs14

RUN mkdir /app
WORKDIR /app

COPY . .

RUN apt update && apt install ffmpeg -y && pip install streamlink

RUN \
  cd /app && \
  npm install -g npm && \
  npm ci && \
  npm run build

EXPOSE 8000
ENTRYPOINT ["node", "dist/index.js"]