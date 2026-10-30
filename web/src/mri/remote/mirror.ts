import { record } from '@rrweb/record';

import { phoneScreen } from './inject';

const FLUSH_MS = 30;
const RECT_MS = 200;
const PART_CHARS = 16000;
// Past this the phone is not keeping up, so drop events and resend a full snapshot once it drains.
const BACKLOG_BYTES = 4 * 1024 * 1024;

type Send = (raw: string) => void;

let channel: RTCDataChannel | null = null;
let stopRecord: (() => void) | undefined;
let queue: unknown[] = [];
let flushTimer = 0;
let rectTimer = 0;
let lastRect = '';
let behind = false;
let partId = 0;

function sendRaw(raw: string) {
    if (!channel || channel.readyState !== 'open') return;
    if (raw.length <= PART_CHARS) return channel.send(raw);
    const id = ++partId;
    const n = Math.ceil(raw.length / PART_CHARS);
    for (let i = 0; i < n; i++) {
        channel.send(JSON.stringify({ t: 'part', id, i, n, d: raw.slice(i * PART_CHARS, (i + 1) * PART_CHARS) }));
    }
}

function flush() {
    flushTimer = 0;
    if (!channel || queue.length === 0) return;
    if (channel.bufferedAmount > BACKLOG_BYTES) {
        queue = [];
        behind = true;
        return;
    }
    const es = queue;
    queue = [];
    sendRaw(JSON.stringify({ t: 'rr', es }));
}

function sendRect(send: Send) {
    const el = phoneScreen();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    const rect = { x: r.left, y: r.top, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight, r: radius };
    const key = JSON.stringify(rect);
    if (key === lastRect) return;
    lastRect = key;
    send(JSON.stringify({ t: 'rect', ...rect }));
}

/** Streams the phone's DOM to the remote, which rebuilds it live. */
export function startMirror(dc: RTCDataChannel) {
    stopMirror();
    channel = dc;
    lastRect = '';
    behind = false;

    stopRecord = record({
        emit(event) {
            queue.push(event);
            if (!flushTimer) flushTimer = window.setTimeout(flush, FLUSH_MS);
        },
        blockSelector: '[data-remote-cursor]',
        maskInputOptions: { password: true },
        inlineStylesheet: true,
        recordCanvas: false,
        collectFonts: false,
        sampling: { mousemove: false, mouseInteraction: false, scroll: 50, input: 'last' },
    });

    rectTimer = window.setInterval(() => {
        sendRect(sendRaw);
        if (behind && channel && channel.bufferedAmount < BACKLOG_BYTES / 4) {
            behind = false;
            record.takeFullSnapshot(true);
        }
    }, RECT_MS);
    sendRect(sendRaw);
}

export function stopMirror() {
    stopRecord?.();
    stopRecord = undefined;
    window.clearTimeout(flushTimer);
    window.clearInterval(rectTimer);
    flushTimer = rectTimer = 0;
    queue = [];
    channel = null;
}
