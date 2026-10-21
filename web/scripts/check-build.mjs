// Fails the build when the files app pages and the media uploader load are missing or wrong:
// they are served by URL (fxmanifest.lua lists them), so nothing else would notice.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const outDir = process.argv[2] ?? 'build';
const out = (name) => `${web}${outDir}/${name}`;

const problems = [];

for (const name of ['sdphone-sdk.js', 'sdphone-sdk.d.ts', 'uploader.html']) {
    if (!existsSync(out(name))) problems.push(`${outDir}/${name} is missing`);
}

if (existsSync(out('uploader.html'))
    && !readFileSync(out('uploader.html')).equals(readFileSync(`${web}src/uploader/uploader.html`))) {
    problems.push(`${outDir}/uploader.html differs from src/uploader/uploader.html`);
}

if (existsSync(out('sdphone-sdk.js')) && /^\s*(import|export)\b/m.test(readFileSync(out('sdphone-sdk.js'), 'utf8'))) {
    problems.push(`${outDir}/sdphone-sdk.js is a module; app pages load it as a classic script`);
}

if (problems.length) {
    console.error(`check-build:\n  ${problems.join('\n  ')}`);
    process.exit(1);
}

console.log(`check-build: ${outDir}/sdphone-sdk.js, sdphone-sdk.d.ts and uploader.html are in place`);
