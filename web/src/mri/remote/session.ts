import { create } from 'zustand';

import { fetchNui, isFiveM } from '@/core/nui';
import { fetchIceConfig } from '@/apps/phone/calls/webrtc';
import { t } from '@/i18n';
import { startMirror, stopMirror } from './mirror';
import { caretToEnd, edit, fieldInfo, hideCursor, home, key, pointer, screenAspect, watchScreen, type PointerPhase } from './inject';

export type RemoteStatus = 'idle' | 'opening' | 'waiting' | 'connecting' | 'connected' | 'failed';

export type RemoteError = 'unavailable' | 'cooldown' | 'server' | 'p2p' | 'expired' | null;

export interface RemoteUrl {
    id:    string;
    name?: string;
    url:   string;
}

interface RemoteState {
    status:    RemoteStatus;
    error:     RemoteError;
    urls:      RemoteUrl[];
    choice:    string | null;
    expiresAt: number;
}

export const useRemoteStore = create<RemoteState>()(() => ({
    status: 'idle', error: null, urls: [], choice: null, expiresAt: 0,
}));

const GATHER_MS = 3500;
const CHOICE_KEY = 'mri.remote.address';

function savedChoice(): string | null {
    try { return localStorage.getItem(CHOICE_KEY); } catch { return null; }
}

/** Picks which address goes in the QR code, remembered for the next code. */
export function chooseUrl(id: string) {
    useRemoteStore.setState({ choice: id });
    try { localStorage.setItem(CHOICE_KEY, id); } catch { /* storage blocked */ }
}

type Inbound =
    | { t: 'p'; e: PointerPhase; x: number; y: number }
    | { t: 'edit'; at: number; del: number; ins: string }
    | { t: 'key'; k: 'Enter' | 'Escape' | 'Backspace' }
    | { t: 'home' }
    | { t: 'toggle' };

let token: string | null = null;
let peer: RTCPeerConnection | null = null;
let channel: RTCDataChannel | null = null;
let expiryTimer = 0;
let unwatchScreen: () => void = () => {};
let phoneOpen = false;
let live = false;
let videoSender: RTCRtpSender | null = null;

function set(patch: Partial<RemoteState>) {
    useRemoteStore.setState(patch);
}

function send(msg: Record<string, unknown>) {
    if (channel?.readyState === 'open') channel.send(JSON.stringify(msg));
}

/** Page texts for the real phone, in this phone's language. */
function pageStrings(): Record<string, string> {
    return {
        title:      t('remote.page.title', 'Phone remote'),
        connecting: t('remote.page.connecting', 'Connecting to your phone…'),
        connected:  t('remote.page.connected', 'Connected'),
        hint:       t('remote.page.hint', 'Touch here to use the phone in the game'),
        closed:     t('remote.page.closed', 'The phone is put away'),
        openPhone:  t('remote.page.openPhone', 'Take out phone'),
        putAway:    t('remote.page.putAway', 'Put away'),
        back:       t('remote.page.back', 'Back'),
        home:       t('remote.page.home', 'Home'),
        keyboard:   t('remote.page.keyboard', 'Keyboard'),
        typeHere:   t('remote.page.typeHere', 'Type here'),
        send:       t('remote.page.send', 'Send'),
        noField:    t('remote.page.noField', 'Tap a text field on the phone first'),
        ended:      t('remote.page.ended', 'Disconnected. Scan a new code in Settings to connect again.'),
        expired:    t('remote.page.expired', 'This code has expired. Open Settings on the phone in the game and scan a new one.'),
        failed:     t('remote.page.failed', 'Could not connect directly to the game. Try with both on the same Wi-Fi network.'),
        appName:    t('remote.page.appName', 'Phone'),
        offline:    t('remote.page.offline', 'Join the server and this app connects on its own.'),
        reconnect:  t('remote.page.reconnect', 'Connect again'),
        forgotten:  t('remote.page.forgotten', 'This phone was forgotten. Scan a new code in Settings on the phone in the game.'),
        install:    t('remote.page.install', 'Install app'),
        installIos: t('remote.page.installIos', 'To make it an app: tap Share, then Add to Home Screen.'),
        installAndroid: t('remote.page.installAndroid', 'To make it an app: open the browser menu and tap Add to Home screen.'),
        fullscreen: t('remote.page.fullscreen', 'Full screen'),
    };
}

function closePeer() {
    stopMirror();
    // The server keeps a connected session alive to serve the mirror's files, so tell it when it ends.
    if (live) void fetchNui('mri:remote:cancel');
    live = false;
    channel?.close();
    peer?.close();
    channel = null;
    peer = null;
    unwatchScreen();
    unwatchScreen = () => {};
    hideCursor();
}

let reportedField: Element | null = null;

function onFocusChange() {
    // focusout lands before the next focusin, so read the active element once the move settles.
    window.setTimeout(() => {
        reportedField = document.activeElement;
        const info = fieldInfo(reportedField);
        if (info.on) caretToEnd();
        send({ t: 'field', ...info });
    }, 0);
}

/** Focus events wait for the window to have system focus, so a remote tap checks the field itself. */
function reportIfFocusMoved() {
    window.setTimeout(() => { if (document.activeElement !== reportedField) onFocusChange(); }, 0);
}

