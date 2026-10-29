// Replays the remote phone's touches and typing on the in-game phone screen as DOM events.

export type PointerPhase = 'down' | 'move' | 'up' | 'cancel';

export interface FieldInfo {
    on:    boolean;
    value: string;
    kind:  'text' | 'number' | 'secret';
}

const POINTER_ID = 1;
const DRAG_SLOP = 6;
const CURSOR_SIZE = 26;
const CURSOR_IDLE_MS = 1200;
const INERTIA_MIN = 0.25;
const INERTIA_DECAY = 0.94;

function screenEl(): HTMLElement | null {
    return document.querySelector('[data-phone-screen]') as HTMLElement | null;
}

/** Width over height of the phone screen, as laid out right now. */
export function screenAspect(): number {
    const el = screenEl();
    if (!el || !el.offsetHeight) return 440 / 956;
    return el.offsetWidth / el.offsetHeight;
}

export function watchScreen(onChange: () => void): () => void {
    const el = screenEl();
    if (!el || typeof ResizeObserver === 'undefined') return () => {};
    const observer = new ResizeObserver(onChange);
    observer.observe(el);
    return () => observer.disconnect();
}

let cursor: HTMLDivElement | null = null;
let cursorTimer = 0;

function showCursor(x: number, y: number, pressed: boolean) {
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.setAttribute('aria-hidden', 'true');
        Object.assign(cursor.style, {
            position: 'fixed', left: '0', top: '0', width: `${CURSOR_SIZE}px`, height: `${CURSOR_SIZE}px`,
            marginLeft: `${-CURSOR_SIZE / 2}px`, marginTop: `${-CURSOR_SIZE / 2}px`, borderRadius: '50%',
            background: 'rgba(255,255,255,0.55)', border: '2px solid rgba(0,0,0,0.35)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.35)', pointerEvents: 'none', zIndex: '2147483647',
            transition: 'opacity 160ms ease', opacity: '0',
        } satisfies Partial<CSSStyleDeclaration>);
        document.body.appendChild(cursor);
    }
    // CEF 103 has no standalone `scale` property, so the press shrink rides in the transform.
    cursor.style.transform = `translate(${x}px, ${y}px) scale(${pressed ? 0.8 : 1})`;
    cursor.style.opacity = '1';
    window.clearTimeout(cursorTimer);
    if (!pressed) cursorTimer = window.setTimeout(hideCursor, CURSOR_IDLE_MS);
}

export function hideCursor() {
    window.clearTimeout(cursorTimer);
    if (cursor) cursor.style.opacity = '0';
}

interface Press {
    target:   Element;
    startX:   number;
    startY:   number;
    lastX:    number;
    lastY:    number;
    lastT:    number;
    vx:       number;
    vy:       number;
    dragged:  boolean;
    scroller: HTMLElement | null;
}

let press: Press | null = null;
let inertiaFrame = 0;

function toPage(nx: number, ny: number): { x: number; y: number; scale: number } | null {
    const el = screenEl();
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const cx = Math.min(1, Math.max(0, nx));
    const cy = Math.min(1, Math.max(0, ny));
    return {
        x: rect.left + cx * rect.width,
        y: rect.top + cy * rect.height,
        scale: el.offsetWidth ? rect.width / el.offsetWidth : 1,
    };
}

function firePointer(type: string, target: Element, x: number, y: number, buttons: number): boolean {
    const init: PointerEventInit = {
        bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
        pointerId: POINTER_ID, pointerType: 'mouse', isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons,
    };
    return target.dispatchEvent(new PointerEvent(type, init));
}

function fireMouse(type: string, target: Element, x: number, y: number, buttons: number): boolean {
    return target.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons, detail: 1, view: window,
    }));
}

function canScroll(el: HTMLElement, dx: number, dy: number): boolean {
    const style = getComputedStyle(el);
    const y = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const x = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    return Math.abs(dy) >= Math.abs(dx) ? y : x;
}

function findScroller(from: Element, dx: number, dy: number): HTMLElement | null {
    const root = screenEl();
    for (let el: Element | null = from; el && el !== document.body; el = el.parentElement) {
        if (el instanceof HTMLElement && canScroll(el, dx, dy)) return el;
        if (el === root) break;
    }
    return null;
}

function focusableOf(el: Element): HTMLElement | null {
    const hit = el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
    return hit instanceof HTMLElement ? hit : null;
}

function stopInertia() {
    if (inertiaFrame) cancelAnimationFrame(inertiaFrame);
    inertiaFrame = 0;
}

function startInertia(el: HTMLElement, vx: number, vy: number) {
    stopInertia();
    let sx = vx;
    let sy = vy;
    let last = performance.now();
    const step = (now: number) => {
        const dt = Math.min(48, now - last);
        last = now;
        el.scrollLeft -= sx * dt;
        el.scrollTop -= sy * dt;
        const decay = Math.pow(INERTIA_DECAY, dt / 16);
        sx *= decay;
        sy *= decay;
        inertiaFrame = Math.abs(sx) + Math.abs(sy) > 0.02 ? requestAnimationFrame(step) : 0;
    };
    inertiaFrame = requestAnimationFrame(step);
}

