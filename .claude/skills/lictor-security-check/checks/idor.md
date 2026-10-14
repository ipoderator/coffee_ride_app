# Check — Users can see other users' data by changing the ID

**What you're looking for:** an endpoint that fetches or updates a record using an `id` (or `uuid`, `slug`, `orderId`...) taken straight from the URL or request body — and then never checks that the record actually *belongs to the person asking*. The classic shape: the route has a login check (so it feels safe), but it trusts the ID blindly. Logged-in user #42 changes `?orderId=43` in the address bar and reads user #43's invoice.

The security world calls this IDOR (Insecure Direct Object Reference) or "broken object-level authorization" (BOLA). Don't say either of those to the user. Say: **"a logged-in user can read other people's records by changing the number in the URL."**

This is different from [Unauthenticated API routes](./api-auth.md). There, the door has no lock at all. Here, the door has a lock — you have to log in — but once inside, *every* drawer opens, not just yours. An AI codegen tool almost always adds the login check and almost never adds the ownership check, because it doesn't know your data model. So this bug ships constantly.

**The wider family — don't stop at "read another user's row by changing an integer."** The same root cause (a user-supplied identifier reaching a data access with no ownership/authorization fence on the path) shows up as:
- **BOLA / object-level** — the classic above: change the `id` and you reach another principal's object.
- **BFLA / function-level** — a *normal* user reaches an **admin-only operation** (a `/admin` route, a `role`-changing update, a bulk export) because the handler checks "are you logged in?" but never "are you allowed to do *this*?"
- **Predictable / sequential IDs** — auto-increment ints, short codes, or guessable slugs make the wall trivial to walk end-to-end; this raises severity, it doesn't create or cure the bug.
- **GraphQL `node(id)` / global-id resolvers** — a single `node(id: …)` field or any resolver that loads by client-supplied id, with the authorization check missing from the resolver.
- **Second-order** — an id taken from object **A** (which the user legitimately owns) is used to reach object **B** (which they don't), with no re-check on B. Example: you own message `m`, the handler loads `m.attachmentId`, then serves that attachment without checking *its* owner.
- **Mass-assignment-adjacent over-return** — the lookup *is* fenced, but the handler returns the whole record (or accepts the whole body) including fields the user shouldn't see or set (`role`, `isAdmin`, `internalNotes`, another tenant's `orgId`). The fence held; the projection leaked.

## The method — trace the authorization flow, don't just read the next line

A real IDOR finding is **a user-controlled object identifier reaching a data access with no ownership/authorization barrier anywhere on the path between them.** Reading only the line directly under the handler is what makes scanners both noisy *and* shallow — it misses fences that live in middleware/policies/base-classes (false positives) and misses multi-step second-order flows (false negatives). Check these three things, in order. Doing all three is what makes this audit as deep as a commercial BOLA engine while staying near-zero-false-positive.

**Step A — is there a SINK (a data access driven by the id)?** A `findById`/`findUnique`, a file read by a path/filename, a record returned in a response, or an `update`/`delete` whose target is chosen by the identifier. Grep finds these.

**Step B — does a user-controlled IDENTIFIER reach it? Trace the id backwards through *every* step, not one.** Follow:
- the route/handler arg (`params.id`, `:id`, `req.query.orderId`, `body.uuid`, a `slug`, an uploaded `filename`),
- assignments and renames (`const oid = params.id; … findUnique({ where: { id: oid } })`),
- **function/service boundaries** (`getOrder(params.id)` → open `getOrder` and keep going into the repository/service layer),
- **second-order hops** (id read off object A → used to load object B; trace into the B lookup and check *B's* owner, not A's),
- across files/modules, into ORM scopes and GraphQL resolvers.

An identifier is **attacker-controlled** if it originates in the request (path, query, body, header, uploaded filename, a decompiled mobile client's path param) rather than the **session/token**. Stop when you hit a request source (→ attacker-controlled) or the session/auth context (→ not attacker-controlled — that's the user loading *their own* row).

> **Sources that are attacker-controlled.** `req.params|query|body|headers`, `params[:id]`, `searchParams.get`, `request.GET|POST|args|json`, `$_GET|$_POST|$request->input`, route/path args, GraphQL arguments (incl. `node(id)` global ids), an uploaded file's name/path, **and any id a mobile client puts in the URL** (the client picks it, so it's attacker-controlled even if it "looks like" the user's own id). **Not** attacker-controlled: `session.user.id`, `request.user`, the subject claim of a verified JWT, `auth().userId` — anything derived from the authenticated session.

