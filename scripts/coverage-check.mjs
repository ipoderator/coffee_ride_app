// Coverage gate (CR-136). Compares each package's
// `coverage/coverage-summary.json` (written by `pnpm test:coverage`) against
// the committed `coverage-baseline.json` and fails when any metric falls
// below its baseline. The baseline is a floor that only moves up: raise it
// with `pnpm coverage:baseline` after coverage improves.
//
//   node scripts/coverage-check.mjs                 check against the baseline
//   node scripts/coverage-check.mjs --update        raise the baseline to current
//   node scripts/coverage-check.mjs --update --allow-decrease
//                                                   also lower it (needs a reason
//                                                   in docs/changelog.md)
//   node scripts/coverage-check.mjs --base <file>   PRs: also hold the line at the
//                                                   base branch's baseline, so a PR
//                                                   can't pass by lowering the file
//
// COVERAGE_ALLOW_DECREASE=1 skips the --base comparison (CI sets it for PRs
// labelled `coverage-decrease-approved`). The report is Markdown; with
// GITHUB_STEP_SUMMARY set it is also appended to the CI job summary.

import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const BASELINE_PATH = join(ROOT, 'coverage-baseline.json');
const METRICS = ['lines', 'statements', 'functions', 'branches'];

const args = process.argv.slice(2);
const update = args.includes('--update');
const allowDecrease =
  args.includes('--allow-decrease') ||
  ['1', 'true'].includes(process.env.COVERAGE_ALLOW_DECREASE);
const baseIndex = args.indexOf('--base');
const basePath = baseIndex === -1 ? undefined : args[baseIndex + 1];

const out = (line = '') => process.stdout.write(`${line}\n`);

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const tolerance = baseline.tolerance ?? 0;
const baseFile =
  basePath && existsSync(basePath)
    ? JSON.parse(readFileSync(basePath, 'utf8'))
    : undefined;

// Percent from raw counts, not the summary's pre-rounded `pct`. A metric
// with nothing to cover counts as fully covered (istanbul's convention).
function percent(counts) {
  return counts.total === 0 ? 100 : (100 * counts.covered) / counts.total;
}

function floor2(value) {
  return Math.floor(value * 100) / 100;
}

// { total: {lines: pct, ...}, scopes: { 'src/x/': {lines: pct, ...} } }
function measure(pkgDir, scopePrefixes) {
  const summaryPath = join(ROOT, pkgDir, 'coverage', 'coverage-summary.json');
  if (!existsSync(summaryPath)) return undefined;
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const pkgRoot = `${join(ROOT, pkgDir)}/`;

  const total = Object.fromEntries(
    METRICS.map((m) => [m, percent(summary.total[m])]),
  );
  const scopes = {};
  for (const prefix of scopePrefixes) {
    const counts = Object.fromEntries(
      METRICS.map((m) => [m, { total: 0, covered: 0 }]),
    );
    let files = 0;
    for (const [file, entry] of Object.entries(summary)) {
      if (file === 'total' || !file.startsWith(pkgRoot + prefix)) continue;
      files += 1;
      for (const m of METRICS) {
        counts[m].total += entry[m].total;
        counts[m].covered += entry[m].covered;
      }
    }
    scopes[prefix] =
      files === 0
        ? undefined
        : Object.fromEntries(METRICS.map((m) => [m, percent(counts[m])]));
  }
  return { total, scopes };
}

// Stricter of the two baselines, metric by metric.
function floorFor(pkgDir, scope, metric) {
  const pick = (source) => {
    const pkg = source?.packages?.[pkgDir];
    return scope ? pkg?.scopes?.[scope]?.[metric] : pkg?.total?.[metric];
  };
  const own = pick(baseline);
  const base = basePath && !allowDecrease ? pick(baseFile) : undefined;
  if (own === undefined) return base;
  if (base === undefined) return own;
  return Math.max(own, base);
}

const failures = [];
const missing = [];
const rows = [];
const measured = {};

