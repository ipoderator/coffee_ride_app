# Check — Broken logins, busted tokens, and the "trust me" admin door

**What you're looking for:** the login and session machinery itself being soft. Four flavors, all common in AI-built apps:

1. **Routes that change things with no login check at all** — not just "list" endpoints (that's `api-auth.md`), but the `POST /api/transfer`, `DELETE /api/account`, `POST /api/admin/refund` mutations that anyone can fire.
2. **JWTs that aren't really verified** — tokens that are `decode()`'d instead of `verify()`'d, accept `alg: none`, have no expiry, or are signed with a secret that's sitting in the client bundle.
3. **Weak or guessable sessions** — session IDs built from `Math.random()`, a counter, the user's email, or a timestamp; sessions that never expire.
4. **Default or hardcoded credentials** — `admin/admin`, a `MASTER_PASSWORD = "..."` constant, an "if email === 'me@founder.com' you're an admin" backdoor left in from testing.

The thread tying these together: the app *has* a lock, but the lock is fake, the key is printed on the door, or the door only locks the front (the GET) and leaves the back (the POST) wide open.

…and the same root causes show up in the wider auth surface: **authentication-vs-authorization confusion** (you proved *who* the user is, but never checked they're allowed to touch *this* record — that's IDOR, in `api-auth.md`), **OAuth `state`/redirect-URI misconfig** (CSRF on the callback, or an open `redirect_uri` that ships the auth code to an attacker), **MFA that's enforced on the UI but not the API** (the second factor is a frontend gate, not a server gate), **password-reset token flaws** (a reset code that's guessable, never expires, or isn't bound to one user), and **session fixation** (the session ID isn't rotated at login, so an ID the attacker planted *before* you logged in is now *your* logged-in session). Don't stop at the four headline flavors.

## The method — trace the protected surface and the token's integrity, don't just grep the keyword

