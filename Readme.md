# Proxy Plus (Koa-based)

This project is a proxy server built using [Koa](https://koajs.com/). It is designed to forward, filter, and log HTTP and WebSocket requests between clients and backend services, providing a flexible middleware architecture for custom logic and integrations.

WebSocket support is included, which is especially useful when proxying the Neo4j server or other services that require real-time, bidirectional communication.

---

## Features

- HTTP and WebSocket proxying with Koa
- Middleware support for logging, user context, and policy enforcement
- Easily extendable for custom connectors and routes
- Dynamic routing and static file serving
- Conditional redirects based on request headers

---

## Usage

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the proxy server:**
   ```bash
   npm start
   ```

3. **Configure your client or application to send requests through this proxy.**

---

## Project Structure

- `src/app.ts` - Main application entry point
- `src/middleware/` - Koa middleware (context, logger, policy, user)
- `src/routes/` - Route handlers
- `src/utils/` - Utility functions
- `src/connectors/` - Example connectors
- `src/config/defaultEnv.ts` - Default dynamic route configuration

---

## Environment Variables

- **`DYNAMIC_ROUTES`**:
  JSON string for dynamic route configuration (`DynamicRoute[]`).

  If `DYNAMIC_ROUTES` is not set, the app uses `DEFAULT_DYNAMIC_ROUTES` from `src/config/defaultEnv.ts`.

  Parsing and interpolation behavior:
  - Parsed once at startup.
  - Invalid JSON falls back to an empty route list.
  - Any string value can include placeholders like `{ENV_NAME}`.
  - Placeholders are resolved recursively across all nested route fields.
  - Special placeholders:
    - `{DEFAULT_DYNAMIC_ROUTES_INVENTORY_PREFIX}` -> value of `DYNAMIC_ROUTES_INVENTORY_PREFIX`
    - `{MCP_NEO4J_AUTH_HEADER}` -> value of `MCP_NEO4J_AUTH_HEADER`
  - Any other placeholder uses `process.env[PLACEHOLDER]`.
  - Unknown placeholders are left unchanged.

  Route registration precedence (per route object):
  1. If `redirect` exists, register a redirect route.
  2. Else if `splashPage` is `true`, register the services inventory page route.
  3. Else if `relativeFilePath` exists, register a static file route.
  4. Else if `target` exists, register a proxied route.
  5. Otherwise the route is ignored.

  Supported `DynamicRoute` fields:

  | Field | Type | Behavior |
  | --- | --- | --- |
  | `name` | `string` | Display/logging name; also used for services page button text. |
  | `route` | `string` | Koa route path/pattern (for example `/analytics/(.*)`). |
  | `target` | `string` | Upstream target URL for proxied HTTP routes. |
  | `rewritebase` | `boolean` | For HTML responses, injects `<base href="...">` and patches CSP `base-uri`. |
  | `redirect` | `string \| { default, conditionalRedirects[] }` | Redirects request instead of proxying; can be header-conditional. |
  | `conditionalReturns` | `Array<{ condition, headerName, includes, return }>` | Returns a local JSON payload when header condition matches. |
  | `subpathReturns` | `Array<{ path, return }>` | Returns a local JSON payload when `ctx.path` starts with `path`. |
  | `requestHeaderRules` | `RequestHeaderRule[]` | Rewrites outbound proxy request headers before forwarding. |
  | `splashPage` | `boolean` | Registers the services inventory HTML page (`DYNAMIC_ROUTES_INVENTORY_PREFIX`). |
  | `relativeFilePath` | `string` | Serves local file content for the route. |
  | `params` | `string` | Query/path suffix appended to the services page button link. |
  | `policyName` | `string` | Policy metadata used by policy mapping/execution. |
  | `connectorName` | `string` | Connector plugin metadata used by connector mapping. |
  | `icon` | `string` | Inline SVG/HTML snippet rendered in the services page button. |
  | `doNotRenderButton` | `boolean` | Excludes route from services inventory button rendering. |
  | `hideIfNoAccess` | `boolean` | If unauthorized, hides button instead of rendering a disabled one. |
  | `websocket.handler` | `'neo4j-bolt' \| 'attu'` | Enables WebSocket handling for matching route path. |
  | `websocket.target` | `string` | Upstream WebSocket target URL. |
  | `websocket.authHeader` | `string` | Optional auth header used by `attu` WebSocket handler. |
  | `websocket.preserveQueryString` | `boolean` | When `true`, forwards query string in `attu` WebSocket handler. |

  Return-key based responses (`redirect.conditionalRedirects[].return`, `conditionalReturns[].return`, `subpathReturns[].return`) currently support:
  - `NEO4J_BROWSER_MANIFEST`

  `requestHeaderRules` details:
  - `operation: "create"` -> sets header only if missing.
  - `operation: "update"` -> always sets/replaces header.
  - `operation: "patch"` -> regex replace on existing header value.
  - `operation: "delete"` -> removes header.
  - Optional `when` supports header conditions using `includes`, `equals`, `matches` (+ regex `flags`), or `exists`.

- **`IGNORE_URLS_FOR_LOGGING_BY_PREFIX`**:  
  Comma-separated list or JSON array of URL path prefixes to ignore in request logging. Useful for suppressing logs for health checks, static assets, or other non-essential endpoints.  
  Default: `['/_app', '/health', '/metrics', '/favicon.ico', '/robots.txt', '/static', '/public']`

- **`WS_TARGET_URL`**:  
  Specifies the default WebSocket backend URL to which the proxy will forward WebSocket connections.  
  If not set, it defaults to `ws://10.82.1.228:7687/`.  
  Set it in your environment to point to your desired WebSocket server.

- **`LOG_LEVEL=debug`**:  
  Turn on debug statements in your app.

---

## Examples Using `DEFAULT_DYNAMIC_ROUTES`

`DEFAULT_DYNAMIC_ROUTES` in `src/config/defaultEnv.ts` is the built-in route set when `DYNAMIC_ROUTES` is not provided.  
The examples below are copied from that default and can be reused as a starting point for custom `DYNAMIC_ROUTES` values.

### Example 1: Root redirect + conditional return + websocket

```json
{
  "name": "root",
  "route": "/",
  "policyName": "mock-always-allow",
  "connectorName": "simple",
  "websocket": {
    "handler": "neo4j-bolt",
    "target": "ws://10.29.1.86:7687"
  },
  "redirect": {
    "default": "/services",
    "conditionalRedirects": [
      {
        "condition": "header",
        "headerName": "accept",
        "includes": "application/json",
        "return": "NEO4J_BROWSER_MANIFEST"
      }
    ]
  }
}
```

### Example 2: Static file route from defaults

```json
{
  "name": "static-files-browser-config-json",
  "route": "/browser/:neo4j.browser.config.json",
  "policyName": "mock-always-allow",
  "connectorName": "simple",
  "relativeFilePath": "src/config/neo4j.browser.config.json"
}
```

### Example 3: Proxied HTML app with base rewriting

```json
{
  "name": "Data Browser",
  "route": "/analytics/(.*)",
  "target": "http://10.29.1.86:3001",
  "rewritebase": true,
  "policyName": "mock-always-allow",
  "connectorName": "simple"
}
```

### Example 4: MCP route with header injection placeholder

```json
{
  "name": "Link Analytics AI",
  "route": "/mcp",
  "target": "http://10.29.1.86:7475/mcp",
  "requestHeaderRules": [
    {
      "operation": "create",
      "headerName": "Authorization",
      "value": "{MCP_NEO4J_AUTH_HEADER}"
    }
  ],
  "policyName": "mock-always-allow",
  "connectorName": "mock",
  "doNotRenderButton": true
}
```

---

## TODO

- WebSocket forwarding is implemented for only one WebSocket. Add support for multiple WebSockets.

---

## Security Scanning (Trivy)

This repo includes a GitHub Actions workflow that runs Trivy on every PR and on pushes to `main`, and uploads results to GitHub Code Scanning:

- Workflow: `.github/workflows/trivy.yml`
- Output: `trivy.sarif` uploaded to the repo Security tab

---

## License

MIT

---

In order to work with neo4j authentication for read-only databases use following URL structure:

```http://localhost:3000/browser/?connectURL=bolt%3A%2F%2Flocalhost%3A3000&preselectAuthMethod=NO_AUTH&cmd=:play&arg=movies```
