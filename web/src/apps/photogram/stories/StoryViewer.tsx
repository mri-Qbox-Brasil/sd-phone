import { useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';

import { t } from '@/i18n';
import { failText, type Envelope } from '@/core/api';
import type { StoryGroup } from '../photogramApi';
import { apiMarkStorySeen } from '../photogramApi';
import { isVideoUrl } from '../create/Media';
import { VerifiedCheck } from '../ui';
import { storyBackground } from './backgrounds';
import { StoryCanvas, TagLabel } from './StoryCanvas';
import { useDeckActive } from '@/shell/deckActive';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { AlertDialog } from '@/ui/AlertDialog';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function StoryViewer({ stories, startIndex, onClose, onDelete, onOpenProfile }: {
    stories:        StoryGroup[];
    startIndex:     number;
    onClose:        () => void;
    onDelete?:      (storyId: string) => Promise<Envelope>;
    onOpenProfile?: (handle: string) => void;
}) {
    const [si, setSi] = useState(startIndex);
    const [fi, setFi] = useState(0);
    const story = stories[si];

    const frame = story?.frames[fi];
    const activeUrl     = frame?.url ?? '';
    const activeIsVideo = !frame?.text && isVideoUrl(activeUrl);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [progress, setProgress] = useState(0);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState('');
    const deckActive = useDeckActive();
    useStatusBarLight(true);

    useEffect(() => {
        if (frame) void apiMarkStorySeen(frame.id);
    }, [frame]);

    useEffect(() => {
        setProgress(0);
        setError('');
        const v = videoRef.current;
        if (!v || !activeIsVideo) return;
        v.currentTime = 0;
    }, [si, fi, activeIsVideo]);

    useEffect(() => {
        const v = videoRef.current;
        if (!v || !activeIsVideo) return;
        if (!deckActive || confirming) { v.pause(); return; }
        v.muted = false;
        void v.play().catch(() => { v.muted = true; void v.play().catch(() => {}); });
    }, [si, fi, activeIsVideo, deckActive, confirming]);

    if (!story || !frame) return null;

    function advance(dir: 1 | -1) {
        if (dir === 1) {
            if (fi < story.frames.length - 1) setFi(fi + 1);
            else if (si < stories.length - 1) { setSi(si + 1); setFi(0); }
            else onClose();
        } else {
            if (fi > 0) setFi(fi - 1);
            else if (si > 0) { setSi(si - 1); setFi(0); }
        }
    }

    async function deleteFrame() {
        setConfirming(false);
        if (!onDelete) return;
        const wasLast = story.frames.length === 1;
        const wasEnd  = fi === story.frames.length - 1;
        const res = await onDelete(frame.id);
        if (!res.success) {
            setError(failText(res, t('photogram.storyDeleteFailed', 'Could not delete story')));
            return;
        }
        if (wasLast) onClose();
        else if (wasEnd) setFi(fi - 1);
    }

    return (
        <div className="absolute inset-0 z-50 flex flex-col bg-black" style={{ animation: 'ios-sheet-backdrop-in 0.2s ease-out' }}>
            <StatusBarSpacer />

            <div className="flex gap-1 px-2.5 pt-1">
                {story.frames.map((f, i) => {
                    const w = i < fi ? '100%' : i > fi ? '0%' : (activeIsVideo ? `${progress * 100}%` : '100%');
                    return (
                        <div key={f.id} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/30">
                            <div className="h-full rounded-full bg-white" style={{ width: w, transition: i === fi && activeIsVideo ? 'width 0.12s linear' : undefined }} />
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                <img src={story.user.avatar} alt="" draggable={false} className="h-[32px] w-[32px] rounded-full object-cover" />
                <span dir="auto" className="text-[14px] font-semibold text-white">{story.user.handle}</span>
                {story.user.verified && <VerifiedCheck size={18} />}
                <div className="flex-1" />
                {story.isMe && onDelete && (
                    <button type="button" onClick={() => setConfirming(true)} aria-label={t('photogram.deleteStory', 'Delete story')} className="me-3 text-white active:opacity-60">
                        <Trash2 className="h-[24px] w-[24px]" strokeWidth={2} />
                    </button>
                )}
                <button type="button" onClick={onClose} aria-label={t('common.close', 'Close')} className="text-white active:opacity-60">
                    <X className="h-7 w-7" strokeWidth={2.2} />
                </button>
            </div>

            {error && <div className="px-4 pb-2 text-center text-[14px] text-white/85">{error}</div>}

            <div className="relative min-h-0 flex-1">
                <StoryCanvas className="rounded-[14px]">
                    {frame.text ? (
                        <div className="absolute inset-0 flex items-center justify-center p-8" style={{ background: storyBackground(frame.bg) }}>
                            <p dir="auto" className="whitespace-pre-wrap break-words text-center text-[26px] font-semibold leading-snug text-white">{frame.text}</p>
                        </div>
                    ) : activeIsVideo ? (
                        <video
                            key={`${si}-${fi}`}
                            ref={videoRef}
                            src={activeUrl}
                            autoPlay
                            playsInline
                            onTimeUpdate={e => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }}
                            onEnded={() => advance(1)}
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    ) : (
                        <img src={activeUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    {frame.caption && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-6">
                            <p dir="auto" className="max-w-full whitespace-pre-wrap break-words rounded-[10px] bg-black/55 px-3.5 py-2 text-center text-[17px] font-medium leading-snug text-white">{frame.caption}</p>
                        </div>
                    )}
                    {frame.tags?.map(tag => (
                        <button
                            key={tag.handle}
                            type="button"
                            onClick={() => onOpenProfile?.(tag.handle)}
                            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 active:opacity-70"
                            style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}
                        >
                            <TagLabel handle={tag.handle} />
                        </button>
                    ))}
                </StoryCanvas>
                <button type="button" aria-label={t('photogram.previousStory', 'Previous')} onClick={() => advance(-1)} className="absolute inset-y-0 start-0 w-1/3" />
                <button type="button" aria-label={t('photogram.nextStory', 'Next')} onClick={() => advance(1)} className="absolute inset-y-0 end-0 w-2/3" />
            </div>

            <div className="h-7 shrink-0" />

            {confirming && (
                <AlertDialog
                    title={t('photogram.deleteStoryTitle', 'Delete Story?')}
                    message={t('photogram.deleteStoryMessage', "This story will be removed for everyone. This can't be undone.")}
                    confirmLabel={t('photogram.delete', 'Delete')}
                    cancelLabel={t('photogram.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirming(false)}
                    onConfirm={() => { void deleteFrame(); }}
                />
            )}
        </div>
    );
}
