FROM node:22.19.0-alpine AS prod-deps

WORKDIR /usr/src/app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY tsconfig.json ./
COPY packages/core packages/core
COPY tests/integration/ tests/integration/

RUN yarn workspaces focus @scheduler/testing

CMD ["yarn", "test"]