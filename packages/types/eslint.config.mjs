// packages/types ESLint config — thin wrapper around packages/config's
// shared Node-library factory (see that package's own comment for why every
// workspace member still needs its own file despite the shared content).
import { nodeLibraryConfig } from 'config/eslint/node-library';

export default nodeLibraryConfig();
