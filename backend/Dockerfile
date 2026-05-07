# build
FROM node:22 AS build

WORKDIR /app
COPY package*.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm install \
    --prefer-offline \
    --no-audit \
    --no-progress \
    --max-parallel 4

COPY . .

RUN npm run build

# prod
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm install \
    --prefer-offline \
    --no-audit \
    --no-progress \
    --max-parallel 4 \
    --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 8080

CMD ["node", "dist/main.js"]
