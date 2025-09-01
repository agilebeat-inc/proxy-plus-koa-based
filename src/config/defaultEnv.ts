export const DEFAULT_DYNAMIC_ROUTES = '[{"name": "Data Browser","route": "/analytics/(.*)", "target": "http://10.182.1.86:3001", "rewritebase": true, "policyName": "mock-always-allow", "connectorName": "simple"}, {"name": "Link Analytics", "route": "/graph(.*)", "target": "http://10.182.1.86:7474", "rewritebase": false, "params": "/browser?dbms=neo4j://Anonymous@localhost:3000&db=neo4j", "policyName": "mock-always-allow", "connectorName": "mock"}]';
export const DEFAULT_IGNORE_URLS_FOR_LOGGING_BY_PREFIX = "['/analytics/graph/browser', '/analytics/browser/_app']";
// Static HTML for the dynamic routes services page, configurable via env var
export const DEFAULT_SERVICES_HTML = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Service Selector</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      html, body {
        height: 100%;
        margin: 0;
        padding: 0;
        font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
        background: #f3f4f6;
        color: #1c1917;
      }
      .container {
        max-width: 28rem;
        margin: 8vh auto 0 auto;
        background: #fff;
        border-radius: 1rem;
        box-shadow: 0 2px 12px #0002;
        padding: 2.5em 2em 2em 2em;
        text-align: center;
        border: 1px solid #e5e7eb;
      }
      h1 {
        color: #2563eb; /* BioDDEx blue-600 */
        font-size: 2.25rem; /* text-4xl */
        font-weight: 700;   /* font-bold */
        margin-bottom: 1.5em;
        letter-spacing: -0.01em;
        font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
      }
      .button {
        display: block;
        margin: 1.2em 0;
        padding: 0.75em 0.5em;
        background: #f9fafb;
        color: #1c1917;
        border-radius: 0.25rem;
        border: 1px dotted #94a3b8; /* slate-400 */
        font-size: 1.1em;
        font-family: inherit;
        font-weight: 500;
        box-shadow: 0 1px 3px 0 rgb(0 0 0 / .08), 0 1px 2px -1px rgb(0 0 0 / .08);
        text-decoration: none;
        cursor: pointer;
        transition: border-color 0.2s, background 0.2s;
        user-select: none;
      }
      .button:hover {
        background: #e5e7eb;
        border-color: #0f172a;
        border-style: solid;
        color: #2563eb;
      }
      @media (max-width: 600px) {
        .container {
          margin: 2vh 1vw 0 1vw;
          padding: 1.5em 0.5em 1.5em 0.5em;
        }
        h1 {
          font-size: 1.3rem;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Select Service</h1>
      <!--SERVICES_BUTTONS-->
    </div>
  </body>
</html>
`;
export const DEFAULT_UPSTREAM_ERROR_MSG = `
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
        Sorry, the service you are trying to access is currently unavailable.
        Please contact your system administrator for further assistance.
      </div>
      <div class="contact">
        <strong>Need help?</strong><br>
        Email: <a href="mailto:admin@example.com">admin@example.com</a>
      </div>
      <a class="button" href="/services">Back to Services</a>
    </div>
  </body>
</html>
`;