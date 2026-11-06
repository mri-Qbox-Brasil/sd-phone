
export function ancestorZoom(el: HTMLElement | null): number {
    let z = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cz = parseFloat(getComputedStyle(n).getPropertyValue('zoom'));
        if (cz > 0 && cz !== 1) z *= cz;
    }
    return z || 1;
}

interface Box { left: number; top: number; width: number; height: number }

/**
 * A pointer's place in an element's own (unzoomed) pixels, measured from its top-left corner, whichever way the
 * browser reports a box under an ancestor's CSS zoom. Chromium 128+ (FiveM's CEF today) gives getBoundingClientRect
 * in screen pixels, zoom included; older Chromium gave it in the element's own pixels while the pointer stayed in
 * screen pixels. `rect.width / width` tells the two apart, as trackFraction does.
 */
export function toLocal(clientX: number, clientY: number, rect: Box, width: number, height: number, zoom: number) {
    const w = width || rect.width || 1;
    const h = height || rect.height || 1;
    const fx = (rect.width || w) / w / zoom;
    const fy = (rect.height || h) / h / zoom;
    return {
        x: (clientX * fx - rect.left) * (w / (rect.width || w)),
        y: (clientY * fy - rect.top) * (h / (rect.height || h)),
    };
}

/** toLocal for an element on the page. */
export function localPoint(el: HTMLElement, clientX: number, clientY: number) {
    return toLocal(clientX, clientY, el.getBoundingClientRect(), el.offsetWidth, el.offsetHeight, ancestorZoom(el));
}

export function trackFraction(el: HTMLElement, clientX: number): number | null {
    const r = el.getBoundingClientRect();
    const w = el.offsetWidth;
    if (w <= 0 || r.width <= 0) return null;
    const factor = (r.width / w) / ancestorZoom(el);
    const f = Math.max(0, Math.min(1, (clientX * factor - r.left) / r.width));
    return getComputedStyle(el).direction === 'rtl' ? 1 - f : f;
}

export function trackFractionY(el: HTMLElement, clientY: number): number | null {
    const r = el.getBoundingClientRect();
    const h = el.offsetHeight;
    if (h <= 0 || r.height <= 0) return null;
    const factor = (r.height / h) / ancestorZoom(el);
    return Math.max(0, Math.min(1, (clientY * factor - r.top) / r.height));
}
