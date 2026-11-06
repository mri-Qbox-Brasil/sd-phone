import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    AudioLines, Bird, Camera, Clapperboard, FileText, Flag, Flame, Images, Mail, MessageSquare, Mic, Newspaper, Rss,
    ShoppingBag, Skull, StickyNote, Users, X,
} from 'lucide-react';
import clsx from 'clsx';

import { demoAdminOnly } from '@/core/demo';
import { fetchNui } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { AuditPage } from './pages/AuditPage';
import { BirdyPage } from './pages/BirdyPage';
import { ContentPage } from './pages/ContentPage';
import { BinPage } from './pages/BinPage';
import { Dashboard } from './pages/Dashboard';
import { FlagsPage } from './pages/FlagsPage';
import { MediaPage } from './pages/MediaPage';
import { MapPage } from './pages/MapPage';
import { MigrationPage } from './pages/MigrationPage';
import { MutesPage } from './pages/MutesPage';
import { NumbersPage } from './pages/NumbersPage';
import { RacingPage } from './pages/RacingPage';
import { PlayerDetail } from './pages/PlayerDetail';
import { PlayersPage } from './pages/PlayersPage';
import { ToastHost, closeTopmostOverlay, useToasts } from './ui';
import './admin.css';

type TabId = 'overview' | 'players' | 'apps' | 'media' | 'map' | 'flags' | 'mutes' | 'bin' | 'audit' | 'numbers' | 'migration';

type AppId =
    | 'birdy' | 'messages' | 'mail' | 'darkchat' | 'photogram' | 'vibez' | 'cherry' | 'marketplace' | 'pages'
    | 'weazelnews' | 'documents' | 'notes' | 'voicememos' | 'callrecordings' | 'groups' | 'gallery' | 'racing';

const TABS: { id: TabId; label: string; heading: string; sub: string }[] = [
    { id: 'overview',  label: 'Overview',    heading: 'Overview',    sub: 'Activity across every phone' },
    { id: 'players',   label: 'Players',     heading: 'Players',     sub: 'Search anyone by name, number or account' },
    { id: 'apps',      label: 'Apps',        heading: 'Apps',        sub: 'Moderate what players post' },
    { id: 'media',     label: 'Media',       heading: 'Media',       sub: 'Everything posted, newest first' },
    { id: 'map',       label: 'Live map',    heading: 'Live map',    sub: 'Players online now' },
    { id: 'flags',     label: 'Flags',       heading: 'Flags',       sub: 'Watchlist queue' },
    { id: 'mutes',     label: 'Mutes',       heading: 'Mutes',       sub: 'Active mutes' },
    { id: 'bin',       label: 'Recycle bin', heading: 'Recycle bin', sub: 'Restore deleted content' },
    { id: 'audit',     label: 'Audit log',   heading: 'Audit log',   sub: 'Every staff action' },
    { id: 'numbers',   label: 'Numbers',     heading: 'Numbers',     sub: 'SIM registry' },
    { id: 'migration', label: 'Migration',   heading: 'Migration',   sub: 'Import from another phone' },
];

const APPS: { id: AppId; label: string; sub: string; icon: React.ReactNode }[] = [
    { id: 'birdy',          label: 'Squawk',          sub: 'Posts and accounts',             icon: <Bird size={14} /> },
    { id: 'messages',       label: 'Messages',        sub: 'Read only',                      icon: <MessageSquare size={14} /> },
    { id: 'mail',           label: 'Mail',            sub: 'Mailboxes and their messages',   icon: <Mail size={14} /> },
    { id: 'darkchat',       label: 'Dark Chat',       sub: 'Rooms and messages',             icon: <Skull size={14} /> },
    { id: 'photogram',      label: 'Photogram',       sub: 'Posts, comments and likes',      icon: <Camera size={14} /> },
    { id: 'vibez',          label: 'Clout',           sub: 'Posts, comments and likes',      icon: <Clapperboard size={14} /> },
    { id: 'cherry',         label: 'Cherry',          sub: 'Profiles',                       icon: <Flame size={14} /> },
    { id: 'marketplace',    label: 'Marketplace',     sub: 'Listings',                       icon: <ShoppingBag size={14} /> },
    { id: 'pages',          label: 'Pages',           sub: 'Posts',                          icon: <Newspaper size={14} /> },
    { id: 'weazelnews',     label: 'Weazel News',     sub: 'Published articles',             icon: <Rss size={14} /> },
    { id: 'documents',      label: 'Documents',       sub: 'Files and who signed them',      icon: <FileText size={14} /> },
    { id: 'notes',          label: 'Notes',           sub: 'Read only',                      icon: <StickyNote size={14} /> },
    { id: 'voicememos',     label: 'Voice memos',     sub: 'Recordings',                     icon: <Mic size={14} /> },
    { id: 'callrecordings', label: 'Call recordings', sub: 'Recorded calls',                 icon: <AudioLines size={14} /> },
    { id: 'groups',         label: 'Groups',          sub: 'Crews and their members',        icon: <Users size={14} /> },
    { id: 'gallery',        label: 'Gallery',         sub: 'Player photos',                  icon: <Images size={14} /> },
    { id: 'racing',         label: 'Racing',          sub: 'Track board',                    icon: <Flag size={14} /> },
];

