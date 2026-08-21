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
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# Aplicador de migrations. Roda uma vez, antes do app subir, e some. O CLI do Prisma tem
# uma árvore de dependências própria que não cabe numa imagem de runtime enxuta — então ele
# vive aqui, num estágio separado, em vez de contaminar a imagem final.
FROM base AS migrator
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY package.json ./
CMD ["npx", "prisma", "migrate", "deploy"]

# Imagem final. O `standalone` do Next traz só os módulos que o servidor usa de fato, então
# aqui não entra nem o node_modules completo nem nada de build.
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN useradd --uid 1001 --create-home --shell /usr/sbin/nologin nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
# O client gerado do Prisma; o CLI e as migrations ficam no estágio `migrator`.
COPY --from=builder --chown=nextjs:nextjs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
