import { ApiHttpError } from '../lib/http.js';

function extractSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const raw = headers.get('set-cookie');
  if (!raw) return [];

  // Split cookies without breaking Expires=Tue, ...
  return raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/g);
}

function toCookieHeader(setCookies) {
  const pairs = [];

  for (const setCookie of setCookies) {
    const firstPart = setCookie.split(';')[0]?.trim();
    if (!firstPart || !firstPart.includes('=')) continue;
    pairs.push(firstPart);
  }

  return pairs.join('; ');
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapEnvelope(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if ('data' in payload && 'success' in payload) return payload.data;
  return payload;
}

async function requestJson(url, { method = 'GET', headers = {}, body, cookie } = {}) {
  const reqHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  if (cookie) {
    reqHeaders.Cookie = cookie;
  }

  let requestBody;
  if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers: reqHeaders,
    body: requestBody,
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new ApiHttpError(`HTTP ${response.status} em ${method} ${new URL(url).pathname}`, {
      status: response.status,
      url,
      payload,
    });
  }

  return {
    payload: unwrapEnvelope(payload),
    setCookies: extractSetCookieHeaders(response.headers),
  };
}

function normalizeExpires(expiresIn) {
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
    return new Date(Date.now() + expiresIn * 1000).toISOString();
  }

  if (typeof expiresIn === 'string') {
    const asDate = new Date(expiresIn);
    if (!Number.isNaN(asDate.getTime())) {
      return asDate.toISOString();
    }
  }

  return null;
}

export async function loginDevWithBootstrap({
  connectTokenUrl,
  oidcBootstrapUrl,
  email,
  password,
  clientId,
  scope,
  origin,
}) {
  const connect = await requestJson(connectTokenUrl, {
    method: 'POST',
    body: {
      grantType: 'password',
      scope,
      email,
      password,
      staySignedIn: true,
      clientId,
    },
  });

  const cookieHeader = toCookieHeader(connect.setCookies);
  if (!cookieHeader) {
    throw new Error(
      'Login dev não retornou cookies de sessão. Verifique credenciais e configurações locais.',
    );
  }

  const bootstrap = await requestJson(oidcBootstrapUrl, {
    method: 'POST',
    headers: {
      Origin: origin,
    },
    cookie: cookieHeader,
    body: {
      clientId,
      scope,
    },
  });

  const token = bootstrap.payload;
  if (!token || typeof token !== 'object' || !token.access_token) {
    throw new Error('Bootstrap OIDC não retornou access_token.');
  }

  return {
    ...token,
    token_type: token.token_type || 'Bearer',
    client_id: clientId,
    scope,
    origin,
    source: 'dev_bootstrap',
    savedAt: new Date().toISOString(),
    expires_at: normalizeExpires(token.expires_in),
  };
}

