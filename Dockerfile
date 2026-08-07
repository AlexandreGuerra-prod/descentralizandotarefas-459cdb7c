FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
# Sem NITRO_PRESET o Nitro gera um worker Cloudflare em .output/ — que este
# contêiner Node não sabe executar. O preset node-server produz um servidor
# HTTP autocontido em .output/server/index.mjs.
ENV NITRO_PRESET=node-server
RUN bun install --frozen-lockfile && bun run build

FROM node:20-alpine
WORKDIR /app
# O preset node-server já embute as dependências em .output/server/_libs,
# então não é preciso copiar node_modules nem package.json.
COPY --from=build /app/.output ./.output
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
