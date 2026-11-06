import { useCallback, useEffect, useRef } from 'react';
import clsx from 'clsx';

import type { MigrationLine } from '../../types';
import { clockOf } from './format';

const LEVEL_TEXT: Record<MigrationLine['level'], string> = {
    info:  'text-adm-2',
    ok:    'text-adm-ok',
    warn:  'text-adm-warn',
    error: 'text-adm-danger',
};

const LEVEL_RAIL: Record<MigrationLine['level'], string> = {
    info:  'bg-transparent',
    ok:    'bg-adm-ok/60',
    warn:  'bg-adm-warn/70',
    error: 'bg-adm-danger/70',
};

export function MigrationLog({ lines, className }: { lines: MigrationLine[]; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const pinned = useRef(true);

    useEffect(() => {
        const el = ref.current;
        if (el && pinned.current) el.scrollTop = el.scrollHeight;
    }, [lines]);

    const onScroll = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
    }, []);

    return (
        <div
            ref={ref}
            onScroll={onScroll}
            className={clsx(
                'adm-scroll overflow-y-auto rounded-lg bg-black/35 font-mono text-[11.5px] leading-relaxed ring-1 ring-adm-hair',
                className,
            )}
        >
            {lines.length === 0 ? (
                <div className="px-4 py-3 text-adm-4">
                    The run writes here line by line. Pick your domains and start the import.
                </div>
            ) : (
                lines.map(l => (
                    <div key={l.id} className="relative flex gap-3 px-4 py-[3px] hover:bg-adm-surface">
                        <span className={clsx('absolute inset-y-0 start-0 w-[2px]', LEVEL_RAIL[l.level])} />
                        <span className="shrink-0 text-adm-4 tabular-nums">{clockOf(l.at)}</span>
                        <span className={clsx('min-w-0 break-words', LEVEL_TEXT[l.level])}>{l.text}</span>
                    </div>
                ))
            )}
        </div>
    );
}
