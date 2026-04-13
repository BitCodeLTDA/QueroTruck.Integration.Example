export class ApiHttpError extends Error {
  constructor(message, { status, url, payload } = {}) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.url = url;
    this.payload = payload;
  }
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function buildUrl(baseUrl, pathOrUrl, query) {
  const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
  const url = new URL(
    isAbsolute
      ? pathOrUrl
      : `${normalizeBaseUrl(baseUrl)}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`,
  );

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function parseBody(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapEnvelope(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  if (
    Object.prototype.hasOwnProperty.call(payload, 'success') &&
    Object.prototype.hasOwnProperty.call(payload, 'data')
  ) {
    return payload.data;
  }

  return payload;
}

export function createApiClient({ baseUrl }) {
  async function request(method, pathOrUrl, options = {}) {
    const {
      query,
      headers,
      token,
      origin,
      body,
      form,
      raw = false,
    } = options;

    const url = buildUrl(baseUrl, pathOrUrl, query);

    const reqHeaders = {
      Accept: 'application/json',
      ...(headers || {}),
    };

    if (token) {
      reqHeaders.Authorization = token.startsWith('Bearer ')
        ? token
        : `Bearer ${token}`;
    }

    if (origin) {
      reqHeaders.Origin = origin;
    }

    let requestBody;

    if (form && typeof form === 'object') {
      reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      requestBody = new URLSearchParams(
        Object.entries(form)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      ).toString();
    } else if (body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }

    const response = await fetch(url, {
      method,
      headers: reqHeaders,
      body: requestBody,
    });

    const text = await response.text();
    const payload = parseBody(text);

    if (!response.ok) {
      throw new ApiHttpError(
        `HTTP ${response.status} em ${method} ${url.pathname}`,
        {
          status: response.status,
          url: url.toString(),
          payload,
        },
      );
    }

    if (raw) return payload;
    return unwrapEnvelope(payload);
  }

  return {
    request,
    get(pathOrUrl, options = {}) {
      return request('GET', pathOrUrl, options);
    },
    post(pathOrUrl, body, options = {}) {
      return request('POST', pathOrUrl, { ...options, body });
    },
    put(pathOrUrl, body, options = {}) {
      return request('PUT', pathOrUrl, { ...options, body });
    },
    patch(pathOrUrl, body, options = {}) {
      return request('PATCH', pathOrUrl, { ...options, body });
    },
    delete(pathOrUrl, options = {}) {
      return request('DELETE', pathOrUrl, options);
    },
  };
}
