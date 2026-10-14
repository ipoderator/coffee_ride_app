# Check — Secrets in code

**What you're looking for:** a real credential — an API key, token, password, or connection string — that is *both* a genuine secret *and* reachable by someone who shouldn't have it. The classic case is the "vibe-coded app pasted the API key into a `const` because the AI told it to," then shipped that file to GitHub or into the browser bundle. Once a secret is committed, served, logged, or baked into client JavaScript, anyone who can read that surface can drain your account, and you get the bill.

A secret leak is different from injection in *one* important way: there's no "sink" the value flows *into*. The value itself **is** the payload. So the two questions aren't "source → sink," they're **"is this a real secret?"** and **"who can read it?"** A grep hit answers neither. A bare regex match on `sk-…` flags `.env.example` placeholders, type definitions, and rotated test keys — that's what makes secret scanners infamous for noise. The depth here comes from confirming *both* halves before you say a word.

**For AI apps specifically:** the keys that hurt most are the AI-provider keys — Anthropic (`sk-ant-…`), OpenAI (`sk-…`/`sk-proj-…`), Google AI (`AIza…`) — because they bill per token with no spending cap by default, and bots scrape public repos for them within minutes. An exposed provider key isn't "someone reads your data," it's "someone runs a $40,000 crypto-mining-via-LLM job on your card overnight." Treat these as the top of the severity stack.

## The method — confirm the secret *and* the exposure, don't just grep the format

A real secret finding needs **both halves true**. Either one alone is a false positive:

1. **It is a genuine credential** — a known provider format (strong prefix) *or* a high-entropy literal assigned to a secret-shaped name — **not** a placeholder, example, type definition, or test fixture.
2. **It is reachable by someone who shouldn't have it** — committed to the repo, shipped in a **client** bundle (browser-exposed), served at a public path, logged, or returned in an HTTP response.

Grep finds **format**. You supply **realness** and **reachability**. Check all three steps, in order — doing all three is what makes this as deep as a commercial secret scanner while staying near-zero-false-positive.

**Step A — is there a CANDIDATE?** A string that matches a provider format, or a high-entropy value assigned to a secret-shaped name (`apiKey`, `token`, `secret`, `password`, `*_KEY`). (Catalogs below.) Grep finds these.

**Step B — is it a REAL secret? Look at the value, not just the name.** A candidate is real if:
- it matches a **strong provider prefix** (`sk-ant-`, `sk_live_`, `ghp_`, `AKIA…`) — these are unforgeable shapes, near-certainly real; **or**
- it's a **high-entropy literal** (long, mixed-case + digits, no dictionary words, no obvious template markers) assigned to a secret-shaped name; **or**
- it's a **connection string / private-key block** with real-looking credentials embedded.

A candidate is **NOT** real — and you must **not** flag it — if the value is any of:
- a **placeholder / example**: `your_key_here`, `sk-xxxx`, `sk-proj-xxxxxxxx`, `changeme`, `<YOUR_API_KEY>`, `INSERT_KEY`, `replace-me`, all-same-char or obviously fake;
- an **env reference**, not a literal: `process.env.OPENAI_KEY`, `os.environ["X"]`, `import.meta.env.VITE_X`, `Deno.env.get(...)`, `config.get(...)` — the *name* of a secret is not a secret;
- a **type/interface/doc**: `apiKey: string`, JSDoc `@example sk-…`, a comment documenting the format;
- a **test fixture / known-public value**: Stripe's documented `sk_test_…`/`pk_test_…` sample keys, the canonical `AKIAIOSFODNN7EXAMPLE`, or values under `__tests__`/`fixtures`/`*.spec.*`;
- a **publishable-by-design** key: `pk_live_…` (Stripe), `NEXT_PUBLIC_*` Supabase **anon** key, Firebase web `apiKey` — these are *meant* to be in the client (note as INFO, see barriers).