export function pointer(phase: PointerPhase, nx: number, ny: number) {
    const at = toPage(nx, ny);
    if (!at) return;
    const { x, y, scale } = at;

    if (phase === 'down') {
        stopInertia();
        const target = document.elementFromPoint(x, y);
        if (!target) return;
        press = { target, startX: x, startY: y, lastX: x, lastY: y, lastT: performance.now(), vx: 0, vy: 0, dragged: false, scroller: null };
        showCursor(x, y, true);
        firePointer('pointerover', target, x, y, 1);
        const allowed = firePointer('pointerdown', target, x, y, 1);
        if (allowed && fireMouse('mousedown', target, x, y, 1)) {
            const field = focusableOf(target);
            const active = document.activeElement;
            if (field) {
                if (field !== active) field.focus({ preventScroll: true });
            } else if (active instanceof HTMLElement && active !== document.body) {
                active.blur();
            }
        }
        return;
    }

    if (!press) {
        if (phase === 'move') showCursor(x, y, false);
        return;
    }

    const current = press;
    const dx = x - current.lastX;
    const dy = y - current.lastY;

    if (phase === 'move') {
        const now = performance.now();
        const dt = Math.max(1, now - current.lastT);
        if (!current.dragged && Math.hypot(x - current.startX, y - current.startY) > DRAG_SLOP * scale) {
            current.dragged = true;
            current.scroller = findScroller(current.target, x - current.startX, y - current.startY);
        }
        if (current.dragged && current.scroller) {
            current.scroller.scrollLeft -= dx / scale;
            current.scroller.scrollTop -= dy / scale;
        }
        current.vx = (dx / scale) / dt;
        current.vy = (dy / scale) / dt;
        current.lastX = x;
        current.lastY = y;
        current.lastT = now;
        showCursor(x, y, true);
        firePointer('pointermove', current.target, x, y, 1);
        fireMouse('mousemove', current.target, x, y, 1);
        return;
    }

    press = null;
    showCursor(x, y, false);
    if (phase === 'cancel') {
        firePointer('pointercancel', current.target, x, y, 0);
        return;
    }

    firePointer('pointerup', current.target, x, y, 0);
    fireMouse('mouseup', current.target, x, y, 0);
    if (current.dragged) {
        const speed = Math.hypot(current.vx, current.vy);
        if (current.scroller && speed > INERTIA_MIN && performance.now() - current.lastT < 80) {
            startInertia(current.scroller, current.vx, current.vy);
        }
        return;
    }

    const under = document.elementFromPoint(x, y);
    const target = under && (current.target.contains(under) || under.contains(current.target)) ? under : current.target;
    fireMouse('click', target, x, y, 0);
}

function editable(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
    if (el instanceof HTMLInputElement) return !el.readOnly && !el.disabled && !['checkbox', 'radio', 'button', 'submit', 'range', 'file', 'color'].includes(el.type);
    return el instanceof HTMLElement && el.isContentEditable;
}

export function fieldInfo(el: Element | null): FieldInfo {
    if (!editable(el)) return { on: false, value: '', kind: 'text' };
    if (el instanceof HTMLInputElement) {
        // A password leaves the game only as dots, so the remote can still delete and append in place.
        if (el.type === 'password') return { on: true, value: '•'.repeat(el.value.length), kind: 'secret' };
        const numeric = ['number', 'tel'].includes(el.type) || ['numeric', 'decimal', 'tel'].includes(el.inputMode);
        return { on: true, value: el.value, kind: numeric ? 'number' : 'text' };
    }
    if (el instanceof HTMLTextAreaElement) return { on: true, value: el.value, kind: 'text' };
    return { on: true, value: el.textContent ?? '', kind: 'text' };
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
}

/** Replaces `del` characters at `at` with `ins` in the focused field. */
export function edit(at: number, del: number, ins: string) {
    const el = document.activeElement;
    if (!editable(el)) return;

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const value = el.value;
        const start = Math.min(Math.max(0, at), value.length);
        const end = Math.min(value.length, start + Math.max(0, del));
        let selectable = true;
        try { el.setSelectionRange(start, end); } catch { selectable = false; }

        const done = selectable && (ins === ''
            ? (end > start ? document.execCommand('delete') : true)
            : document.execCommand('insertText', false, ins));
        if (done && el.value === value.slice(0, start) + ins + value.slice(end)) return;

        const next = value.slice(0, start) + ins + value.slice(end);
        setNativeValue(el, next);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: ins ? 'insertText' : 'deleteContentBackward', data: ins || null }));
        try { el.setSelectionRange(start + ins.length, start + ins.length); } catch { /* number and email fields have no caret */ }
        return;
    }

    if (del > 0) for (let i = 0; i < del; i++) document.execCommand('delete');
    if (ins) document.execCommand('insertText', false, ins);
}

/** Puts the caret at the end of the focused field, where the remote's own copy of the text ends. */
export function caretToEnd() {
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* no caret on this type */ }
}

export function key(name: 'Enter' | 'Escape' | 'Backspace') {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
    const init: KeyboardEventInit = { key: name, code: name, bubbles: true, cancelable: true, composed: true };
    const allowed = target.dispatchEvent(new KeyboardEvent('keydown', init));
    target.dispatchEvent(new KeyboardEvent('keyup', init));
    if (!allowed || name !== 'Enter') return;
    if (target instanceof HTMLTextAreaElement) {
        edit(target.selectionStart ?? target.value.length, (target.selectionEnd ?? 0) - (target.selectionStart ?? 0), '\n');
    } else if (target instanceof HTMLInputElement && target.form) {
        target.form.requestSubmit();
    }
}

/** Taps the home indicator, the bar along the bottom edge of the screen. */
export function home() {
    pointer('down', 0.5, 0.988);
    pointer('up', 0.5, 0.988);
}
