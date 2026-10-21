import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, type Plugin, type Rollup } from 'vite';

// Every path is resolved from this file, not the working directory: sd-tablet imports this plugin
// from its own vite.config.ts and builds the same three files out of sd-phone's source.
const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Writes the custom-app SDK (sdphone-sdk.js), its types (sdphone-sdk.d.ts) and the media upload
 * helper (uploader.html) into the build folder, at the URLs fxmanifest.lua lists. The SDK is built
 * on its own as a classic script, because the phone injects it into app pages with a plain
 * <script src>; the other two ship exactly as written.
 */
export function sdkAssets(): Plugin {
    return {
        name: 'sd-phone-sdk-assets',
        apply: 'build',
        async generateBundle() {
            const result = await build({
                configFile: false,
                publicDir: false,
                logLevel: 'warn',
                build: {
                    write: false,
                    target: 'chrome110',
                    minify: true,
                    lib: {
                        entry: fromHere('./src/sdk/index.ts'),
                        formats: ['iife'],
                        // Required for iife; the entry exports nothing, so no global is created.
                        name: 'sdphoneSdk',
                        fileName: () => 'sdphone-sdk.js',
                    },
                },
            });

            const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
            const chunk = outputs.flatMap(o => o.output).find((o): o is Rollup.OutputChunk => o.type === 'chunk');
            if (!chunk) throw new Error('sd-phone-sdk-assets: the SDK build produced no script');

            this.emitFile({ type: 'asset', fileName: 'sdphone-sdk.js', source: chunk.code });
            this.emitFile({ type: 'asset', fileName: 'sdphone-sdk.d.ts', source: readFileSync(fromHere('./src/sdk/sdphone-sdk.d.ts')) });
            this.emitFile({ type: 'asset', fileName: 'uploader.html', source: readFileSync(fromHere('./src/uploader/uploader.html')) });
        },
    };
}