const CONTENT_PAGES: Record<string, { search: string; empty: string; deleteBody: string; thread: string; grid?: boolean }> = {
    messages:    { search: 'Filter sent texts by content or number',      empty: 'No messages yet.',            deleteBody: '',                                                             thread: 'Conversation' },
    darkchat:    { search: 'Filter messages by content, alias or room',   empty: 'No Dark Chat messages yet.',  deleteBody: 'The message goes to the Recycle bin for 30 days. Its reactions do not come back.',       thread: 'Room context' },
    photogram:   { search: 'Filter posts by caption or username',         empty: 'No Photogram posts yet.',     deleteBody: 'The post goes to the Recycle bin for 30 days. Its comments, likes and saves do not come back.', thread: 'Comments' },
    vibez:       { search: 'Filter posts by caption or username',         empty: 'No Clout posts yet.',         deleteBody: 'The post goes to the Recycle bin for 30 days. Its comments, likes and saves do not come back.', thread: 'Comments' },
    cherry:      { search: 'Filter profiles by username, name or bio',    empty: 'No Cherry profiles yet.',     deleteBody: '',                                                             thread: '' },
    marketplace: { search: 'Filter listings by title or description',     empty: 'No listings yet.',            deleteBody: 'The listing goes to the Recycle bin for 30 days.',                          thread: '' },
    pages:       { search: 'Filter posts by title or description',        empty: 'No posts yet.',               deleteBody: 'The post goes to the Recycle bin for 30 days.',                             thread: '' },
    gallery:     { search: 'Filter photos by citizen ID',                 empty: 'No photos yet.',              deleteBody: 'The photo goes to the Recycle bin for 30 days. The albums it was in do not come back.', thread: '', grid: true },
    mail:        { search: 'Filter mailboxes by address, name or message text', empty: 'No mailboxes yet.',     deleteBody: '',                                                             thread: 'Messages' },
    documents:   { search: 'Filter documents by name, content or citizen ID',   empty: 'No documents yet.',     deleteBody: 'The document goes to the Recycle bin for 30 days. The signatures on it do not come back.', thread: 'Signatures' },
    weazelnews:  { search: 'Filter articles by headline, body or author', empty: 'No articles published yet.',  deleteBody: 'The article goes to the Recycle bin for 30 days.',                          thread: '' },
    notes:       { search: 'Filter notes by content or citizen ID',       empty: 'No notes yet.',               deleteBody: '',                                                             thread: '' },
    voicememos:  { search: 'Filter memos by name or citizen ID',          empty: 'No voice memos yet.',         deleteBody: 'The recording goes to the Recycle bin for 30 days.',                        thread: '' },
    callrecordings: { search: 'Filter recordings by number, name or citizen ID', empty: 'No call recordings yet.', deleteBody: 'The recording goes to the Recycle bin for 30 days.',                     thread: '' },
    groups:      { search: 'Filter groups by name or leader',             empty: 'No groups yet.',              deleteBody: '',                                                             thread: '' },
};

