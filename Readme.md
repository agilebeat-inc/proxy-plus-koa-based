# Proxy Plus (Koa-based)

This project is a proxy server built using [Koa](https://koajs.com/). It is designed to forward, filter, and log HTTP and WebSocket requests between clients and backend services, providing a flexible middleware architecture for custom logic and integrations.

WebSocket support is included, which is especially useful when proxying the Neo4j server or other services that require real-time, bidirectional communication.

## Features
- HTTP and WebSocket proxying with Koa
- Middleware support for logging, user context, and policy enforcement
- Easily extendable for custom connectors and routes

## Usage
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the proxy server:
   ```bash
   npm start
   ```
3. Configure your client or application to send requests through this proxy.

## Project Structure
- `src/app.ts` - Main application entry point
- `src/middleware/` - Koa middleware (context, logger, policy, user)
- `src/routes/` - Route handlers
- `src/utils/` - Utility functions
- `src/connectors/` - Example connectors

## Environment Variables

- `DYNAMIC_ROUTES`: JSON string defining dynamic proxy routes. Example:
  `[{"name": "analytics", "route": "/analytics(.*)", "target": "http://<some webapp address>:3000"}]`

- `IGNORE_URLS_FOR_LOGGING_BY_PREFIX`: Comma-separated list or JSON array of URL path prefixes to ignore in request logging. Useful for suppressing logs for health    checks, static assets, or other non-essential endpoints. Default: `['/_app', '/health', '/metrics', '/favicon.ico', '/robots.txt', '/static', '/public']`

- `WS_TARGET_URL`: is an environment variable that specifies the default WebSocket backend URL to which the proxy will forward WebSocket connections. If not set, it defaults to `ws://10.82.1.228:7687/`. This allows you to easily change the WebSocket target without modifying the code. Set it in your environment to point to your desired WebSocket server.

## TODO

- Websocket forwarding is implemented for only one websocket. Add multiple websocket.

## License
MIT

