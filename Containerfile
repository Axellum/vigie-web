# Vigie Web image: the SvelteKit Node server, run as the unprivileged "node" user.
#   podman build -t vigie-web -f Containerfile .
#   podman run --rm -p 3000:3000 -e VIGIE_API_URL=http://vigie-api:8080 vigie-web
FROM docker.io/library/node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM docker.io/library/node:22-slim
LABEL org.opencontainers.image.title="Vigie Web" \
      org.opencontainers.image.description="Website for the Vigie API. A personal project, shared in case it helps." \
      org.opencontainers.image.source="https://github.com/Axellum/vigie-web" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# The places of the search by name (GeoNames), read by the server on the first search.
COPY --from=build /app/data ./data
USER node
EXPOSE 3000
CMD ["node", "build"]
