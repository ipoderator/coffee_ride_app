// ADR-009 / `.claude/rules/extensibility.md`: cabinet features register a
// descriptor into a shared list instead of the shell branching per feature.
// This is the descriptor shape both the participant and (later) organizer
// registries use.
export interface CabinetNavItem {
  label: string;
  href: string;
  /** Lower sorts first. Leave gaps (10, 20, 30, ...) so a future feature can
   * slot in between without renumbering existing ones. */
  order: number;
}
