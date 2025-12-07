FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first
COPY package.json yarn.lock ./

# Copy prisma schema before install (needed for postinstall generation)
COPY prisma ./prisma/

RUN yarn install --frozen-lockfile

# Copy source files
COPY . .

# Regenerate Prisma Client for the correct platform
RUN yarn prisma generate

RUN yarn build

CMD ["node", "dist/main.js"]
