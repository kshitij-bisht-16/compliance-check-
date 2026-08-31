# DFI compliance prototype — container image for Fly.io / Render / any Docker host.
FROM node:22-slim

WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package*.json ./
RUN npm install --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
ENV PORT=3300
EXPOSE 3300

CMD ["node", "server/index.js"]