A real auth finding is one of two shapes, and both are about a **path with a missing or fake barrier** — not a keyword on a line. Grepping `jwt.decode` or `app.post` alone is what makes scanners noisy *and* shallow: it flags safe code (a `decode` that runs *after* a real `verify`, a `POST` that's *meant* to be public) and misses the real ones (a mutation whose auth check lives two helper-calls away and is never actually reached). Two traces, run on every candidate. Doing both is what makes this audit as deep as a commercial auth review while staying near-zero-false-positive.

### Trace 1 — PROTECTED SURFACE: does a sensitive op have an auth gate *before* it?

**Step A — is this a SENSITIVE op?** A route/handler/RPC that **reads or mutates data that isn't meant to be public**: writes to a DB, charges/refunds money, deletes a record, changes a role or password, reads another user's private data, hits an admin function. Grep finds the candidate handlers; *you* decide if the op is sensitive.

**Step B — is there an AUTH GATE on the path, *before* the sensitive op? Trace it, don't assume it.** Follow the handler from its entry point to the sensitive line and look for a real check *that actually runs before* the op:
- a **middleware** mounted on this route (`app.use(requireAuth)`, `router.use(auth)`, a Next.js `middleware.ts` `matcher` that *covers this path*, a `@login_required` / `before_action :authenticate_user!` / `Depends(get_current_user)` / `Auth::middleware`),
- an **inline check** at the top of the handler (`const session = await auth(); if (!session) return 401`, `getServerSession()`, `requireUser()`, `ctx.user` guard),
- and crucially: trace that the check is **on this path and not bypassable** — a guard inside an `if` that the request can skip, a middleware whose `matcher`/path-prefix doesn't actually match this route, or a check that's `return`ed-around, does **not** count.

A sensitive op is **unprotected** if no correct gate runs before it on *every* reachable path to the op. Stop when you find a gate that always runs before the op (→ protected) or confirm none does (→ broken auth).

> **Sensitive ops (what MUST be gated).** State-changing routes: `POST|PUT|PATCH|DELETE` that write/charge/delete/change-role/reset-password. Private reads: any handler returning another user's data, a list endpoint, an export, a file download keyed by id. Admin surface: anything under `/admin`, a debug route, a feature-flag toggle, an impersonation endpoint. AI apps: an agent/tool endpoint that spends tokens or calls a paid tool, a "run this action" route the model can reach. *Everything genuinely public — see the false-positive guards — is NOT a sensitive op.*

> **Auth-vs-authz, stated once:** a present login check answers *"are you someone?"* It does **not** answer *"are you allowed to touch THIS row?"* A handler that checks `session` but then trusts a `userId`/`id` from the request body or URL to pick the record is an **IDOR** (covered in `api-auth.md`) — authentication present, authorization missing. If you see a real session check but the record is chosen from user-supplied input rather than from the session, flag it there, not here.

### Trace 2 — TOKEN/SESSION INTEGRITY: is the credential actually unforgeable?

**Step A — find the trust decision.** The line where the app decides *"this token/session proves who you are"* and lets you in. That's the sink: `jwt.verify`/`jwt.decode`, a session lookup, a cookie read that maps to a user.

**Step B — trace the credential's integrity from issue to check.** A token/session is **forgeable or weak** if *any* of these is true on the trust path:
- **signature not checked** — `decode()` used instead of `verify()` on the trust path; `verify_signature: False`; a Go keyfunc that returns `nil, nil`,
- **algorithm not pinned** — `verify()` with no `algorithms:` allowlist, so `alg: none` or a key-confusion (RS256→HS256) downgrade is accepted,
- **weak/hardcoded/shared secret** — a short literal secret, a secret committed in repo, the *same* secret as `.env.example`, or **a signing secret reachable from the client** (`NEXT_PUBLIC_*`, a value in the browser bundle, embedded in a mobile binary),
- **no expiry / no expiry check** — issued with no `expiresIn`/`exp`/`setExpirationTime`, *or* verified with `exp` validation disabled, so a captured token lives forever,
- **guessable session ID** — built from `Math.random()`, a timestamp, a counter, or the user's email/id rather than a CSPRNG,
- **session fixation** — the session ID isn't regenerated at login, so a pre-auth ID survives into the authenticated session,
- **missing cookie flags** — a session cookie set without `HttpOnly` (JS can steal it), `Secure` (sent over HTTP), or `SameSite` (CSRF-rideable). Lower severity than the above, but on the integrity surface.

Stop when you confirm a forgery hole (→ finding) or confirm the credential is verified, pinned, expiring, random, and rotated (→ clean).

**Step C — is there a BARRIER?** For Trace 1 the barrier is *a correct auth gate that always runs before the sensitive op.* For Trace 2 the barrier is *a properly verified, algorithm-pinned, expiring token signed with a strong server-only secret, plus random rotated session IDs.* A barrier only counts when it's **actually on the path** (a middleware whose matcher really covers the route; a `verify` that truly runs before the access decision) and **right for the threat** (pinning the algorithm does nothing if the secret is in the client; `HttpOnly` does nothing if the signature isn't checked).

**Verdict + confidence (write this into the finding):**
- **Confirmed** — a sensitive op with no gate on any reachable path, OR a credential that's demonstrably forgeable/weak on the trust path (decode-not-verify, `alg:none` accepted, secret in client, hardcoded creds). Full severity.
- **Likely** — a gate or `verify` you couldn't fully confirm reaches this path (e.g. a middleware whose `matcher` you couldn't tie to the route, a `verify` that *might* run upstream), or a missing-expiry/cookie-flag you couldn't fully resolve. Flag it, but say exactly what to check.
- **Not a finding** — a correct gate provably runs before the op, the token is verified+pinned+expiring with a server-only secret, or the route is genuinely public. Stay silent. *This silence is the product's near-zero-FP promise — honor it.*

The discipline in one line: **depth comes from tracing the gate to the op and the token from issue to check; quiet comes from honoring a barrier that genuinely runs on the path.**

## How to scan

