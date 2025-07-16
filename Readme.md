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
  '[{"name": "analytics", "route": "/analytics(.*)", "target": "http://<some webapp address>:3000"}]'

## License
MIT
