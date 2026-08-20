FROM node:20-bullseye

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    imagemagick \
    webp && \
    npm i -g pm2 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /root/bot

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

CMD ["pm2-runtime", "start", "index.js", "--name", "izumi"]
