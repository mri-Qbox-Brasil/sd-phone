import { useEffect, useMemo, useState } from 'react';
import { Bird, Camera, Clapperboard, Images, X } from 'lucide-react';

import { adminMedia } from '../adminApi';
import type { AdminMediaItem } from '../types';
import { Badge, CenterNote, Spinner, Toggle } from '../ui';

const APPS: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: 'all',       label: 'All',        icon: <Images size={13} /> },
    { id: 'photos',    label: 'Gallery',    icon: <Camera size={13} /> },
    { id: 'photogram', label: 'Photogram',  icon: <Camera size={13} /> },
    { id: 'clout',     label: 'Clout',      icon: <Clapperboard size={13} /> },
    { id: 'squawk',    label: 'Squawk',     icon: <Bird size={13} /> },
];

const APP_LABEL: Record<string, string> = {
    photos: 'Gallery', photogram: 'Photogram', clout: 'Clout', squawk: 'Squawk',
};

function when(ts: number): string {
    if (!ts) return '-';
    const mins = Math.max(0, Math.floor((Date.now() / 1000 - ts) / 60));
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
}

export function MediaPage({ onOpenPlayer }: { onOpenPlayer: (cid: string) => void }) {
    const [items, setItems] = useState<AdminMediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [app, setApp] = useState('all');
    const [full, setFull] = useState<AdminMediaItem | null>(null);

    useEffect(() => {
        void adminMedia().then(res => {
            setItems(res.success ? res.data?.media ?? [] : []);
            setLoading(false);
        });
    }, []);

    const shown = useMemo(
        () => (app === 'all' ? items : items.filter(m => m.app === app)),
        [items, app],
    );

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        for (const m of items) c[m.app] = (c[m.app] ?? 0) + 1;
        return c;
    }, [items]);

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {APPS.map(a => {
                    const on = app === a.id;
                    const n = a.id === 'all' ? items.length : counts[a.id] ?? 0;
                    return (
                        <Toggle key={a.id} on={on} onClick={() => setApp(a.id)}>
                            {a.icon}
                            {a.label}
                            <span className="tabular-nums text-adm-3">{n}</span>
                        </Toggle>
                    );
                })}
            </div>

            {shown.length === 0 ? (
                <CenterNote>Nothing posted here yet.</CenterNote>
            ) : (
                <div className="grid grid-cols-5 gap-2.5">
                    {shown.map((m, i) => (
                        <button
                            key={`${m.app}-${m.id}-${i}`}
                            type="button"
                            onClick={() => setFull(m)}
                            className="group relative aspect-square overflow-hidden rounded-lg bg-adm-surface-2 ring-1 ring-adm-hair transition-transform hover:scale-[1.02]"
                        >
                            <img src={m.url} alt="" draggable={false} className="h-full w-full object-cover" />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-5 text-start">
                                <div className="truncate text-[11px] font-semibold text-adm-1">{m.author}</div>
                                <div className="flex items-center justify-between gap-1">
                                    <span className="text-[10px] text-adm-2">{APP_LABEL[m.app] ?? m.app}</span>
                                    <span className="text-[10px] tabular-nums text-adm-3">{when(m.createdAt)}</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {full && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
                    onMouseDown={() => setFull(null)}
                >
                    <div
                        className="max-h-full max-w-3xl overflow-hidden rounded-lg bg-adm-surface ring-1 ring-adm-hair-strong"
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3 border-b border-adm-hair px-4 py-2.5">
                            <div className="flex items-center gap-2">
                                <Badge>{APP_LABEL[full.app] ?? full.app}</Badge>
                                <button
                                    type="button"
                                    onClick={() => { onOpenPlayer(full.author); setFull(null); }}
                                    className="text-[13px] font-semibold text-adm-1 underline-offset-2 hover:underline"
                                >
                                    {full.author}
                                </button>
                                <span className="text-[12px] text-adm-3">{when(full.createdAt)}</span>
                            </div>
                            <button type="button" onClick={() => setFull(null)} className="text-adm-3 hover:text-adm-2">
                                <X size={16} />
                            </button>
                        </div>
                        {full.video
                            ? <video src={full.video} controls autoPlay loop className="max-h-[70vh] w-auto" />
                            : <img src={full.url} alt="" className="max-h-[70vh] w-auto" />}
                        <div className="break-all border-t border-adm-hair px-4 py-2 text-[11px] text-adm-4">{full.url}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
