interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
}

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function handleToken(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  const code = body.code as string | undefined;
  const codeVerifier = body.code_verifier as string | undefined;

  if (!code) {
    return jsonResponse({ error: "missing required field: code" }, 400);
  }

  const params = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    client_secret: env.STRAVA_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
  });
  if (codeVerifier) {
    params.set("code_verifier", codeVerifier);
  }

  const stravaRes = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await stravaRes.text();
  return new Response(data, {
    status: stravaRes.status,
    headers: {
      "Content-Type": stravaRes.headers.get("Content-Type") ?? "application/json",
      ...CORS_HEADERS,
    },
  });
}

const APP_PACKAGE = "com.persoack.cablesnap";

// Escape a string for safe interpolation into an HTML attribute value.
function htmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Escape a string for safe interpolation inside a <script> string literal.
function jsString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function handleCallback(request: Request): Response {
  // CONTRACT (manual verification only — no test framework configured for this worker):
  //   GET /callback?code=abc&scope=activity:write&state=xyz
  //     → 200 text/html that bounces the browser to
  //       cablesnap://strava-callback?code=abc&scope=activity%3Awrite&state=xyz
  //   GET /callback?error=access_denied&state=xyz
  //     → 200 text/html bouncing to cablesnap://strava-callback?error=access_denied&state=xyz
  //   POST /callback → 405 (caught by the method-not-allowed guard above)
  //
  // Why an HTML interstitial instead of a bare 302 Location: cablesnap://… —
  // Chrome / Android Custom Tabs refuse to follow a *server redirect* whose
  // target is a non-http(s) custom scheme (shows "not found" /
  // ERR_UNKNOWN_URL_SCHEME). A client-side navigation from a loaded page (plus
  // a user-tappable fallback link) reliably launches the app, and is still
  // intercepted by the app's WebBrowser.openAuthSessionAsync watcher.
  const incomingUrl = new URL(request.url);
  const target = new URL("cablesnap://strava-callback");
  incomingUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  const deepLink = target.toString();

  // Android intent:// fallback — explicit package guarantees the OS resolves it
  // to CableSnap even when the custom scheme alone is ambiguous.
  const query = target.search; // includes leading "?"
  const intentLink =
    `intent://strava-callback${query}#Intent;scheme=cablesnap;package=${APP_PACKAGE};end`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Returning to CableSnap…</title>
<style>
  body { font-family: system-ui, -apple-system, Roboto, sans-serif; background: #fafafa;
         color: #1a1a1a; margin: 0; display: flex; min-height: 100vh; align-items: center;
         justify-content: center; text-align: center; }
  .card { padding: 2rem 1.5rem; max-width: 22rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { color: #555; margin: .25rem 0 1.5rem; }
  a.btn { display: inline-block; background: #fc4c02; color: #fff; text-decoration: none;
          font-weight: 600; padding: .75rem 1.5rem; border-radius: .5rem; }
  a.alt { display: block; margin-top: 1rem; color: #888; font-size: .85rem; }
</style>
</head>
<body>
<div class="card">
  <h1>Connecting to CableSnap…</h1>
  <p>If the app doesn't open automatically, tap the button below.</p>
  <a class="btn" id="open" href="${htmlAttr(deepLink)}">Open CableSnap</a>
  <a class="alt" id="openIntent" href="${htmlAttr(intentLink)}">Still stuck? Tap here</a>
</div>
<script>
  (function () {
    var deepLink = ${jsString(deepLink)};
    var intentLink = ${jsString(intentLink)};
    // Android: prefer the explicit-package intent URL.
    var isAndroid = /Android/i.test(navigator.userAgent);
    try { window.location.replace(isAndroid ? intentLink : deepLink); }
    catch (e) { try { window.location.href = deepLink; } catch (e2) {} }
  })();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS },
  });
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  const refreshToken = body.refresh_token as string | undefined;

  if (!refreshToken) {
    return jsonResponse({ error: "missing required field: refresh_token" }, 400);
  }

  const params = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    client_secret: env.STRAVA_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const stravaRes = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await stravaRes.text();
  return new Response(data, {
    status: stravaRes.status,
    headers: {
      "Content-Type": stravaRes.headers.get("Content-Type") ?? "application/json",
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // GET /callback: bounce Strava's redirect back to the app deep link
    if (request.method === "GET" && url.pathname === "/callback") {
      return handleCallback(request);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }

    switch (url.pathname) {
      case "/token":
        return handleToken(request, env);
      case "/refresh":
        return handleRefresh(request, env);
      default:
        return jsonResponse({ error: "not found" }, 404);
    }
  },
};
