#####################################
# Base stage: setup Corepack, workdir, and manifest
#####################################
FROM node:20-alpine AS base

# Enable Corepack and activate specified Yarn version
RUN set -ex \
    && apk add --no-cache bash python3 \
    && node -v \
    && npm -v \
    && which corepack || true \
    && corepack --version || true \
    && corepack enable \
    && corepack prepare yarn@4.9.2 --activate \
    && corepack --version \
    && yarn -v

# Define working directory
WORKDIR /usr/src/app

# Copy Yarn config and project manifest
COPY src/.yarnrc.yml src/package.json src/yarn.lock ./

#####################################
# Stage 1: Install dependencies (dev + prod)
#####################################
FROM base AS deps

RUN yarn install --immutable

#####################################
# Stage 2: Build the application
#####################################
FROM deps AS builder

# Copy application source and build
COPY src/ ./
RUN yarn build

#####################################
# Stage 3: Production image
#####################################
FROM base AS runner

# Install production dependencies only
RUN yarn workspaces focus --all --production

# Copy build output
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