**Step C — is it REACHABLE? Trace where this value ends up.** A real secret only matters if it crosses to someone who shouldn't read it. Establish the exposure path:
- **Committed to the repo** — it's in a tracked source file (and worse, in git *history* — see the special case). Anyone with repo read access has it; public repo = the whole internet + scraper bots.
- **Shipped to the browser (client bundle).** This is the one AI generators botch most. A secret is client-exposed if it's:
  - prefixed `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `EXPO_PUBLIC_`, `PUBLIC_` (SvelteKit), `GATSBY_`, `NUXT_PUBLIC_` — **the framework inlines these into the JS the browser downloads**;
  - read via `import.meta.env.X` in a file that ends up in client code;
  - hardcoded in a `'use client'` component, a `pages/`/`app/` client file, a React/Vue/Svelte component, or any `src/` file bundled for the browser.
- **Served at a public path** — sitting in `public/`, `static/`, `dist/`, a committed `.env` that the server serves, or any route that returns the file.
- **Logged** — `console.log(apiKey)`, `logger.info(token)`: it lands in log aggregators, crash reports, and stdout that ops/3rd-parties can read.
- **Returned in a response** — the secret is put into JSON/HTML sent to the client (`res.json({ key })`, embedded in server-rendered HTML, a debug endpoint).

If a real secret has **any** of these exposure paths, it's a finding. If it's a real value with **no** path out (a server-only `.env` that's `.gitignore`d and never logged/served — i.e. used correctly), it's **not a finding** — that's exactly how secrets are *supposed* to live.

**Verdict + confidence (write this into the finding):**
- **Confirmed** — a real credential (strong prefix, or unmistakable high-entropy literal) on a real exposure path (committed / client bundle / served / logged / returned). Full severity. For provider keys: CRITICAL.
- **Likely** — a high-entropy literal you can't fully prove is live (could be rotated/stale), or an exposure path you couldn't fully resolve (e.g. unsure if the file reaches the client bundle). Flag it, say exactly what to verify, and **rotate-anyway** is the safe call.
- **Not a finding** — a placeholder, env reference, type/doc, public-by-design key, test fixture, or a real secret with no exposure path. Stay silent. *This silence is the product's near-zero-FP promise — honor it.*

The discipline in one line: **a finding is a real value that someone who shouldn't have it can read — prove both, or stay quiet.**

> **Redaction discipline (non-negotiable):** when you *do* report, **never print the full live secret.** Mask it — show only enough to locate it: first 6–8 chars of the prefix + `…` + last 4 (`sk-ant-api03…7f2a`), or just the prefix + length (`sk-live_…[32 chars]`). A report file, a draft email, or a git commit containing the full key re-leaks it. Mask in the title, the detail, and any code snippet you quote.

## How to scan — Step 1: find the candidate secrets

You're reading the repo, not running it. Grep for the shapes below to enumerate **candidates**, then run Steps B–C on each hit. A grep hit is a *candidate*, never a finding on its own.

### Strong-prefix provider keys (very low false positive — but still check realness + exposure)

```bash
# AI providers + payment + VCS + cloud — the shapes that are near-certainly real keys
grep -rEn --exclude-dir={node_modules,.next,dist,build,.git,.turbo,out,vendor} \
  'sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{40,}|sk-(proj-)?[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{24,}|sk_test_[A-Za-z0-9]{24,}|rk_live_[A-Za-z0-9]{24,}|AIza[A-Za-z0-9_-]{35}|ya29\.[A-Za-z0-9_-]+|ghp_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}|glpat-[A-Za-z0-9_-]{20}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|hf_[A-Za-z0-9]{30,}|r8_[A-Za-z0-9]{30,}|dop_v1_[a-f0-9]{64}|shpat_[a-f0-9]{32}|EAACEdEose0cBA[A-Za-z0-9]+|twilio.*AC[a-f0-9]{32}|SK[a-f0-9]{32}|key-[a-f0-9]{32}|npm_[A-Za-z0-9]{36}' \
  . 2>/dev/null
```

### Generic high-entropy assignments (a secret-shaped NAME holding a long literal)

```bash
# A secret-shaped variable assigned a long literal — needs a realness check on the VALUE
grep -rEn --exclude-dir={node_modules,.next,dist,build,.git,out,vendor} \
  --include='*.ts' --include='*.js' --include='*.jsx' --include='*.tsx' \
  --include='*.py' --include='*.go' --include='*.rb' --include='*.php' \
  --include='*.env*' --include='*.yml' --include='*.yaml' --include='*.json' --include='*.toml' \
  -E '(api[_-]?key|secret|token|passwd|password|access[_-]?key|client[_-]?secret|auth[_-]?token|private[_-]?key)["'\'' ]*[:=]\s*["'\''][A-Za-z0-9+/_=-]{16,}["'\'']' \
  . 2>/dev/null
