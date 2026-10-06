# Build from the repo root: docker build -f server/Dockerfile -t nim-server .
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci -w @nim/server --include-workspace-root
COPY shared/ shared/
COPY server/ server/
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["npx", "tsx", "server/src/index.ts"]
