import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

const entries = [
    { in: 'src/content/index.ts', out: 'content.js', format: 'iife' },
    { in: 'src/background/index.ts', out: 'background.js', format: 'iife' },
    { in: 'src/popup/popup.ts', out: 'popup.js', format: 'esm' },
    { in: 'src/options/options.ts', out: 'options.js', format: 'esm' },
];

async function copyStatic() {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
    manifest.version = pkg.version;

    await mkdir(dist, { recursive: true });
    await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 4)}\n`);
    await cp(path.join(root, 'icons'), path.join(dist, 'icons'), { recursive: true });
    await cp(path.join(root, 'injected.css'), path.join(dist, 'injected.css'));
    await cp(path.join(root, 'src/popup/popup.html'), path.join(dist, 'popup.html'));
    await cp(path.join(root, 'src/popup/popup.css'), path.join(dist, 'popup.css'));
    await cp(path.join(root, 'src/options/options.html'), path.join(dist, 'options.html'));
    await cp(path.join(root, 'src/options/options.css'), path.join(dist, 'options.css'));
}

function entryOptions(entry) {
    return {
        entryPoints: [path.join(root, entry.in)],
        outfile: path.join(dist, entry.out),
        bundle: true,
        format: entry.format,
        platform: 'browser',
        target: 'chrome110',
        charset: 'utf8',
        sourcemap: watch ? 'inline' : false,
        minify: false,
        logLevel: 'info',
    };
}

await rm(dist, { recursive: true, force: true });
await copyStatic();

if (watch) {
    const contexts = await Promise.all(entries.map((entry) => context(entryOptions(entry))));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[build] watching src/ — static file changes require a restart');
} else {
    await Promise.all(entries.map((entry) => build(entryOptions(entry))));
    console.log('[build] dist/ ready');
}
