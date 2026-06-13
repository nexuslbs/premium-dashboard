# syntax=docker/dockerfile:1
# Stage 1: Build frontend + compile backend
FROM node:22-alpine AS builder
WORKDIR /build

# Copy only package files first for layer caching
COPY package.json tsconfig.json tsconfig.server.json build.cjs vite.config.ts ./
COPY server/ ./server/
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./

# Install dependencies
RUN npm install

# Build frontend (Vite)
RUN npm run build:frontend

# Compile backend TypeScript
RUN npm run build:server

# Stage 2: Production image
FROM nginx:alpine

# Install Node.js for API server
RUN apk add --no-cache nodejs docker-cli sqlite

# Copy frontend build to nginx
COPY --from=builder /build/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled backend
COPY --from=builder /build/server-dist /app/server
COPY --from=builder /build/package.json /app/package.json
COPY --from=builder /build/node_modules /app/node_modules

# Copy startup script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
