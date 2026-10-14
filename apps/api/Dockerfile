# -------------------------
# Build
# -------------------------
FROM node:22.19.0-alpine AS build

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
RUN ls
COPY tsconfig.json ./
COPY apps/api apps/api

# Not using --immutable until we figure out how to generate yarn.lock for each workspace without running `yarn install` in the root workspace
RUN yarn install

RUN yarn workspaces foreach -Rpt --from @scheduler/api run build


# -------------------------
# Production dependencies
# -------------------------
FROM node:22.19.0-alpine AS prod-deps

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY tsconfig.json ./
COPY apps/api/package.json apps/api/package.json

RUN yarn workspaces focus @scheduler/api --production


# -------------------------
# Runtime
# -------------------------
FROM node:22.19.0-alpine AS runtime

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/apps/api/dist ./dist
COPY package.json ./

EXPOSE 8000

CMD ["node", "dist/index.js"]