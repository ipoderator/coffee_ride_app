# Lictor Security Check — framework crosswalk

**Companion to [`CHECKS.md`](./CHECKS.md)** · Baseline 2.2.1 · Last reviewed 2026-06-19

This file maps every category of the frameworks Lictor claims coverage of, to the
specific check number(s) in the 48-check catalog that cover it. It exists so the
coverage claim is **verifiable**, not just asserted — a buyer (or a competitor) can
read straight down each column and confirm it.

Check numbers (`#N`) refer to the rows in [`CHECKS.md`](./CHECKS.md).

**Honesty note:** "covered" means *a check exists whose documented class includes this
category*. It does **not** mean Lictor exploits it — the catalog is code-reading and
live-observation only (see CHECKS.md "Coverage philosophy"). Partial-coverage rows are
marked `~`.

---

## Summary

| Framework | Categories | Covered | Coverage |
|---|---|---|---|
| OWASP Top 10 — Web (2021) | 10 | 10 | **full** |
| OWASP API Security Top 10 (2023) | 10 | 10 | **full** |
| OWASP Mobile Top 10 (2024) | 10 | 10 | **full** |
| OWASP Top 10 for LLM Apps (2025) | 10 | 10 | **full** |
| **OWASP total** | **40** | **40** | **full** |
| CWE Top 25 (2024) | 25 | 19 | **application-layer** (6 memory-safety out of scope by design) |

---

## OWASP Top 10 — Web (2021)

| # | Category | Lictor check(s) |
|---|----------|-----------------|
| A01 | Broken Access Control | #6 api-auth, #8 idor, #9 admin-paths, #22 open-redirect, #25 mass-assignment, #37 path-traversal |
| A02 | Cryptographic Failures | #35 weak-crypto, #2 ai-keys, #5 logging-pii |
| A03 | Injection | #11 injection, #30 llm-output-sink |
| A04 | Insecure Design | #24 business-flow-automation, #17 rate-limiting |
| A05 | Security Misconfiguration | #3 env-files, #4 cloud-storage, #10 db-exposure, #14 cors, #15 security-headers, #18 open-services |
| A06 | Vulnerable & Outdated Components | #19 dependencies |
| A07 | Identification & Authentication Failures | #7 authn-session |
| A08 | Software & Data Integrity Failures | #16 webhooks-csrf, #23 cicd-pipeline-integrity, #33 model-artifact-provenance, #36 unsafe-deserialization |
| A09 | Security Logging & Monitoring Failures | #39 audit-logging-gaps |
| A10 | Server-Side Request Forgery (SSRF) | #12 ssrf |

**10 / 10 covered.**

## OWASP API Security Top 10 (2023)

| # | Category | Lictor check(s) |
|---|----------|-----------------|
| API1 | Broken Object Level Authorization (BOLA) | #8 idor |
| API2 | Broken Authentication | #7 authn-session |
| API3 | Broken Object Property Level Authorization | #25 mass-assignment |
| API4 | Unrestricted Resource Consumption | #38 resource-amplification, #17 rate-limiting |
| API5 | Broken Function Level Authorization | #6 api-auth, #9 admin-paths |
| API6 | Unrestricted Access to Sensitive Business Flows | #24 business-flow-automation |
| API7 | Server-Side Request Forgery | #12 ssrf |
| API8 | Security Misconfiguration | #14 cors, #15 security-headers, #18 open-services |
| API9 | Improper Inventory Management | #40 api-inventory, #39 audit-logging-gaps |
| API10 | Unsafe Consumption of APIs | #41 third-party-consumption |

**10 / 10 covered.**

## OWASP Mobile Top 10 (2024)

| # | Category | Lictor check(s) |
|---|----------|-----------------|
| M1 | Improper Credential Usage | #21 mobile, #26 mobile-auth-local |
| M2 | Inadequate Supply Chain Security | #27 mobile-supply-chain |
| M3 | Insecure Authentication/Authorization | #26 mobile-auth-local |
| M4 | Insufficient Input/Output Validation | #47 mobile-input-validation |
| M5 | Insecure Communication | #45 mobile-cert-pinning, #21 mobile (cleartext) |
| M6 | Inadequate Privacy Controls | #48 mobile-privacy-controls |
| M7 | Insufficient Binary Protections | #46 mobile-binary-protections |
| M8 | Security Misconfiguration | #46 mobile-binary-protections, #47 mobile-input-validation |
| M9 | Insecure Data Storage | #31 mobile-data-storage |
| M10 | Insufficient Cryptography | #35 weak-crypto |

**10 / 10 covered.**

