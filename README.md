# CDN de Mídia via Proxy para Xtream - Documentação Completa

## Índice

1. [Visão Geral](#visão-geral)
2. [Objetivo](#objetivo)
3. [Arquitetura](#arquitetura)
4. [Fluxo de Funcionamento](#fluxo-de-funcionamento)
5. [Estrutura do Projeto](#estrutura-do-projeto)
6. [Instalação](#instalação)
7. [Configuração](#configuração)
8. [Variáveis de Ambiente](#variáveis-de-ambiente)
9. [Iniciando o Projeto](#iniciando-o-projeto)
10. [Execução em Produção](#execução-em-produção)
11. [Endpoints da API](#endpoints-da-api)
12. [Autenticação](#autenticação)
13. [Tokens Temporários](#tokens-temporários)
14. [Streaming](#streaming)
15. [Segurança](#segurança)
16. [Erros](#erros)
17. [Troubleshooting](#troubleshooting)
18. [Boas Práticas](#boas-práticas)
19. [Exemplos de Uso](#exemplos-de-uso)

---

## Visão Geral

Sistema de CDN de mídia que funciona como intermediário entre o cliente e um servidor Xtream. O objetivo é que **o usuário nunca tenha acesso ao link real da mídia, ao domínio do Xtream ou ao proxy**, enxergando apenas o domínio da CDN.

O projeto é composto por dois componentes principais:

- **API Privada** (Node.js + Express): Gerencia autenticação, consulta de mídias e geração de tokens temporários.
- **CDN Worker** (Cloudflare Workers): Edge de streaming que valida tokens e retransmite a mídia através de proxy residencial.

---

## Objetivo

Construir uma CDN segura que funcione como camada intermediária para servidores Xtream, ocultando completamente sua infraestrutura. Toda a lógica deve acontecer exclusivamente no servidor.

**Regras obrigatórias:**

- Todo processamento acontece no servidor
- Nenhuma lógica crítica existe no client-side
- O navegador apenas reproduz o fluxo de vídeo
- Nunca utilizar JavaScript do navegador para descobrir a mídia
- Nunca expor URL original, domínio do Xtream, IP do proxy, credenciais ou qualquer informação sensível
- O usuário não deve conseguir descobrir a origem da mídia utilizando DevTools, inspeção de rede ou qualquer outro método

---

## Arquitetura

```
Cliente (Navegador/App)
    │
    ├── Requisição à API Privada
    │       │
    │       ├── Validação de autenticação (API Key)
    │       ├── Consulta de mídia no Xtream
    │       └── Gera token temporário assinado (HMAC-SHA256)
    │       │
    │       └── Retorna: URL da CDN + Token
    │
    ├── Acessa domínio CDN (Cloudflare Workers)
    │       │
    │       ├── Valida token (assinatura + expiração)
    │       ├── Extrai informações da mídia do token
    │       ├── Constrói URL original do Xtream (NUNCA exposta)
    │       │
    │       └── Proxy pass-through via proxy residencial
    │               │
    │               ├── Proxy acessa servidor Xtream
    │               ├── Xtream retorna stream de mídia
    │               ├── Worker retransmite dados para o cliente
    │               │
    │               └── Cliente recebe stream (conectado apenas ao domínio CDN)
    │
    └── Reprodução contínua
            │
            ├── Cliente permanece conectado ao domínio CDN
            ├── Proxy pass-through de dados em tempo real
            └── Nenhum redirecionamento ou exposição de origem
```

### Fluxo de Segurança

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   Cliente   │────▶│  API Privada │────▶│ Cloudflare      │────▶│ Proxy        │────▶│ Xtream      │
│             │     │              │     │ Workers (CDN)   │     │ Residencial  │     │ Server      │
│ - Recebe    │     │ - Valida     │     │ - Valida token  │     │ - Encaminha  │     │ - Retorna   │
│   URL+Token │     │   API Key    │     │ - Monta URL     │     │   request    │     │   stream    │
│ - Acessa    │     │ - Consulta   │     │   upstream      │     │ - Não modif. │     │             │
│   CDN       │     │   Xtream     │     │ - Proxy stream  │     │   dados      │     │             │
│ - Reproduz  │     │ - Gera token │     │                 │     │              │     │             │
└─────────────┘     └──────────────┘     └─────────────────┘     └──────────────┘     └─────────────┘
     ▲                    ▲                       ▲                      ▲                    ▲
     │                    │                       │                      │                    │
  Apenas vê          Nunca expõe            Nunca expõe             Nunca expõe         Nunca expõe
  domínio CDN       credenciais            URL original            IP original         credenciais
```

---

## Fluxo de Funcionamento

### Passo a Passo

1. **Cliente solicita mídia**
   - O cliente envia uma requisição à API Privada com o ID da mídia e tipo (live/vod/series).

2. **API valida autenticação**
   - A API verifica a chave de API (`X-API-Key` no header).

3. **API consulta o Xtream**
   - A API busca informações da mídia no servidor Xtream para obter nome, duração e detalhes.

4. **API gera token temporário**
   - Um token HMAC-SHA256 é criado com: ID da mídia, tipo, stream ID, extensão, data de expiração e ID único.

5. **Cliente recebe link da CDN**
   - A API retorna: `https://cdn.dominio.com/stream/{token}`

6. **Cliente acessa a CDN**
   - O navegador requisita o stream ao domínio da CDN (Cloudflare Workers).

7. **CDN valida o token**
   - O Worker verifica a assinatura HMAC, expiração e validade do token.

8. **CDN monta URL upstream**
   - O Worker constrói a URL original do Xtream usando credenciais das variáveis de ambiente.

9. **Proxy residencial encaminha**
   - O Worker faz fetch através do proxy residencial (Cloudflare Workers não têm IP bloqueado pelo Xtream).

10. **Xtream retorna o stream**
    - O servidor Xtream envia os dados de mídia ao proxy.

11. **CDN retransmite ao cliente**
    - O Worker faz proxy pass-through dos dados, mantendo streaming em tempo real.

12. **Cliente reproduz**
    - O navegador recebe e reproduz o vídeo conectado apenas ao domínio da CDN.

---

## Estrutura do Projeto

```
CdnServer/
├── .env                          # Variáveis de ambiente (não versionar)
├── .env.example                  # Exemplo de configuração
├── package.json                  # Dependências e scripts
├── tsconfig.json                 # Configuração TypeScript
├── wrangler.toml                 # Configuração Cloudflare Workers
├── DOCUMENTACAO.md               # Esta documentação
│
└── src/
    ├── api/                      # API Privada (Node.js + Express)
    │   ├── index.ts              # Entry point do servidor
    │   ├── routes/
    │   │   ├── media.ts          # Rotas de mídia e geração de tokens
    │   │   └── health.ts         # Rotas de health check
    │   └── middleware/
    │       ├── auth.ts           # Validação de API Key
    │       └── rateLimit.ts      # Rate limiting
    │
    ├── cdn/                      # Cloudflare Worker (CDN Edge)
    │   └── index.ts              # Worker principal de streaming
    │
    └── shared/                   # Código compartilhado
        ├── types/
        │   └── index.ts          # Definições de tipos TypeScript
        ├── utils/
        │   ├── token.ts          # Geração e verificação de tokens
        │   └── logger.ts         # Sistema de logging
        └── services/
            ├── xtream.ts         # Cliente da API Xtream
            └── proxy.ts          # Serviço de proxy residencial
```

---

## Instalação

### Pré-requisitos

- Node.js >= 18.0.0
- npm ou yarn
- Conta Cloudflare (para deploy do Worker)
- Conta em um serviço de proxy residencial
- Servidor Xtream com acesso à API

### Passos

```bash
# 1. Clone ou copie o projeto
cd CdnServer

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o arquivo .env com suas credenciais

# 4. Verifique se tudo está correto
npm run typecheck
```

---

## Configuração

### Arquivo `.env`

Copie o `.env.example` para `.env` e preencha todos os campos:

```bash
cp .env.example .env
```

### Deploy do Cloudflare Worker

As variáveis de ambiente do Worker devem ser configuradas no dashboard do Cloudflare:

```bash
# Via Wrangler CLI
wrangler secret put XTREAM_URL
wrangler secret put XTREAM_USERNAME
wrangler secret put XTREAM_PASSWORD
wrangler secret put PROXY_URL
wrangler secret put PROXY_USER
wrangler secret put PROXY_PASS
wrangler secret put TOKEN_SECRET
wrangler secret put CDN_DOMAIN
```

Ou configure diretamente no dashboard: Workers & Pages > cdn-proxy > Settings > Variables

---

## Variáveis de Ambiente

### Servidor Xtream

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `XTREAM_URL` | Sim | URL base do servidor Xtream | `https://prndcdn.online` |
| `XTREAM_USERNAME` | Sim | Usuário do Xtream | `53652219` |
| `XTREAM_PASSWORD` | Sim | Senha do Xtream | `31939872` |

### Proxy Residencial

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `PROXY_URL` | Sim | URL do proxy com formato `protocolo://host:porta` | `http://proxy.example.com:2101` |
| `PROXY_USER` | Sim | Usuário do proxy | `AOA8ASD08U298HA` |
| `PROXY_PASS` | Sim | Senha do proxy | `AOA8ASD08U298HA` |

### API Privada

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `API_KEY` | Sim | Chave de autenticação da API | `sua_chave_api_aqui` |
| `TOKEN_SECRET` | Sim | Segredo para assinatura HMAC dos tokens | `segredo_minimo_32_caracteres` |
| `PORT` | Não | Porta do servidor (padrão: 3000) | `3000` |

### Domínios

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `CDN_DOMAIN` | Sim | Domínio do Cloudflare Worker | `cdn.seudominio.com` |
| `PANEL_DOMAIN` | Não | Domínio do painel de controle | `painel.seudominio.com` |
| `ALLOWED_ORIGINS` | Não | Origens permitidas (CORS), separadas por vírgula | `https://painel.seudominio.com` |

### Segurança

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `RATE_LIMIT_WINDOW_MS` | Não | Janela de rate limit em ms (padrão: 60000) | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Não | Máximo de requisições por janela (padrão: 60) | `60` |

### Cache

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `CACHE_TTL_SECONDS` | Não | TTL do cache em segundos (padrão: 3600) | `3600` |
| `CACHE_MAX_ENTRIES` | Não | Máximo de entradas no cache (padrão: 1000) | `1000` |

### Expiração de Tokens

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `EXTRA_EXPIRATION_MINUTES` | Não | Minutos extras de expiração (padrão: 60) | `60` |

### Logging

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `LOG_LEVEL` | Não | Nível de log: debug, info, warn, error (padrão: info) | `info` |

---

## Iniciando o Projeto

### Desenvolvimento

```bash
# Inicia o servidor de desenvolvimento com hot reload
npm run dev
```

O servidor estará disponível em `http://localhost:3000`.

### Verificação

```bash
# Verifica tipos TypeScript
npm run typecheck

# Verifica erros de lint
npm run lint
```

---

## Execução em Produção

### API Privada

```bash
# Build para produção
npm run build:api

# Inicia o servidor
node dist/api/index.js
```

Recomendações para produção:
- Use PM2 ou systemd para gerenciar o processo
- Configure HTTPS com Nginx/Caddy como reverse proxy
- Use variáveis de ambiente seguras (não o arquivo .env)
- Configure monitoramento e logs

### Cloudflare Worker

```bash
# Deploy do Worker
npm run build:cdn

# Ou diretamente
wrangler deploy
```

### Configuração do Domínio

1. No Cloudflare DNS, adicione um registro CNAME apontando para o Worker
2. No Worker, configure o domínio personalizado em Settings > Triggers > Custom Domains

---

## Endpoints da API

### Base URL

```
http://localhost:3000
```

### Headers Obrigatórios

Todos os endpoints de mídia requerem:

```
X-API-Key: sua_chave_api
Content-Type: application/json
```

---

### POST /api/token

Gera um token temporário para acessar uma mídia via CDN.

**Headers:**

| Header | Obrigatório | Descrição |
|--------|-------------|-----------|
| `X-API-Key` | Sim | Chave de API |
| `Content-Type` | Sim | `application/json` |

**Body (JSON):**

| Campo | Obrigatório | Tipo | Descrição |
|-------|-------------|------|-----------|
| `mediaId` | Sim | string | ID da mídia no Xtream |
| `mediaType` | Sim | string | Tipo: `live`, `vod` ou `series` |
| `duration` | Não | number | Duração em minutos (padrão: 120) |
| `extension` | Não | string | Extensão do arquivo (padrão: mp4, apenas para vod/series) |

**Resposta 201:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "url": "https://cdn.seudominio.com/stream/eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2025-01-15T18:30:00.000Z",
  "duration": 180
}
```

**Resposta 400:**

```json
{
  "error": "Bad Request",
  "message": "mediaId e mediaType são obrigatórios.",
  "statusCode": 400
}
```

**Resposta 401:**

```json
{
  "error": "Unauthorized",
  "message": "Chave de API inválida ou ausente.",
  "statusCode": 401
}
```

**Resposta 404:**

```json
{
  "error": "Not Found",
  "message": "Mídia não encontrada no servidor Xtream.",
  "statusCode": 404
}
```

**Resposta 429:**

```json
{
  "error": "Too Many Requests",
  "message": "Muitas requisições. Tente novamente mais tarde.",
  "statusCode": 429
}
```

---

### GET /api/media/live

Lista categorias de canais ao vivo.

**Headers:**

| Header | Obrigatório | Descrição |
|--------|-------------|-----------|
| `X-API-Key` | Sim | Chave de API |

**Resposta 200:**

```json
{
  "categories": [
    {
      "category_id": "1",
      "category_name": "Filmes",
      "parent_id": 0
    }
  ]
}
```

---

### GET /api/media/live/:categoryId

Lista canais ao vivo de uma categoria.

**Parâmetros de URL:**

| Parâmetro | Obrigatório | Descrição |
|-----------|-------------|-----------|
| `categoryId` | Sim | ID da categoria |

**Resposta 200:**

```json
{
  "streams": [
    {
      "num": "1",
      "name": "Canal Example",
      "stream_type": "live",
      "stream_id": 12345,
      "stream_icon": "https://example.com/logo.png",
      "category_id": "1"
    }
  ]
}
```

---

### GET /api/media/vod

Lista categorias de filmes (VOD).

**Headers:**

| Header | Obrigatório | Descrição |
|--------|-------------|-----------|
| `X-API-Key` | Sim | Chave de API |

**Resposta 200:**

```json
{
  "categories": [
    {
      "category_id": "1",
      "category_name": "Ação",
      "parent_id": 0
    }
  ]
}
```

---

### GET /api/media/vod/:categoryId

Lista filmes de uma categoria.

**Parâmetros de URL:**

| Parâmetro | Obrigatório | Descrição |
|-----------|-------------|-----------|
| `categoryId` | Sim | ID da categoria |

**Resposta 200:**

```json
{
  "streams": [
    {
      "num": 1,
      "name": "Filme Example",
      "stream_type": "movie",
      "stream_id": 67890,
      "stream_icon": "https://example.com/poster.jpg",
      "container_extension": "mp4",
      "duration_secs": 7200,
      "duration": "02:00:00"
    }
  ]
}
```

---

### GET /api/media/series

Lista categorias de séries.

**Headers:**

| Header | Obrigatório | Descrição |
|--------|-------------|-----------|
| `X-API-Key` | Sim | Chave de API |

**Resposta 200:**

```json
{
  "categories": [
    {
      "category_id": "1",
      "category_name": "Drama",
      "parent_id": 0
    }
  ]
}
```

---

### GET /api/media/series/:categoryId

Lista séries de uma categoria.

**Parâmetros de URL:**

| Parâmetro | Obrigatório | Descrição |
|-----------|-------------|-----------|
| `categoryId` | Sim | ID da categoria |

**Resposta 200:**

```json
{
  "series": [
    {
      "num": 1,
      "name": "Série Example",
      "series_id": 11111,
      "cover": "https://example.com/cover.jpg",
      "plot": "Sinopse da série...",
      "genre": "Drama",
      "rating": "8.5"
    }
  ]
}
```

---

### GET /api/media/series/:seriesId/info

Busca informações detalhadas de uma série.

**Parâmetros de URL:**

| Parâmetro | Obrigatório | Descrição |
|-----------|-------------|-----------|
| `seriesId` | Sim | ID da série |

**Resposta 200:**

```json
{
  "info": {
    "series_id": 11111,
    "name": "Série Example",
    "cover": "https://example.com/cover.jpg",
    "plot": "Sinopse completa...",
    "cast": "Ator 1, Ator 2",
    "director": "Diretor Example",
    "genre": "Drama",
    "releaseDate": "2023-01-15",
    "rating": "8.5",
    "seasons": 3
  }
}
```

---

### GET /api/media/series/:seriesId/episodes/:season

Lista episódios de uma temporada.

**Parâmetros de URL:**

| Parâmetro | Obrigatório | Descrição |
|-----------|-------------|-----------|
| `seriesId` | Sim | ID da série |
| `season` | Sim | Número da temporada |

**Resposta 200:**

```json
{
  "episodes": [
    {
      "id": "1",
      "episode_num": 1,
      "title": "Piloto",
      "container_extension": "mp4",
      "info": {
        "releasedate": "2023-01-15",
        "plot": "Sinopse do episódio...",
        "duration_secs": 2700,
        "duration": "00:45:00",
        "season": 1
      }
    }
  ]
}
```

---

### GET /api/health

Verifica o status dos serviços.

**Resposta 200:**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "services": {
    "proxy": "connected"
  }
}
```

**Resposta 503:**

```json
{
  "status": "degraded",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "services": {
    "proxy": "unreachable"
  }
}
```

---

### GET /api/info

Retorna informações do serviço.

**Resposta 200:**

```json
{
  "service": "CDN Media Proxy API",
  "version": "1.0.0",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

---

## Autenticação

### API Key

Todas as requisições à API Privada devem incluir a chave de API no header:

```
X-API-Key: sua_chave_api_aqui
```

A chave é configurada via variável de ambiente `API_KEY`.

### Validação

1. O middleware `auth.ts` verifica a presença e validade da API Key
2. Requisições sem chave ou com chave inválida recebem erro 401
3. A chave nunca é logada ou exposta em respostas

---

## Tokens Temporários

### Geração

1. O cliente solicita um token via `POST /api/token`
2. A API valida a mídia no Xtream
3. Um token HMAC-SHA256 é gerado com:
   - `mediaId`: ID da mídia
   - `mediaType`: Tipo (live/vod/series)
   - `streamId`: ID do stream
   - `extension`: Extensão do arquivo
   - `exp`: Timestamp de expiração
   - `iat`: Timestamp de criação
   - `jti`: ID único do token

### Estrutura do Token

```
Header.Payload.Signature

Header: {"alg":"HS256","typ":"JWT"}
Payload: {
  "mediaId": "12345",
  "mediaType": "vod",
  "streamId": "12345",
  "extension": "mp4",
  "exp": 1705344600,
  "iat": 1705333800,
  "jti": "a1b2c3d4e5f6..."
}
Signature: HMAC-SHA256(base64(header) + "." + base64(payload), TOKEN_SECRET)
```

### Expiração

A regra de expiração é:

```
Tempo de expiração = Duração da mídia + EXTRA_EXPIRATION_MINUTES
```

Exemplos:

| Mídia | Duração | Expiração (+ 60min) |
|-------|---------|---------------------|
| Filme curto | 1h30 | 2h30 |
| Filme médio | 2h | 3h |
| Filme longo | 3h | 4h |
| Série (episódio) | 45min | 1h45 |

### Validação no CDN

O Cloudflare Worker verifica:

1. **Assinatura HMAC**: O token foi assinado com o `TOKEN_SECRET` correto
2. **Data de expiração**: O token não expirou
3. **Validade mínima**: Restam pelo menos 60 segundos de validade

### Reutilização

- Tokens podem ser reutilizados dentro do período de validade
- Cada token possui um `jti` único para rastreamento
- Após expiração, o token é rejeitado permanentemente

---

## Streaming

### Como Funciona

O streaming é feito em modo **proxy pass-through**:

1. O Cloudflare Worker recebe a requisição do cliente
2. Valida o token
3. Constrói a URL upstream (Xtream) usando credenciais do `.env`
4. Faz `fetch` através do proxy residencial
5. Retransmite os dados recebidos diretamente ao cliente

### Características

- **Streaming em tempo real**: Não baixa o arquivo completo antes de transmitir
- **Suporte a Range requests**: Permite seeking em vídeos VOD
- **Sem redirecionamento**: O cliente nunca é redirecionado para outro servidor
- **Headers preservados**: Content-Type, Content-Range, Accept-Ranges são mantidos
- **Connection keep-alive**: Conexão persistente para melhor performance

### Proxy Residencial

O Xtream frequentemente bloqueia IPs de data centers (como os da Cloudflare). O proxy residencial resolve isso:

```
Cloudflare Worker → Proxy Residencial → Xtream Server
```

O Worker configura o proxy via query parameter:

```
http://proxy.example.com:2101?url=https://xtream.com/stream/...
```

### Suporte a Formatos

| Tipo | Formato | Extensão |
|------|---------|----------|
| Live | HLS | `.m3u8` |
| VOD | MP4 (configurável) | `.mp4` |
| Series | MP4 (configurável) | `.mp4` |

### Suporte a Range Requests

Para VOD/Series, o sistema suporta Range requests para seeking:

```
Range: bytes=0-1048575
```

O Cloudflare Worker repassa o header `Range` ao upstream e retorna o `Content-Range` adequado.

---

## Segurança

### Implementada

- **Tokens HMAC-SHA256**: Assinatura criptográfica para validação
- **Validação de expiração**: Tokens têm tempo limitado
- **Rate Limiting**: Proteção contra abuso (configurável)
- **Helmet.js**: Headers de segurança HTTP
- **CORS**: Controle de origem permitida
- **Rate Limit por IP/API Key**: Limite de requisições
- **Sem exposição de credenciais**: Tudo via variáveis de ambiente
- **Logging seguro**: Credenciais nunca são logadas
- **Error handling**: Mensagens de erro genéricas ao cliente
- **X-Content-Type-Options: nosniff**: Previne MIME sniffing
- **X-Frame-Options: DENY**: Previne clickjacking
- **Cache-Control: no-store**: Previne cache de dados sensíveis

### O que NUNCA é exposto

| Informação | Status |
|------------|--------|
| URL original da mídia | Protegida |
| Domínio do Xtream | Protegido |
| IP do proxy | Protegido |
| Credenciais do Xtream | Protegidas |
| Credenciais do proxy | Protegidas |
| Token Secret | Protegido |
| API Key | Protegida |

### Proteção contra Descoberta

O usuário não pode descobrir a origem da mídia porque:

1. O token contém apenas IDs internos, não URLs
2. O Worker constrói a URL upstream server-side
3. O proxy intermediário oculta o IP real do Xtream
4. O cliente nunca recebe a URL original
5. Não há redirecionamentos HTTP
6. Não há JavaScript client-side que exponha informações

---

## Erros

### Códigos HTTP Utilizados

| Código | Significado | Uso |
|--------|-------------|-----|
| 200 | OK | Requisição bem-sucedida |
| 201 | Created | Token criado com sucesso |
| 204 | No Content | Resposta OPTIONS (CORS) |
| 400 | Bad Request | Parâmetros inválidos |
| 401 | Unauthorized | API Key inválida ou token expirado |
| 404 | Not Found | Rota ou mídia não encontrada |
| 429 | Too Many Requests | Rate limit excedido |
| 500 | Internal Server Error | Erro interno do servidor |
| 502 | Bad Gateway | Erro ao acessar upstream |
| 503 | Service Unavailable | Serviço temporariamente indisponível |

### Mensagens de Erro

Todos os erros seguem o padrão:

```json
{
  "error": "Tipo do Erro",
  "message": "Mensagem descritiva em português.",
  "statusCode": 400
}
```

---

## Troubleshooting

### Problemas Comuns

#### 1. Erro 401 ao acessar a API

**Causa**: API Key incorreta ou ausente

**Solução**: Verifique se o header `X-API-Key` está correto e se a variável `API_KEY` no `.env` confere.

#### 2. Erro 404 "Mídia não encontrada"

**Causa**: O ID da mídia não existe no Xtream ou credenciais incorretas

**Solução**: Verifique `XTREAM_URL`, `XTREAM_USERNAME` e `XTREAM_PASSWORD` no `.env`.

#### 3. Erro 502 no streaming

**Causa**: Proxy residencial inacessível ou Xtream bloqueando

**Solução**:
- Verifique se o proxy está funcionando: `GET /api/health`
- Confirme as credenciais do proxy no `.env`
- Verifique se o Xtream não mudou suas APIs

#### 4. Erro 429 Too Many Requests

**Causa**: Rate limit excedido

**Solução**: Aumente `RATE_LIMIT_MAX_REQUESTS` ou aguarde a janela de reset.

#### 5. Token expirado imediatamente

**Causa**: Diferença de horário entre servidores

**Solução**: Verifique se o relógio do servidor está correto e se `EXTRA_EXPIRATION_MINUTES` está adequado.

#### 6. Cloudflare Worker não conecta ao proxy

**Causa**: Variáveis de ambiente não configuradas no Cloudflare

**Solução**: Configure as variáveis via `wrangler secret put` ou no dashboard do Cloudflare.

### Logs

Os logs seguem o formato:

```
[2025-01-15T12:00:00.000Z] [INFO] Request {"method":"POST","path":"/api/token","status":201,"duration":"45ms"}
```

Níveis de log disponíveis: `debug`, `info`, `warn`, `error`.

---

## Boas Práticas

### Desenvolvimento

1. **Nunca commite o arquivo `.env`** - Use `.env.example` como referência
2. **Use HTTPS em produção** - Configure Nginx/Caddy como reverse proxy
3. **Valide todos os inputs** - Nunca confie em dados do cliente
4. **Log erros, não dados sensíveis** - Credenciais nunca nos logs
5. **Teste antes de deployar** - Use `npm run typecheck` e `npm run lint`

### Segurança

1. **Rotacione o TOKEN_SECRET** periodicamente
2. **Use API Keys fortes** - Mínimo de 32 caracteres aleatórios
3. **Configure CORS** adequadamente
4. **Monitore o rate limiting** - Analise padrões de uso
5. **Mantenha dependências atualizadas**

### Performance

1. **Configure cache no Cloudflare** - Para catálogos de mídia
2. **Use keep-alive** nas conexões de proxy
3. **Monitore a latência** do proxy residencial
4. **Configure timeouts** adequadamente

### Manutenção

1. **Documente mudanças** no `.env.example`
2. **Mantenha a documentação atualizada**
3. **Use versionamento** (Git) para todas as mudanças
4. **Faça backup** das configurações regularmente

---

## Exemplos de Uso

### 1. Gerar Token para Filme

```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sua_chave_api" \
  -d '{
    "mediaId": "67890",
    "mediaType": "vod",
    "duration": 120
  }'
```

**Resposta:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "url": "https://cdn.seudominio.com/stream/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2025-01-15T15:30:00.000Z",
  "duration": 120
}
```

### 2. Gerar Token para Canal ao Vivo

```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sua_chave_api" \
  -d '{
    "mediaId": "12345",
    "mediaType": "live"
  }'
```

### 3. Listar Categorias de Filmes

```bash
curl http://localhost:3000/api/media/vod \
  -H "X-API-Key: sua_chave_api"
```

### 4. Listar Filmes por Categoria

```bash
curl http://localhost:3000/api/media/vod/5 \
  -H "X-API-Key: sua_chave_api"
```

### 5. Listar Séries

```bash
curl http://localhost:3000/api/media/series \
  -H "X-API-Key: sua_chave_api"
```

### 6. Buscar Info de uma Série

```bash
curl http://localhost:3000/api/media/series/11111/info \
  -H "X-API-Key: sua_chave_api"
```

### 7. Listar Episódios

```bash
curl http://localhost:3000/api/media/series/11111/episodes/1 \
  -H "X-API-Key: sua_chave_api"
```

### 8. Acessar Stream via CDN (no navegador)

```
https://cdn.seudominio.com/stream/eyJhbGciOiJIUzI1NiIs...
```

### 9. Verificar Health do Serviço

```bash
curl http://localhost:3000/api/health
```

### 10. Usando o Token no Player (Exemplo com HLS.js)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Player CDN</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
  <video id="video" controls width="640"></video>
  <script>
    // O token é obtido da API privada (server-side)
    const streamUrl = 'https://cdn.seudominio.com/stream/eyJhbGciOiJIUzI1NiIs...';
    const video = document.getElementById('video');

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
    }
  </script>
</body>
</html>
```

---

## Arquitetura Detalhada

### Comunicação API → Xtream

A API Privada se comunica diretamente com o Xtream para:

- Listar categorias (live, vod, series)
- Listar streams por categoria
- Buscar informações de mídia específica
- Validar se uma mídia existe antes de gerar token

### Comunicação CDN → Proxy → Xtream

O Cloudflare Worker se comunica com o Xtream através do proxy:

1. **Worker** monta a URL: `http://proxy:port?url=https://xtream/stream/...`
2. **Proxy** recebe a requisição e encaminha ao Xtream
3. **Xtream** retorna os dados de stream
4. **Proxy** retorna os dados ao Worker
5. **Worker** retransmite ao cliente

### Por que Proxy Residencial?

- Cloudflare Workers usam IPs de data center
- Xtream bloqueia IPs de data center
- Proxy residencial usa IPs de ISPs residenciais
- O Xtream não bloqueia esses IPs

---

## Notas para Deploy

### Cloudflare Workers

1. Instale o Wrangler CLI: `npm install -g wrangler`
2. Faça login: `wrangler login`
3. Configure as variáveis secretas via `wrangler secret put`
4. Faça deploy: `wrangler deploy`

### API Privada (VPS/Servidor)

1. Instale Node.js 18+
2. Configure as variáveis de ambiente
3. Use PM2: `pm2 start dist/api/index.js --name cdn-api`
4. Configure Nginx como reverse proxy com HTTPS

### Variáveis Secretas no Cloudflare

```bash
wrangler secret put XTREAM_URL
wrangler secret put XTREAM_USERNAME
wrangler secret put XTREAM_PASSWORD
wrangler secret put PROXY_URL
wrangler secret put PROXY_USER
wrangler secret put PROXY_PASS
wrangler secret put TOKEN_SECRET
wrangler secret put CDN_DOMAIN
```

---

*Documentação gerada em Julho de 2026 - CDN Media Proxy v1.0.0*
<img width="984" height="774" alt="image" src="https://github.com/user-attachments/assets/2425b0bf-d2c0-4c18-9289-ca4b0dcfeaa0" />
