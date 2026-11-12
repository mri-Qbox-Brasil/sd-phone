import { useState } from 'react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { Sheet } from '@/ui/Sheet';
import { SearchBar } from '@/ui/SearchBar';
import { apiFollowList, apiSearch, avatarFor, type FollowUser } from '../photogramApi';
import { VerifiedCheck } from '../ui';

export function TagPeopleSheet({ myHandle, exclude, onPick, onClose }: {
    myHandle?: string;
    exclude:   string[];
    onPick:    (handle: string) => void;
    onClose:   () => void;
}) {
    const [query, setQuery] = useState('');
    const q = query.trim();

    const { data: following } = useAsyncData<FollowUser[]>(() => apiFollowList('following', myHandle), [myHandle]);
    const { data: results, loading: searching } = useAsyncData<FollowUser[]>(() => apiSearch(q), [q], { enabled: q.length > 0 });

    const people = (q ? (results ?? []) : (following ?? [])).filter(u => !exclude.includes(u.handle));
    const empty = q
        ? (searching ? '' : t('photogram.noAccountsFound', 'No accounts found.'))
        : t('photogram.tagSearchHint', 'Search for anyone on Photogram to tag them.');

    return (
        <Sheet onClose={onClose} top="34%" forceDark className="bg-[#1c1c1e] font-sf">
            {({ close }) => (
                <>
                    <div className="px-4 pb-3 pt-[22px] text-center text-[19px] font-bold text-white">{t('photogram.tagPeople', 'Tag people')}</div>
                    <div className="shrink-0 px-4 pb-2">
                        <SearchBar
                            value={query}
                            onChange={setQuery}
                            autoFocus
                            forceDark
                            placeholder={t('photogram.search', 'Search')}
                            pillClassName="gap-2.5 rounded-[12px] bg-white/[0.12] px-3.5 py-2.5"
                            iconClassName="h-[20px] w-[20px] text-white/55"
                            textClassName="text-[18px] text-white placeholder:text-white/45"
                        />
                    </div>

                    {!q && people.length > 0 && (
                        <div className="px-4 pb-1 pt-2 text-[15px] font-semibold text-white/55">{t('photogram.following', 'Following')}</div>
                    )}

                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-8">
                        {people.length === 0 ? (
                            empty && <div className="px-8 pt-10 text-center text-[16px] leading-snug text-white/50">{empty}</div>
                        ) : people.map(u => (
                            <button
                                key={u.handle}
                                type="button"
                                onClick={() => { onPick(u.handle); close(); }}
                                className="flex w-full items-center gap-4 px-4 py-2.5 text-start active:bg-white/[0.08]"
                            >
                                <img
                                    src={u.avatar}
                                    alt=""
                                    draggable={false}
                                    onError={e => { const fallback = avatarFor(u.handle); if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback; }}
                                    className="h-[54px] w-[54px] shrink-0 rounded-full bg-white/10 object-cover"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span dir="auto" className="truncate text-[18px] font-semibold text-white">{u.handle}</span>
                                        {u.verified && <VerifiedCheck size={18} />}
                                    </div>
                                    {u.name && <div dir="auto" className="truncate text-[15px] text-white/55">{u.name}</div>}
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </Sheet>
    );
}
