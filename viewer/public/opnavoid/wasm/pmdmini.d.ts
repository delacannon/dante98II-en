import type { PmdModule } from '../src/types.js';

declare function createModule(): Promise<PmdModule>;
export default createModule;
