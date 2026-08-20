FROM node:20-alpine

RUN apk add --no-cache \
    ffmpeg \
    imagemagick \
    git \
    python3 \
    make \
    g++

WORKDIR /root/bot

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

CMD ["node", "index.js"]
