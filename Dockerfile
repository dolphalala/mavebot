FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV XDG_CACHE_HOME=/tmp/.cache

RUN apk add --no-cache fontconfig ttf-dejavu

COPY --chown=node:node package*.json ./
RUN npm install --omit=dev --include=optional \
  && npm install --omit=dev --include=optional --os=linux --libc=musl --cpu=x64 sharp

COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node docs ./docs
COPY --chown=node:node web ./web

USER node
EXPOSE 4188
EXPOSE 4192

CMD ["node", "src/index.mjs"]
