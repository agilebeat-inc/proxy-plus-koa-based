// middleware/auth.ts
import { Middleware } from 'koa';
import { asyncLocalStorage } from '../localStorage';
import { DYNAMIC_ROUTES_INVENTORY_PREFIX } from '../config/env' 

const DEFAULT_ACCESS_DENY_ERROR_MSG = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Service Unavailable</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      html, body {
        height: 100%;
        margin: 0;
        padding: 0;
        font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", Segoe UI Symbol, "Noto Color Emoji";
        background: #f3f4f6;
        color: #1c1917;
      }
      .error-container {
        max-width: 28rem;
        margin: 8vh auto 0 auto;
        background: #fff;
        border-radius: 1rem;
        box-shadow: 0 2px 12px #0002;
        padding: 2.5em 2em 2em 2em;
        text-align: center;
        border: 1px solid #e5e7eb;
      }
      .error-title {
        color: #d32f2f;
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 0.5em;
        letter-spacing: -0.01em;
      }
      .error-message {
        font-size: 1.1em;
        color: #444;
        margin-bottom: 1.5em;
      }
      .contact {
        margin-top: 2em;
        color: #71717a;
        font-size: 0.95em;
      }
      .button {
        display: inline-block;
        margin-top: 2em;
        padding: 0.75em 2em;
        background: #f3f4f6;
        color: #1c1917;
        border: 1px dotted #a1a1aa;
        border-radius: 0.25rem;
        font-size: 1.1em;
        text-decoration: none;
        transition: border-color 0.2s, background 0.2s;
        font-weight: 500;
        cursor: pointer;
      }
      .button:hover {
        border-style: solid;
        border-color: #0f172a;
        background: #e5e7eb;
      }
      a {
        color: #71717a;
        text-decoration: underline dotted #a1a1aa 1px;
        text-underline-offset: 3px;
        transition: text-decoration-color 0.2s, text-decoration-style 0.2s;
      }
      a:hover {
        text-decoration-style: solid;
        text-decoration-color: #0f172a;
      }
      @media (max-width: 600px) {
        .error-container {
          margin: 2vh 1vw 0 1vw;
          padding: 1.5em 0.5em 1.5em 0.5em;
        }
      }
    </style>
  </head>
  <body>
    <div class="error-container">
      <h1 class="error-title">Service Unavailable</h1>
      <div class="error-message">
        Sorry, you have no access to the service you requested.
        Please contact your system administrator for further assistance.
      </div>
      <div class="contact">
        <strong>Contact us if you think that you should have access to the system.</strong><br>
        Email: <a href="mailto:admin@example.com">admin@example.com</a>
      </div>
      <a class="button" href="${DYNAMIC_ROUTES_INVENTORY_PREFIX}">Back to Services</a>
    </div>
  </body>
</html>
`;

export const pepMiddleware: Middleware = async (ctx, next) => {
  const store = asyncLocalStorage.getStore();
  if (!store?.isAllowed) {
    ctx.status = 403;
    ctx.type = 'html';
    ctx.body = DEFAULT_ACCESS_DENY_ERROR_MSG;
    return; // Deny access
  }

  await next(); // Allow access
};
