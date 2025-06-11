FROM node:22.16-alpine3.21

ARG PORT=1000

WORKDIR /app
COPY . .
RUN npm install
RUN echo $PORT > port.txt
ENTRYPOINT ["node","server.js"]