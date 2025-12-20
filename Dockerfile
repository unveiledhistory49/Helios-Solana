# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
# We need to copy .env if it exists, but usually env vars are passed in docker run/compose
# COPY .env .env 

# Create volume mount point for database
VOLUME /data
ENV DB_PATH=/data/events.db

EXPOSE 3000

CMD ["node", "dist/index.js", "start"]
