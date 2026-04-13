import crypto from 'node:crypto';

function unwrapEnvelope(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if ('data' in payload && 'success' in payload) return payload.data;
  return payload;
}

export async function fetchOpenIdConfiguration(client, wellKnownUrl) {
  const discovery = await client.get(wellKnownUrl, { raw: true });

  if (!discovery || typeof discovery !== 'object') {
    throw new Error('Resposta inválida do OIDC discovery.');
  }

  if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
    throw new Error(
      'OIDC discovery sem authorization_endpoint ou token_endpoint.',
    );
  }

  return discovery;
}

export function generatePkcePair() {
  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
    state: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
  };
}

export function buildAuthorizationUrl({
  authorizationEndpoint,
  clientId,
  redirectUri,
  scope,
  codeChallenge,
  state,
}) {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

export async function exchangeAuthorizationCode({
  client,
  tokenEndpoint,
  code,
  clientId,
  redirectUri,
  codeVerifier,
  clientSecret,
}) {
  const form = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  };

  if (clientSecret) {
    form.client_secret = clientSecret;
  }

  const payload = await client.post(tokenEndpoint, undefined, {
    form,
    raw: true,
  });
  return unwrapEnvelope(payload);
}

export async function refreshAccessToken({
  client,
  tokenEndpoint,
  refreshToken,
  clientId,
}) {
  const payload = await client.post(tokenEndpoint, undefined, {
    form: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    },
    raw: true,
  });
  return unwrapEnvelope(payload);
}
