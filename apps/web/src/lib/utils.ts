// shadcn/ui's standard class-name helper (clsx + tailwind-merge). Re-exported
// from `packages/ui` so both know the role type scale's `text-*` names
// (CR-152) — one tailwind-merge configuration, not two that can drift.
export { cn } from 'ui';
