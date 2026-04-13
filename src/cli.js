#!/usr/bin/env node

import { config } from './lib/config.js';
import { createApiClient, ApiHttpError } from './lib/http.js';
import {
  ensureDir,
  exitWithError,
  nowIso,
  parseArgs,
  printJson,
  readJsonIfExists,
  readPayloadFromFile,
  toInt,
  writeJson,
} from './lib/utils.js';
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchOpenIdConfiguration,
  generatePkcePair,
  refreshAccessToken,
} from './services/oidc.js';
import { loginDevWithBootstrap } from './services/dev-auth.js';
import {
  createIntegrationRequest,
  getIntegrationRequestStatus,
} from './services/integration-requests.js';
import {
  createAdvertisement,
  deleteAdvertisement,
  getAdvertisementById,
  listAdKinds,
  listBrandsByKind,
  listCategories,
  listModelsByBrand,
  listModelVersionsByModel,
  listModelYearsByVersion,
  myAdvertisements,
  updateAdvertisement,
} from './services/ads.js';

const rootClient = createApiClient({ baseUrl: config.apiBaseUrl });
const webClient = createApiClient({ baseUrl: config.webApiBaseUrl });

ensureDir(config.runtimeDir);

function help() {
  console.log(`
QueroTruck Partner Integration JS (CLI)

Uso:
  node src/cli.js <comando> [--opcao valor]

Comandos de auth:
  help
  discovery
  auth:pkce [--save]
  auth:authorize-url [--client-id ...] [--redirect-uri ...] [--scope ...] [--save]
  auth:exchange --code ... [--code-verifier ...] [--client-id ...] [--redirect-uri ...] [--client-secret ...] [--save]
  auth:refresh [--refresh-token ...] [--client-id ...] [--save]
  auth:dev-login [--email ...] [--password ...] [--client-id ...] [--scope ...] [--origin ...] [--save]
  token:show
  token:set --access-token ...

Comandos de integração:
  integration:create [--file payloads/integration-request.json]
  integration:status --tracking IR-YYYYMMDD-XXXXXX

Comandos de catálogo (read-only):
  catalog:ad-kinds
  catalog:categories [--kind-code truck]
  catalog:brands --kind-code truck
  catalog:models --brand-id <GUID> [--kind-code truck]
  catalog:versions --model-id <GUID>
  catalog:years --model-version-id <GUID>

Comandos de anúncios (CRUD):
  ads:create [--file payloads/create-ad.truck.draft.json]
  ads:get --id <GUID>
  ads:update --id <GUID> [--file payloads/update-ad.truck.draft.json]
  ads:delete --id <GUID> [--reason SoldOtherwise] [--description "..."]
  ads:my [--page 1] [--page-size 20] [--status Draft]

Dicas:
  - Se não passar --id em ads:get / ads:update / ads:delete, o CLI tenta usar .runtime/last-advertisement.json
  - Para operações de escrita, o token precisa ter contexto de usuário anunciante e cumprir regra de Origin/scope.
  - Em localhost, use auth:dev-login para obter token automático (connect + oidc/bootstrap).
`);
}

async function getDiscovery() {
  return fetchOpenIdConfiguration(rootClient, config.oidcWellKnownUrl);
}

