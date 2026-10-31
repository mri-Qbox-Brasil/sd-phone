import { record } from '@rrweb/record';

import { phoneScreen } from './inject';

const FLUSH_MS = 30;
const RECT_MS = 200;
const PART_CHARS = 16000;
// Past this the phone is not keeping up, so drop events and resend a full snapshot once it drains.
const BACKLOG_BYTES = 4 * 1024 * 1024;
const VIDEO_FPS = 24;
const VIDEO_BITRATE = 2_500_000;
// A canvas this share of the phone screen or bigger (camera viewfinder, games) goes out as video.
const VIDEO_MIN_AREA = 0.15;

type Send = (raw: string) => void;

let channel: RTCDataChannel | null = null;
let stopRecord: (() => void) | undefined;
let queue: unknown[] = [];
let flushTimer = 0;
let rectTimer = 0;
let lastRect = '';
let behind = false;
let partId = 0;
let videoSender: RTCRtpSender | null = null;
let videoCanvas: HTMLCanvasElement | null = null;
let videoTrack: MediaStreamTrack | null = null;

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

/** The biggest canvas showing on the phone screen, if it is big enough to be worth a video. */
function liveCanvas(): HTMLCanvasElement | null {
    const screen = phoneScreen();
    if (!screen) return null;
    const box = screen.getBoundingClientRect();
    let best: HTMLCanvasElement | null = null;
    let bestArea = box.width * box.height * VIDEO_MIN_AREA;
    screen.querySelectorAll('canvas').forEach(canvas => {
        const r = canvas.getBoundingClientRect();
        const w = Math.min(r.right, box.right) - Math.max(r.left, box.left);
        const h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
        if (w <= 0 || h <= 0 || getComputedStyle(canvas).visibility === 'hidden') return;
        if (w * h > bestArea) { best = canvas; bestArea = w * h; }
    });
    return best;
}

function syncVideo(send: Send) {
    if (!videoSender) return;
    const canvas = liveCanvas();
    if (canvas === videoCanvas) return;
    videoTrack?.stop();
    videoTrack = null;
    const id = canvas ? record.mirror.getId(canvas) : -1;
    // Not serialized yet: try again next tick.
    videoCanvas = canvas && id <= 0 ? null : canvas;
    if (canvas && id > 0) {
        try { videoTrack = canvas.captureStream(VIDEO_FPS).getVideoTracks()[0] ?? null; } catch { videoTrack = null; }
    }
    void videoSender.replaceTrack(videoTrack).catch(() => {});
    send(JSON.stringify({ t: 'canvas', id: videoTrack ? id : null }));
}

/** Streams the phone's DOM to the remote, which rebuilds it live; a big canvas rides the video track. */
export function startMirror(dc: RTCDataChannel, sender: RTCRtpSender | null) {
    stopMirror();
    channel = dc;
    videoSender = sender;
    if (sender) {
        const params = sender.getParameters();
        if (params.encodings?.[0]) {
            params.encodings[0].maxBitrate = VIDEO_BITRATE;
            params.encodings[0].maxFramerate = VIDEO_FPS;
            void sender.setParameters(params).catch(() => {});
        }
    }
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
        syncVideo(sendRaw);
        if (behind && channel && channel.bufferedAmount < BACKLOG_BYTES / 4) {
            behind = false;
            record.takeFullSnapshot(true);
            // Node ids are renumbered by the new snapshot.
            videoCanvas = null;
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
    videoTrack?.stop();
    videoTrack = null;
    videoCanvas = null;
    videoSender = null;
}
