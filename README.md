# QueroTruck Partner Integration JS

Projeto JavaScript enxuto para integração ponta-a-ponta com a API da QueroTruck:

- OIDC (discovery + PKCE + troca de code por token)
- Refresh de token (`grant_type=refresh_token`)
- Login dev automatizado (local) via `connect/token` + `oidc/bootstrap`
- Solicitação de integração (`integration-requests`)
- CRUD de anúncios (`create`, `read`, `update`, `delete`)
- Consultas de catálogo para montar payloads

## Requisitos

- Node.js 18+

## Setup

```bash
cd examples/qt-partner-integration-js
cp .env.example .env
```

Preencha no `.env`:

- `QT_CLIENT_ID`
- `QT_REDIRECT_URI`
- opcionalmente `QT_ORIGIN`

Observação importante:

- Para `POST/PUT/DELETE` de anúncios, o token precisa ter contexto de usuário anunciante (claim de usuário) e atender a política de segurança de integração (Origin válida ou scope `web.client.integration`, conforme seu cenário).

## Fluxo rápido localhost (automatizado)

Se você estiver testando localmente (`http://localhost:8080`) pode gerar token sem abrir navegador:

```bash
npm run auth:dev-login
```

Esse comando:

1. autentica com usuário/senha local no `connect/token`
2. usa a sessão para fazer `POST /auth/v1/oidc/bootstrap`
3. salva `access_token` + `refresh_token` em `.runtime/token.json`

Variáveis úteis no `.env`:

- `QT_DEV_EMAIL` (default: `dev.admin@querotruck.com.br`)
- `QT_DEV_PASSWORD` (default: `123456`)
- `QT_DEV_CLIENT_ID` (default: `QueroTruck.Web`)
- `QT_DEV_SCOPE` (default: `authenticate`)
- `QT_DEV_ORIGIN` (default: `http://localhost:3000`)

## Fluxo 1: Solicitar Integração

```bash
npm run integration:create -- --file payloads/integration-request.json
```

Pegue o `trackingCode` retornado e consulte:

```bash
npm run integration:status -- --tracking IR-20260411-8A1C2E
```

## Fluxo 2: Autenticar (OIDC + PKCE)

1. Descobrir endpoints oficiais:

```bash
npm run discovery
```

2. Gerar URL de authorize + PKCE e salvar no runtime:

```bash
npm run auth:authorize-url
```

3. Abrir `authorizeUrl` no navegador, fazer login e copiar o `code` do callback.

4. Trocar code por token e salvar:

```bash
npm run auth:exchange -- --code SEU_AUTH_CODE
```

4.1. Renovar access token com refresh token (quando já existir token salvo):

```bash
npm run auth:refresh
```

5. Conferir token salvo:

```bash
npm run token:show
```

Se você já tiver token, pode salvar direto:

```bash
npm run token:set -- --access-token SEU_ACCESS_TOKEN
```

## Fluxo 3: Descobrir IDs de catálogo

```bash
npm run catalog:ad-kinds
npm run catalog:categories -- --kind-code truck
npm run catalog:brands -- --kind-code truck
npm run catalog:models -- --brand-id GUID_DA_MARCA --kind-code truck
npm run catalog:versions -- --model-id GUID_DO_MODELO
npm run catalog:years -- --model-version-id GUID_DA_VERSAO
```

Com esses IDs, ajuste os payloads em `payloads/`.

## Fluxo 4: CRUD de anúncios

### Create

```bash
npm run ads:create -- --file payloads/create-ad.truck.draft.json
```

Se receber `403 forbidden_integration_write`, informe uma Origin permitida:

```bash
npm run ads:create -- --file payloads/create-ad.truck.draft.json --origin http://localhost:3000
```

Quando o token for gerado por `auth:dev-login`, o CLI reaproveita automaticamente a `origin` salva no token.

O CLI salva automaticamente o último `id` em `.runtime/last-advertisement.json`.

### Read

```bash
npm run ads:get -- --id GUID_DO_ANUNCIO
```

Ou sem `--id` para usar o último salvo:

```bash
npm run ads:get
```

### Update

```bash
npm run ads:update -- --id GUID_DO_ANUNCIO --file payloads/update-ad.truck.draft.json
```

### Delete

```bash
npm run ads:delete -- --id GUID_DO_ANUNCIO --reason SoldOtherwise --description "Vendido no ERP"
```

### Listar meus anúncios

```bash
npm run ads:my -- --page 1 --page-size 20
```

## Arquivos importantes

- `src/cli.js`: comandos da integração
- `src/services/oidc.js`: discovery + PKCE + token
- `src/services/integration-requests.js`: abertura/status de solicitação
- `src/services/ads.js`: CRUD e catálogo
- `payloads/*.json`: payloads de exemplo

## Comandos disponíveis

```bash
npm run help
```