Auth logic lives in middleware, route handlers, an `auth/`, `lib/auth`, or `utils/session` folder, and mobile keychain/token code. Cast a wide net across stacks.

### Find the login / token / session code

```bash
# JS/TS — the libraries and homerolled bits
grep -rEn --exclude-dir={node_modules,.next,dist,build,.git} \
  -E 'jwt\.(sign|verify|decode)|jsonwebtoken|jose|express-session|cookie-session|iron-session|next-auth|lucia|bcrypt|argon2|scrypt' \
  . 2>/dev/null | head -40

# Python (Flask/Django/FastAPI)
grep -rEn --include='*.py' --exclude-dir={venv,.venv,__pycache__,site-packages} \
  -E 'jwt\.(encode|decode)|PyJWT|flask_jwt|SECRET_KEY|SESSION_COOKIE|check_password|set_password|@login_required|Depends\(' \
  . 2>/dev/null | head -40

# Go
grep -rEn --include='*.go' \
  -E 'jwt\.(Parse|ParseWithClaims|NewWithClaims)|SigningMethodNone|gorilla/sessions|bcrypt\.' \
  . 2>/dev/null | head -40

# Ruby (Rails / Sinatra)
grep -rEn --include='*.rb' --exclude-dir={vendor,tmp} \
  -E 'JWT\.(encode|decode)|before_action|authenticate_user|has_secure_password|devise|session\[' \
  . 2>/dev/null | head -40

# PHP (Laravel / plain)
grep -rEn --include='*.php' --exclude-dir={vendor} \
  -E 'JWT::(decode|encode)|firebase/php-jwt|password_(hash|verify)|\$_SESSION|Auth::|middleware\(' \
  . 2>/dev/null | head -40

# Mobile — Swift / Kotlin / Flutter / React Native
grep -rEn --include='*.swift' --include='*.kt' --include='*.java' \
  --include='*.dart' --include='*.ts' --include='*.tsx' \
  -E 'JWT|jwt_decode|jwtDecode|Keychain|SharedPreferences|EncryptedSharedPreferences|flutter_secure_storage|AsyncStorage|SecureStore|UserDefaults' \
  . 2>/dev/null | head -40
```

### Find state-changing routes (the ones that MUST be locked)

```bash
# JS/TS — POST/PUT/PATCH/DELETE handlers
grep -rEn --include='*.ts' --include='*.js' --exclude-dir={node_modules,.next,dist} \
  -E '(app|router)\.(post|put|patch|delete)\(|export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)' \
  . 2>/dev/null | head -40

# Python
grep -rEn --include='*.py' --exclude-dir={venv,.venv} \
  -E '@(app|router|bp)\.(post|put|patch|delete)|methods=\[.*(POST|PUT|PATCH|DELETE)' \
  . 2>/dev/null | head -40

# Go / Ruby / PHP routers
grep -rEn --include='*.go' --include='*.rb' --include='*.php' \
  -E '\.(POST|PUT|PATCH|DELETE)\(|(post|put|patch|delete)\s+[\x27"]/|Route::(post|put|patch|delete)' \
  . 2>/dev/null | head -40
```

For each one, **run Trace 1 on the handler** — don't stop at "is there a `session` word somewhere in the file." Read from the entry point to the mutating line and confirm a real gate runs *before* it: an inline `if (!session) return 401`, a middleware whose path actually covers this route, a `@login_required`/`before_action`/`Depends(get_current_user)`. If a `POST /api/...` mutates data (writes to a DB, charges a card, deletes a record, changes a role) and **no correct gate runs before the mutation on a reachable path**, that's a finding — even if the matching `GET` is locked, even if the UI hides the button. Attackers don't use your UI; they `curl` the `POST` directly. (And if a gate *is* present but the record is chosen from a body/URL `id` rather than the session, that's IDOR → `api-auth.md`, not here.)

### Sniff for the specific smells

