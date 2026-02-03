# Maestro Proxy – JS scripts and Portal SDK

## Current setup

1. **Proxy** (`.maestro/proxy/`): HTTP server that:
   - Connects to the Portal REST server via WebSocket (`REST_WS`, default `ws://localhost:3000/ws`).
   - Authenticates with `REST_AUTH_TOKEN`.
   - Exposes **`POST /eval`**: body is JS code (plain text or `{"code":"..."}`); the code runs in Node with **`client`** (a connected `PortalSDK` instance) in scope. Response is `{"result": <return value>}`.

2. **Maestro flows**: Use `runScript` with a file. That file runs in **Maestro’s GraalJS** engine and has:
   - `http.post(url, options)` to call the proxy.
   - Env from `config.yaml` (e.g. `MAESTRO_PROXY_PORT`) – use template literals or string concat so the port is interpolated.

3. **Execution model**:
   - **Maestro JS file**: runs on the device/runner; it should `http.post('http://127.0.0.1:' + MAESTRO_PROXY_PORT + '/eval', { headers: {...}, body: JSON.stringify({ code: "..." }) })`.
   - **`code` string**: is sent to the proxy and executed **on the proxy** (Node). There, only **`client`** (PortalSDK) is in scope. Return value of the code becomes `result` in the JSON response.

## What you need to start

1. **Env for the proxy** (when starting it, e.g. from scripts or Maestro):
   - `REST_WS` – WebSocket URL of the Portal REST server (e.g. `ws://localhost:3000/ws`).
   - `REST_AUTH_TOKEN` – Token for that REST server.
   - Optional: `PORT` (default 3500), `HOST` (default 127.0.0.1).

2. **Env for Maestro** (in `.maestro/.env` or environment when running `maestro test`):
   - `MAESTRO_PROXY_PORT` – Port the proxy is listening on (same as proxy `PORT`).
   - Plus any flow-specific vars (e.g. `MAESTRO_TEST_NSEC`, `MAESTRO_NWC_URL`).

3. **Telling Maestro the proxy port**
   - Maestro reads `MAESTRO_PROXY_PORT` from the environment (see `config.yaml` → `env.MAESTRO_PROXY_PORT`).
   - **Fixed port**: Start the proxy with a fixed port, then set the same port for Maestro:
     - Start proxy: `cd .maestro/proxy && PORT=3500 REST_WS=... REST_AUTH_TOKEN=... npm run start`
     - Set for Maestro: put `MAESTRO_PROXY_PORT=3500` in `.env.maestro` (repo root; used by `scripts/run-maestro-tests.sh`) or in `.maestro/.env`, or run `export MAESTRO_PROXY_PORT=3500` before `maestro test`.
   - **Random port** (using `scripts/start.sh`): `start.sh` starts the proxy in the background and **prints the chosen port** to stdout. Capture it and export before running Maestro:
     ```bash
     export MAESTRO_PROXY_PORT=$(.maestro/proxy/scripts/start.sh)
     maestro test .maestro/flows/entrypoint-generate.yaml
     ```
     Or in one line: `MAESTRO_PROXY_PORT=$(.maestro/proxy/scripts/start.sh) maestro test .maestro/flows/entrypoint-generate.yaml`
     Stop the proxy when done: `.maestro/proxy/scripts/stop.sh`

4. **Running order**:
   - Start the Portal REST server (app or backend that exposes the WebSocket).
   - Start the proxy: from `.maestro/proxy`, `PORT=3500 REST_WS=... REST_AUTH_TOKEN=... npm run start` (or use `scripts/start.sh` and set `MAESTRO_PROXY_PORT` to the printed port).
   - Run Maestro flows that use `runScript` so they can reach `http://127.0.0.1:<MAESTRO_PROXY_PORT>/eval`.
   - If you use `run-maestro-tests.sh`, add `MAESTRO_PROXY_PORT=<port>` to `.env.maestro` (and start the proxy with that port before running the script), or start the proxy with `start.sh`, then run: `MAESTRO_PROXY_PORT=$(.maestro/proxy/scripts/start.sh) bash scripts/run-maestro-tests.sh android regular`.

## Writing Maestro JS scripts that call the proxy

- **In the Maestro script file** (e.g. under `.maestro/flows/js/`):
  - Build the proxy URL with the port, e.g. `'http://127.0.0.1:' + MAESTRO_PROXY_PORT + '/eval'` (GraalJS may expose env as globals; if not, you may need to pass the port via flow env/substitution).
  - POST JSON: `{ "code": "<string of JS code that runs on the proxy>" }`.
  - The code string is the **proxy-side** script: it can only use **`client`** (PortalSDK). It must be valid JS (e.g. `await client.authenticateKey("npub...");`).

- **In the `code` string (proxy-side)** you can use any `client.*` method from the Portal SDK, e.g.:
  - `client.authenticateKey(mainKey, subkeys?)`
  - `client.newKeyHandshakeUrl(onKeyHandshake, staticToken?)`
  - `client.requestSinglePayment(mainKey, subkeys, paymentRequest, onStatusChange)`
  - `client.requestRecurringPayment(...)`, `client.requestInvoicePayment(...)`, `client.fetchProfile(mainKey)`, `client.setProfile(profile)`, `client.closeRecurringPayment(...)`, `client.issueJwt(...)`, `client.verifyJwt(...)`, `client.addRelay(...)`, `client.removeRelay(...)`
  - For payment requests you need `Currency` and `Timestamp` (e.g. `Currency.Millisats`, `Timestamp.fromNow(3600)`). **They are not currently injected** in the proxy’s `/eval` scope; for payment scripts you can either add them to the eval scope in `server.ts` or pass serialized options (e.g. `{ amount, currency: "Millisats", ... }`) if the SDK accepts them.

