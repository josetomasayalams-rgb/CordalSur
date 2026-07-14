# Cordal Sur access service

Cloudflare Worker + D1 service for the static GitHub Pages guest guide. It keeps
the public site static while centralizing scheduled access and administrator
changes.

Current production resources:

- Worker: `https://cordal-sur-access.josetomasayalams.workers.dev`
- D1 database: `cordal-sur-access`
- Allowed web origin: `https://josetomasayalams-rgb.github.io`

## Security model

- Guest PINs are stored only as HMAC-SHA256 digests made with `PIN_PEPPER`.
- The administrator PIN is configured only as an HMAC digest in the
  `ADMIN_PIN_DIGEST` Worker secret. The plaintext PIN is never stored in D1.
- Tokens are signed with HMAC-SHA256. Administrator tokens last 30 minutes and
  guest tokens expire exactly at the stay checkout.
- A valid administrator token may also open the protected guest interface in
  the same browser tab; it is still revalidated through `/v1/auth/session`.
- A guest token contains the stay revision. Editing, disabling, finishing or
  deleting that stay makes the prior token fail on the next session check.
- Five failed attempts in 15 minutes lock that IP-derived rate key for 30
  minutes. Raw IP addresses are not persisted.
- CORS echoes an origin only when it exactly matches `ALLOWED_ORIGINS`.

This is a practical access barrier, not a way to make files already published
by GitHub Pages secret. The HTML remains retrievable from the static origin.

## Required bindings and secrets

| Name | Kind | Purpose |
|---|---|---|
| `DB` | D1 binding | `stays` and rate-limit state |
| `ALLOWED_ORIGINS` | variable | Comma-separated exact origins, no path or trailing slash |
| `TOKEN_ISSUER` | variable | Token namespace; keep stable after launch |
| `TOKEN_SECRET` | secret | At least 32 random characters, used only for token signatures |
| `PIN_PEPPER` | secret | A different random secret of at least 32 characters |
| `ADMIN_PIN_DIGEST` | secret | 64-character hex HMAC digest for the private administrator PIN |
| `DEFAULT_GUEST_PIN_DIGEST` | secret | 64-character hex HMAC digest for the private default guest PIN |

Production should use only:

```text
https://josetomasayalams-rgb.github.io
```

Local origins belong in the separate `dev` environment already declared in
`wrangler.toml`.

## Recreate the service in another Cloudflare account

From this `worker/` directory:

```bash
npx wrangler login
npx wrangler d1 create cordal-sur-access
npx wrangler d1 create cordal-sur-access-dev
```

Copy the returned IDs into the matching production and development blocks in
`wrangler.toml`. Then create secrets without putting their values in source:

```bash
openssl rand -base64 48
npx wrangler secret put TOKEN_SECRET

openssl rand -base64 48
npx wrangler secret put PIN_PEPPER

PIN="NN-NN" PIN_PEPPER="the-same-pepper-entered-above" npm run hash-pin
npx wrangler secret put ADMIN_PIN_DIGEST

PIN="NN-NN" PIN_PEPPER="the-same-pepper-entered-above" npm run hash-pin
npx wrangler secret put DEFAULT_GUEST_PIN_DIGEST
```

Enter the generated value at each secret prompt. Repeat with `--env dev` and
different secrets for local development. Do not commit `.dev.vars`.

Apply and deploy only after the IDs and secrets are ready. The production
account for this repository is already provisioned; these commands are for a
fresh account or disaster recovery:

```bash
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

The schema creates no stay automatically, so guest access starts locked.
Administration remains available and the first stay can be created there.

## Front-end configuration

The deployed Worker URL must be present in both the public pages and
`admin.html`. Either set it globally before the scripts:

```html
<script>window.CORDAL_SUR_ACCESS_API = "https://cordal-sur-access.ACCOUNT.workers.dev";</script>
```

or set `data-api-base` on each script:

```html
<script src="js/access.js"
        data-api-base="https://cordal-sur-access.ACCOUNT.workers.dev"
        defer></script>
```

For `admin.html`, fill either the `cordal-api-base` meta value or the
`data-api-base` attribute on `js/admin.js`. The scripts default to
`http://127.0.0.1:8787` only when the page itself is on localhost.

Every protected static page needs:

```html
<script>document.documentElement.classList.add("access-pending")</script>
<link rel="stylesheet" href="css/access.css?v=1">
```

in `<head>`, plus `js/access.js` configured as above. The early class prevents a
flash of the protected interface. Guest tokens use `localStorage`, so the PIN
is entered once per browser/device; administrator tokens use `sessionStorage`.

## API contract

All request bodies are JSON. Protected routes use
`Authorization: Bearer <token>`.

| Method and path | Authentication | Behavior |
|---|---|---|
| `GET /v1/access/status` | none | Returns only `active`/`locked` and timezone |
| `POST /v1/auth/guest` | none | Accepts `{ "pin": "NN-NN" }` during an active stay |
| `POST /v1/auth/admin` | none | Accepts the configured administrator PIN |
| `GET /v1/auth/session` | guest or admin | Verifies signature, expiry and stay revision/state |
| `GET /v1/admin/stays` | admin | Lists all stays in chronological order |
| `POST /v1/admin/stays` | admin | Creates a stay |
| `PATCH /v1/admin/stays/:id` | admin | Updates, enables/disables, changes PIN, or finishes |
| `DELETE /v1/admin/stays/:id` | admin | Deletes and immediately revokes a stay |

Create body:

```json
{
  "label": "Familia Pérez",
  "startLocal": "2026-07-18T16:00",
  "endLocal": "2026-07-21T11:00",
  "guestPin": "55-73",
  "enabled": true
}
```

Times are wall-clock values in `America/Santiago`, converted by the Worker and
stored as UTC Unix seconds. A stay is active on the half-open interval
`[start, end)`. Ambiguous or nonexistent DST times are rejected instead of
guessed. All stays, including disabled ones, must not overlap. Adjacent windows
where one ends exactly when the next begins are valid.

On update, omit `guestPin` (or send an empty string) to preserve its digest.
Send `{ "finish": true }` by itself to finish an active stay immediately.

## Verification

Tests are read-only with respect to repository files. They use Node's built-in
test runner and a temporary SQLite database:

```bash
npm test
```

They cover exact CORS, token tampering/expiry, peppered digests,
`America/Santiago` conversion and DST edges, access policy constants, and the
D1 no-overlap trigger.
