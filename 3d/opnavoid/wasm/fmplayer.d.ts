import type { FmpModule } from '../src/types.js';

declare const createFMPlayerModule: () => Promise<FmpModule>;
export default createFMPlayerModule;