```bash
# alg:none and unverified decode (JS/TS/Python/Go/Ruby/PHP)
grep -rEn --exclude-dir={node_modules,.next,dist,vendor,venv,.venv} \
  -E "alg(orithm)?['\"]?\s*[:=]\s*['\"]?none|algorithms\s*=\s*\[\s*['\"]none|jwt\.decode\(|jwtDecode\(|jwt_decode\(|SigningMethodNone|verify_signature['\"]?\s*[:=]\s*(False|false)" \
  . 2>/dev/null

# JWT signed/verified with no expiry set (no exp / expiresIn)
grep -rEn --exclude-dir={node_modules,.next,dist,vendor,venv,.venv} \
  -E 'jwt\.sign\(|jwt\.encode\(|NewWithClaims|JWT\.encode' \
  . 2>/dev/null | head -30   # then read each: is expiresIn / exp / setExpirationTime present?

# Guessable session/token generation
grep -rEn --exclude-dir={node_modules,.next,dist,vendor,venv,.venv} \
  -E 'Math\.random\(\)|Date\.now\(\)\s*\+|sessionId\s*=|token\s*=\s*.*(email|username|userId|\+\+|counter)|uuid\.uuid1\(|new Random\(' \
  . 2>/dev/null | head -30

# Default / hardcoded creds and backdoors
grep -rEn --exclude-dir={node_modules,.next,dist,vendor,venv,.venv} \
  -E "(password|passwd|pwd|secret|master).{0,12}['\"](admin|password|123456|changeme|root|test)['\"]|==\s*['\"]admin['\"]|isAdmin\s*=\s*true|email\s*===?\s*['\"][^'\"]+@" \
  . 2>/dev/null | head -30
```

### Wider surface — the auth bugs scanners usually miss

```bash
# Signing secret reachable from the client (the master key taped to the door)
grep -rEn --exclude-dir={node_modules,.next,dist,vendor,venv,.venv} \
  -E '(NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_|REACT_APP_)[A-Z_]*(JWT|SECRET|SIGN|PRIVATE)|(JWT_SECRET|signingKey|privateKey)\s*[:=].{0,40}(NEXT_PUBLIC|VITE_|process\.env\.NEXT_PUBLIC)' \
  . 2>/dev/null | head -30

# OAuth: missing/loose state + open redirect_uri on the callback
grep -rEn --exclude-dir={node_modules,.next,dist,vendor,venv,.venv} \
  -E 'redirect_uri|redirectUri|callbackURL|oauth.*state|response_type|authorization_code|passport\.authenticate' \
  . 2>/dev/null | head -30   # then read each: is `state` generated+checked? is redirect_uri an allowlist, not echoed from the request?

# Password-reset tokens — guessable / no expiry / not bound to one user
grep -rEn --exclude-dir={node_modules,.next,dist,vendor,venv,.venv} \
  -E 'reset.?token|resetToken|forgot.?password|password.?reset|verification.?code|otp|Math\.random\(\).*(reset|token|code)' \
  . 2>/dev/null | head -30   # then read each: CSPRNG? short expiry? tied to the requesting user only?

# Session fixation — is the session ID regenerated AT login?
grep -rEn --exclude-dir={node_modules,.next,dist,vendor,venv,.venv} \
  -E 'req\.session\.regenerate|session\.regenerate|reset_session|request\.session\.cycle_key|rotateSession|regenerateId' \
  . 2>/dev/null   # ABSENCE near the login handler is the smell — read the login path and confirm a fresh ID is issued post-auth

# Session cookie flags — HttpOnly / Secure / SameSite
grep -rEn --exclude-dir={node_modules,.next,dist,vendor,venv,.venv} \
  -E 'setCookie|res\.cookie|set_cookie|cookie\s*:|httpOnly|secure\s*:|sameSite|SESSION_COOKIE_(HTTPONLY|SECURE|SAMESITE)' \
  . 2>/dev/null | head -30   # then read each cookie that carries a session/token: are all three flags set?
```

