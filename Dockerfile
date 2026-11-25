FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG APP_BASE_PATH=""
ENV APP_BASE_PATH=$APP_BASE_PATH
RUN npm install --global pnpm@11.28.5
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN node scripts/package-source.mjs /tmp/quayloom-source.zip && pnpm build

FROM node:24-bookworm-slim AS runtime
LABEL org.opencontainers.image.title="Quayloom" org.opencontainers.image.version="0.3.6" org.opencontainers.image.licenses="AGPL-3.0-only"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210 DATA_DIR=/app/data
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node package.json LICENSE NOTICE.md ./
COPY --chown=node:node LICENSES ./LICENSES
COPY --from=build --chown=node:node /tmp/quayloom-source.zip ./source/quayloom-source.zip
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node --input-type=module -e 'import http from "node:http";const r=http.get({host:"127.0.0.1",port:Number(process.env.PORT||3210),path:(process.env.BASE_PATH||"")+"/api/health",headers:{Host:new URL(process.env.PUBLIC_ORIGIN||"http://localhost:3210").host}},s=>{s.resume();process.exit(s.statusCode===200?0:1)});r.on("error",()=>process.exit(1));r.setTimeout(4000,()=>{r.destroy();process.exit(1)})'
CMD ["node", "server/start.mjs"]
