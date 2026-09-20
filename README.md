# Scheduler

Scheduler is a small HTTP job scheduler for delivering webhooks and
other HTTP messages asynchronously. Jobs are stored in Redis and processed by
BullMQ workers. Each job can be delayed, retried with exponential backoff, and
optionally rate-limited and concurrency-limited by a shared flow-control key.

When a job is delivered, the scheduler sends the configured HTTP request with
these headers:

- `Authorization`: a short-lived JWT signed by the scheduler
- `Message-Id`: the scheduler job ID
- `Attempts-Made`: the number of attempts already made
- `Retry-Delay`: the configured retry delay in milliseconds
- `Rate-Delay`: time spent waiting for flow control, in milliseconds
- `Content-Type: application/json`

## Requirements

- Docker and Docker Compose for the recommended setup
- Or Node.js 22+, Yarn 4, Redis, and Loki for a manual setup

## Run With Docker

The included script generates a random API token and starts the scheduler,
Redis, and Loki in the background:

```sh
chmod +x ./run.sh
./run.sh
```

The API is then available at `http://localhost:8000`. To inspect or stop the
services:

```sh
docker compose logs -f scheduler
docker compose down
```

The Redis and Loki data are stored in the `redis-data` and `loki_data` Docker
volumes.

## Run Manually

Install dependencies and build the TypeScript source:

```sh
corepack enable
yarn install
yarn build
```

Start Redis and Loki separately, then export the same environment variables
used by the application:

```sh
export REDIS_URL=redis://localhost:6379
export LOKI_URL=http://localhost:3100
export API_TOKEN_KEY="$(openssl rand -hex 32)"
```

Start the compiled server:

```sh
yarn start
```

The server listens on port `8000` on all interfaces. For development with
automatic restart, use `yarn dev` after confirming the development script's
entry point matches your local checkout.

## Authentication

`/api/v1/health` and `/api/v1/.well-known/jwks.json` are public. All message
endpoints require the server token generated in `API_TOKEN_KEY`:

```sh
export API_TOKEN_KEY="$(openssl rand -hex 32)"
curl -H "Authorization: Bearer $API_TOKEN_KEY" \
	http://localhost:8000/api/v1/messages
```

Keep the token secret. The scheduler compares it directly with the bearer
token supplied by clients; it is not a user login or OAuth token.

## API Reference

Base URL: `http://localhost:8000/api/v1`

### `GET /health`

Checks whether the scheduler can communicate with Redis.

```sh
curl -i http://localhost:8000/api/v1/health
```

Returns `200` when Redis is ready and `500` otherwise.

### `GET /.well-known/jwks.json`

Returns the public JWK used by receivers to validate JWTs generated for
delivered messages. This endpoint is public and responses are not cached.

```sh
curl http://localhost:8000/api/v1/.well-known/jwks.json
```

### `POST /messages`

Queues an HTTP message and returns the BullMQ job object, including its ID.
The job ID can be used to cancel the message.

```sh
curl -X POST http://localhost:8000/api/v1/messages \
	-H "Authorization: Bearer $API_TOKEN_KEY" \
	-H "Content-Type: application/json" \
	-d '{
		"url": "https://example.com/webhooks/orders",
		"method": "POST",
		"body": {
			"event": "order.created",
			"orderId": "order_123"
		},
		"delay": 30000,
		"retry": 3,
		"retryDelay": 5000
	}'
```

Request fields:

| Field         | Required    | Description                                                                        |
| ------------- | ----------- | ---------------------------------------------------------------------------------- |
| `url`         | Yes         | Valid destination URL.                                                             |
| `method`      | No          | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, or `HEAD`. Defaults to `POST`. |
| `body`        | Conditional | Non-empty JSON object for `POST`, `PUT`, and `PATCH`; omit it for other methods.   |
| `delay`       | No          | Delay before delivery, in milliseconds.                                            |
| `retry`       | No          | Maximum attempts. Defaults to `3`.                                                 |
| `retryDelay`  | No          | Initial exponential backoff delay, in milliseconds. Defaults to 5 minutes.         |
| `flowControl` | No          | Shared rate and concurrency limits for matching jobs.                              |

`flowControl` accepts `key`, `rate`, `period`, and optional `concurrency`.
`rate` is the maximum number of jobs per `period` milliseconds. Jobs with the
same flow-control settings share a worker queue.

Example of a rate-limited job:

```json
{
  "url": "https://example.com/webhooks/orders",
  "body": { "event": "order.created" },
  "flowControl": {
    "key": "orders",
    "rate": 10,
    "period": 1000,
    "concurrency": 2
  }
}
```

### `DELETE /messages/:id`

Cancels a queued job by its UUID. Use the ID returned by `POST /messages`:

```sh
curl -i -X DELETE http://localhost:8000/api/v1/messages/85f8b1bb-7ed8-4f65-9a84-1e5a2c7b4d13 \
	-H "Authorization: Bearer $API_TOKEN_KEY"
```

Returns `204` when the job is cancelled or `404` when it cannot be found.

## Project Scripts

| Command      | Purpose                                            |
| ------------ | -------------------------------------------------- |
| `yarn build` | Compile TypeScript to `dist/`.                     |
| `yarn start` | Run the compiled server.                           |
| `yarn dev`   | Run the development server with automatic restart. |
