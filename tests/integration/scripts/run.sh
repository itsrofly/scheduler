#!/usr/bin/env bash

# -------------------------
# Pull Redis
# -------------------------
docker pull redis:latest

# -------------------------
# Build Scheduler API image
# -------------------------
docker build -t scheduler/api -f ../../apps/api/Dockerfile ../../

# -------------------------
# Run Redis
# -------------------------

docker run -d --name scheduler-tests-redis -p 0:6379 redis
PORT_REDIS=$(docker port scheduler-tests-redis 6379 | cut -d: -f2)
REDIS_URL="redis://localhost:${PORT_REDIS}"

# -------------------------
# Run Scheduler
# -------------------------

API_TOKEN_KEY=$(openssl rand -hex 32)

docker run -d --name scheduler-tests-api -p 0:8000 -e API_TOKEN_KEY=${API_TOKEN_KEY} -e REDIS_URL=${REDIS_URL} scheduler/api 

PORT_API=$(docker port scheduler-tests-api 8000 | cut -d: -f2)


echo SCHEDULER_URL="http://localhost:${PORT_API}" > .env
echo SCHEDULER_TOKEN_KEY=${API_TOKEN_KEY} >> .env 
