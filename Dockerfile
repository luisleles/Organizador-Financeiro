# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Instala as dependências isoladamente para aproveitar o cache de camadas do Docker.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# Gera o client do Prisma e compila a aplicação Next.js.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Imagem final, enxuta, sem as ferramentas de build.
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN useradd --uid 1001 --no-create-home --shell /usr/sbin/nologin nextjs
COPY --from=builder --chown=nextjs:nextjs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nextjs /app/.next ./.next
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nextjs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nextjs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nextjs /app/package.json ./package.json
USER nextjs
EXPOSE 3000
CMD ["npm", "start"]
