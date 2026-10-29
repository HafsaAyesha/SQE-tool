import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},test:{include:['tests/security/security.test.ts'],fileParallelism:false,testTimeout:120000,hookTimeout:30000}});
