/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Agent worktrees live under .claude/; they carry their own copy of the tests.
  test: { exclude: ['**/node_modules/**', '**/.claude/**'] },
});
