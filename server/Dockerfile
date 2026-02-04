FROM node:20-alpine

WORKDIR /app
COPY package.json /app/package.json
RUN npm install --production

COPY server.js /app/server.js
COPY public /app/public

ENV PORT=3000
ENV BASE_PATH=/chat
ENV CHAT_DB_PATH=/app/chat.db
ENV CHAT_CORS_ORIGIN=http://localhost:8080

EXPOSE 3000

CMD ["node", "server.js"]
