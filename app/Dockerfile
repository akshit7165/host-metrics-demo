FROM node:24-alpine

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

RUN npm i --production

COPY server.js ./

EXPOSE 3000

CMD ["node", "server.js"]