## Quick test without Maestro

From the repo root:

```bash
cd .maestro/proxy
PORT=3500 REST_WS=ws://localhost:3000/ws REST_AUTH_TOKEN=your-token npm run start
# In another terminal:
./scripts/eval-file.sh scripts/example.js
# Or:
curl -sS -X POST http://127.0.0.1:3500/eval -H 'Content-Type: application/json' -d '{"code":"await client.authenticateKey(\"npub1...\");"}'
```

## Reference: Portal SDK (client) API

See `node_modules/portal-sdk/README.md`. Summary of methods available on `client` in `/eval`:

| Method | Purpose |
|--------|--------|
| `authenticate(token)` | Already called by proxy at startup. |
| `authenticateKey(mainKey, subkeys?)` | Auth with user key. |
| `newKeyHandshakeUrl(onKeyHandshake, staticToken?)` | Get URL for key handshake. |
| `requestSinglePayment(mainKey, subkeys, request, onStatusChange)` | Single payment (needs `Currency`, `Timestamp` for request shape). |
| `requestRecurringPayment(mainKey, subkeys, request)` | Recurring payment. |
| `requestInvoicePayment(mainKey, subkeys, request, onStatusChange)` | Pay an invoice. |
| `fetchProfile(mainKey)`, `setProfile(profile)` | Profile get/set. |
| `closeRecurringPayment(mainKey, subkeys, subscriptionId)` | Close subscription. |
| `issueJwt(targetKey, durationHours)`, `verifyJwt(publicKey, token)` | JWT. |
| `addRelay(relay)`, `removeRelay(relay)` | Relay management. |

Types like `Currency`, `Timestamp` are documented in the SDK README; expose them in the proxy’s eval if you want to use them in `code` strings.

---

## Test order and where to call JS (proxy/SDK)

### Full order of tests (same for all 3 entrypoints)

Run one entrypoint: `entrypoint-generate.yaml`, `entrypoint-import-nsec.yaml`, or `entrypoint-import-mnemonic.yaml`. Each runs **onboarding first**, then the suites below in this order:

| # | Suite | Flow(s) |
|---|--------|--------|
| 0 | **Onboarding** | `Onboarding/generate.yaml` **or** `Onboarding/import-nsec.yaml` **or** `Onboarding/import-mnemonic.yaml` (depending on entrypoint) |
| 1 | Activities | `activities/open-activity.yaml`, `activities/test-filters.yaml` |
| 2 | Camera/QR | `camera/qr-auth.yaml`, `camera/qr-ticket.yaml`, `camera/qr-wallet.yaml` |
| 3 | Identities | `identities/change-display-name.yaml`, `identities/change-nip05.yaml`, `identities/change-propic.yaml` |
| 4 | Payments | `payments/payment.yaml` |
| 5 | Settings | `Settings/change-currency.yaml`, `Settings/change-relay.yaml`, `Settings/change-wallet.yaml` |
| 6 | Subscriptions | `subscriptions/open-subscription.yaml`, `subscriptions/subscription.yaml`, `subscriptions/terminate-subscription.yaml` |
| 7 | Tickets | `tickets/open-ticket.yaml`, `tickets/recover-tickets.yaml`, `tickets/spend-ticket.yaml` |
| 8 | Extra | `extra/bunker.yaml` |

*(Currently `entrypoint-generate.yaml` has many of these commented out; the list above is the full order when all are enabled.)*

### Where to call JS scripts (proxy/SDK)

| When | Where | Purpose |
|------|--------|--------|
| **Right after onboarding** | End of **`Onboarding/import-nsec.yaml`** | Already has `runScript: ../js/requestLogin.js`. Registers the test user’s key with the backend (`client.authenticateKey(npub)`). **Needs:** npub (e.g. from `TEST_NSEC` or env `TEST_NPUB`). |
| **Right after onboarding** | End of **`Onboarding/import-mnemonic.yaml`** | **Add** same `runScript` as import-nsec so the backend knows the imported user. **Needs:** npub (derive from `TEST_MNEMONIC` or set env `TEST_NPUB`). |
| **Right after onboarding** | End of **`Onboarding/generate.yaml`** | **Add** same `runScript` so the backend knows the generated user. **Needs:** npub (e.g. env `TEST_NPUB` for a known test identity, or derive from seed if you use a fixed test mnemonic). |
| **Before `activities/open-activity.yaml`** (optional) | Start of **`activities/open-activity.yaml`** or a small “seed activity” flow run just before it | RunScript that triggers a request the app can show (e.g. `client.newKeyHandshakeUrl(...)` then expose that URL so the app gets a login request, or trigger a payment). Creates at least one activity so “tap Payment” (or “tap Login”) has something to open. |
| **Inside camera/QR flows** (when implemented) | Inside **`camera/qr-auth.yaml`**, **`qr-ticket.yaml`**, **`qr-wallet.yaml`** | RunScript to get URL/payload from proxy (e.g. `newKeyHandshakeUrl`, ticket QR, NWC URL), then show that as QR (e.g. on host or test page) so the app can scan it. |

**Summary:** Call the proxy (runScript) **at the end of each onboarding flow** to run `client.authenticateKey(npub)` so the backend knows the test user. Optionally call it **before open-activity** to create a request/activity, and **inside camera flows** to generate the QR payload the app will scan.
