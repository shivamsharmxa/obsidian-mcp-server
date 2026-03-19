import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  banner: {
    js: '#!/usr/bin/env node',
  },
  noExternal: [],
  outDir: 'dist',
});
