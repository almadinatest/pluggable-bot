// packages/widget/build.mjs
//
// Builds the widget with esbuild and injects configuration from the
// environment (WIDGET_*) at bundle time, replacing the runtime defaults.
// Any option can still be overridden per-embed via `data-*` attributes on
// the `<script>` tag (see README).
//
//   node build.mjs          # one-shot minified build → dist/pluggable-bot.js
//   node build.mjs --watch  # rebuild on source changes (with sourcemap)

import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const define = {
  'process.env.WIDGET_API_URL': JSON.stringify(process.env.WIDGET_API_URL ?? ''),
  'process.env.WIDGET_BOT_NAME': JSON.stringify(process.env.WIDGET_BOT_NAME ?? 'Bot'),
  'process.env.WIDGET_PRIMARY_COLOR': JSON.stringify(process.env.WIDGET_PRIMARY_COLOR ?? '#1a1a2e'),
  'process.env.WIDGET_POSITION': JSON.stringify(process.env.WIDGET_POSITION ?? 'bottom-right'),
  'process.env.WIDGET_CONTEXT_MAX_CHARS': JSON.stringify(process.env.WIDGET_CONTEXT_MAX_CHARS ?? '2000'),
  'process.env.WIDGET_MAX_HISTORY': JSON.stringify(process.env.WIDGET_MAX_HISTORY ?? '10'),
};

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'PluggableBotLoader',
  outfile: 'dist/pluggable-bot.js',
  target: 'es2020',
  minify: !watch,
  sourcemap: watch,
  define,
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[widget] watching for changes…');
} else {
  await build(options);
  const { statSync } = await import('node:fs');
  const size = statSync('dist/pluggable-bot.js').size;
  console.log(`[widget] built dist/pluggable-bot.js (${(size / 1024).toFixed(1)} kB)`);
}