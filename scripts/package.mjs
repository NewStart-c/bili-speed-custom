import { ZipArchive } from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const release = path.join(root, 'release');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const zipPath = path.join(release, `bili-speed-custom-v${pkg.version}.zip`);

await mkdir(release, { recursive: true });

const output = createWriteStream(zipPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

const done = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
});

archive.pipe(output);
archive.directory(dist, false);
await archive.finalize();
await done;

console.log(`[package] ${zipPath}`);