const isTyping = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function AdminPanel() {
    const [open, setOpen] = useState(demoAdminOnly);
    const [leaving, setLeaving] = useState(false);
    const [adminName, setAdminName] = useState<string | undefined>(demoAdminOnly ? 'Demo Admin' : undefined);
    const [simEnabled, setSimEnabled] = useState(false);
    const [racingEnabled, setRacingEnabled] = useState(demoAdminOnly);
    const [tab, setTab] = useState<TabId>('overview');
    const [app, setApp] = useState<AppId>('birdy');
    const [playerCid, setPlayerCid] = useState<string | null>(null);
    const [searchSeed, setSearchSeed] = useState('');
    const [gallerySeed, setGallerySeed] = useState('');
    const [contentSeed, setContentSeed] = useState<{ app: string; q: string } | null>(null);
    const [openFlags, setOpenFlags] = useState(0);
    const { toasts, push } = useToasts();

    const tabs = TABS.filter(t => t.id !== 'numbers' || simEnabled);
    const apps = APPS.filter(a => a.id !== 'racing' || racingEnabled);

    useNuiEvent('sd-phone:admin:open', useCallback((data) => {
        setAdminName(data?.adminName);
        setSimEnabled(data?.sim === true);
        setRacingEnabled(data?.racing === true);
        setTab('overview');
        setPlayerCid(null);
        setSearchSeed('');
        setLeaving(false);
        setOpen(true);
    }, []));

    const close = useCallback(() => {
        void fetchNui('sd-phone:admin:close');
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setOpen(false);
        else setLeaving(true);
    }, []);

    const switchTab = useCallback((next: TabId) => {
        setTab(next);
        if (next !== 'players') setPlayerCid(null);
    }, []);

    const openApp = useCallback((next: AppId) => {
        setApp(next);
        if (next === 'gallery') setGallerySeed('');
        if (next !== contentSeed?.app) setContentSeed(null);
    }, [contentSeed]);

    useEffect(() => {
        if (!open || leaving) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                if (closeTopmostOverlay()) return;
                close();
                return;
            }
            if (e.ctrlKey || e.altKey || e.metaKey || isTyping() || document.querySelector('[data-modal]')) return;
            const n = Number(e.key);
            if (Number.isInteger(n) && n >= 1 && n <= Math.min(9, tabs.length)) switchTab(tabs[n - 1].id);
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, leaving, close, switchTab, tabs]);

    const openPlayer = useCallback((cid: string) => {
        setTab('players');
        setPlayerCid(cid);
    }, []);

    const openGallery = useCallback((cid: string) => {
        setGallerySeed(cid);
        setApp('gallery');
        setTab('apps');
    }, []);

    const openContent = useCallback((target: string, q: string) => {
        setContentSeed({ app: target, q });
        setApp(target as AppId);
        setTab('apps');
    }, []);

    const enter = useRef<{ tab: TabId; cls: string }>({ tab, cls: '' });
    if (enter.current.tab !== tab) {
        const from = tabs.findIndex(t => t.id === enter.current.tab);
        const to = tabs.findIndex(t => t.id === tab);
        enter.current = { tab, cls: to > from ? 'adm-anim-tab-right' : 'adm-anim-tab-left' };
    }

    const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
    const [underline, setUnderline] = useState<{ left: number; width: number } | null>(null);
    useLayoutEffect(() => {
        const el = tabRefs.current[tab];
        if (!el) return;
        setUnderline({ left: el.offsetLeft + 10, width: Math.max(0, el.offsetWidth - 20) });
    }, [tab, open, openFlags, simEnabled]);

    if (!open) return null;

    const counts: Partial<Record<TabId, number>> = { flags: openFlags || undefined };
    const current = TABS.find(t => t.id === tab) ?? TABS[0];
    const currentApp = apps.find(a => a.id === app) ?? apps[0];
    const contentCfg = CONTENT_PAGES[currentApp.id];

    const heading = tab === 'players' && playerCid
        ? { title: 'Player details', sub: playerCid }
        : tab === 'apps'
            ? { title: currentApp.label, sub: currentApp.sub }
            : { title: current.heading, sub: current.sub };

    const appBody = (
        <>
            {currentApp.id === 'birdy' && (
                <BirdyPage
                    key={contentSeed?.app === 'birdy' ? `birdy:${contentSeed.q}` : 'birdy'}
                    initialQuery={contentSeed?.app === 'birdy' ? contentSeed.q : undefined}
                    onOpenPlayer={openPlayer}
                    toast={push}
                />
            )}
            {currentApp.id === 'racing' && <RacingPage onToast={push} />}
            {contentCfg && (
                <ContentPage
                    key={currentApp.id === 'gallery'
                        ? `gallery:${gallerySeed}`
                        : contentSeed?.app === currentApp.id ? `${currentApp.id}:${contentSeed.q}` : currentApp.id}
                    app={currentApp.id}
                    initialQuery={currentApp.id === 'gallery'
                        ? gallerySeed
                        : contentSeed?.app === currentApp.id ? contentSeed.q : undefined}
                    searchPlaceholder={contentCfg.search}
                    emptyLabel={contentCfg.empty}
                    deleteBody={contentCfg.deleteBody}
                    threadLabel={contentCfg.thread}
                    grid={contentCfg.grid}
                    onOpenPlayer={openPlayer}
                    toast={push}
                />
            )}
        </>
    );

    return (
        <div
            className={clsx(
                'sd-admin fixed inset-0 z-[400] flex items-center justify-center',
                leaving ? 'adm-anim-fade-out' : 'adm-anim-fade-in',
                demoAdminOnly ? 'p-6' : 'bg-black/45',
            )}
            onAnimationEnd={e => {
                if (!leaving || e.target !== e.currentTarget) return;
                setLeaving(false);
                setOpen(false);
            }}
        >
            <div
                data-admin-surface
                dir="ltr"
                className={clsx(
                    'relative flex flex-col overflow-hidden border border-adm-hair-strong bg-adm-bg',
                    leaving ? 'adm-anim-panel-out' : 'adm-anim-panel-in',
                    demoAdminOnly
                        ? 'h-full w-full rounded-[14px]'
                        : 'h-[88vh] w-[1180px] max-w-[94vw] rounded-[14px] shadow-[0_30px_80px_rgba(0,0,0,0.55)]',
                )}
            >
                <div className="flex h-14 shrink-0 items-center gap-3 pe-3 ps-5">
                    <div className="flex min-w-0 items-baseline gap-2.5">
                        <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-adm-1">Phone Admin</span>
                        <span className="truncate text-[12.5px] text-adm-3">Players, content and moderation</span>
                    </div>
                    <div className="ms-auto flex items-center gap-2">
                        <span className="flex h-6 items-center rounded-[6px] bg-white/[0.05] px-2 text-[12px] text-adm-2">
                            {adminName ?? 'Admin'}
                        </span>
                        <button type="button" className="adm-btn adm-btn--icon" onClick={close} aria-label="Close" title="Close (Esc)">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="relative flex shrink-0 items-center overflow-x-auto border-b border-adm-hair px-3 [scrollbar-width:none]">
                    {tabs.map((t, i) => (
                        <button
                            key={t.id}
                            type="button"
                            ref={el => { tabRefs.current[t.id] = el; }}
                            data-on={tab === t.id}
                            title={i < 9 ? String(i + 1) : undefined}
                            onClick={() => switchTab(t.id)}
                            className="adm-tab"
                        >
                            {t.label}
                            {counts[t.id] != null && <span className="adm-tab__count">{counts[t.id]}</span>}
                        </button>
                    ))}
                    {underline && (
                        <span
                            className="adm-tab-underline absolute -bottom-px h-[1.5px] rounded-full bg-adm-1"
                            style={{ left: underline.left, width: underline.width }}
                        />
                    )}
                </div>

                <div className="relative min-h-0 flex-1 overflow-hidden">
                    <div key={tab} className={clsx('absolute inset-0 flex', enter.current.cls)}>
                        {tab === 'apps' && (
                            <div className="adm-scroll w-[200px] shrink-0 space-y-0.5 overflow-y-auto border-e border-adm-hair p-3">
                                {apps.map(a => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        data-on={currentApp.id === a.id}
                                        onClick={() => openApp(a.id)}
                                        className="adm-rail-item"
                                    >
                                        {a.icon}
                                        <span className="truncate">{a.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="adm-scroll min-w-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
                            {tab !== 'overview' && !(tab === 'players' && playerCid) && (
                                <div className="mb-4 flex min-h-[30px] items-center gap-3">
                                    <div className="adm-heading">
                                        {heading.title}
                                        <span className="text-[12.5px] font-normal text-adm-3">{heading.sub}</span>
                                    </div>
                                </div>
                            )}

                            {tab === 'overview' && (
                                <Dashboard onSearch={q => { setSearchSeed(q); setPlayerCid(null); setTab('players'); }} />
                            )}
                            {tab === 'players' && !playerCid && (
                                <PlayersPage initialQuery={searchSeed} onOpenPlayer={openPlayer} />
                            )}
                            {tab === 'players' && playerCid && (
                                <PlayerDetail cid={playerCid} onBack={() => setPlayerCid(null)} toast={push} onOpenGallery={openGallery} />
                            )}
                            {tab === 'apps' && <div key={currentApp.id} className="adm-anim-fade-in">{appBody}</div>}
                            {tab === 'media' && <MediaPage onOpenPlayer={openPlayer} />}
                            {tab === 'map' && <MapPage onOpenPlayer={openPlayer} />}
                            {tab === 'numbers' && <NumbersPage onOpenPlayer={openPlayer} />}
                            {tab === 'mutes' && <MutesPage onOpenPlayer={openPlayer} toast={push} />}
                            {tab === 'audit' && <AuditPage onOpenPlayer={openPlayer} />}
                            {tab === 'bin' && <BinPage onOpenPlayer={openPlayer} toast={push} />}
                            {tab === 'flags' && (
                                <FlagsPage
                                    onOpenPlayer={openPlayer}
                                    onOpenContent={openContent}
                                    onCount={setOpenFlags}
                                    toast={push}
                                />
                            )}
                            {tab === 'migration' && <MigrationPage toast={push} />}
                        </div>
                    </div>
                </div>

                <ToastHost toasts={toasts} />
            </div>
        </div>
    );
}
