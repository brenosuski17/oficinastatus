# Compila o site e monta a imagem com o servidor, que entrega a API e o site na mesma porta.
FROM node:22-bookworm-slim AS site
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY server/migrations ./migrations
COPY server/scripts ./scripts
COPY --from=site /app/client/dist /app/client/dist
RUN mkdir -p data && chown -R node:node data
USER node
EXPOSE 3333
CMD ["sh", "-c", "node src/migrar.js && node src/index.js"]