For each wider-surface hit, run the method: OAuth → is `state` generated and verified on the callback, and is `redirect_uri` checked against an allowlist (not echoed back from the request)? Reset tokens → CSPRNG, short expiry, bound to exactly one user, single-use? Session fixation → does the login handler issue a *new* session ID after authenticating? Cookie flags → does every session-bearing cookie set `HttpOnly` + `Secure` + `SameSite`?

## What to report — the four stories

### Story 1 — The unlocked back door (mutation with no auth)

```ts
// app/api/account/route.ts
export async function DELETE(req: Request) {
  const { userId } = await req.json();
  await db.user.delete({ where: { id: userId } });   // ← no session check
  return Response.json({ ok: true });
}
```

**Here's what goes wrong:** Your UI only shows the "delete account" button to logged-in users, so it *feels* protected. But the endpoint takes a `userId` from the request body and there's no check that you're logged in — let alone that you're allowed to delete *that* user. Anyone runs `curl -X DELETE yourapp.com/api/account -d '{"userId":"any-id"}'` and starts deleting accounts one by one. Same shape gives you free refunds (`/api/admin/refund`), free credits, role changes, password resets for other people.

**Severity: 🔴 CRITICAL** for money/account/role mutations; 🟠 HIGH for lower-stakes writes.

**Fix tonight:**
```ts
import { auth } from "@/lib/auth";

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  // Don't trust a userId from the body — use the session's own id.
  await db.user.delete({ where: { id: session.user.id } });
  return Response.json({ ok: true });
}
```
The rule: every POST/PUT/PATCH/DELETE checks the session *before* it touches data, and derives "who am I acting as" from the **session**, never from the request body. Do all of them in one pass.

### Story 2 — The token that isn't really checked

```js
// "verifying" a login token — but not really
const payload = jwt.decode(token);          // ← decode, not verify
if (payload.userId) { /* you're in */ }
```
or
```python
jwt.decode(token, options={"verify_signature": False})   # ← signature off
```
or
```go
token, _ := jwt.Parse(raw, func(t *jwt.Token) (interface{}, error) {
    return nil, nil   // ← returns no key; accepts alg:none
})
```

**Here's what goes wrong:** A JWT is just base64 — `decode()` reads it without checking the signature. An attacker takes their own valid token, edits the middle (`{"userId":"me"}` → `{"userId":"the-founder","role":"admin"}`), and your app believes it because it never checked the signature. The `alg: none` trick is the same idea: the attacker sets the token's algorithm to "none," strips the signature, and a loose verifier accepts it. Result: log in as anyone, become admin at will.

**Severity: 🔴 CRITICAL.** This is full account takeover.

**Fix tonight** — always `verify` with an explicit algorithm allowlist:
```js
// JS/TS (jsonwebtoken)
const payload = jwt.verify(token, process.env.JWT_SECRET, {
  algorithms: ["HS256"],   // pin it; never allow "none"
});
```
```python
# Python (PyJWT)
payload = jwt.decode(token, SECRET, algorithms=["HS256"])  # signature ON, alg pinned
```
```go
// Go (golang-jwt) — reject unexpected signing methods
token, err := jwt.Parse(raw, func(t *jwt.Token) (interface{}, error) {
    if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
        return nil, fmt.Errorf("unexpected signing method")
    }
    return []byte(os.Getenv("JWT_SECRET")), nil
})
```

### Story 3 — Tokens with no expiry, or a secret living in the client

```js
const token = jwt.sign({ userId }, SECRET);   // ← no expiresIn → lives forever
```
```ts
// next.config / client bundle
const JWT_SECRET = "supersecret123";   // ← shipped to the browser
```

**Here's what goes wrong (no expiry):** a token captured once — from a shared computer, a leaked log, an old screenshot — works *forever*. There's no logout that actually invalidates it, no window that closes. **(secret in client):** if the signing secret is in any file that ends up in the browser bundle or a mobile app's binary, an attacker extracts it and signs their own valid tokens for any user. The lock is real, but the master key is taped to the door.

**Severity: 🟠 HIGH** for missing expiry; **🔴 CRITICAL** for a signing secret in the client/app bundle.