function handle(raw: unknown) {
    if (typeof raw !== 'string') return;
    let msg: Inbound;
    try { msg = JSON.parse(raw) as Inbound; } catch { return; }

    switch (msg.t) {
        case 'p':
            if (!phoneOpen || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
            pointer(msg.e, msg.x, msg.y);
            if (msg.e !== 'move') reportIfFocusMoved();
            return;
        case 'edit':
            if (!phoneOpen || typeof msg.ins !== 'string' || msg.ins.length > 2000) return;
            edit(Math.trunc(msg.at) || 0, Math.trunc(msg.del) || 0, msg.ins);
            return;
        case 'key':
            if (!phoneOpen || !['Enter', 'Escape', 'Backspace'].includes(msg.k)) return;
            key(msg.k);
            // Sending a message usually clears the field without moving focus, so resync the remote's copy.
            onFocusChange();
            return;
        case 'home':
            if (phoneOpen) home();
            return;
        case 'toggle':
            void fetchNui('mri:remote:toggle');
            return;
    }
}

function attach(dc: RTCDataChannel) {
    channel = dc;
    dc.onopen = () => {
        window.clearTimeout(expiryTimer);
        set({ status: 'connected', error: null, urls: [] });
        reportedField = document.activeElement;
        send({ t: 'hello', aspect: screenAspect(), open: phoneOpen, field: fieldInfo(document.activeElement) });
        unwatchScreen = watchScreen(() => send({ t: 'screen', aspect: screenAspect() }));
        startMirror(dc, videoSender);
    };
    dc.onmessage = e => handle(e.data);
    dc.onclose = () => {
        if (channel !== dc) return;
        closePeer();
        set({ status: 'idle', urls: [] });
    };
}

function waitForCandidates(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(resolve => {
        const timer = window.setTimeout(resolve, GATHER_MS);
        pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') { window.clearTimeout(timer); resolve(); }
        });
    });
}

async function answer(offerToken: string, sdp: string, paired: boolean) {
    if (paired) {
        // A paired phone opening its app: the server already swapped sessions, so no cancel goes out.
        window.clearTimeout(expiryTimer);
        token = offerToken;
        live = false;
    } else if (offerToken !== token || useRemoteStore.getState().status !== 'waiting') {
        return;
    }
    set({ status: 'connecting', urls: [] });

    closePeer();
    const pc = new RTCPeerConnection(await fetchIceConfig());
    peer = pc;
    pc.ondatachannel = e => attach(e.channel);
    pc.onconnectionstatechange = () => {
        if (peer !== pc) return;
        if (pc.connectionState === 'failed') {
            closePeer();
            set({ status: 'failed', error: 'p2p' });
        }
    };

    try {
        await pc.setRemoteDescription({ type: 'offer', sdp });
        // The remote offers a receive-only video slot; a canvas on screen gets sent through it.
        const video = pc.getTransceivers().find(tr => tr.receiver.track.kind === 'video');
        if (video) video.direction = 'sendonly';
        videoSender = video?.sender ?? null;
        await pc.setLocalDescription(await pc.createAnswer());
        await waitForCandidates(pc);
        if (peer !== pc || !pc.localDescription) return;
        void fetchNui('mri:remote:answer', { token: offerToken, sdp: pc.localDescription.sdp });
        token = null;
        live = true;
    } catch {
        closePeer();
        set({ status: 'failed', error: 'p2p' });
    }
}

/** Mints a QR code for a real phone to scan. */
export async function openRemote() {
    if (!isFiveM) return;
    closePeer();
    set({ status: 'opening', error: null, urls: [] });
    const res = await fetchNui<{ success: boolean; code?: string; data?: { token: string; urls: RemoteUrl[]; expiresIn: number } }>(
        'mri:remote:open', { strings: pageStrings() });
    if (!res?.success || !res.data) {
        const code = res?.code === 'unavailable' || res?.code === 'cooldown' ? res.code : 'server';
        set({ status: 'failed', error: code });
        return;
    }
    token = res.data.token;
    const ttl = res.data.expiresIn * 1000;
    const urls = Array.isArray(res.data.urls) ? res.data.urls : [];
    const saved = savedChoice();
    const choice = urls.find(u => u.id === saved)?.id ?? urls[0]?.id ?? null;
    set({ status: 'waiting', urls, choice, expiresAt: Date.now() + ttl });
    window.clearTimeout(expiryTimer);
    expiryTimer = window.setTimeout(() => {
        if (useRemoteStore.getState().status !== 'waiting') return;
        token = null;
        set({ status: 'failed', error: 'expired', urls: [] });
    }, ttl);
}

/** Forgets every phone saved as an app, and drops the one connected now. */
export function forgetPhones() {
    window.clearTimeout(expiryTimer);
    token = null;
    live = false;
    closePeer();
    set({ status: 'idle', error: null, urls: [] });
    void fetchNui('mri:remote:forget');
}

/** Drops the connection, or the code still waiting for a phone. */
export function closeRemote() {
    window.clearTimeout(expiryTimer);
    if (token) void fetchNui('mri:remote:cancel');
    token = null;
    closePeer();
    set({ status: 'idle', error: null, urls: [] });
}

export function installRemote() {
    window.addEventListener('message', (event: MessageEvent) => {
        const msg = event.data as { action?: string; data?: { token?: string; sdp?: string; paired?: boolean } } | undefined;
        if (msg?.action === 'mri:remote:offer' && typeof msg.data?.token === 'string' && typeof msg.data.sdp === 'string') {
            void answer(msg.data.token, msg.data.sdp, msg.data.paired === true);
        } else if (msg?.action === 'sd-phone:open') {
            phoneOpen = true;
            send({ t: 'open', open: true });
        } else if (msg?.action === 'sd-phone:close') {
            phoneOpen = false;
            hideCursor();
            send({ t: 'open', open: false });
        }
    });
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
}
