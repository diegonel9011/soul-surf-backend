# ── Stage 1: dependencias ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: build (genera Prisma client) ────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

# ── Stage 3: imagen final ─────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copiar solo lo necesario
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY src    ./src
COPY prisma ./prisma
COPY package.json ./

EXPOSE 3001

# migrate deploy + seed de price rules + arrancar servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