**Fix tonight:**
```js
const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
  expiresIn: "1h",          // short-lived; pair with a refresh token
});
```
- Signing/verifying happens **only on the server**. The client gets the token, never the secret.
- Mobile: never embed a signing secret in the app. Apps are trivially decompiled. The server signs; the device only stores the issued token (in Keychain / EncryptedSharedPreferences / `flutter_secure_storage` / Expo `SecureStore` — not in `UserDefaults`, plain `SharedPreferences`, or `AsyncStorage`).

### Story 4 — Guessable sessions and default credentials

```js
const sessionId = Math.random().toString(36).slice(2);   // ← guessable
// or
sessions[userEmail] = true;                              // ← session = the email
```
```python
if username == "admin" and password == "admin":          # ← default creds
    login()
```
```php
if ($email === "founder@me.com") { $_SESSION['admin'] = true; }  // ← test backdoor
```

**Here's what goes wrong:** `Math.random()` isn't cryptographically random — with enough samples its output is predictable, so an attacker can forge a valid session ID and ride into someone's account. A session keyed on the email means guessing the email *is* logging in. And the `admin/admin` or "if it's my email, I'm admin" lines are the kind of thing that gets pasted in during testing and shipped to prod — the first thing anyone tries.

**Severity: 🔴 CRITICAL** for default/hardcoded creds and email-as-session; **🟠 HIGH** for `Math.random()` session IDs.

**Fix tonight:**
```js
import crypto from "node:crypto";
const sessionId = crypto.randomBytes(32).toString("hex");   // CSPRNG, unguessable
```
- Delete every default/hardcoded credential and every `if email === "..."` admin shortcut. Admin status comes from a real `role` column in the database, set deliberately — never from a string compare in code.
- Better: don't hand-roll sessions at all. Use a vetted library — NextAuth/Auth.js, Lucia, `iron-session` (JS); Devise (Rails); Django's built-in auth; Laravel Breeze/Sanctum (PHP). They get the random-ID, hashing, and expiry right for you.
- Passwords are stored hashed with bcrypt/argon2/scrypt — never plaintext, never MD5/SHA1.

### Story 5 — The wider auth bugs (reset tokens, OAuth, session fixation, cookie flags)

These are less common in early AI-built apps but land hard when present. Run the method, flag the ones that are real:

```ts
// ❌ password reset — guessable code, no expiry, picks the user from the request
const code = Math.floor(100000 + Math.random() * 900000);   // 6 digits, Math.random
await db.reset.create({ data: { email, code } });            // no expiry, no single-use
// later:
const r = await db.reset.findFirst({ where: { code } });    // ← any user's code, not bound to requester
```
```ts
// ❌ OAuth callback — no state check, redirect echoed from the request
app.get("/auth/callback", async (req) => {
  const { code } = req.query;                 // ← no `state` verified → login CSRF
  const token = await exchange(code);
  res.redirect(req.query.next as string);     // ← open redirect: attacker controls `next`
});
```
```js
// ❌ login — session ID never rotated (fixation)
req.session.userId = user.id;                 // ← same session ID the attacker may have planted pre-login
```

**Here's what goes wrong:** A 6-digit `Math.random()` reset code with no expiry and no binding to the requester is brute-forceable *and* lets one user reset another's password by guessing a code — full account takeover via the "forgot password" flow. A missing OAuth `state` lets an attacker stitch their own login session onto your account (login CSRF); an echoed `redirect_uri`/`next` ships the auth code or the user to an attacker site. No session-ID rotation at login means a session the attacker fixed in your browser *before* you logged in becomes *your* authenticated session. Missing `HttpOnly` lets any XSS read the cookie; missing `Secure`/`SameSite` leaks it over HTTP or lets another site ride it.