function resolveExpiresAt(expiresIn) {
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
    return new Date(Date.now() + expiresIn * 1000).toISOString();
  }

  if (typeof expiresIn === 'string') {
    const parsed = new Date(expiresIn);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function resolveOrigin(args) {
  if (args.origin) return args.origin;

  const stored = readJsonIfExists(config.tokenFilePath, {});
  if (stored && typeof stored.origin === 'string' && stored.origin.trim()) {
    return stored.origin.trim();
  }

  return config.defaultOrigin || undefined;
}

function resolveToken(args, { required = false } = {}) {
  const argToken = args.token || args['access-token'];
  if (argToken) return argToken;

  if (config.accessTokenFromEnv) return config.accessTokenFromEnv;

  const stored = readJsonIfExists(config.tokenFilePath);
  if (stored && typeof stored.access_token === 'string') {
    return stored.access_token;
  }

  if (required) {
    exitWithError(
      'Token não encontrado. Use auth:exchange, token:set ou configure QT_ACCESS_TOKEN no .env.',
    );
  }

  return undefined;
}

function saveLastAdvertisementId(id) {
  writeJson(config.lastAdFilePath, {
    id,
    savedAt: nowIso(),
  });
}

function resolveAdvertisementId(args) {
  if (args.id) return args.id;

  const last = readJsonIfExists(config.lastAdFilePath);
  if (last?.id) return last.id;

  exitWithError(
    'ID do anúncio não informado e .runtime/last-advertisement.json não encontrado. Use --id.',
  );
}

async function handleDiscovery() {
  const discovery = await getDiscovery();
  printJson(discovery);
}

async function handleAuthPkce(args) {
  const pkce = generatePkcePair();

  if (args.save) {
    writeJson(config.pkceFilePath, pkce);
  }

  printJson(pkce);
}

async function handleAuthAuthorizeUrl(args) {
  const discovery = await getDiscovery();

  const clientId = args['client-id'] || config.clientId;
  const redirectUri = args['redirect-uri'] || config.redirectUri;
  const scope = args.scope || config.scope;

  if (!clientId) {
    exitWithError('client_id ausente. Use --client-id ou QT_CLIENT_ID.');
  }

  if (!redirectUri) {
    exitWithError('redirect_uri ausente. Use --redirect-uri ou QT_REDIRECT_URI.');
  }

  const pkce = generatePkcePair();

  const authorizeUrl = buildAuthorizationUrl({
    authorizationEndpoint: discovery.authorization_endpoint,
    clientId,
    redirectUri,
    scope,
    codeChallenge: pkce.codeChallenge,
    state: pkce.state,
  });

  const output = {
    authorizationEndpoint: discovery.authorization_endpoint,
    authorizeUrl,
    clientId,
    redirectUri,
    scope,
    state: pkce.state,
    codeVerifier: pkce.codeVerifier,
    codeChallenge: pkce.codeChallenge,
  };

  if (args.save) {
    writeJson(config.pkceFilePath, output);
  }

  printJson(output);
  console.log('\nAbra a URL acima no navegador, faça login e copie o parâmetro ?code=... do callback.');
}

async function handleAuthExchange(args) {
  const code = args.code;
  if (!code) {
    exitWithError('Informe o authorization code com --code.');
  }

  const discovery = await getDiscovery();
  const savedPkce = readJsonIfExists(config.pkceFilePath, {});

  const clientId = args['client-id'] || config.clientId;
  const redirectUri = args['redirect-uri'] || config.redirectUri;
  const codeVerifier = args['code-verifier'] || savedPkce.codeVerifier;
  const clientSecret = args['client-secret'] || undefined;

  if (!clientId) {
    exitWithError('client_id ausente. Use --client-id ou QT_CLIENT_ID.');
  }
  if (!redirectUri) {
    exitWithError('redirect_uri ausente. Use --redirect-uri ou QT_REDIRECT_URI.');
  }
  if (!codeVerifier) {
    exitWithError(
      'code_verifier ausente. Use --code-verifier ou rode auth:authorize-url --save antes.',
    );
  }

  const tokenResponse = await exchangeAuthorizationCode({
    client: rootClient,
    tokenEndpoint: discovery.token_endpoint,
    code,
    clientId,
    redirectUri,
    codeVerifier,
    clientSecret,
  });

  const snapshot = {
    ...tokenResponse,
    token_endpoint: discovery.token_endpoint,
    client_id: clientId,
    redirect_uri: redirectUri,
    savedAt: nowIso(),
    expires_at: resolveExpiresAt(tokenResponse.expires_in),
  };

  if (args.save || args.save === undefined) {
    writeJson(config.tokenFilePath, snapshot);
  }

  printJson(snapshot);
}

async function handleAuthRefresh(args) {
  const stored = readJsonIfExists(config.tokenFilePath, {});
  const refreshToken = args['refresh-token'] || stored.refresh_token;
  const clientId = args['client-id'] || stored.client_id || config.clientId;

  if (!refreshToken) {
    exitWithError(
      'refresh_token ausente. Use --refresh-token ou faça auth:exchange/auth:dev-login antes.',
    );
  }

  if (!clientId) {
    exitWithError('client_id ausente. Use --client-id ou configure QT_CLIENT_ID.');
  }

  const discovery = await getDiscovery();
  const tokenResponse = await refreshAccessToken({
    client: rootClient,
    tokenEndpoint: discovery.token_endpoint,
    refreshToken,
    clientId,
  });

  const snapshot = {
    ...stored,
    ...tokenResponse,
    token_endpoint: discovery.token_endpoint,
    client_id: clientId,
    savedAt: nowIso(),
    expires_at: resolveExpiresAt(tokenResponse.expires_in),
  };

  if (args.save || args.save === undefined) {
    writeJson(config.tokenFilePath, snapshot);
  }

  printJson(snapshot);
}

async function handleAuthDevLogin(args) {
  const email = args.email || config.devAuth.email;
  const password = args.password || config.devAuth.password;
  const clientId = args['client-id'] || config.devAuth.clientId;
  const scope = args.scope || config.devAuth.scope;
  const origin = args.origin || config.devAuth.origin;

  if (!email || !password) {
    exitWithError(
      'Credenciais ausentes para auth:dev-login. Configure QT_DEV_EMAIL e QT_DEV_PASSWORD.',
    );
  }

  if (!clientId) {
    exitWithError('client_id ausente para auth:dev-login.');
  }

  if (!origin) {
    exitWithError('Origin ausente para auth:dev-login (use --origin ou QT_DEV_ORIGIN).');
  }

  const snapshot = await loginDevWithBootstrap({
    connectTokenUrl: config.devAuth.connectTokenUrl,
    oidcBootstrapUrl: config.devAuth.oidcBootstrapUrl,
    email,
    password,
    clientId,
    scope,
    origin,
  });

  if (args.save || args.save === undefined) {
    writeJson(config.tokenFilePath, snapshot);
  }

  printJson(snapshot);
}

function handleTokenShow() {
  const stored = readJsonIfExists(config.tokenFilePath);

  if (!stored) {
    exitWithError('Nenhum token salvo em .runtime/token.json.');
  }

  const output = {
    savedAt: stored.savedAt,
    token_type: stored.token_type,
    expires_in: stored.expires_in,
    expires_at: stored.expires_at || null,
    client_id: stored.client_id || null,
    source: stored.source || null,
    has_refresh_token: Boolean(stored.refresh_token),
    access_token_preview:
      typeof stored.access_token === 'string'
        ? `${stored.access_token.slice(0, 24)}...`
        : null,
  };

  printJson(output);
}

function handleTokenSet(args) {
  const accessToken = args['access-token'];
  if (!accessToken) {
    exitWithError('Informe --access-token.');
  }

  writeJson(config.tokenFilePath, {
    access_token: accessToken,
    token_type: 'Bearer',
    savedAt: nowIso(),
    source: 'manual',
  });

  printJson({ ok: true, tokenFile: config.tokenFilePath });
}

async function handleIntegrationCreate(args) {
  const file = args.file || 'payloads/integration-request.json';
  const payload = readPayloadFromFile(file);
  const token = resolveToken(args, { required: false });

  const created = await createIntegrationRequest(webClient, {
    payload,
    token,
    origin: resolveOrigin(args),
  });

  printJson(created);
}

async function handleIntegrationStatus(args) {
  const trackingCode = args.tracking;
  if (!trackingCode) {
    exitWithError('Informe --tracking IR-YYYYMMDD-XXXXXX.');
  }

  const token = resolveToken(args, { required: false });

  const status = await getIntegrationRequestStatus(webClient, {
    trackingCode,
    token,
    origin: resolveOrigin(args),
  });

  printJson(status);
}

async function handleCatalogAdKinds() {
  const data = await listAdKinds(webClient);
  printJson(data);
}

async function handleCatalogCategories(args) {
  const data = await listCategories(webClient, {
    kindCode: args['kind-code'],
  });
  printJson(data);
}

async function handleCatalogBrands(args) {
  const kindCode = args['kind-code'];
  if (!kindCode) {
    exitWithError('Informe --kind-code (ex.: truck).');
  }
  const data = await listBrandsByKind(webClient, { kindCode });
  printJson(data);
}

async function handleCatalogModels(args) {
  const brandId = args['brand-id'];
  if (!brandId) {
    exitWithError('Informe --brand-id.');
  }

  const data = await listModelsByBrand(webClient, {
    brandId,
    kindCode: args['kind-code'],
  });

  printJson(data);
}

async function handleCatalogVersions(args) {
  const modelId = args['model-id'];
  if (!modelId) {
    exitWithError('Informe --model-id.');
  }

  const data = await listModelVersionsByModel(webClient, {
    modelId,
  });

  printJson(data);
}

async function handleCatalogYears(args) {
  const modelVersionId = args['model-version-id'];
  if (!modelVersionId) {
    exitWithError('Informe --model-version-id.');
  }

  const data = await listModelYearsByVersion(webClient, {
    modelVersionId,
  });

  printJson(data);
}

async function handleAdsCreate(args) {
  const file = args.file || 'payloads/create-ad.truck.draft.json';
  const payload = readPayloadFromFile(file);
  const token = resolveToken(args, { required: true });

  const created = await createAdvertisement(webClient, {
    payload,
    token,
    origin: resolveOrigin(args),
  });

  if (created?.id) {
    saveLastAdvertisementId(created.id);
  }

  printJson(created);
}

async function handleAdsGet(args) {
  const id = resolveAdvertisementId(args);
  const token = resolveToken(args, { required: false });

  const ad = await getAdvertisementById(webClient, {
    id,
    token,
    origin: resolveOrigin(args),
  });

  printJson(ad);
}

async function handleAdsUpdate(args) {
  const id = resolveAdvertisementId(args);
  const file = args.file || 'payloads/update-ad.truck.draft.json';
  const payload = readPayloadFromFile(file);
  const token = resolveToken(args, { required: true });

  const updated = await updateAdvertisement(webClient, {
    id,
    payload,
    token,
    origin: resolveOrigin(args),
  });

  printJson(updated);
}

async function handleAdsDelete(args) {
  const id = resolveAdvertisementId(args);
  const reason = args.reason || 'SoldOtherwise';
  const description = args.description || null;
  const token = resolveToken(args, { required: true });

  const removed = await deleteAdvertisement(webClient, {
    id,
    removeAdvertisementReason: reason,
    descriptionReason: description,
    token,
    origin: resolveOrigin(args),
  });

  printJson({
    id,
    deleted: true,
    response: removed,
  });
}

async function handleAdsMy(args) {
  const token = resolveToken(args, { required: true });

  const pageIndex = toInt(args.page, 1);
  const pageSize = toInt(args['page-size'], 20);

  const data = await myAdvertisements(webClient, {
    pageIndex,
    pageSize,
    status: args.status,
    token,
    origin: resolveOrigin(args),
  });

  printJson(data);
}

async function main() {
  const [command = 'help', ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (command) {
    case 'help':
      help();
      return;

    case 'discovery':
      await handleDiscovery();
      return;

    case 'auth:pkce':
      await handleAuthPkce(args);
      return;

    case 'auth:authorize-url':
      await handleAuthAuthorizeUrl(args);
      return;

    case 'auth:exchange':
      await handleAuthExchange(args);
      return;

    case 'auth:refresh':
      await handleAuthRefresh(args);
      return;

    case 'auth:dev-login':
      await handleAuthDevLogin(args);
      return;

    case 'token:show':
      handleTokenShow();
      return;

    case 'token:set':
      handleTokenSet(args);
      return;

    case 'integration:create':
      await handleIntegrationCreate(args);
      return;

    case 'integration:status':
      await handleIntegrationStatus(args);
      return;

    case 'catalog:ad-kinds':
      await handleCatalogAdKinds();
      return;

    case 'catalog:categories':
      await handleCatalogCategories(args);
      return;

    case 'catalog:brands':
      await handleCatalogBrands(args);
      return;

    case 'catalog:models':
      await handleCatalogModels(args);
      return;

    case 'catalog:versions':
      await handleCatalogVersions(args);
      return;

    case 'catalog:years':
      await handleCatalogYears(args);
      return;

    case 'ads:create':
      await handleAdsCreate(args);
      return;

    case 'ads:get':
      await handleAdsGet(args);
      return;

    case 'ads:update':
      await handleAdsUpdate(args);
      return;

    case 'ads:delete':
      await handleAdsDelete(args);
      return;

    case 'ads:my':
      await handleAdsMy(args);
      return;

    default:
      exitWithError(`Comando desconhecido: ${command}`);
  }
}

main().catch((error) => {
  if (error instanceof ApiHttpError) {
    exitWithError(error.message, {
      status: error.status,
      url: error.url,
      payload: error.payload,
    });
  }

  if (error instanceof Error) {
    exitWithError(error.message, {
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }

  exitWithError('Erro inesperado.', error);
});
