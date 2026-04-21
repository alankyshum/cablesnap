interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
}

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
