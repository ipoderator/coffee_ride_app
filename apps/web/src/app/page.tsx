// Bootstrap placeholder (CR-002). Real screens follow docs/design.md and the
// feature-module structure in .claude/rules/extensibility.md starting at CR-011 —
// this page only proves the app builds and renders.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">Coffee Ride</h1>
      <p className="text-text-secondary">
        Платформа собирается. Скоро здесь будут заезды.
      </p>
    </main>
  );
}
