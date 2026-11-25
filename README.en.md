# Quayloom · 0.3.8

[![简体中文](https://img.shields.io/badge/简体中文-Readme-lightgrey)](README.md) [![English](https://img.shields.io/badge/English-Current-blue)](README.en.md) ![License](https://img.shields.io/badge/license-AGPL--3.0--only-green) ![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933)

**Keep your AI conversations and generation jobs on your own server.**

Quayloom is a self-hosted, multi-provider AI chat workspace built on the official [chat-demo](https://github.com/deepseek-ai/chat-demo) interface. Administrators configure providers, distribute access codes and set quotas. Sign in to the same instance from a computer or phone to continue your conversations. Refreshing, closing a page or signing out does not actively cancel an already submitted job.

- **Server-side conversations and jobs:** persistent history, cross-device access and progress recovery after refresh.
- **Multiple providers:** OpenAI Chat Completions / Responses, Anthropic Messages and DeepSeek extensions, with explicit per-model capabilities.
- **Administration and access codes:** centralized provider keys, models, permissions, concurrency, request and token quotas.
- **Chat and statistics:** streaming, reasoning, message branches, Markdown, math, Mermaid and statistics based on reported upstream usage.
- **Languages and appearance:** Chinese / English across login, chat and administration; light, dark or browser-following themes, with browser-following as the default.
- **Self-hosting and mobile access:** Docker / 1Panel deployment, subpath support and Android WebView client source.

**Quick navigation**

- **Explore:** [What's new](#whats-new) · [Features](#features) · [Providers](#providers)
- **Deploy:** [Docker / 1Panel](#deployment) · [Run from source](#development) · [Deployment guide, Chinese](docs/DEPLOYMENT.md)
- **Use and maintain:** [Jobs and quotas](#jobs-and-quotas) · [Statistics](#statistics) · [Backups](#backups) · [Update checks](#update-checks) · [Android](#android) · [FAQ](#faq)
- **Project terms:** [License and credits](#license-and-credits) · [Privacy](#privacy) · [Disclaimer](#disclaimer)

## What's new

Version **0.3.8** adds a **Grok (xAI)** provider preset using `https://api.x.ai/v1`. Discover account-available models on the server or enter IDs manually. Newly added models at the official xAI endpoint default to Responses; existing model protocols remain unchanged. Encrypted server-side keys, persistent jobs and provider quotas are reused, without automatically enabling search or other capabilities. Existing Android clients can use the channel without upgrading.

Version **0.3.7** adds administrator-only stable-release update checks with manual checking and bilingual status messages, without automatic upgrades. It changes the default backend, Docker and Compose port to **9810**. Explicit `PORT` settings continue to override the default. Docker images are published to GHCR, and Android APKs are distributed through GitHub Releases. Android **0.2.1** adds encrypted credential remembering and controlled autofill, scoped to the exact workspace address and login mode; it never automatically submits a login.

Version 0.3.6 adds Chinese / English switching on login, chat and admin pages. The initial language follows the browser language. Appearance supports light, dark and browser-following modes, defaulting to the browser preference and reacting to live changes. Both preferences persist across refreshes and synchronize between same-origin tabs; signing out does not clear them. User content, provider names and model IDs are not translated.

## Features

- Streaming conversations, message branches, Markdown, math, Mermaid and history ZIP import/export.
- Provider presets for DeepSeek, OpenAI, Grok (xAI), Anthropic, OpenRouter, Ollama and custom endpoints.
- Administrator-managed model discovery, defaults, protocol selection and capability flags.
- Access codes with expiry and allowed providers/models. Login silently trims surrounding whitespace without changing internal characters.
- Shared provider concurrency limits, plus independent access-code × provider request, token and concurrency quotas.
- Administrator analytics with date, provider, model and identity filters; persisted task details and actual usage coverage.
- Read-only administrator access to access-code conversations and their generation state.
- In-app announcements for all or selected access codes, unread/read state and administrator withdrawal.
- HttpOnly / SameSite=Strict login cookies and server-side AES-256-GCM encryption of provider keys. Keys are not returned to the browser.

Access codes currently allow **text and reasoning only**, not search, file or voice tools. See the [access-code guide, Chinese](docs/ACCESS_CODES.md).

## Deployment

### Prebuilt GHCR image

Image: `ghcr.io/ettijbaqaee/quayloom:0.3.8`; rolling tag: `latest`; platform: `linux/amd64`.

This is the complete composition, identical to [compose.ghcr.yaml](compose.ghcr.yaml). Import it into 1Panel or use the repository file:

```yaml
name: quayloom
services:
  quayloom:
    image: ghcr.io/ettijbaqaee/quayloom:0.3.8
    pull_policy: always
    init: true
    restart: unless-stopped
    ports:
      - "127.0.0.1:${PORT:-9810}:${PORT:-9810}"
    environment:
      HOST: "0.0.0.0"
      PORT: "${PORT:-9810}"
      PUBLIC_ORIGIN: "${PUBLIC_ORIGIN:?Set PUBLIC_ORIGIN in .env}"
      COOKIE_SECURE: "${COOKIE_SECURE:-true}"
      QUOTA_TIME_ZONE: "${QUOTA_TIME_ZONE:-Asia/Shanghai}"
      NODE_OPTIONS: "--max-old-space-size=512"
    volumes:
      - quayloom-data:/app/data
    mem_limit: 768m
    cpus: 1.5
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
volumes:
  quayloom-data:
```

Create a private `.env` in the same directory:

```dotenv
PUBLIC_ORIGIN=https://chat.example.com
PORT=9810
COOKIE_SECURE=true
QUOTA_TIME_ZONE=Asia/Shanghai
```

Replace the example domain, then start (or set the same variables in 1Panel):

```sh
docker compose -f compose.ghcr.yaml pull
docker compose -f compose.ghcr.yaml up -d
docker compose -f compose.ghcr.yaml logs quayloom
```

Proxy the public site to `127.0.0.1:9810`; the binding is intentionally loopback-only. The image has a built-in health check. Read the first administrator password from the log. For local-only HTTP evaluation, use `PUBLIC_ORIGIN=http://127.0.0.1:9810` and `COOKIE_SECURE=false`. If you override `PORT`, also change your reverse-proxy upstream. Before upgrades, back up the data and master key, update the pinned image tag, pull and recreate; never delete the data volume to upgrade.

The image is built for the **root path**. Subpath deployments must rebuild from source with matching build and runtime base paths; changing only `BASE_PATH` cannot rewrite the bundled frontend.

### Docker Compose (build from source)

Install Docker Engine and Compose v2, then copy the environment template in the repository root:

```sh
cp .env.example .env
```

Edit `.env` for the public origin, for example:

```dotenv
PUBLIC_ORIGIN=https://chat.example.com
COOKIE_SECURE=true
```

Build and start:

```sh
docker compose up -d --build
docker compose logs quayloom
```

On first initialization, the server prints a generated administrator password once. Open `/admin` on your domain to sign in. Alternatively, configure `ADMIN_PASSWORD_FILE` and a read-only secret-file mount before the first start. Do not commit real passwords.

The supplied composition publishes **only `127.0.0.1:9810`**. Use a reverse proxy for remote access. For a local-only evaluation on the server itself, use `PUBLIC_ORIGIN=http://127.0.0.1:9810` and `COOKIE_SECURE=false`, then visit that address. A different device's loopback address does not point to the server.

Persistent data lives in a Docker volume. **Do not run `docker compose down -v` unless you intend to delete that volume.**

### 1Panel

1. Place the complete source tree on the server, not only the composition template.
2. Prepare `.env` with the exact public origin, cookie setting and optional base path.
3. Import `compose.yaml` in 1Panel container orchestration. Point the build context to the complete project directory and load its environment variables using your panel version's controls.
4. Build and start, then configure a website reverse proxy to `127.0.0.1:9810`, preserving Host and the full request path.
5. Check container health and startup logs, sign in and configure your providers and models.

### Subpaths and offline images

For deployment at `/Quayloom`, set `BASE_PATH=/Quayloom` in `.env`. The supplied composition passes it to both the `APP_BASE_PATH` build argument and the `BASE_PATH` runtime variable. `PUBLIC_ORIGIN` remains an origin such as `https://chat.example.com`, without a path. Rebuild the frontend after changing its base path.

If you have an offline image, import it using `docker load -i <image.tar.gz>`, set the composition's `image` to the actual imported tag and remove `build`. The source repository does not contain large image archives; prebuilt images are distributed through GHCR.

To build an image directly: `docker build -t quayloom:local .`. There is no GitHub Pages deployment or automatic image-publishing workflow. See the [environment template](.env.example) and [deployment guide, Chinese](docs/DEPLOYMENT.md) for reverse-proxy and maintenance details.

## Development

Requires **Node.js 24+** and **pnpm 11.28.5**.

```sh
pnpm install --frozen-lockfile
pnpm type
pnpm lint
pnpm build
cp .env.example .env
pnpm start
```

The default address is `http://127.0.0.1:9810`, with administration at `/admin`. First initialization accepts either `ADMIN_PASSWORD` or `ADMIN_PASSWORD_FILE`, not both; passwords must be 12–1024 characters. If neither is set, a generated password is printed once. These variables do not reset an existing database's password.

For development, run `pnpm start` and `pnpm dev` separately, then open `http://localhost:8090`. Production requires the Node backend; opening HTML directly or using static-only hosting is insufficient. The production backend has no third-party runtime npm dependencies.

The public tree excludes internal tests, verification scripts, screenshots and acceptance logs. Type checking and linting are static checks, not proof that a paid provider supports a feature.

## Providers

1. Sign in to administration and add a provider using the appropriate protocol or preset.
2. Enter the Base URL and API key. Leaving a key blank preserves the saved key; clearing it requires an explicit action.
3. Discover models or enter their actual IDs manually, then configure capabilities according to provider documentation.
4. Choose a default model and return to chat. The connection check tests model listing and authentication, not inference or tool availability.

**Grok (xAI):** choose its quick preset, enter your xAI API key and use `https://api.x.ai/v1`. Model discovery requests `/v1/models` from the server without starting chat generation. Use IDs actually available to the account, or enter IDs manually. New models at the official xAI endpoint default to [Responses](https://docs.x.ai/developers/model-capabilities/text/comparison), with explicit per-model protocol selection; existing models are never switched automatically. Configure reasoning, search and image capabilities only when the actual model supports them; they are disabled by default.

| Protocol | Supported scope |
| --- | --- |
| OpenAI compatible | Explicit per-model Chat Completions or Responses; text, reasoning and declared image support. Native `web_search` requires Responses and an explicitly configured adapter. |
| Anthropic | Messages, declared vision/files and thinking; an explicit `web_search_20250305` adapter is available. DeepSeek-only extensions are filtered. |
| DeepSeek extensions | Corresponding official endpoint and extension protocol; search and voice still depend on upstream support. |

For native search, select the matching search adapter and capability, then enable search in administrator chat. Newly discovered models do not enable it automatically. Search actions, sources and citations reflect upstream data; Quayloom does not run arbitrary tools or fetch web pages itself. Search may incur separate provider charges beyond local chat-token quotas.

Administrator OpenAI-compatible image input supports PNG, JPEG, GIF and WebP, up to 3 MiB per image and 256 images / 128 MiB per identity. Images are stored in the server database and transformed to the selected protocol before sending. Reasoning effort follows the model's declared supported values; a provider default is available.

No model-name guessing, protocol fallback or automatic resend is used after failure. Capability switches do not add features to the upstream service. Provider-specific file IDs and signed contexts are not forwarded to another provider. Gemini, AWS/Vertex and DSH OAuth/device login are not integrated, and DSH credentials are not read.

Private-network endpoints such as Ollama require explicit opt-in. Container loopback refers to the container itself. Dangerous metadata/link-local destinations remain blocked, DNS validation is pinned to the actual connection, and redirects are rejected.

## Jobs and quotas

Conversations and jobs are persisted on the server and isolated by administrator or access-code identity. Administrators can read access-code conversations. Original browser attachments and device preferences remain local; stored OpenAI image references can be used across devices. Legacy browser history is migrated under the corresponding identity, with existing server conversations taking precedence.

- Refreshing, closing the page or signing out does not actively cancel a submitted job. The Stop action does. Expiring, disabling or changing access-code authorization cancels that code's jobs.
- Jobs run for at most ten minutes. An identity can store up to 2,000 conversations, with a 4 MiB limit per conversation.
- A server restart marks incomplete jobs interrupted and retains partial output. It does **not** automatically resend possibly billable requests.
- Concurrent edits use revision checks; conflicting writes are rejected instead of silently overwriting another tab.
- Quotas reserve usage before sending and settle against complete reported usage. Failed or interrupted upstream requests without reliable usage conservatively consume the reservation. Daily quotas use `Asia/Shanghai` by default.
- File and voice requests count toward requests and concurrency, not chat tokens. Local quotas are not a currency budget or provider balance; configure spending limits with the provider too.

## Statistics

The conversation's Chat / Statistics views and clickable generation indicators expose persisted per-task measurements. Administrator read-only access-code views include the same statistics.

Token values come only from upstream usage, not character-count estimates. Input totals include ordinary input, cache reads and cache creation. Unknown values differ from reported zero. Cache hit rate is cache-read tokens divided by total input tokens.

Time to first token measures server-observed wait for nonempty text or reasoning. Output speed uses reported output tokens over the observed output interval when available; otherwise a measured character rate is explicitly labeled characters/second. Context percentage uses actual input tokens and the administrator-configured context window; model limits are not guessed. Tool time remains unknown without a measured local executor.

These are server-observed statistics, not GPU benchmarks, invoices or account balances. See the [detailed metric definitions, Chinese](README.md#statistics).

## Backups

SQLite uses a single-process exclusive lock. **Never run multiple replicas against the same data directory or open another SQLite client on the running production database.**

Before upgrading, stop the instance and back up the complete data directory, administrator password file and deployment configuration. Keep the database and its encryption master key together. If `STUDIO_MASTER_KEY` is used, separately preserve exactly the same 32-byte Base64 key. Lost or mismatched keys prevent credential recovery.

History ZIP exports contain conversations and available images, not API keys, settings or original non-image attachments. Import replaces the current identity's history, not another identity's. Manual history snapshots do not replace a complete database backup.

To reset an administrator password, stop the server, set `RESET_ADMIN_PASSWORD`, run `pnpm reset-password`, clear that variable and update the existing password file/configuration before restarting. Resetting revokes logins but is not a substitute for stopping background jobs.

Use same-origin HTTPS in production. HTTP does not protect transport confidentiality, and server-side conversations are not end-to-end encrypted. Protect the database, backups and browser environment accordingly.

## Update checks

After administrator sign-in, the admin page shows the current workspace version and latest stable GitHub release. It checks once on entry and offers a manual check button. An available update links to its release page; it never downloads, installs, restarts containers or executes remote code automatically.

Only the server contacts the fixed `EttijBaqaee/quayloom` GitHub Releases endpoint. No conversations, provider keys, cookies or access codes are sent. Successful checks are cached for 15 minutes and failed checks for 60 seconds; manual checks respect the cache. Network errors, rate limiting or no stable release produce an unavailable state, not a false up-to-date result, and do not affect chat. This compares the server workspace version, not Android's independent version.

## Android

The signed native client is **0.2.1**; native and workspace versions are independent. Download it from [GitHub Releases](https://github.com/EttijBaqaee/quayloom/releases/latest). The signing identity is preserved for upgrades.

Remember credentials is enabled by default. Only successful logins are saved using AndroidKeyStore and AES-GCM, scoped to the complete workspace address and login mode. Returning to that address fills the credential without submitting a login. Disable remembering or use sign out and clear device session to remove saved credentials. A key failure never falls back to plaintext. Uninstalling or clearing app data requires entering credentials again. Avoid remembering credentials on shared or untrusted devices.

The [Android directory](android/README.md) contains a lightweight WebView client. Enter your workspace URL and use its administrator password or access code. The server must be deployed separately; the client is not an offline model engine, embeds no provider keys and does not store plaintext login credentials. Prefer HTTPS. Build instructions are included; source availability alone does not imply device validation of an APK.

## FAQ

**Can I deploy on GitHub Pages?** No. Persistent jobs, credentials and quotas require the Node backend and writable server storage.

**Why can't another device reach port 9810?** The composition intentionally binds it to loopback. Configure a reverse proxy and the exact `PUBLIC_ORIGIN` instead of exposing it by accident.

**Will a browser refresh stop generation?** No. Submitted jobs run on the server. A server restart interrupts them without automatically sending another paid request.

**Does enabling search or files guarantee support?** No. The selected model, protocol and provider must support the capability. Access codes currently remain text/reasoning only.

**Can I scale using several replicas on one database?** No. This version uses single-process SQLite; give separate instances separate data and keys.

## License and credits

Quayloom's original code is **GNU AGPL v3 only (`AGPL-3.0-only`)**; see [LICENSE](LICENSE). Third-party code, fonts and dependencies retain their own licenses. The upstream [chat-demo](https://github.com/deepseek-ai/chat-demo) MIT notice and `Copyright (c) 2026 DeepSeek` are preserved in [MIT-chat-demo.txt](LICENSES/MIT-chat-demo.txt). See the [third-party inventory](LICENSES/THIRD-PARTY.md) and [NOTICE](NOTICE.md) for complete credits and boundaries.

The README organization references [Pictelier](https://github.com/EttijBaqaee/pictelier), while deployment instructions and feature descriptions here refer to Quayloom. Quayloom is independent and is not an official DeepSeek, DSH or Pictelier product.

The application offers corresponding source through its Source link and `GET /api/source.zip` under the configured base path. Docker and APK distributions also include their matching source. The GitHub development tree may differ from an older image's bundled documentation; operators must provide the source matching the version they distribute or run. Do not publish production credentials, user data or private signing keys. Recipients may rebuild Android with their own signing key.


## Privacy

- Administrator update checks request only public GitHub release metadata from the server, without conversations, provider keys, login cookies or access codes. GitHub can still see the requesting server's IP and normal connection metadata.
- Your deployment server stores conversations, jobs, usage, access codes and configuration. Provider keys are encrypted server-side, and administrators can access data according to their permissions. Browser preferences and necessary local attachment/history-migration data remain on the device. Hosting the source on GitHub does not grant the author access to your instance.
- Model requests, model discovery and network features send necessary inputs, attachments, parameters and authentication to the providers you configure. Their retention, processing location and billing follow their own policies. Obtain authorization before sending another person's sensitive information.
- Android manages cookies in app-private storage and, when enabled, encrypts remembered login credentials with a device key. You can disable and clear them. Device encryption does not replace a secure OS, screen lock or HTTPS.
- Other instance operators may have their own privacy rules. Operators control backups, application logs and proxy logs. README badges, GitHub downloads and GHCR requests expose ordinary connection details such as IP addresses to those services.

## Disclaimer

1. **As-is software.** The project is provided as-is under [LICENSE](LICENSE), without promises of error-free operation, uninterrupted service or fitness for a particular purpose. Assess your environment and keep it maintained.
2. **Deployment and data.** Operators are responsible for access control, TLS, host security, API/master keys and backups. Upgrades can interrupt jobs, and lost keys or data may not be recoverable. Example settings are not a guarantee of a hardened production system.
3. **External services and cost.** Providers control their availability, content policies, pricing and refunds. Failed, cancelled or interrupted requests may still be charged. Local quotas and statistics are not the upstream invoice or a guarantee against overspending; confirm provider billing and set provider-side limits.
4. **Content and rights.** Model output can be wrong, incomplete or subject to third-party rights. Review before publishing, commercial use or important decisions. Obtain necessary permissions for input, attachments and distribution, and comply with applicable law and service terms.
5. **Independent project.** Quayloom is not an official product of DeepSeek, GitHub, DSH or any connected provider. Third-party deployments, modifications and commercial offerings are their operators' responsibility; do not claim author endorsement or make promises on contributors' behalf without authorization.
6. **License and scope.** Original code is AGPL-3.0-only; upstream and third-party components retain their respective licenses. Preserve notices and provide corresponding source when applicable. This statement does not replace the license, add restrictions or reduce granted rights. Warranty exclusions and liability limits apply only as permitted by applicable law; non-excludable obligations remain unaffected.
