#!/usr/bin/env bash

API_TOKEN_KEY=$(openssl rand -hex 32) && \
echo "API_TOKEN_KEY=${API_TOKEN_KEY}" > .env

docker compose up --build --exit-code-from tests