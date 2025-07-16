# -------- Stage 1: Build --------
FROM node:24 AS builder

# Install git
RUN apt-get update && apt-get install -y git curl sudo

# Set working directory
WORKDIR /app

# Clone the GitHub repository
COPY . .

RUN yarn install && yarn build

# -------- Stage 2: Serve with Koa --------
FROM node:24-slim

WORKDIR /app

# Copy package.json and yarn.lock first for better layer caching
COPY --from=builder /app/package.json /app/yarn.lock ./

# Install only production dependencies
RUN yarn install --production

# Copy the dist folder from the builder stage
COPY --from=builder /app/dist ./

COPY Readme.md /README.md

EXPOSE 3000

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]