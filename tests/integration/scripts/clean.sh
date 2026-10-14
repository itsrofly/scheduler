#!/usr/bin/env bash

echo "Cleaning up Integration Test Environment"
set -e
docker stop scheduler-tests-api scheduler-tests-redis > /dev/null 2>&1 || true
docker rm scheduler-tests-api scheduler-tests-redis > /dev/null 2>&1 || true
rm .env > /dev/null 2>&1 || true