import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { AtSign, X } from 'lucide-react';

import { t } from '@/i18n';
import { failText, type Envelope } from '@/core/api';
import { ancestorZoom } from '@/lib/zoom';
import type { User } from '../data';
import type { NewStory, StoryTag } from '../photogramApi';
import { isVideoUrl, MediaThumb } from '../create/Media';
import { DEFAULT_STORY_BACKGROUND, STORY_BACKGROUNDS, storyBackground } from './backgrounds';
import { StoryCanvas, TagLabel } from './StoryCanvas';
import { TagPeopleSheet } from './TagPeopleSheet';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

const MAX_TAGS = 10;

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

export function StoryComposer({ media, me, onClose, onShare }: {
    media?:  string[];
    me:      User | null;
    onClose: () => void;
    onShare: (story: NewStory) => Promise<Envelope>;
}) {
    const items = media ?? [];
    const [sel,      setSel]      = useState(0);
    const [captions, setCaptions] = useState<string[]>(() => items.map(() => ''));
    const [tags,     setTags]     = useState<StoryTag[][]>(() => items.map(() => []));
    const [tagging,  setTagging]  = useState(false);
    const [text,     setText]     = useState('');
    const [bg,       setBg]       = useState(DEFAULT_STORY_BACKGROUND);
    const [sharing,  setSharing]  = useState(false);
    const [error,    setError]    = useState('');
    const textRef = useRef<HTMLTextAreaElement>(null);
    const boxRef  = useRef<HTMLDivElement>(null);
    useStatusBarLight(true);

    useLayoutEffect(() => {
        const el = textRef.current;
        if (!el) return;
        el.style.height = '0px';
        el.style.height = `${el.scrollHeight}px`;
    }, [text]);

    const isMedia = items.length > 0;
    const current = items[sel];
    const ready = isMedia || text.trim() !== '';

    function setCaption(value: string) {
        setCaptions(prev => prev.map((c, i) => (i === sel ? value : c)));
    }
    function setSelTags(fn: (prev: StoryTag[]) => StoryTag[]) {
        setTags(prev => prev.map((list, i) => (i === sel ? fn(list) : list)));
    }

    async function share() {
        if (sharing || !ready) return;
        setSharing(true);
        setError('');
        const story: NewStory = isMedia
            ? { items: items.map((image, i) => ({ image, caption: captions[i].trim() || undefined, tags: tags[i].length > 0 ? tags[i] : undefined })) }
            : { text: text.trim(), bg };
        const res = await onShare(story);
        if (!res.success) {
            setError(failText(res, t('photogram.storyCreateFailed', 'Could not share your story')));
            setSharing(false);
        }
    }

    return (
        <div className="absolute inset-0 z-50 flex flex-col bg-black font-sf" style={{ animation: 'ios-sheet-up 0.32s cubic-bezier(0.32,0.72,0,1)', willChange: 'transform' }}>
            <StatusBarSpacer />

            <div className="relative mx-2 mt-1 min-h-0 flex-1">
                <StoryCanvas boxRef={boxRef} className="rounded-[18px]" style={isMedia ? { background: '#111' } : { background: storyBackground(bg) }}>
                    {isMedia ? (
                        isVideoUrl(current)
                            ? <video key={sel} src={current} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
                            : <img src={current} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center px-8 pb-20 pt-16">
                            <textarea
                                ref={textRef}
                                value={text}
                                onChange={e => setText(e.target.value)}
                                maxLength={500}
                                rows={1}
                                autoFocus
                                dir="auto"
                                placeholder={t('photogram.writeStory', 'Start typing…')}
                                className="max-h-full w-full resize-none overflow-y-auto no-scrollbar bg-transparent text-center text-[26px] font-semibold leading-snug text-white outline-none placeholder:text-white/70"
                            />
                        </div>
                    )}

                    {isMedia && tags[sel].map(tag => (
                        <DraggableTag
                            key={tag.handle}
                            tag={tag}
                            boxRef={boxRef}
                            onMove={(x, y) => setSelTags(list => list.map(tg => (tg.handle === tag.handle ? { ...tg, x, y } : tg)))}
                            onRemove={() => setSelTags(list => list.filter(tg => tg.handle !== tag.handle))}
                        />
                    ))}

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close', 'Close')}
                        className="absolute start-3 top-3 z-20 flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/35 text-white active:opacity-60"
                    >
                        <X className="h-[24px] w-[24px]" strokeWidth={2.2} />
                    </button>

                    {isMedia && (
                        <button
                            type="button"
                            onClick={() => setTagging(true)}
                            disabled={tags[sel].length >= MAX_TAGS}
                            aria-label={t('photogram.tagPeople', 'Tag people')}
                            className="absolute end-3 top-3 z-20 flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/35 text-white active:opacity-60 disabled:opacity-40"
                        >
                            <AtSign className="h-[22px] w-[22px]" strokeWidth={2.2} />
                        </button>
                    )}

                    {isMedia ? (
                        <div className="absolute inset-x-0 bottom-5 z-20 px-5">
                            <input
                                value={captions[sel]}
                                onChange={e => setCaption(e.target.value)}
                                maxLength={200}
                                dir="auto"
                                placeholder={t('photogram.addCaption', 'Add a caption…')}
                                className="w-full rounded-[12px] bg-black/50 px-4 py-3 text-center text-[17px] text-white outline-none placeholder:text-white/70"
                            />
                        </div>
                    ) : (
                        <div className="absolute inset-x-0 bottom-5 flex justify-center gap-3.5">
                            {Object.entries(STORY_BACKGROUNDS).map(([key, css], i) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setBg(key)}
                                    aria-label={t('photogram.storyBackground', 'Background {n}', { n: i + 1 })}
                                    className={`h-[34px] w-[34px] rounded-full active:scale-90 ${key === bg ? 'border-[3px] border-white' : 'border-2 border-white/45'}`}
                                    style={{ background: css }}
                                />
                            ))}
                        </div>
                    )}
                </StoryCanvas>

                {tagging && (
                    <TagPeopleSheet
                        myHandle={me?.handle}
                        exclude={tags[sel].map(tg => tg.handle)}
                        onPick={handle => setSelTags(list => [...list, { handle, x: 0.5, y: 0.42 }])}
                        onClose={() => setTagging(false)}
                    />
                )}
            </div>

            {error && <div className="px-5 pt-3 text-center text-[14px] text-white/85">{error}</div>}

            <div className="flex shrink-0 items-center gap-3 px-4 pb-9 pt-3">
                <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto no-scrollbar">
                    {items.length > 1 && items.map((url, i) => (
                        <button
                            key={`${i}-${url}`}
                            type="button"
                            onClick={() => setSel(i)}
                            aria-label={t('photogram.storySlide', 'Slide {n}', { n: i + 1 })}
                            className={`h-[54px] w-[40px] shrink-0 overflow-hidden rounded-[7px] border-2 ${i === sel ? 'border-white' : 'border-transparent opacity-60'}`}
                        >
                            <MediaThumb url={url} badge={false} />
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => { void share(); }}
                    disabled={!ready || sharing}
                    className="flex shrink-0 items-center gap-2.5 rounded-full bg-white py-2 pe-5 ps-2 active:opacity-70 disabled:opacity-40"
                >
                    {me?.avatar
                        ? <img src={me.avatar} alt="" draggable={false} className="h-[30px] w-[30px] rounded-full object-cover" />
                        : <span className="h-[30px] w-[30px] rounded-full bg-black/15" />}
                    <span className="text-[16px] font-semibold text-black">
                        {sharing ? t('photogram.sharing', 'Sharing…') : t('photogram.yourStory', 'Your Story')}
                    </span>
                </button>
            </div>
        </div>
    );
}

