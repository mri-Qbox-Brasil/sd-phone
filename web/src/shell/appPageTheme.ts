import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import inter800 from '@fontsource/inter/files/inter-latin-800-normal.woff2?url';
import inter900 from '@fontsource/inter/files/inter-latin-900-normal.woff2?url';

// What a custom app's page gets of the phone's look: the --phone-* colours and the phone's font.
// The colours come from the theme tokens the phone's stylesheet computes (channel triples such as
// "28 28 30"), so they follow the theme, the accent and custom palettes exactly as the phone does.

// The phone's Inter goes into app pages under a name of its own, so a page that asks for "Inter"
// itself (an older app, with or without its own copy) renders exactly as it did.
const INTER_FAMILY = 'sd-phone Inter';

const FONT = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "${INTER_FAMILY}", Inter, system-ui, sans-serif`;

const FROM_TOKENS: Array<[name: string, token: string, alpha?: number]> = [
    ['--phone-background', '--base'],
    ['--phone-surface', '--surface'],
    ['--phone-elevated', '--elevated'],
    ['--phone-control', '--control'],
    ['--phone-text', '--label'],
    ['--phone-text-secondary', '--ios-gray'],
    ['--phone-separator', '--hairline', 0.1],
    ['--phone-accent', '--ios-blue'],
];

/** The --phone-* variables, from a reader that returns a computed token's value ('' when unset). */
export function phoneVars(read: (token: string) => string): Record<string, string> {
    const vars: Record<string, string> = {};

    for (const [name, token, alpha] of FROM_TOKENS) {
        const channels = read(token).trim();
        if (!channels) continue;
        vars[name] = alpha === undefined ? `rgb(${channels})` : `rgb(${channels} / ${alpha})`;
    }

    vars['--phone-on-accent'] = '#ffffff';
    vars['--phone-destructive'] = '#ff453a';
    vars['--phone-font'] = FONT;

    return vars;
}

/** The variables as one rule with no specificity, so any rule of the page's own still wins. */
export function pageVarsCss(vars: Record<string, string>): string {
    return `:where(:root){${Object.entries(vars).map(([name, value]) => `${name}:${value};`).join('')}}`;
}

const INTER: Array<[weight: number, url: string]> = [
    [400, inter400], [500, inter500], [600, inter600], [700, inter700], [800, inter800], [900, inter900],
];

let interData: Promise<Array<[number, ArrayBuffer]>> | null = null;

/**
 * Makes Inter usable in an app's page. The page is another origin, and a font file fetched from the
 * phone's origin there would need CORS headers FiveM does not send; so the phone fetches the files
 * itself, once, and hands the bytes to the page as FontFaces built with the page's own constructor.
 */
export function loadInter(doc: Document): Promise<void> {
    const view = doc.defaultView as (Window & typeof globalThis) | null;
    if (!view || typeof view.FontFace !== 'function') return Promise.resolve();

    interData ??= Promise.all(INTER.map(([weight, url]) =>
        fetch(url).then(r => r.arrayBuffer()).then((data): [number, ArrayBuffer] => [weight, data])));

    return interData.then(list => {
        for (const [weight, data] of list) {
            doc.fonts.add(new view.FontFace(INTER_FAMILY, data, { weight: String(weight) }));
        }
    }, () => {
        interData = null;
    });
}
