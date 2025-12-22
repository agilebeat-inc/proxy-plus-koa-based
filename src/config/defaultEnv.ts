export const DEFAULT_DYNAMIC_ROUTES_INVENTORY_PREFIX = '/services'
export const DEFAULT_INJECTED_BOLT_PRINCIPAL = 'neo4j';
export const DEFAULT_INJECTED_BOLT_SCHEME = 'basic';
export const DEFAULT_NEO4J_BROWSER_MANIFEST = `{
  "name": "Neo4j Browser (PEP)",
  "short_name": "Neo4j Browser",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#000",
  "icons": [
    {
      "src": "./assets/images/device-icons/neo4j-browser.svg",
      "type": "svg"
    }
  ],
  "description": "Neo4j Browser is the general purpose user interface for working with Neo4j. Query, visualize, administer and monitor the database.",
  "homepage": "https://neo4j.com/developer/guide-neo4j-browser/",
  "neo4jDesktop": {
    "apiVersion": "^1.4.0"
  },
  "version": "5.24.0",
  "builtAt": "2024-09-02T12:18:54.860Z",
  "buildNumber": "225"
  "initialCommand": "MATCH (n) RETURN n LIMIT 25"
}`;
export const DEFAULT_DYNAMIC_ROUTES = JSON.stringify([
  {
    name: "root",
    route: "/",
    policyName: "mock-always-allow",
    connectorName: "simple",
    redirect: {
      default: "/services",
      conditionalRedirects: [
        { condition: "header", headerName: "accept", includes: "application/json", return: "NEO4J_BROWSER_MANIFEST" },
      ]
    }
  },
  {
    name: "static-files-browser-config-json",
    route: "/browser/:neo4j.browser.config.json",
    policyName: "mock-always-allow",
    connectorName: "simple",
    relativeFilePath: "src/config/neo4j.browser.config.json"
  },
  {
    name: "patched-favicon-ico",
    route: "/favicon.ico",
    policyName: "mock-always-allow",
    connectorName: "simple",
    redirect: "/analytics/favicon.ico"
  },
  {
    name: "patched-root-example",
    route: "/search",
    policyName: "mock-always-allow",
    connectorName: "simple",
    redirect: "/analytics/search"
  },
  {
    name: "Services",
    route: "/services",
    policyName: "mock-always-allow",
    connectorName: "simple",
    splashPage: true
  },
  {
    name: "Search",
    route: "/search(.*)",
    policyName: "mock-always-allow",
    connectorName: "simple"
  },
  {
    name: "Browser",
    route: "/analytics/(.*)",
    target: "http://10.29.1.86:3001",
    rewritebase: true,
    policyName: "mock-always-allow",
    connectorName: "simple",
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"></path> <circle cx="12" cy="12" r="9"></circle> <line x1="4.6" y1="7" x2="19.4" y2="7"></line> <line x1="3" y1="12" x2="21" y2="12"></line> <line x1="4.6" y1="17" x2="19.4" y2="17"></line> </svg>',
  },
  {
    name: "Link Analytics",
    route: "/browser/(.*)",
    target: "http://10.29.1.86:7474/browser/",
    policyName: "mock-always-allow",
    connectorName: "mock",
    subpathReturns: [
      { path: "/browser/manifest.json", return: "NEO4J_BROWSER_MANIFEST" },
    ],
    icon: '<svg width="1.2em" height="1.2em" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"> <path style="fill:currentColor;stroke:#d7dadc;" d="M30.292 11.224c-0.021 3.943-3.219 7.094-7.193 7.078-3.927-0.021-7.073-3.234-7.052-7.208 0.021-3.87 3.276-7.052 7.188-7.021 3.901 0.026 7.073 3.245 7.057 7.151zM13.083 32c-3.141 0.010-5.781-2.62-5.813-5.792-0.031-3.109 2.604-5.776 5.724-5.786 3.25-0.016 5.859 2.552 5.859 5.766 0.005 3.177-2.599 5.802-5.771 5.813zM11.896 3.786c0 2.083-1.714 3.797-3.786 3.786-2.068-0.010-3.813-1.771-3.781-3.813 0.031-2.068 1.792-3.792 3.839-3.76 2.042 0.031 3.729 1.745 3.729 3.786zM29.198 15.932c-3.594 3.141-6.667 3.703-9.891 1.813-2.854-1.672-4.26-4.964-3.542-8.266 0.786-3.573 3.344-5.443 8.266-5.953-3.734-2.672-7.682-3.495-12.021-2.432-0.563 0.135-0.323 0.349-0.167 0.63 1.047 1.932 0.51 4.276-1.255 5.536-1.771 1.255-4.172 1.005-5.625-0.656-0.432-0.484-0.568-0.354-0.875 0.089-3.344 4.896-3.151 11.568 0.5 16.245 0.656 0.844 1.37 1.625 2.255 2.281 1-4.281 4.521-5.672 7.354-5.188 3.458 0.594 5.339 3.474 5.01 7.719 4.693-0.573 10.573-7.536 9.99-11.818zM17.083 2.792c0.615-0.031 1.161 0.49 1.172 1.115 0.016 0.609-0.458 1.104-1.073 1.125-0.677 0.021-1.151-0.427-1.156-1.094-0.005-0.63 0.438-1.115 1.057-1.146zM6.766 8.839c0.641 0.010 1.141 0.536 1.109 1.167-0.021 0.604-0.526 1.073-1.141 1.068-0.615-0.010-1.099-0.49-1.104-1.104-0.010-0.646 0.49-1.141 1.135-1.13zM5.807 12.969c0.005-0.599 0.5-1.099 1.104-1.109 0.615-0.016 1.099 0.443 1.125 1.068 0.026 0.651-0.448 1.172-1.083 1.182-0.63 0.010-1.151-0.505-1.146-1.141zM6.495 16.13c0.031-0.609 0.526-1.073 1.141-1.063 0.641 0.016 1.099 0.521 1.073 1.188-0.026 0.625-0.516 1.089-1.13 1.063-0.635-0.016-1.115-0.542-1.083-1.188zM9.151 20.177c-0.667 0.010-1.146-0.458-1.135-1.115 0.005-0.615 0.495-1.109 1.089-1.115 0.63-0.010 1.167 0.521 1.161 1.135-0.005 0.604-0.495 1.083-1.115 1.094zM14.255 4.031c-0.625 0.016-1.156-0.505-1.151-1.13 0-0.646 0.51-1.12 1.167-1.104 0.615 0.016 1.083 0.5 1.083 1.115 0 0.599-0.495 1.104-1.099 1.12zM20.932 24.193c-0.656-0.005-1.141-0.5-1.115-1.146 0.026-0.594 0.536-1.078 1.141-1.073 0.635 0.005 1.13 0.521 1.109 1.167-0.021 0.615-0.495 1.052-1.135 1.052zM22.979 21.833c-0.641 0.016-1.161-0.49-1.156-1.12 0.010-0.615 0.484-1.094 1.104-1.109 0.646-0.016 1.151 0.474 1.151 1.12 0 0.604-0.484 1.094-1.099 1.109z" </svg>'
  },
  {
    name: "Button Rendered But Not Active",
    route: "/hidden-rendered-button(.*)",
    target: "https://google.com",
    rewritebase: true,
    policyName: "mock-always-deny",
    connectorName: "mock",
    hideIfNoAccess: false
  },
  {
    name: "Button Rendered But Not Active With An Icon",
    route: "//hidden-rendered-button(.*)",
    target: "https://google.com",
    rewritebase: true,
    policyName: "mock-always-deny",
    connectorName: "mock",
    hideIfNoAccess: false,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"></path> <circle cx="12" cy="12" r="9"></circle> <line x1="4.6" y1="7" x2="19.4" y2="7"></line> <line x1="3" y1="12" x2="21" y2="12"></line> <line x1="4.6" y1="17" x2="19.4" y2="17"></line> </svg>',
  },
  {
    name: "Button Not Rendered But Not Active With An Icon",
    route: "/olaf(.*)",
    target: "https://google.com",
    rewritebase: true,
    policyName: "mock-always-deny",
    connectorName: "mock",
    hideIfNoAccess: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"></path> <circle cx="12" cy="12" r="9"></circle> <line x1="4.6" y1="7" x2="19.4" y2="7"></line> <line x1="3" y1="12" x2="21" y2="12"></line> <line x1="4.6" y1="17" x2="19.4" y2="17"></line> </svg>',
  }
]);
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
        html,
        body {
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
            color: #000000;
            /* blue-600 */
            font-size: 2.25rem;
            /* text-4xl */
            font-weight: 700;
            /* font-bold */
            margin-bottom: 1.5em;
            letter-spacing: -0.01em;
            font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
            text-shadow: 0 8px 32px rgba(37, 99, 235, 0.28), 0 3px 12px rgba(0,0,0,0.18);
        }

        .button {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.7em;
            margin: 1.2em 0;
            padding: 0.75em 0.5em;
            background: #f9fafb;
            color: #1c1917;
            border-radius: 0.25rem;
            border: 1px dotted #94a3b8;
            /* slate-400 */
            font-size: 1.1em;
            font-family: inherit;
            font-weight: 500;
            box-shadow: 0 1px 3px 0 rgb(0 0 0 / .08), 0 1px 2px -1px rgb(0 0 0 / .08);
            text-decoration: none;
            cursor: pointer;
            transition: border-color 0.2s, background 0.2s, box-shadow 0.2s, transform 0.2s;
            user-select: none;
        }

        .button:hover {
            background: #e5e7eb;
            border-color: #0f172a;
            border-style: solid;
            color: #2563eb;
            box-shadow: 0 8px 24px 0 rgb(37 99 235 / 0.15), 0 1.5px 4px 0 rgb(0 0 0 / .10);
            transform: translateY(-4px) scale(1.03);
        }

        .button svg {
            width: 1.2em;
            height: 1.2em;
            flex-shrink: 0;
            color: #000080;
            transition: color 0.2s;
        }

        .button:hover svg {
            color: #2563eb;
        }

        .button.inactive {
          pointer-events: none;
          opacity: 0.5;
          cursor: not-allowed;
          display: inline-flex;
          align-items: center;
          gap: 0.7em;
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

        .service-text {
            color: #000000;
            vertical-align: middle;
            transition: color 0.2s;
        }

        .button:hover .service-text {
            color: #000000;
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
export const DEFAULT_ACCESS_DENY_ERROR_MSG = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Access Denied</title>
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
      <a class="button" href="__SERVICES_PREFIX__">Back to Services</a>
    </div>
  </body>
</html>
`;
