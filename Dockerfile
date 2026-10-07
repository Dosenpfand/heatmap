FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV HOST=0.0.0.0 PORT=8080
COPY package.json server.js ./
COPY --from=build /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
