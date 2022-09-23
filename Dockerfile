FROM ubuntu:focal
ARG DEBIAN_FRONTEND=noninteractive

RUN apt update && apt install -y wget curl
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
RUN apt install -y nodejs yarn python3 python3-pip 
RUN pip3 install streamlink

RUN mkdir /app
WORKDIR /app

COPY . .

RUN npm install -g npm

RUN \
  cd /app && \
  npm ci

RUN npx playwright install chrome

EXPOSE 8000

RUN chmod +x stream_channel.sh
RUN chmod +x kill_chrome_processes.sh

ENTRYPOINT ["npx", "ts-node", "index.ts"]
