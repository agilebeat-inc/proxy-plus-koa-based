# -------- Stage 1: Build --------
FROM node:24 AS builder

# Install git
RUN apt-get update && apt-get install -y git curl sudo

# Set working directory
WORKDIR /app

# Copy only dependency manifests first (better layer caching)
COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

# Copy the rest of the source after dependencies are installed
COPY . .

RUN npm run build:all

# -------- Stage 2: Serve with Koa --------
FROM node:24-slim

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY --from=builder /app/package.json /app/package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev --no-audit --no-fund

# Copy the dist folder from the builder stage
COPY --from=builder /app/dist ./

COPY Readme.md /README.md

EXPOSE 3000

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
