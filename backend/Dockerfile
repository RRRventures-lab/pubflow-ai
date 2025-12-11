# PubFlow AI Backend Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for bcrypt and other native modules
RUN apk add --no-cache python3 make g++

# Install ALL dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dependencies for bcrypt
RUN apk add --no-cache python3 make g++

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Set environment
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "dist/index.js"]
