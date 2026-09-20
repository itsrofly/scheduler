# -------------------------
# Build
# -------------------------
FROM node:22.19.0-alpine AS build

WORKDIR /usr/src/app

RUN corepack enable

# Copy dependency files first for Docker cache
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ .yarn/

RUN yarn install --immutable

# Then copy the application
COPY . .

RUN yarn build


# -------------------------
# Production dependencies
# -------------------------
FROM node:22.19.0-alpine AS prod-deps

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ .yarn/

RUN yarn workspaces focus --all --production


# -------------------------
# Runtime
# -------------------------
FROM node:22.19.0-alpine AS runtime

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package.json ./

EXPOSE 8000

CMD ["node", "dist/index.js"]