for (const [pkgDir, entry] of Object.entries(baseline.packages)) {
  const scopePrefixes = Object.keys(entry.scopes ?? {});
  const current = measure(pkgDir, scopePrefixes);
  if (!current) {
    missing.push(pkgDir);
    failures.push(
      `${pkgDir}: no coverage report — run \`pnpm test:coverage\` first`,
    );
    continue;
  }
  measured[pkgDir] = current;

  const targets = [
    [undefined, current.total],
    ...scopePrefixes.map((s) => [s, current.scopes[s]]),
  ];
  for (const [scope, values] of targets) {
    const label = scope ? `${pkgDir}/${scope}` : `${pkgDir} (total)`;
    if (!values) {
      failures.push(
        `${label}: scope matches no source file — fix or remove it in the baseline`,
      );
      continue;
    }
    const cells = METRICS.map((m) => {
      const floor = floorFor(pkgDir, scope, m);
      const value = values[m];
      if (floor === undefined) return `${value.toFixed(2)}`;
      const ok = value + tolerance >= floor;
      if (!ok)
        failures.push(
          `${label} ${m}: ${value.toFixed(2)}% < baseline ${floor.toFixed(2)}%`,
        );
      const delta = value - floor;
      const sign = delta >= 0 ? '+' : '−';
      return `${ok ? '' : '❌ '}${value.toFixed(2)} (${sign}${Math.abs(delta).toFixed(2)})`;
    });
    rows.push(`| ${label} | ${cells.join(' | ')} |`);
  }
}

// A package with a report but no baseline entry is reported, never gated —
// add it to the baseline with --update once its suite is stable.
const unknown = ['apps', 'packages']
  .flatMap((dir) =>
    readdirSync(join(ROOT, dir)).map((name) => `${dir}/${name}`),
  )
  .filter((pkgDir) =>
    existsSync(join(ROOT, pkgDir, 'coverage', 'coverage-summary.json')),
  )
  .filter((pkgDir) => !(pkgDir in baseline.packages));

if (update) {
  for (const pkgDir of unknown) {
    baseline.packages[pkgDir] = { total: {} };
    measured[pkgDir] = measure(pkgDir, []);
  }
  const lowered = [];
  for (const [pkgDir, current] of Object.entries(measured)) {
    const entry = baseline.packages[pkgDir];
    const write = (target, values, label) => {
      for (const m of METRICS) {
        const next = floor2(values[m]);
        if (target[m] !== undefined && next < target[m] && !allowDecrease) {
          lowered.push(`${label} ${m}: ${target[m]} → ${next}`);
          continue;
        }
        target[m] = next;
      }
    };
    write(entry.total, current.total, `${pkgDir} (total)`);
    for (const [scope, values] of Object.entries(current.scopes)) {
      if (values) write(entry.scopes[scope], values, `${pkgDir}/${scope}`);
    }
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  out(`Updated ${BASELINE_PATH}.`);
  if (missing.length > 0)
    out(`Left unchanged (no coverage report): ${missing.join(', ')}.`);
  if (lowered.length > 0) {
    out('Kept (current is lower; pass --allow-decrease to lower them):');
    for (const line of lowered) out(`  ${line}`);
  }
  process.exit(0);
}

const report = [
  '## Test coverage',
  '',
  `Current % (Δ vs. baseline floor; tolerance ${tolerance} pp). Baseline: \`coverage-baseline.json\`.`,
  '',
  `| Package / scope | ${METRICS.join(' | ')} |`,
  `| --- | ${METRICS.map(() => '---:').join(' | ')} |`,
  ...rows,
  '',
  ...(unknown.length > 0
    ? [
        `Not gated (no baseline entry): ${unknown.join(', ')}. Add with \`pnpm coverage:baseline\`.`,
        '',
      ]
    : []),
  ...(failures.length > 0
    ? [
        '**Coverage fell below the baseline:**',
        '',
        ...failures.map((f) => `- ${f}`),
        '',
      ]
    : ['Coverage holds at or above the baseline.', '']),
];

out(report.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report.join('\n')}\n`);
}
if (basePath && !baseFile) {
  out(
    `Note: base baseline ${basePath} not found — compared against this branch's baseline only.`,
  );
}
process.exit(failures.length > 0 ? 1 : 0);