**Step C — is there an OWNERSHIP / AUTHORIZATION BARRIER on the path, *before* the access?** If a correct barrier binds the object to the current principal before the sink runs, it is **safe — do not flag.** A barrier only counts when it's **on the path the id travels** and **the right kind for the operation**.

> **Barriers, per shape.** *Object-level (BOLA)* → the lookup names the session user/tenant in its filter (`where: { id, userId: session.user.id }`, `WHERE id=$1 AND org_id=$2`, `current_user.orders.find(id)`), an `assertOwns(user, id)` / `requireOwner(...)` helper *called before* the access, a **Row-Level-Security (RLS) policy** on the table (Supabase/Postgres) or Firebase security rules, or a policy/guard class (Laravel `authorize()`, Pundit/CanCanCan, NestJS guard) that scopes the record. *Function-level (BFLA)* → an explicit role/permission check for *this* operation (`if (session.user.role !== 'admin') return 403`), not merely "is logged in." *Second-order* → the re-check must be on **object B**, the one finally served — a fence on A is not a fence on B. *Over-return* → an explicit field allowlist / DTO / `select` that drops fields the user shouldn't see or set.
>
> A barrier **does not count** if it's in the wrong place or the wrong kind: a `401`/login check with no ownership filter (that's the painted lock); a `403` *after* the row was already fetched and returned; ownership checked on the parent but not the child; a check in a *sibling* route that this handler doesn't go through.

