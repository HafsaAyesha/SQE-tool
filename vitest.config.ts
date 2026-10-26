import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
loadEnvConfig(process.cwd());
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } }, test: { include: ['tests/unit/**/*.test.ts'] } });