**Severity:** 🔴 CRITICAL for a guessable/unbound reset token (it's account takeover) and for a missing OAuth `state`; 🟠 HIGH for session fixation and an open `redirect_uri`; 🟡 MEDIUM for missing cookie flags on a session cookie.

**Fix tonight:**
```ts
// ✅ reset token: CSPRNG, short expiry, single-use, bound to ONE user
import crypto from "node:crypto";
const token = crypto.randomBytes(32).toString("hex");
await db.reset.create({ data: { userId: user.id, token, expiresAt: new Date(Date.now() + 30*60_000) } });
// on use: look it up by token, check expiresAt > now, mark used, and reset only THAT userId.
```
```ts
// ✅ OAuth: generate `state`, store it, verify it on callback; allowlist the redirect
const state = crypto.randomBytes(16).toString("hex");   // store in session/cookie, compare on return
// callback: if (req.query.state !== stored) return 400;
// redirect only to a value from a fixed allowlist, never echoed from the request.
```
```js
// ✅ rotate the session at login (kills fixation)
req.session.regenerate(() => { req.session.userId = user.id; });   // express-session
// Django: request.session.cycle_key();  Rails: reset_session
```
```ts
// ✅ every session-bearing cookie gets all three flags
res.cookie("session", id, { httpOnly: true, secure: true, sameSite: "lax" });
```

## What NOT to flag (false-positive guards — read this before reporting)

- **Genuinely public mutations.** `POST /api/contact`, `POST /api/newsletter/subscribe`, `POST /api/waitlist`, anonymous analytics beacons — these are *meant* to be open. They need rate-limiting and spam protection, not a login. Note as INFO at most.
- **Webhooks.** `POST /api/webhooks/stripe`, `/api/webhooks/github` — these are authenticated by **signature verification** (`stripe.webhooks.constructEvent`, an HMAC compare), not a session. If you see a signature check, it's fine.
- **The login and signup routes themselves.** `POST /api/login`, `/api/register`, `/api/auth/*`, password-reset *request* endpoints — these are unauthenticated by definition. That's correct.
- **Public/publishable keys are not secrets.** `pk_live_…` (Stripe), `NEXT_PUBLIC_*` / `VITE_*` / `EXPO_PUBLIC_*` / Firebase web config, Supabase **anon** key — these are *designed* to ship to the client. A JWT *signing secret* in the client is the bug; a publishable key is not. (See the Secrets check for the key-type table.)
- **`jwt.decode()` used for non-security reads.** Decoding a token just to read a non-sensitive claim for display (e.g. show the user's name) *after* it's already been `verify`'d elsewhere, or decoding your own freshly-minted token, is fine. The bug is decode-*instead-of*-verify on the trust path. Check whether a real `verify` happens before any access decision.
- **`alg: none` in test fixtures, library docs, or a comment** — not in the live verification path. Confirm it's reachable code.
- **`Math.random()` for non-security things** — animation jitter, a random tip, picking a placeholder color, cache-busting. Only flag it when the output becomes a session ID, token, password-reset code, or anything an attacker would want to guess.
- **`admin`/`test` strings in seed scripts, fixtures, or `.env.example`** — a `seed.ts` that creates a dev admin with a known password is normal *as long as it doesn't run in production*. Flag it only if it's reachable in the prod code path or the seeded creds aren't changed on deploy.
- **Framework-managed session cookies.** If they're using NextAuth, Django, Devise, Laravel, etc., the session ID, expiry, and hashing are handled correctly by the library — don't flag the framework's own cookie as "guessable." The library also sets `HttpOnly`/`Secure`/`SameSite` and (for NextAuth/Django/Devise/Laravel) rotates the session at login for you — don't flag missing cookie flags or "session fixation" against a framework-managed session. Only home-rolled cookie/session code is in scope.
- **A `decode()` that runs AFTER a real `verify()` — the barrier is upstream.** If you traced the credential and a correct `jwt.verify(token, secret, { algorithms: [...] })` happens before the access decision, a later `jwt.decode()` purely to read a claim for display is fine. The bug is decode-*instead-of*-verify on the trust path; confirm the verify is actually on the path before staying silent, and confirm it's actually absent before flagging.
- **A `POST` whose auth gate is a middleware that genuinely covers it.** If a `requireAuth` middleware is mounted on the router/path-prefix that includes this route (and the `matcher`/mount actually matches — verify the path, don't assume), the inline check can legitimately be absent. The barrier is the middleware. Only flag when *no* correct gate runs before the op on a reachable path.
- **OAuth `state`/redirect handled by the library.** Passport, NextAuth, Auth.js, `openid-client`, Authlib, OmniAuth generate and verify `state` and pin `redirect_uri` for you. Don't flag a library-driven OAuth flow for "missing state" — only a hand-rolled `/auth/callback` that reads `code` with no `state` check, or echoes the redirect from the request.
- **Reset/verification tokens already done right.** A reset token that's `crypto.randomBytes`/`secrets.token_urlsafe`, has an `expiresAt`/TTL, is single-use, and is looked up *and* bound to one user — that's the barrier. Don't flag it because the word "token" appears. Only flag guessable generation, no expiry, reuse, or a code matched without binding it to the requesting user.
- **Cookies that don't carry a session.** A non-sensitive preference/UI cookie (theme, locale, a non-secret analytics id) doesn't need `HttpOnly`/`Secure`/`SameSite` the way a session/token cookie does. Only hold session- or token-bearing cookies to the three-flag bar.

## Report a finding as

**Title:** be specific to the flavor you found, e.g.
- "`DELETE /api/account` deletes any user with no login check"
- "Login tokens are read with `jwt.decode()` — the signature is never checked"
- "JWT signing secret is shipped to the browser in `lib/auth.ts:6`"
- "Admin access granted by a hardcoded `admin/admin` login in `routes/auth.py:22`"

**Detail (example for the unverified-token case):**
> `src/lib/auth.ts:31` reads the login token with `jwt.decode(token)` and trusts the `userId` inside it. `decode()` only un-base64s the token — it never checks the signature. A JWT is three base64 chunks separated by dots, and the middle chunk is the data. Anyone can take their own valid token, change the middle chunk to say `"userId":"your-founder-account"` or `"role":"admin"`, and your app will believe it, because nothing verified that you signed it.
>
> **What can go wrong:** A curious user (or a researcher poking at launch) edits one field in their own token and is suddenly logged in as you, or as any customer. Full account takeover, no password needed. This is one of the most-exploited bugs in hand-rolled auth.
>
> **How to fix tonight (10 minutes):**
> 1. Change `jwt.decode` to `jwt.verify` with a pinned algorithm:
>    ```ts
>    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
>    ```
> 2. Make sure `JWT_SECRET` is a long random server-side env var (`openssl rand -hex 32`), not a short literal and not anything that ships to the client.
> 3. Add `expiresIn: "1h"` everywhere you `jwt.sign`, so a stolen token doesn't live forever.
> 4. Verify: take a valid token, change one character in the middle chunk, and send it. The app must now reject it (401), not log you in.

**Lead every finding with its confidence and the traced path.** State `Confirmed` or `Likely` (from the method's verdict rule), and name the path you followed. For a protected-surface finding, that's `route → gate present? → sensitive op` — e.g. `POST /api/admin/refund → no session check on any path → db.payment.refund()` (Confirmed), or `DELETE /api/account → middleware matcher may not cover this route → db.user.delete()` (Likely, say what to verify). For a token-integrity finding, that's the credential from issue to check — e.g. `cookie token → jwt.decode() on the trust path, never verified → access granted` (Confirmed), or `reset code → Math.random(), no expiry, looked up unbound to requester → password changed` (Confirmed). That traced path is the whole difference between this audit and a grep tool: it proves the gate is really missing (or the token really forgeable), tells the founder exactly where to add the lock, and is the thing a false-positive can't fake.

Repeat the report block for each flavor you found. If you spot default/hardcoded credentials, add the standing line: *"Even if you do nothing else from this audit: remove this and the equivalent of `admin/admin` before you deploy — it's the first thing anyone tries."*
