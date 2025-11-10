FROM node:20-bookworm-slim

WORKDIR /app

COPY . .

RUN npm install 

EXPOSE 9575

ENTRYPOINT ["npm", "start"]

