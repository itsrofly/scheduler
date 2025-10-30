#####################################
# Base stage: setup Corepack, workdir, and manifest
#####################################
FROM node:22.19.0-alpine AS base

# Define working directory
WORKDIR /usr/src/app

COPY src/ ./

RUN npm install -g corepack
RUN yarn install --immutable
RUN yarn build

# Install production dependencies only
RUN yarn workspaces focus --all --production

EXPOSE 3000

CMD ["node", "dist/index.js"]
