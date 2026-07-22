import esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * The extension host is CommonJS Node. `vscode` is injected by the host and must
 * never be bundled. Everything else (the `livetennisapi` client) is bundled so
 * the .vsix ships no node_modules tree.
 *
 * `ws` is the client's *optional* peer dependency, reached only through a
 * dynamic `import(moduleName)` with a non-literal specifier inside its WebSocket
 * stream. We never construct that stream, so the call never runs — but it is
 * marked external so esbuild does not attempt to resolve a module we do not
 * install.
 */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode', 'ws'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
