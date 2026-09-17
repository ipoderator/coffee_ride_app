import { nodeLibraryConfig } from 'config/eslint/node-library';

// CR-056: this is the one package exempt from the "no 2GIS SDK import"
// restriction the shared factory otherwise applies by default — it's the
// designated adapter (ADR-010, `.claude/rules/maps.md`).
export default nodeLibraryConfig({ allowMapsSdkImports: true });
