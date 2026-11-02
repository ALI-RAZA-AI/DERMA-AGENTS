// DermaAgents frontend build: esbuild (React + TypeScript) + Tailwind CSS v4 compile API.
//
// In a normal environment run `npm install && npm run build` (uses node_modules).
// In the offline build sandbox, modules are resolved from NODE_MODULES_DIR
// (default /opt/npm-tools/node_modules) and three.js from ./vendor.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.dirname(new URL(import.meta.url).pathname);
const localNM = path.join(root, 'node_modules');
const NM = fs.existsSync(path.join(localNM, 'esbuild')) ? localNM : (process.env.NODE_MODULES_DIR || '/opt/npm-tools/node_modules');
const require = createRequire(path.join(NM, 'noop.js'));
const esbuild = require('esbuild');
const { compile } = await import(path.join(NM, 'tailwindcss/dist/lib.mjs'));

const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });

// ---------------------------------------------------------------- JS bundle
const threeLocal = fs.existsSync(path.join(NM, 'three/build/three.module.js'));
const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true, minify: !watch, sourcemap: watch, format: 'esm', target: ['es2020'],
  outdir: path.join(dist, 'assets'), entryNames: 'app-[hash]', metafile: true,
  jsx: 'automatic', loader: { '.svg': 'text' },
  nodePaths: [NM],
  alias: threeLocal ? {} : { three: path.join(root, 'vendor/three.module.js') },
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
            'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || '') },
  logLevel: 'warning',
});
const jsFile = Object.keys(result.metafile.outputs).find((f) => f.endsWith('.js'));

// ---------------------------------------------------------------- Tailwind
const twBase = path.join(NM, 'tailwindcss/');
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
const compiler = await compile(css, {
  base: root,
  loadStylesheet: async (id, base) => {
    let p;
    if (id === 'tailwindcss') p = path.join(twBase, 'index.css');
    else if (id.startsWith('tailwindcss/')) p = path.join(twBase, id.slice('tailwindcss/'.length));
    else p = path.resolve(base, id);
    return { content: fs.readFileSync(p, 'utf8'), base: path.dirname(p), path: p };
  },
});
// candidate scanner (stand-in for @tailwindcss/oxide): every class-like token in sources
const candidates = new Set();
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p);
  else if (/\.(tsx?|html)$/.test(e.name)) {
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/[A-Za-z0-9_\-:/.\[\]#%()!,'@&>*=+]+/g)) {
      const tok = m[0].replace(/^['"`]+|['"`,;]+$/g, '');
      if (tok.length < 60) candidates.add(tok);
      // also split on quotes / parentheses / commas so tokens like  '-translate-x-full')  are found
      for (const part of m[0].split(/['"`(),]/)) if (part && part.length < 60) candidates.add(part);
    }
  }
});
walk(path.join(root, 'src'));
const outCss = compiler.build([...candidates]);
const cssName = `app-${Buffer.from(String(outCss.length)).toString('hex').slice(0, 8)}.css`;
fs.writeFileSync(path.join(dist, 'assets', cssName), outCss);

// ---------------------------------------------------------------- public + html
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('%CSS%', `/assets/${cssName}`)
  .replace('%JS%', '/' + path.relative(dist, path.join(root, jsFile)).replace(/^dist\//, ''));
fs.writeFileSync(path.join(dist, 'index.html'), html);
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(`built ${jsFile} (${kb(path.join(root, jsFile))}), ${cssName} (${(outCss.length / 1024).toFixed(0)} KB), ${candidates.size} candidates`);
