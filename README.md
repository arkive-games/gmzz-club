# GMZZ Club

Independent Lord of the Mysteries club management: accounts, multiple characters,
approved club membership, role-based administration, activity registration and
five-squad / six-member team planning.

**Runtime: one Go API application + PostgreSQL.** The production executable contains
only the API; the WeChat mini-program is the supported client. No Redis or additional
service is required.

## Quick start

Requires Docker Compose, or Go 1.26+, Node 22.12+ and PostgreSQL 17+.

```powershell
Copy-Item .env.example .env
# Set POSTGRES_PASSWORD and matching DATABASE_URL in .env.
docker compose up --build -d
```

The API listens on http://localhost:19080. Register an account through the mini-program
or an API client, then promote that exact account:

```powershell
docker compose exec app club promote your-username
```

Register a second account for the initial club owner. As platform administrator,
open club administration, create a club and select the other registered user as
owner. The administrator is not automatically enrolled. Other users submit an
application in Discover; the club owner/administrator approves it in Members.
Users then bind their own unbound characters in Members.

Compose reads `.env` automatically. The Go program reads process environment
variables; it does not implicitly load `.env`.

## Local development (PowerShell)

```powershell
docker compose up -d db
$env:DATABASE_URL = 'postgres://club:change-me@localhost:55432/club?sslmode=disable'
npm ci
go run .
```

For the optional browser client, run `npm run build` and `npm run dev` in another
terminal; Vite proxies `/api` to the Go server on port 19080. For a production binary:

```powershell
npm run build
go build -trimpath -o club.exe .
./club.exe
```

Set `COOKIE_SECURE=true` when serving behind an HTTPS reverse proxy. `PORT` defaults
to 19080. The compose application binds to localhost; put it behind your existing
reverse proxy when deploying. Use a URL-safe database password in the compose URL,
or provide a properly encoded `DATABASE_URL` if configuring the binary directly.

## Checks

```powershell
npm run build
go vet ./...
go test ./...
# Integration tests create and drop an isolated schema, never existing tables:
$env:TEST_DATABASE_URL = $env:DATABASE_URL
go test ./server -count=1 -v
```

Browser verification uses `npx playwright test` with a running app and PostgreSQL;
see `web/e2e/` for the complete workflow. Tests create identifiable test accounts
and a test club. They do not require or modify existing user accounts.

To create a populated local preview (18 characters, two activities, saved lineups):

```powershell
node scripts/seed-demo.mjs
```

This requires `DATABASE_URL` for the same local database as the running application.
It prints separate platform administrator, owner and member credentials. The script
only accepts a localhost application URL and uses a new fixture namespace each run.

## Layout and data

- `server/`: HTTP routes, authorization, transactional domain rules and schema.
- `server/catalog.json`: small offline game catalog; served by `/api/catalog`.
- `web/src/`: optional React browser client and shared loadout editors.
- `miniapp/`: WeChat mini-program client built with Taro 4 + React + TypeScript + NutUI React Taro.
- `docs/design.md`: accepted behavior, permission rules and persistence decisions.
- `scripts/sync-catalog.mjs`: regenerates the catalog from a local `data-gmzz` checkout.

```powershell
npm run catalog:sync -- E:/arkive-games/data-gmzz
```

Catalog provenance: Arkive GMZZ `equipment/equipment.json`, `score/talents.json`,
`relics/relics.json`, `secretpartners/secretpartners.json`, `fellows/fellows.json`.
The extracted game data is CC BY-NC 4.0, credited to Arkive / Yihao Liu (tc-imba).
It is included for noncommercial use. No existing Arkive source files are copied.

## WeChat mini-program

```powershell
cd miniapp
npm install
$env:TARO_APP_API_BASE = 'https://club.example.com'
npm run dev:weapp
```

Open `miniapp/dist` in WeChat DevTools. Build a release package with `npm run build:weapp`. The mini-program keeps the club visual language, uses native Taro components with NutUI React Taro, and implements team movement with touch events. See [`docs/miniapp.md`](docs/miniapp.md) for API host, HTTPS and session notes.

