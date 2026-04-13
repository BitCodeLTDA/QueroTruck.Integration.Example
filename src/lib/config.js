import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnvFile, readEnv } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

loadEnvFile(path.join(PROJECT_ROOT, '.env'));

function withoutTrailingSlash(input) {
  return input.replace(/\/+$/, '');
}

const apiBaseUrl = withoutTrailingSlash(
  readEnv('QT_API_BASE_URL', 'https://api.querotruck.com.br'),
);

export const config = {
  projectRoot: PROJECT_ROOT,
  runtimeDir: path.join(PROJECT_ROOT, '.runtime'),
  tokenFilePath: path.join(PROJECT_ROOT, '.runtime', 'token.json'),
  pkceFilePath: path.join(PROJECT_ROOT, '.runtime', 'pkce.json'),
  lastAdFilePath: path.join(PROJECT_ROOT, '.runtime', 'last-advertisement.json'),

  apiBaseUrl,
  webApiBaseUrl: withoutTrailingSlash(
    readEnv('QT_WEB_API_BASE_URL', `${apiBaseUrl}/web/v1`),
  ),
  oidcWellKnownUrl: readEnv(
    'QT_OIDC_WELL_KNOWN_URL',
    `${apiBaseUrl}/auth/.well-known/openid-configuration`,
  ),

  clientId: readEnv('QT_CLIENT_ID', ''),
  redirectUri: readEnv('QT_REDIRECT_URI', ''),
  scope: readEnv('QT_SCOPE', 'openid profile email'),

  defaultOrigin: readEnv('QT_ORIGIN', ''),
  accessTokenFromEnv: readEnv('QT_ACCESS_TOKEN', ''),

  devAuth: {
    email: readEnv('QT_DEV_EMAIL', 'dev.admin@querotruck.com.br'),
    password: readEnv('QT_DEV_PASSWORD', '123456'),
    clientId: readEnv('QT_DEV_CLIENT_ID', 'QueroTruck.Web'),
    scope: readEnv('QT_DEV_SCOPE', 'authenticate'),
    origin: readEnv('QT_DEV_ORIGIN', 'http://localhost:3000'),
    connectTokenUrl: readEnv(
      'QT_DEV_CONNECT_TOKEN_URL',
      `${apiBaseUrl}/auth/v1/connect/token`,
    ),
    oidcBootstrapUrl: readEnv(
      'QT_DEV_OIDC_BOOTSTRAP_URL',
      `${apiBaseUrl}/auth/v1/oidc/bootstrap`,
    ),
  },
};