function DraggableTag({ tag, boxRef, onMove, onRemove }: {
    tag:      StoryTag;
    boxRef:   RefObject<HTMLDivElement | null>;
    onMove:   (x: number, y: number) => void;
    onRemove: () => void;
}) {
    const drag = useRef<{ px: number; py: number; x: number; y: number; zoom: number } | null>(null);

    return (
        <div
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none active:cursor-grabbing"
            style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}
            onPointerDown={e => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                drag.current = { px: e.clientX, py: e.clientY, x: tag.x, y: tag.y, zoom: ancestorZoom(boxRef.current) };
            }}
            onPointerMove={e => {
                const d = drag.current;
                const box = boxRef.current;
                if (!d || !box || box.offsetWidth === 0) return;
                onMove(
                    clamp(d.x + (e.clientX - d.px) / (d.zoom * box.offsetWidth), 0.08, 0.92),
                    clamp(d.y + (e.clientY - d.py) / (d.zoom * box.offsetHeight), 0.04, 0.96),
                );
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
        >
            <TagLabel handle={tag.handle} />
            <button
                type="button"
                onPointerDown={e => e.stopPropagation()}
                onClick={onRemove}
                aria-label={t('photogram.removeTag', 'Remove tag')}
                className="absolute -end-2 -top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-black/75 text-white active:opacity-60"
            >
                <X className="h-[13px] w-[13px]" strokeWidth={3} />
            </button>
        </div>
    );
}