**Verdict + confidence (write this into the finding):**
- **Confirmed** — attacker-controlled id → data access, **no** ownership/authz barrier anywhere on the traced path, on a real request handler. Full severity (CRITICAL for sensitive/financial records or any write/delete; see the severity rule below).
- **Likely** — a barrier *might* exist one layer out (a middleware/policy/base-class you couldn't fully resolve), or the id reaches the sink through indirection you couldn't fully trace. Flag it, but say exactly which layer to check ("confirm the `requireOwner` middleware is actually mounted on this route").
- **Not a finding** — the lookup is fenced to the user/tenant, the id comes from the session, an RLS/policy enforces it, or the record is public by design. Stay silent. *This silence is the product's near-zero-FP promise — honor it.*

The discipline in one line: **depth comes from tracing the id across handler → middleware → service → DB; quiet comes from honoring the fence wherever it lives.**

## How to scan

The tell is a two-part smell, traced across the handler (and the layers it calls):
1. it reads an identifier from `params` / `query` / `body` (not from the session), **and**
2. it queries / updates / deletes by that identifier **without** any ownership-or-role barrier on the path to the access.

### Step 1 — find handlers that take an ID from the request

```bash
# JS / TS — Next.js, Express, Hono, Remix, SvelteKit, Fastify
grep -rEn --include='*.ts' --include='*.tsx' --include='*.js' \
  --exclude-dir={node_modules,.next,dist,build,.svelte-kit} \
  'params\.(id|userId|uuid|slug|orderId)|req\.params|searchParams\.get\(|query\.id|req\.query|body\.(id|userId)' \
  . 2>/dev/null | head -40

# Python — Django, FastAPI, Flask
grep -rEn --include='*.py' --exclude-dir={venv,.venv,__pycache__,node_modules} \
  'def .*\(.*\b(id|pk|user_id|uuid|order_id)\b|request\.(GET|POST|args|json)|kwargs\[|path_params' \
  . 2>/dev/null | head -40

# Go — chi, gin, echo, net/http
grep -rEn --include='*.go' \
  'chi\.URLParam|c\.Param\(|mux\.Vars|r\.PathValue|Query\(\)\.Get|c\.Query\(' \
  . 2>/dev/null | head -40

# Ruby — Rails
grep -rEn --include='*.rb' --exclude-dir={vendor,node_modules} \
  'params\[:id\]|params\[:.*_id\]|params\.require' \
  . 2>/dev/null | head -40

# PHP — Laravel, raw
grep -rEn --include='*.php' --exclude-dir={vendor,node_modules} \
  '\$_GET\[|\$_POST\[|\$request->(input|query|route)|->find\(' \
  . 2>/dev/null | head -40
```

### Step 2 — for each hit, run the method: trace the id to its access and look for a barrier on the path

A grep hit is a *candidate*, never a finding. For each one, do Step B (trace the id from the request to the data access — through helpers, services, and files, not one line) and Step C (is there an ownership/authz barrier *anywhere* on that path — inline filter, middleware, policy, or RLS?). Ask one question of the **whole path**, not just the next line: **does anything bind this object to the current user (or check their role for this operation) before the access happens?**

If the answer is no, it's a finding — and the access lives one line below the id read most of the time. But don't stop at one line in either direction: a fence may sit in middleware a layer out (→ *Not a finding*), and a second-order hop may carry the id another layer in (→ still a finding, on object B).

🔴 Vulnerable — keyed by request ID alone, no barrier on the path:

```ts
const order = await db.order.findUnique({ where: { id: params.id } });
```
```python
order = Order.objects.get(pk=order_id)
```
```go
db.First(&order, "id = ?", chi.URLParam(r, "id"))
```
```ruby
@order = Order.find(params[:id])
```
```php
$order = Order::find($request->id);
```

✅ Safe — the query is fenced to the owner:

```ts
const order = await db.order.findFirst({
  where: { id: params.id, userId: session.user.id },   // ← the fence
});
if (!order) return new Response("Not found", { status: 404 });
```
```python
order = get_object_or_404(Order, pk=order_id, user=request.user)
```

The single most reliable signal: **the `where` / filter clause names the order's ID but never names the logged-in user — and no middleware/policy/RLS does it either.** If the only constraint on the path is the attacker-supplied ID, flag it (`Confirmed`). If a fence *might* live one layer out that you couldn't resolve, flag it `Likely` and name the layer to check.

### Step 3 — the wider family: BFLA, GraphQL, second-order, over-return

The integer-swap is the textbook case, but the same root cause hides in shapes the grep above won't surface. Sweep these too.

```bash
# BFLA — function-level: a privileged operation reachable without a role/permission check.
# Find admin/privileged routes and update sinks, then confirm each has a ROLE check (not just a login check).
grep -rEn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.py' --include='*.go' --include='*.rb' --include='*.php' \
  --exclude-dir={node_modules,.next,dist,build,vendor,venv,.venv} \
  -E '/admin|isAdmin|role\s*[:=]|set(Role|Admin)|grantRole|\.(update|delete|destroy)\(|bulk(Delete|Export)|impersonate' \
  . 2>/dev/null | head -40

# GraphQL — node(id)/global-id and any resolver that loads by a client-supplied id
grep -rEn --exclude-dir={node_modules,.next,dist,build} \
  -E 'node\(\s*id|fromGlobalId|nodeField|resolve.*\bargs\.(id|.*Id)|@FieldResolver|RootQuery.*byId' \
  . 2>/dev/null | head -40

# Second-order — an id read off one record and used to load another (trace into the second lookup)
grep -rEn --include='*.ts' --include='*.js' --include='*.py' --exclude-dir={node_modules,.next,dist} \
  -E '\.(attachmentId|fileId|ownerId|parentId|relatedId|childId)\b|findById\([^)]*\.\w+Id' \
  . 2>/dev/null | head -40

# Over-return / mass-assignment-adjacent — whole-record return or whole-body update
grep -rEn --include='*.ts' --include='*.js' --include='*.py' --exclude-dir={node_modules,.next,dist} \
  -E 'return.*Response\.json\(\s*(record|row|user|order|invoice)\s*\)|\.update\(\s*req\.body\s*\)|\.create\(\s*\{\s*\.\.\.req\.body|save\(\s*\*\*request' \
  . 2>/dev/null | head -40
```

For each hit, apply the same method, but watch the barrier *kind*:
- **BFLA:** the barrier must be a **role/permission** check for *this* operation. A login check is not enough — confirm a `role !== 'admin' → 403` (or policy/guard equivalent) on the path. Missing role check on a privileged op = `Confirmed` BFLA, CRITICAL.
- **GraphQL:** the barrier must live **in the resolver** (or a field-level guard the resolver runs through). A REST endpoint being fenced doesn't fence the GraphQL `node(id)` that reaches the same object.
- **Second-order:** the barrier must be on **object B** (the one finally served), not object A. Trace into the *second* lookup and check *its* owner.
- **Over-return:** the barrier is an explicit field allowlist / DTO / `select`. Even with a correct ownership fence, flag whole-record return that includes `role`, `passwordHash`, `internalNotes`, another tenant's ids, etc. (severity scales with field sensitivity).

### Mobile apps count too

Mobile clients are just front-ends to the same API — the bug lives on the server. But mobile code reveals *which* endpoints take an ID, and how the app builds the URL. Grep the mobile source to map the attack surface, then check the matching server handler.

```bash
# Swift (iOS) — URL building with an id
grep -rEn --include='*.swift' \
  '/users/|/orders/|/api/.*\\(|URL\(string:|\.appendingPathComponent' . 2>/dev/null | head -30

# Kotlin / Java (Android) — Retrofit path params
grep -rEn --include='*.kt' --include='*.java' \
  '@GET\(|@POST\(|@Path\(|@Query\(|"/api/' . 2>/dev/null | head -30

# Flutter / Dart
grep -rEn --include='*.dart' \
  'http\.(get|post|put|delete)\(|Uri\.parse\(|/api/|\$userId|\$id' . 2>/dev/null | head -30

# React Native / Expo
grep -rEn --include='*.tsx' --include='*.ts' --include='*.js' --exclude-dir=node_modules \
  'fetch\(|axios\.(get|post|put|delete)|/api/.*\$\{' . 2>/dev/null | head -30
```

A red flag worth calling out: if a mobile app passes its **own** user ID up to the server (`GET /api/users/{myUserId}/profile`) and the server trusts that ID instead of reading it from the auth token, then anyone who decompiles the app — trivial on Android — can swap in someone else's ID. The client picking *which* account to load is the bug; the server must derive the user from the token, never from the path.

## What to report

**Title:** "Logged-in users can read other people's orders by changing the ID in the URL"

(swap "orders" for whatever record it actually is — invoices, messages, profiles, uploaded files, support tickets)

**Severity:** 🔴 **CRITICAL** when the record holds personal or financial data (orders, invoices, messages, medical info, documents) and the endpoint reads or writes it. 🟠 **HIGH** when the exposed field is low-sensitivity (e.g. a public-ish display name) but ownership still isn't enforced. A write/delete endpoint with no ownership check is always 🔴 — that's not just reading other people's data, it's editing it.

**Detail — write it as a story:**

> **Anyone logged in can read every customer's invoice, just by changing one number.**
>
> Your invoice page at `app/api/invoices/[id]/route.ts:11` looks up the invoice using the ID from the web address:
> ```ts
> const invoice = await db.invoice.findUnique({ where: { id: params.id } });
> return Response.json(invoice);
> ```
> There's a login check higher up, so it *feels* protected. But the lookup only asks "is there an invoice with this ID?" — never "does this invoice belong to the person asking?"
>
> **Here's what goes wrong:** A customer opens their own invoice and sees `app.yourapp.com/api/invoices/1042` in the address bar. Out of curiosity (or worse), they change it to `1041`. Up pops someone else's invoice — name, billing address, line items, amount. They try `1040`, `1039`, `1038`. In ten minutes a script walks every ID from 1 to 50,000 and downloads your entire customer base. You find out when it shows up on a forum, or when a customer emails asking why they can see a stranger's bill.
>
> **How to fix tonight (one line per endpoint):** add the logged-in user to the lookup, so the database can only ever return rows that belong to them.
> ```ts
> import { auth } from "@/lib/auth";
>
> export async function GET(req, { params }) {
>   const session = await auth();
>   if (!session) return new Response("Unauthorized", { status: 401 });
>
>   const invoice = await db.invoice.findFirst({
>     where: { id: params.id, userId: session.user.id },  // ← the fix
>   });
>   if (!invoice) return new Response("Not found", { status: 404 });  // not 403 — don't confirm the ID exists
>   return Response.json(invoice);
> }
> ```
> Return **404, not 403**, when the record isn't theirs — a 403 quietly confirms "this ID exists, you're just not allowed," which still leaks information.
>
> Then do the same to every sibling route — `GET`, `PUT`, `PATCH`, `DELETE` on invoices, and the same shape on orders, messages, files, profiles. The fix is mechanical; sweep all of them in one pass.
>
> **Verify after deploy:** log in as one test user, open one of your own records, then change the ID in the URL to a record you know belongs to a *different* test user. You should get a 404, not their data.

If the project uses **Supabase or Firebase**, add: the durable fix is Row Level Security / security rules on the table itself (see [the database check](./db-exposure.md)) — then even an endpoint that forgets the ownership filter can't hand back rows the requester doesn't own. The query fence above is the app-layer belt; RLS is the suspenders. Do both.

Repeat the report block for each vulnerable endpoint you find. If you find one, assume there are more of the same shape — grep the whole repo before you finish.

**Lead every finding with its confidence and the traced path.** State `Confirmed` or `Likely` (from the method's verdict rule), name the **family** (BOLA / BFLA / second-order / GraphQL / over-return), and write the **id source → lookup → barrier?** path you actually followed — e.g. `params.id → getOrder() → db.order.findUnique() → no ownership filter on path = Confirmed BOLA`, or `args.id → node() resolver → loads document, resolver has no role check = Confirmed BFLA`, or `message.attachmentId → file.findById() → owner re-check missing on the attachment = Confirmed second-order`. That traced path is the whole difference between this audit and a grep tool: it proves the door is really unlocked, tells the founder exactly which layer to add the fence at, and is the thing a false positive can't fake. For a `Likely`, name the layer you couldn't resolve (e.g. "confirm `requireOwner` is actually mounted on this route, not just defined").

## What NOT to flag

The whole point of this product is to not cry wolf. Skip these — they look like the bug but aren't. Each one is a **barrier on the path** (Step C): when a correct fence is present — inline, one layer out, or in the database — there is no finding, no matter how scary the `findById` line looks.

- **The ID is already fenced to the user.** If the query's `where` / filter names the session user (`userId: session.user.id`, `user=request.user`, `WHERE user_id = $current`, a `current_user.orders.find(...)` scope, a Rails `current_user.orders.find(params[:id])`), it's correct — the barrier is *inline on the path*. Not a finding. This is the most common false positive — read the *whole* `where` clause, not just the first key.

- **The record is genuinely public by design.** Blog posts, public product pages, published profiles, a shared link feature, marketing pages. `GET /api/posts/[slug]` for a public blog has no owner to check. Look at *what the record is* — if it's meant for the whole internet, there's nothing to protect. Note as ⚪ INFO at most.

- **The ID comes from the session, not the request.** `db.user.findUnique({ where: { id: session.user.id } })` reads the *current* user's own row. The ID isn't attacker-controlled — it's whoever is logged in. Safe.

- **Ownership is enforced one layer up.** A `requireOwner(params.id, session)` helper, a route middleware, a Django `LoginRequiredMixin` + `get_queryset` that filters by `self.request.user`, a Rails `before_action` that scopes the record, a policy/guard class (Laravel `authorize()`, NestJS guards, Pundit/CanCanCan). If the check lives in a decorator, middleware, base class, or policy rather than inline, it still counts — the barrier is *on the path, just one layer out*. Trace one level out before flagging. (If you can't confirm the middleware is actually *mounted* on this route — only that it's defined — downgrade to `Likely` and say so, rather than calling it clean or `Confirmed`.)

- **Row-Level Security / database-enforced ownership.** A Supabase/Postgres **RLS policy** (`USING (user_id = auth.uid())`) or Firebase security rules on the table mean the database itself refuses rows the requester doesn't own — so even a handler that "forgets" the filter can't leak. That's a real barrier *below* the app layer. Confirm the policy exists and is enabled for the table before waving the endpoint through; if RLS is off or the table has no policy, the handler's missing filter *is* the finding.

- **Tenant/team scoping instead of per-user.** Many B2B apps key ownership to an organization, not an individual (`where: { id, orgId: session.orgId }`). That's a legitimate ownership fence — a record shared across a team the user belongs to is fine. Only flag if there's *no* scoping at all. (Watch the second-order trap: org-scoping object A doesn't scope a *different* org's object B reached through it.)

- **A privileged operation that *does* check the role.** A BFLA candidate (admin route, role-changing update, bulk export) is **not** a finding when an explicit role/permission check for that operation is on the path (`if (session.user.role !== 'admin') return 403`, a policy `authorize('manage', resource)`, a `@Roles('admin')` guard). The barrier for function-level access is a *role* check, not just a login check — but when it's present, stay silent.

- **GraphQL resolver that authorizes inside itself.** A `node(id)` / by-id resolver is fine when the resolver (or a field guard it runs through) binds the object to the caller — `context.user` scoping, a `@Authorized` directive, an ownership check before returning. The barrier must live in the *resolver path*; don't flag a resolver just for taking a client-supplied id.

- **Second-order where object B is re-checked.** Loading `message.attachmentId` and then serving the attachment is safe *if* the attachment lookup itself re-scopes to the user. The fence on B is present — not a finding. Only flag when B is served with no owner check of its own.

- **Unguessable, capability-style IDs used as the secret** — *with caution.* A long random token in a "anyone with the link can view" feature (share links, password-reset tokens, signed URLs) is intentionally the access control. That's a deliberate design, not IDOR. But a 128-bit UUID on a normal account record is **not** a substitute for an ownership check — UUIDs leak (logs, referer headers, the user's own browser history, support tickets) and "hard to guess" isn't "checked." Don't wave a UUID through just because it's not a sequential integer; only treat the random ID as the control when the feature is explicitly a shareable-link/token flow.

- **Admin endpoints that are *supposed* to read any record** — provided they verify an admin role (`if (session.user.role !== "admin") return 403`). An admin dashboard reading `GET /api/admin/users/[id]` by arbitrary ID is correct, *if* the role check is present. Flag only if the admin gate is missing — but that's the painted-lock / unauth check, not this one.

- **Static fixtures, seed scripts, tests, and migrations.** `seed.ts`, `*.test.ts`, `factories.py`, `fixtures/` — these query by hardcoded IDs on purpose and never run in production. Ignore.