```

### Connection strings with embedded credentials

```bash
# user:pass@host DSNs — the password is right there in the string
grep -rEn --exclude-dir={node_modules,.next,dist,build,.git,vendor} \
  -E '(mongodb(\+srv)?|postgres(ql)?|redis|rediss|mysql|amqp|amqps|mssql|clickhouse)://[^:@/\s"<>]+:[^@/\s"<>]+@' \
  . 2>/dev/null | grep -vE '://[^:@]+:(\$\{|YOUR_|password|changeme|x{3,})@'
```

### Private-key blocks + JWT signing secrets + cloud session tokens

```bash
# PEM private keys committed as files or inline
grep -rln --exclude-dir={node_modules,.next,dist,build,.git,vendor} \
  -E -- '-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----' \
  . 2>/dev/null

# JWT signing secret / session secret hardcoded (the thing that signs your auth tokens)
grep -rEn --exclude-dir={node_modules,.next,dist,build,.git,vendor} \
  -E '(jwt[_-]?secret|JWT_SECRET|session[_-]?secret|SECRET_KEY|cookie[_-]?secret|signing[_-]?key|NEXTAUTH_SECRET)["'\'' ]*[:=]\s*["'\''][^"'\'']{12,}["'\'']' \
  . 2>/dev/null

# AWS temporary session token (often pasted alongside an AKIA/ASIA key)
grep -rEn --exclude-dir={node_modules,.next,dist,build,.git,vendor} \
  -E 'aws_session_token|x-amz-security-token' . 2>/dev/null
```

### Client-bundle exposure sweep (the AI-generator classic — a secret marked public)

```bash
# Public-prefixed env vars holding a SECRET-shaped name → inlined into the browser bundle
grep -rEn --exclude-dir={node_modules,.next,dist,build,.git,out} \
  -E '(NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|GATSBY_|NUXT_PUBLIC_|PUBLIC_)[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PRIVATE)' \
  . 2>/dev/null

# Vite/import.meta secrets read in client files
grep -rEn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.vue' --include='*.svelte' \
  --exclude-dir={node_modules,.next,dist,build,.git} \
  -E 'import\.meta\.env\.[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)' \
  . 2>/dev/null
```

**Then run the method on each hit.** For every candidate above, do Step B (look at the *value* — real credential, or placeholder/env-ref/type/fixture?) and Step C (where does it end up — committed / client bundle / served / logged / returned, or safely server-only?). Real value + real exposure path = finding; placeholder, env reference, public-by-design, or no exposure path = stay silent. **Don't shortcut to "the regex matched" — that's how `.env.example` placeholders and `process.env.X` references get falsely flagged, and how a `NEXT_PUBLIC_` key that's only dangerous *because it reaches the browser* gets reported with the wrong severity.**

## Pattern reference (severity by type — assumes Step B+C confirmed real + exposed)

| Pattern | Catches | Severity |
|---|---|---|
| `sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{40,}` | Anthropic API key | CRITICAL |
| `sk-(proj-)?[A-Za-z0-9_-]{20,}` | OpenAI API key (legacy + 2024+ project keys) | CRITICAL |
| `AIza[A-Za-z0-9_-]{35}` | Google API key (AI Studio / Maps / etc.) | HIGH (CRITICAL if it's an AI/billing key) |
| `ya29\.…` | Google OAuth access token | HIGH |
| `sk_live_[A-Za-z0-9]{24,}` / `rk_live_…` | Stripe live secret / restricted key | CRITICAL |
| `sk_test_[A-Za-z0-9]{24,}` | Stripe test secret key | MEDIUM |
| `pk_live_[A-Za-z0-9]{24,}` | Stripe live **publishable** key | INFO (public by design) |
| `ghp_` / `ghs_` / `gho_` / `github_pat_…` | GitHub PAT / server / OAuth / fine-grained token | CRITICAL |
| `glpat-…` | GitLab personal access token | CRITICAL |
| `xox[abprs]-…` | Slack token (bot/user/app/refresh) | HIGH |
| `AKIA[0-9A-Z]{16}` / `ASIA…` | AWS access key / temp session key ID | HIGH (CRITICAL with the secret + session token) |
| `SG\.…` | SendGrid API key | HIGH |
| `hf_…` / `r8_…` | Hugging Face / Replicate token | HIGH |
| `dop_v1_…` | DigitalOcean PAT | CRITICAL |
| `shpat_…` | Shopify access token | HIGH |
| `eyJ…\.…\.…` | JWT (verify it's not a *signing secret* leak) | LOW (HIGH if it's the signing key, not a token) |
| `JWT_SECRET` / `NEXTAUTH_SECRET` / `SECRET_KEY` literal | Auth-signing secret — forges any session | CRITICAL |
| `-----BEGIN … PRIVATE KEY-----` | Private key file/inline | CRITICAL |
| `postgres://u:p@…` / `mongodb://u:p@…` / `mysql://u:p@…` | DB connection string with credentials | CRITICAL |
| `redis://u:p@…` / `amqp://u:p@…` | Cache / queue connection string with credentials | HIGH |
| high-entropy literal in `*_KEY`/`secret`/`token` | Unknown-provider key | HIGH (Likely until you confirm the provider) |

**Severity escalates with exposure breadth:** the *same* key is worse in a **public** repo than a private one, worse in a **client bundle** (every visitor) than a server file, and worst of all in **git history** (permanent, already scraped). Note the exposure path in the severity call.

## Report a finding as

**Title:** "Anthropic API key hardcoded in `src/lib/claude.ts:14` — and shipped to every visitor's browser" (be specific; name the file *and* the exposure path; **mask the key**)

(adapt the headline to the leak: server-committed → "OpenAI key committed to the repo in `…`"; connection string → "Your database password is sitting in `config.ts` in plain text"; client bundle → "Your `…` key is baked into the JavaScript anyone can download"; git history → "A leaked key is in your git history forever")

**Detail:**
> **Confidence: Confirmed.** `src/lib/claude.ts:14` hardcodes an Anthropic API key as a string literal:
> ```ts
> const client = new Anthropic({ apiKey: "sk-ant-api03…7f2a" });  // ← masked
> ```
> **Why it's real:** `sk-ant-api03…` is Anthropic's unmistakable key shape — this isn't a placeholder or an `process.env` reference, it's a live credential pasted in.
>
> **Where it's exposed (the traced path):** `claude.ts` is imported by `app/chat/page.tsx`, a `'use client'` component, so Next.js **inlines this string into the JavaScript bundle the browser downloads.** Open your deployed site, view-source / open the JS bundle, and the key is right there — `literal → client component → browser bundle`. Anyone who visits your site can read it. (Even if it were server-only, the file is committed to the repo, so the leak path holds either way.)
>
> **What can go wrong:** Anthropic keys bill per token with no default cap. Bots scrape public bundles and repos within minutes; a stolen key gets used for someone else's traffic and you pay the bill — often thousands before you notice.
>
> **What to do tonight:**
> 1. **Rotate the key now** — console.anthropic.com → API keys → revoke this one, create a new one. Assume the old one is already compromised; do this first, before anything else.
> 2. Move the new key to a **server-only** env var (`ANTHROPIC_API_KEY=…` in `.env.local` — never a `NEXT_PUBLIC_`/`VITE_` name, never `.env.example`).
> 3. Add a **server-side route** (`app/api/chat/route.ts`) that calls Anthropic; have the browser call *your* route, not Anthropic directly. The key never leaves the server.
> 4. Confirm it's gitignored and not already in history: `git log --all -- src/lib/claude.ts` and the `.env` history check below.
>
> Even if you do nothing else from this audit: **rotate the leaked key tonight.**

Repeat the report block for every distinct secret you found. **Lead every finding with its confidence and the exposure path** — state `Confirmed` or `Likely`, and name the **value-realness + where-exposed** path you established (e.g. `sk-ant-… literal → 'use client' file → browser bundle`, or `postgres://…:…@ → committed config.ts → repo read`, or `OPENAI_KEY literal → console.log → app logs`). That exposure path is the whole difference between this audit and a grep tool: it proves a real person can read a real secret, tells the founder exactly where to cut it, and is the thing a placeholder false-positive can't fake. **And mask every key you quote.**

## Special case: `.env*` files in git history

A secret deleted in a new commit is **still in the history forever.** After the secrets grep, also run:

```bash
# .env* files that were ever committed (added at any point in history)
git log --all --pretty=format: --name-only --diff-filter=A 2>/dev/null | sort -u | grep -E '\.env(\.|$)' | head -20

# Any blob in history that ever matched a strong key prefix (catches keys in deleted/edited files)
git log --all -p -S 'sk-ant-api' -S 'sk_live_' -S 'AKIA' --pretty=format:'%h %an %ad' 2>/dev/null | head -40
```

If any `.env`, `.env.local`, `.env.production`, etc. (or a key blob) shows up — the secrets in them are **in the git history permanently**, even if the current working tree is clean. Flag as **CRITICAL** and tell the user:

1. **Rotate every key that was ever in those files** — history-rewriting does not un-leak a key a bot already scraped.
2. *Then* optionally rewrite history (`git filter-repo` or BFG) if the repo is private and you want the blobs gone.
3. If the repo is (or ever was) **public** on GitHub: assume the keys were scraped within minutes of the push. GitHub's secret scanning may have already auto-notified the provider — rotation is **mandatory**, not optional.

## Don't false-positive on

This is where secret scanners cry wolf — they match a *format* and ignore both realness and reachability. Be strict: flag only when the value is a **genuine credential** *and* someone who shouldn't have it can **read** it. Each item below is a **barrier** — a reason the candidate is safe.

- **Env references, not literals.** `process.env.OPENAI_KEY`, `os.environ["STRIPE_SECRET"]`, `import.meta.env.VITE_X` *on the server*, `Deno.env.get(...)`, `config.get("apiKey")` — the *name* of a secret is not a secret. **Barrier: there's no value here at all.** Safe. (This is the single most common false positive — the regex matches the variable name, not a key.)
- **Placeholders / examples / templates.** `your_key_here`, `sk-xxxx`, `sk-proj-xxxxxxxx`, `changeme`, `<YOUR_API_KEY>`, `INSERT_KEY_HERE`, `replace-me`, all-same-char strings. **Barrier: the value isn't a real credential.** This includes everything in `.env.example`, `.env.sample`, `.env.template`, and `README` setup snippets — those are *meant* to show the shape. Safe.
- **Type definitions, interfaces, and doc comments.** `apiKey: string`, `type Token = \`sk-${string}\``, a JSDoc `@example sk-…`, a comment documenting the format. **Barrier: it's describing a key, not holding one.** Safe.
- **Test fixtures & known-public sample keys.** Stripe's documented `sk_test_…`/`pk_test_…` examples, the canonical `AKIAIOSFODNN7EXAMPLE`, anything under `__tests__/`, `*.test.*`, `*.spec.*`, `fixtures/`, `mocks/`, `seeds/`. **Barrier: not a production credential.** Mention only if a *real live* key snuck into a test file.
- **Public-by-design keys.** Stripe `pk_live_…`/`pk_test_…` publishable keys, Supabase **anon** key, Firebase web config `apiKey` (it's an identifier, not a secret — Firebase security is rules-based), any `NEXT_PUBLIC_*`/`VITE_*` value that is *meant* to be public (analytics IDs, Sentry DSN, Mapbox public token). **Barrier: these are designed to live in the client.** Note as INFO at most — *unless* it's a genuinely secret value wearing a public prefix (a `NEXT_PUBLIC_STRIPE_SECRET` is a real bug — the prefix is the leak, not a license to ignore it).
- **A real secret with no exposure path.** A live key in a server-only file that is **`.gitignore`d, never logged, never served, and never returned in a response** is being used *correctly* — that's the target state, not a finding. **Barrier: no one who shouldn't have it can read it.** (Confirm the `.gitignore` actually covers it and it isn't in git history — see the special case.)
- **Already-rotated / revoked values.** A key the user has commented `// OLD - rotated 2025-…` next to, or a value you can confirm is dead. **Barrier: the credential no longer works.** Note it for hygiene (still scrub from history) but it's not live exposure.
- **Hashes, UUIDs, checksums, and non-secret high-entropy.** A git SHA, a `uuid()`, a content hash, a CSS-in-JS class hash, a base64 *image*, an integrity `sha384-…` — long and random-looking but not a credential. **Barrier: high entropy ≠ secret.** Check the *name* it's bound to and what it is before flagging a bare blob.

When in doubt, answer the two questions out loud: **"Is this value a real credential?"** and **"Who can read it?"** If you can't name a real value *and* a real reader, there's no finding. The product's credibility depends on not flagging every `process.env` reference and every `.env.example` in the codebase. And whenever you *do* report — **mask the secret.**
