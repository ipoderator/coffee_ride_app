# Lictor Security Check — Claude Code skill

> Pre-release security audit for AI-built web apps. A Claude Code skill that vibe-coders run before they ship.

If you built your app with Lovable / Bolt / v0 / Cursor or by prompting Claude directly, your AI didn't tell you about:

- Hardcoded API keys in your JS bundle
- `/api/users` routes that return everyone's data without auth
- Supabase tables with Row Level Security disabled
- `.env` files that end up served at `/.env` on your deployed site
- Admin pages "protected" by client-side `useEffect` redirects (still ship the data)
- CORS configs that let any website read your authenticated API responses
- AI chat endpoints with no prompt-injection defense

Those are just a few examples — this skill runs **48 checks** spanning the full OWASP Web/API/Mobile/GenAI Top 10s plus the application-layer CWE Top 25 (19 of 25 — memory-safety classes are out of scope by design). **Read-only audit** — it doesn't change your code. Writes a markdown report (`SECURITY-AUDIT.md`) you can act on in 30 minutes.

## Install

### Option A: Claude Code plugin (recommended)

Two commands, no clone:

```
/plugin marketplace add Raffa-jarrl/Lictor-AI
/plugin install lictor-security-suite@lictor-ai
```

That installs this skill plus its three companions (`/lictor-explain`, `/lictor-fix-it`, `/lictor-rotate`).

### Option B: Plain file copy

```bash
git clone https://github.com/Raffa-jarrl/Lictor-AI.git ~/Code/lictor 2>/dev/null || \
  (cd ~/Code/lictor && git pull)
bash ~/Code/lictor/skills/install.sh
```

Or copy just this one skill by hand (system-wide, or into a project's `.claude/skills/`):

```bash
mkdir -p ~/.claude/skills
cp -r ~/Code/lictor/skills/plugins/lictor-security-suite/skills/lictor-security-check ~/.claude/skills/
```

Then in any Claude Code session:

```
/lictor-security-check
```

## How to run

In Claude Code, from your project's root directory:

```
/lictor-security-check
```

Claude will:

1. Figure out what kind of project you have (Next.js, Vite, Astro, etc.)
2. Run all 48 security checks against your codebase
3. Write a `SECURITY-AUDIT.md` file with severity-ranked findings
4. Tell you in chat whether it's safe to ship

The audit takes 30–90 seconds depending on project size.

## Example output

```
🟧 FIX BEFORE SHARING PUBLICLY

Found 5 findings (1 critical, 2 high, 2 medium).

The critical one is your OpenAI API key in src/lib/openai.ts:14 — anyone
who views your JS bundle in their browser can run unlimited requests on
your account. Rotate it tonight (instructions in SECURITY-AUDIT.md §1).

The high-severity issues are /api/users returning user data without auth,
and Supabase RLS not enabled (your client code queries directly).

Full report saved to ./SECURITY-AUDIT.md.
```

## What this skill is

A pre-deploy audit for AI-built apps, from [Lictor](https://lictor-ai.com). It reads your code and writes a plain-English report; it never edits anything and never touches the network.

| Stage | Tool | Catches |
|---|---|---|
| **Pre-release** (this skill, free) | `/lictor-security-check` | Bugs in your source code before they ship |
| **Live site** (paid, hosted) | [Lictor monitoring](https://lictor-ai.com) | New exposures on your deployed site, around the clock, with email alerts |

This skill is free, open source, and works today.

## What this skill is NOT

- **Not a pentest.** It catches the categories that vibe-coded SaaS ships with most often. Real adversaries probing your app will find issues this skill won't. Treat it as a final sanity check, not as a security audit by a human.
- **Not a compliance certification.** See [lictor-ai.com/compliance](https://lictor-ai.com/compliance) for how these findings map onto SOC 2 / GDPR / EU AI Act controls. Certification still requires a human auditor.
- **Not a substitute for security mindset.** Reading the report and understanding *why* each finding matters is the value. If you just want a green checkmark, you'll go from "0/10" to "10/10" by hiding findings — you won't be safer.

## Why this exists

The 2026 reality:

- Lovable + Bolt + v0 + Cursor + Claude + ChatGPT generate thousands of new SaaS apps per week
- The people building them are increasingly *not engineers* — they're designers, founders, artists, hobbyists
- The generative tools optimize for "make it work," not "make it safe"
- The security industry treats this audience as not-their-problem
- A 30-minute pre-release audit catches 80% of the bugs that would otherwise show up as Hacker News disclosure threads at 2am

Lictor exists to flip that. This skill is the free product — no signup, runs locally, leaves a markdown report you can show your co-founder. If you later want your live site watched continuously, that's Lictor's hosted monitoring service at [lictor-ai.com](https://lictor-ai.com).

## License

Apache 2.0. Same as the rest of [Lictor](https://github.com/Raffa-jarrl/Lictor-AI).

## Contributing

Found a category of vibe-coded bug we missed? Open an issue at [github.com/Raffa-jarrl/Lictor-AI](https://github.com/Raffa-jarrl/Lictor-AI) with:

1. A real example of the pattern (in any vibe-coded repo you've seen)
2. Why current AI assistants generate this bug
3. The fix the user needs to apply

If we add it to the catalog, you're credited in the next release notes.

## Attribution

Built by [Lictor AI](https://lictor-ai.com). 20-year cybersec founder. The check catalog in this skill (`checks/*.md`) is the source of truth for everything this skill scans for; the hosted service covers the externally-observable slice of it against your live site.

When this skill helps you ship a safer app, drop a star on the repo at [github.com/Raffa-jarrl/Lictor-AI](https://github.com/Raffa-jarrl/Lictor-AI). That's how solo founders measure traction.
