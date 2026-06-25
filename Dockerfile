FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV XDG_CACHE_HOME=/tmp/.cache

RUN apk add --no-cache fontconfig ttf-dejavu

COPY --chown=node:node package*.json ./
RUN npm install --omit=dev

COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node docs ./docs

USER node
EXPOSE 4188
EXPOSE 4190

CMD ["node", "src/index.mjs"]
