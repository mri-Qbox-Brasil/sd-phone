import { t } from '@/i18n';
import { IG } from '../data';
import type { StoryGroup } from '../photogramApi';

export function StoryAvatar({ src, story, onOpen }: {
    src:    string;
    story:  StoryGroup | null;
    onOpen: (story: StoryGroup) => void;
}) {
    if (!story || story.frames.length === 0) {
        return <img src={src} alt="" draggable={false} className="h-[108px] w-[108px] shrink-0 rounded-full object-cover" />;
    }
    return (
        <button
            type="button"
            onClick={() => onOpen(story)}
            aria-label={t('photogram.viewStory', 'View story')}
            className="shrink-0 rounded-full p-[3px] active:opacity-80"
            style={{ background: story.seen ? '#d4d4d4' : IG.ring }}
        >
            <img src={src} alt="" draggable={false} className="block h-[102px] w-[102px] rounded-full border-[3px] border-[#f2f2f2] object-cover" />
        </button>
    );
}
