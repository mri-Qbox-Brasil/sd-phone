import { useEffect, useRef, useState } from 'react';
import {
    Bluetooth, Camera, Check, Contrast, Flashlight, Moon, Music, Pause, Plane, Play,
    SkipBack, SkipForward, Smartphone, Sun, Video, Volume2, VolumeX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { fetchNui, isFiveM } from '@/core/nui';
import { setLaunchIntent } from '@/shell/launchIntent';
import { requestOpenAt } from '@/shell/deeplink';
import { DEVICE_GLYPHS } from '@/apps/settings/bluetooth/BluetoothPage';
import type { BluetoothDevice } from '@/stores/bluetoothStore';
import { useBluetoothStore } from '@/stores/bluetoothStore';
import { trackFraction } from '@/lib/zoom';
import { useTheme } from '@/stores/themeStore';
import { useMusic, useMusicProgress } from '@/apps/music/MusicContext';
import { coverGradient, coverUrl } from '@/apps/music/data';
import { t } from '@/i18n';

export function ControlCenter({ open, onClose, onOpenApp, onWifi }: {
    open: boolean;
    onClose: () => void;
    onOpenApp: (id: string) => void;
    onWifi?: (on: boolean) => void;
}) {
    const { theme, setTheme, brightness, setBrightness, ringtoneVol, setRingtoneVol, airplaneMode, setAirplaneMode, focus, setFocus, rotationLock, setRotationLock } = useTheme('theme', 'setTheme', 'brightness', 'setBrightness', 'ringtoneVol', 'setRingtoneVol', 'airplaneMode', 'setAirplaneMode', 'focus', 'setFocus', 'rotationLock', 'setRotationLock');
    const music = useMusic();
    const btConfigured = useBluetoothStore(s => s.configured);
    const btEnabled    = useBluetoothStore(s => s.enabled);

    const [flash, setFlash]       = useState(false);
    const [btModule, setBtModule] = useState(false);
    const [frosted, setFrosted]   = useState(open);
    useEffect(() => {
        if (open) { setFrosted(true); return; }
        const id = window.setTimeout(() => setFrosted(false), 420);
        return () => window.clearTimeout(id);
    }, [open]);

    useEffect(() => {
        if (open && isFiveM) void fetchNui<{ on: boolean }>('sd-phone:flashlight:state').then(r => setFlash(!!r?.on));
    }, [open]);

    useEffect(() => {
        if (open && btConfigured) void useBluetoothStore.getState().scan(true);
        if (!open) setBtModule(false);
    }, [open, btConfigured]);

    function toggleAirplane() {
        const next = !airplaneMode;
        setAirplaneMode(next);
        onWifi?.(!next);
    }
    function toggleFlash() {
        setFlash(v => !v);
        void fetchNui<{ on: boolean }>('sd-phone:flashlight:toggle').then(r => {
            if (r && typeof r.on === 'boolean') setFlash(r.on);
        });
    }
    function launch(id: string, intent?: unknown) {
        if (intent !== undefined) setLaunchIntent(id, intent);
        onOpenApp(id);
        onClose();
    }
    function openBluetoothSettings() {
        requestOpenAt({ app: 'settings', page: 'bluetooth' });
        onClose();
    }

    const mediaMode = !!music.current;
    const volValue  = mediaMode ? Math.round(music.volume * 100) : ringtoneVol;
    const onVol     = mediaMode ? (v: number) => music.setVolume(v / 100) : setRingtoneVol;

    const EASE = 'cubic-bezier(0.32,0.72,0,1)';
    return (
        <div className={'absolute inset-0 z-[700] ' + (open ? '' : 'pointer-events-none')}>
            {frosted && (
                <div
                    className="absolute inset-0"
                    style={{ backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)' }}
                />
            )}
            <div
                className="absolute inset-0 bg-black/45"
                style={{ opacity: open ? 1 : 0, transition: `opacity 420ms ${EASE}` }}
                onClick={onClose}
            />

            <div
                className="absolute inset-0 overflow-y-auto px-3"
                style={{
                    paddingTop: 'calc(var(--safe-top) + 30px)',
                    paddingBottom: 'calc(var(--safe-bottom) + 16px)',
                    transform: open ? 'translateY(0)' : 'translateY(-10px)',
                    opacity: open ? 1 : 0,
                    transition: `transform 420ms ${EASE}, opacity 380ms ${EASE}`,
                }}
                onClick={onClose}
            >
                <div className="mx-auto flex max-w-[392px] flex-col gap-[18px]" onClick={e => e.stopPropagation()}>
                    <NowPlaying music={music} />

                    <HSlider value={volValue} onChange={onVol} icon={volValue <= 0 ? VolumeX : Volume2} label={t('shell.volume','Volume')} />
                    <HSlider value={brightness} onChange={setBrightness} icon={Sun} label={t('shell.brightness','Brightness')} />

                    <div className="rounded-[36px] bg-white/[0.10] p-[22px]">
                        <div className="grid grid-cols-4 justify-items-center gap-y-[22px]">
                            <Circle icon={Plane}      on={airplaneMode}     onClick={toggleAirplane}                                   color="#ff9f0a"                 label={t('shell.airplaneMode','Airplane Mode')} />
                            {btConfigured && <Circle icon={Bluetooth} on={btEnabled} onClick={() => void useBluetoothStore.getState().setEnabled(!btEnabled)} onLongPress={() => setBtModule(true)} color="#0a84ff" label={t('settings.bluetooth','Bluetooth')} />}
                            <Circle icon={Video}                            onClick={() => launch('camera', { mode: 'VIDEO' })}                                         label={t('shell.record','Record')} />
                            <Circle icon={Flashlight} on={flash}            onClick={toggleFlash}                                      color="#ffffff" glyph="#1c1c1e" label={t('shell.flashlight','Flashlight')} />
                            <Circle icon={Moon}       on={focus}            onClick={() => setFocus(!focus)}                           color="#5e5ce6"                 label={t('shell.focus','Focus')} />
                            <Circle icon={Camera}                           onClick={() => launch('camera', { mode: 'PHOTO' })}                                         label={t('shell.camera','Camera')} />
                            <Circle icon={Contrast}   on={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} color="#5e5ce6"               label={t('shell.darkMode','Dark Mode')} />
                            <Circle icon={Smartphone} on={rotationLock}     onClick={() => setRotationLock(!rotationLock)}             color="#ff453a"                 label={t('shell.rotationLock','Rotation Lock')} />
                        </div>
                    </div>
                </div>
            </div>

            {btConfigured && <BluetoothModule open={open && btModule} onClose={() => setBtModule(false)} onSettings={openBluetoothSettings} />}
        </div>
    );
}

const BT_RESCAN_MS = 2000;

function btStatus(d: BluetoothDevice): string {
    if (d.connected) return t('settings.btConnected', 'Connected');
    if (!d.inRange)  return t('settings.btNotInRange', 'Not in range');
    if (d.full)      return t('settings.btInUse', 'In use');
    return '';
}

/** Expanded Bluetooth module (long press on the tile): power plus connecting to a device right here. */
function BluetoothModule({ open, onClose, onSettings }: { open: boolean; onClose: () => void; onSettings: () => void }) {
    const enabled    = useBluetoothStore(s => s.enabled);
    const devices    = useBluetoothStore(s => s.devices);
    const loading    = useBluetoothStore(s => s.loading);
    const busyId     = useBluetoothStore(s => s.busyId);
    const setEnabled = useBluetoothStore(s => s.setEnabled);
    const pair       = useBluetoothStore(s => s.pair);
    const disconnect = useBluetoothStore(s => s.disconnect);

    useEffect(() => {
        if (!open) return;
        void useBluetoothStore.getState().scan(true);
        const id = window.setInterval(() => {
            if (useBluetoothStore.getState().enabled) void useBluetoothStore.getState().scan(true);
        }, BT_RESCAN_MS);
        return () => window.clearInterval(id);
    }, [open]);

    function press(d: BluetoothDevice) {
        if (busyId) return;
        if (d.connected) void disconnect(d.id);
        else if (d.inRange && !d.full) void pair(d.id);
    }

    const list = devices
        .filter(d => d.paired || d.inRange)
        .sort((a, b) => Number(b.connected) - Number(a.connected) || Number(b.paired) - Number(a.paired));
    const EASE = 'cubic-bezier(0.32,0.72,0,1)';

    return (
        <div
            className={'absolute inset-0 z-10 flex items-center justify-center bg-black/40 px-6 ' + (open ? '' : 'pointer-events-none')}
            style={{ opacity: open ? 1 : 0, transition: `opacity 260ms ${EASE}` }}
            onClick={onClose}
        >
            <div
                className="w-full max-w-[340px] rounded-[36px] bg-[#1c1c1e]/[0.97] p-5 text-white"
                style={{ transform: open ? 'scale(1)' : 'scale(0.92)', transition: `transform 320ms ${EASE}` }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        aria-label={t('settings.bluetooth', 'Bluetooth')}
                        aria-pressed={enabled}
                        onClick={() => void setEnabled(!enabled)}
                        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full transition-colors active:opacity-80"
                        style={{ background: enabled ? '#0a84ff' : 'rgba(255,255,255,0.15)' }}
                    >
                        <Bluetooth className="h-[26px] w-[26px] text-white" />
                    </button>
                    <div className="min-w-0">
                        <p className="text-[19px] font-semibold leading-tight">{t('settings.bluetooth', 'Bluetooth')}</p>
                        <p className="text-[14px] leading-tight text-white/55">{enabled ? t('settings.on', 'On') : t('settings.off', 'Off')}</p>
                    </div>
                </div>

                <div className="my-4 h-px bg-white/15" />

                {!enabled ? (
                    <p className="py-2 text-[15px] text-white/55">{t('settings.btOffBody', 'Turn it on to find devices around you.')}</p>
                ) : list.length === 0 ? (
                    <p className="py-2 text-[15px] text-white/55">{loading ? t('settings.btSearching', 'Searching…') : t('settings.btNothingNearby', 'Nothing nearby')}</p>
                ) : (
                    <div className="-mx-2 max-h-[260px] overflow-y-auto">
                        {list.map(d => {
                            const Icon = DEVICE_GLYPHS[d.kind] ?? Bluetooth;
                            const status = busyId === d.id ? t('settings.btConnecting', 'Connecting…') : btStatus(d);
                            return (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => press(d)}
                                    disabled={!d.connected && (!d.inRange || d.full)}
                                    className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-start active:bg-white/10 disabled:opacity-45"
                                >
                                    <span
                                        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
                                        style={{ background: d.connected ? '#0a84ff' : 'rgba(255,255,255,0.15)' }}
                                    >
                                        <Icon className="h-[18px] w-[18px] text-white" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[16px] leading-tight">{d.name}</span>
                                        {status && <span className="block truncate text-[13px] leading-tight text-white/55">{status}</span>}
                                    </span>
                                    {d.connected && <Check className="h-[20px] w-[20px] shrink-0 text-[#0a84ff]" />}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="my-4 h-px bg-white/15" />

                <button type="button" onClick={onSettings} className="w-full text-start text-[16px] text-white/85 active:opacity-60">
                    {t('settings.btSettingsLink', 'Bluetooth Settings…')}
                </button>
            </div>
        </div>
    );
}

function NowPlaying({ music }: { music: ReturnType<typeof useMusic> }) {
    const { time, duration } = useMusicProgress();
    const track = music.current;
    const pct = track && duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
    const img = track ? coverUrl(track) : null;
    return (
        <div className="rounded-[28px] bg-white/[0.14] px-5 py-[26px]">
            <div className="flex items-center gap-4">
                <div className="grid h-[64px] w-[64px] shrink-0 place-items-center overflow-hidden rounded-[14px] bg-white/15"
                    style={track ? { backgroundImage: img ? `url("${img}")` : coverGradient(track.id), backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                    {track
                        ? (img
                            ? <img src={img} alt="" draggable={false} className="h-full w-full object-cover" />
                            : <Music className="h-7 w-7 text-white/85" />)
                        : <Music className="h-8 w-8 text-white/85" />}
                </div>
                <div className="min-w-0">
                    <p className="truncate text-[18px] font-semibold leading-tight text-white">{track?.title ?? t('shell.notPlaying','Not Playing')}</p>
                    <p className="truncate text-[15px] leading-tight text-white/55">{track?.artist ?? t('shell.notPlaying','Not Playing')}</p>
                </div>
            </div>

            <div className="mt-[22px]">
                <div className="relative h-[6px] w-full rounded-full bg-white/20">
                    <div className="absolute inset-y-0 start-0 rounded-full bg-white/45" style={{ width: `${pct}%` }} />
                    <div className="absolute top-1/2 h-[13px] w-[13px] -translate-y-1/2 rounded-full bg-white shadow" style={{ insetInlineStart: `calc(${pct}% - 6.5px)` }} />
                </div>
                <div className="mt-2 flex justify-between text-[13px] font-medium text-white/55">
                    <span>{fmtTime(time)}</span>
                    <span>{fmtTime(duration)}</span>
                </div>
            </div>

            <div className="mt-[18px] flex items-center justify-center gap-12 text-white">
                <button aria-label={t('shell.previous','Previous')} onClick={music.prev}><SkipBack className="h-[27px] w-[27px] fill-white" /></button>
                <button aria-label={music.playing ? t('shell.pause','Pause') : t('shell.play','Play')} onClick={music.toggle}>
                    {music.playing
                        ? <Pause className="h-[34px] w-[34px] fill-white" />
                        : <Play  className="h-[34px] w-[34px] fill-white" />}
                </button>
                <button aria-label={t('shell.next','Next')} onClick={music.next}><SkipForward className="h-[27px] w-[27px] fill-white" /></button>
            </div>
        </div>
    );
}

const HOLD_MS = 450;

function Circle({ icon: Icon, on = false, onClick, onLongPress, color = '#ffffff', glyph = '#ffffff', label }: {
    icon: LucideIcon; on?: boolean; onClick?: () => void; onLongPress?: () => void; color?: string; glyph?: string; label: string;
}) {
    const timer = useRef<number | undefined>(undefined);
    const held = useRef(false);
    const cancelHold = () => window.clearTimeout(timer.current);
    return (
        <button
            onPointerDown={() => {
                if (!onLongPress) return;
                held.current = false;
                cancelHold();
                timer.current = window.setTimeout(() => { held.current = true; onLongPress(); }, HOLD_MS);
            }}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            onContextMenu={e => { if (onLongPress) e.preventDefault(); }}
            // The click that ends a long press must not also toggle the tile.
            onClick={() => { if (held.current) { held.current = false; return; } onClick?.(); }}
            aria-label={label}
            aria-pressed={on}
            className="flex h-[74px] w-[74px] items-center justify-center rounded-full transition-colors active:opacity-80"
            style={{ background: on ? color : 'rgba(255,255,255,0.15)' }}
        >
            <Icon className="h-[30px] w-[30px]" style={{ color: on ? glyph : '#ffffff' }} />
        </button>
    );
}

function HSlider({ value, onChange, icon: Icon, label }: { value: number; onChange: (v: number) => void; icon: LucideIcon; label: string }) {
    const ref = useRef<HTMLDivElement | null>(null);
    const dragging = useRef(false);
    const [drag, setDrag] = useState<number | null>(null);
    const shown = drag ?? value;

    function posFrom(e: React.PointerEvent): number | null {
        const el = ref.current;
        if (!el) return null;
        const f = trackFraction(el, e.clientX);
        return f === null ? null : Math.round(f * 100);
    }
    return (
        <div
            ref={ref}
            role="slider"
            aria-label={label}
            aria-valuenow={shown}
            className="relative h-[50px] w-full cursor-pointer touch-none select-none overflow-hidden rounded-[19px] bg-white/[0.16]"
            onPointerDown={e => { const p = posFrom(e); if (p === null) return; dragging.current = true; ref.current?.setPointerCapture?.(e.pointerId); setDrag(p); onChange(p); }}
            onPointerMove={e => { if (!dragging.current) return; const p = posFrom(e); if (p !== null) { setDrag(p); onChange(p); } }}
            onPointerUp={() => { dragging.current = false; setDrag(null); }}
            onPointerCancel={() => { dragging.current = false; setDrag(null); }}
        >
            <div className="pointer-events-none absolute inset-y-0 start-0 bg-white" style={{ width: `${shown}%` }} />
            <div className="pointer-events-none absolute inset-y-0 start-[18px] flex items-center">
                <Icon className="h-[22px] w-[22px]" style={{ color: shown > 10 ? '#3a3a3c' : '#ffffff' }} />
            </div>
        </div>
    );
}

function fmtTime(s: number): string {
    if (!isFinite(s) || s <= 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function ControlCenterHotzone({ onOpen }: { onOpen: () => void }) {
    const start = useRef<{ x: number; y: number } | null>(null);
    return (
        <div
            className="absolute end-0 top-0 z-[400]"
            style={{ width: '46%', height: 'calc(var(--safe-top) + 6px)' }}
            onPointerDown={e => { start.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
            onPointerMove={e => {
                if (!start.current) return;
                if (e.clientY - start.current.y > 14) { start.current = null; onOpen(); }
            }}
            onPointerUp={e => {
                if (!start.current) return;
                const moved = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y);
                start.current = null;
                if (moved < 10) onOpen();
            }}
        />
    );
}