## OWASP Top 10 for LLM Apps (2025)

| # | Category | Lictor check(s) |
|---|----------|-----------------|
| LLM01 | Prompt Injection | #20 ai-agent, #28 indirect-prompt-injection, #44 rag-ingestion-trust |
| LLM02 | Sensitive Information Disclosure | #42 llm-context-overscope |
| LLM03 | Supply Chain | #33 model-artifact-provenance |
| LLM04 | Data & Model Poisoning | #44 rag-ingestion-trust |
| LLM05 | Improper Output Handling | #30 llm-output-sink |
| LLM06 | Excessive Agency | #43 agent-tool-permissions, #42 llm-context-overscope |
| LLM07 | System Prompt Leakage | #29 system-prompt-secrets |
| LLM08 | Vector & Embedding Weaknesses | #32 vector-store-isolation |
| LLM09 | Misinformation | #34 ungrounded-output-trust |
| LLM10 | Unbounded Consumption | #17 rate-limiting, #38 resource-amplification |

**10 / 10 covered.**

---

## CWE Top 25 — 2024 (MITRE)

Rank order per the [2024 CWE Top 25](https://cwe.mitre.org/top25/archive/2024/2024_cwe_top25.html).

| Rank | CWE | Name | Lictor check(s) |
|---|---|------|-----------------|
| 1 | CWE-79 | Cross-site Scripting | #11 injection |
| 2 | CWE-787 | Out-of-bounds Write | — **out of scope** (memory safety) |
| 3 | CWE-89 | SQL Injection | #11 injection |
| 4 | CWE-352 | Cross-Site Request Forgery | #16 webhooks-csrf |
| 5 | CWE-22 | Path Traversal | #37 path-traversal |
| 6 | CWE-125 | Out-of-bounds Read | — **out of scope** (memory safety) |
| 7 | CWE-78 | OS Command Injection | #11 injection |
| 8 | CWE-416 | Use After Free | — **out of scope** (memory safety) |
| 9 | CWE-862 | Missing Authorization | #6 api-auth, #8 idor |
| 10 | CWE-434 | Unrestricted File Upload | #13 file-upload |
| 11 | CWE-94 | Code Injection | #11 injection, #30 llm-output-sink |
| 12 | CWE-20 | Improper Input Validation | ~ #47 mobile-input-validation, #41 third-party-consumption, #38 resource-amplification |
| 13 | CWE-77 | Command Injection | #11 injection |
| 14 | CWE-287 | Improper Authentication | #7 authn-session |
| 15 | CWE-269 | Improper Privilege Management | ~ #25 mass-assignment, #26 mobile-auth-local |
| 16 | CWE-502 | Deserialization of Untrusted Data | #36 unsafe-deserialization |
| 17 | CWE-200 | Exposure of Sensitive Information | #5 logging-pii, #3 env-files, #42 llm-context-overscope |
| 18 | CWE-863 | Incorrect Authorization | #8 idor |
| 19 | CWE-918 | Server-Side Request Forgery | #12 ssrf |
| 20 | CWE-119 | Improper Restriction of Memory Buffer | — **out of scope** (memory safety) |
| 21 | CWE-476 | NULL Pointer Dereference | — **out of scope** (memory safety) |
| 22 | CWE-798 | Use of Hard-coded Credentials | #1 secrets, #2 ai-keys |
| 23 | CWE-190 | Integer Overflow or Wraparound | — **out of scope** (memory safety) |
| 24 | CWE-400 | Uncontrolled Resource Consumption | #17 rate-limiting, #38 resource-amplification |
| 25 | CWE-306 | Missing Authentication for Critical Function | #6 api-auth, #7 authn-session |

**19 / 25 covered.** The 6 uncovered (ranks 2, 6, 8, 20, 21, 23 — CWE-787/125/416/119/476/190)
are memory-safety and integer-overflow classes in compiled/native code. They cannot be
confirmed by reading an app's source or observing its public surface; proving them needs a
fuzzer or an authorized live-system pentest. That is **out of scope by design** — Lictor is a
free, no-exploitation, pre-ship self-audit, not a memory-safety analyzer. A founder shipping a
web/mobile/AI app is not writing the kind of native code where these dominate; when they are,
the honest recommendation is a dedicated fuzzing/pentest engagement, which Lictor will say.

---

## How to keep this current

When a check module is added, changed, or removed in [`CHECKS.md`](./CHECKS.md), update the
relevant row(s) here in the same commit. If a future check ever closes one of the 6
memory-safety CWEs (e.g. a Rust/Go/C++ static-analysis surface), move it out of "out of scope"
and bump the summary count — and only then.
