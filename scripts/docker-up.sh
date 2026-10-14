#!/usr/bin/env bash

GREEN='\033[0;32m'
RESET='\033[0m'

API_TOKEN_KEY=$(openssl rand -hex 32) && \
echo "API_TOKEN_KEY=${API_TOKEN_KEY}" > .env

docker compose up -d --build && \

echo -e " ${GREEN}✔${RESET} Access the API at:" && \
echo -e " ${GREEN}http://localhost:8000${RESET}" &&

echo -e " ${GREEN}✔${RESET} Use this api token:" && \
echo -e " ${GREEN}${API_TOKEN_KEY}${RESET}"
