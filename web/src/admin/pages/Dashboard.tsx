import { useEffect, useState } from 'react';

import { adminStats } from '../adminApi';
import type { AdminStats } from '../types';
import { Card, Input, Spinner } from '../ui';
import { TrendTile } from '../Sparkline';

function Stat({ label, value }: { label: string; value: number | undefined }) {
    return (
        <div className="px-5 py-4">
            <div className="text-[12.5px] text-adm-3">{label}</div>
            <div className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.01em] text-adm-1 tabular-nums">
                {value === undefined ? '-' : value.toLocaleString()}
            </div>
        </div>
    );
}

export function Dashboard({ onSearch }: { onSearch: (q: string) => void }) {
    const [q, setQ] = useState('');
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void adminStats().then(res => {
            setStats(res.success ? res.data ?? null : null);
            setLoading(false);
        });
    }, []);

    const trends = stats?.trends;
    const days   = stats?.days;

    return (
        <div className="space-y-6">
            {loading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
                <>
                    <div className="adm-card grid grid-cols-4 divide-x divide-adm-hair">
                        <Stat label="Players online"    value={stats?.online} />
                        <Stat label="Phones registered" value={stats?.phones} />
                        <Stat label="Flags waiting"     value={stats?.openFlags} />
                        <Stat label="Active mutes"      value={stats?.activeMutes} />
                    </div>

                    <div>
                        <div className="adm-heading mb-3">Find a player</div>
                        <Input
                            value={q}
                            onChange={setQ}
                            onEnter={() => { if (q.trim().length >= 2) onSearch(q.trim()); }}
                            placeholder="Name, citizen ID, phone number, Birdy handle or account username"
                        />
                        <div className="mt-2 text-[11.5px] text-adm-3">Press Enter to search. Results load 20 at a time.</div>
                    </div>

                    <div>
                        <div className="adm-heading mb-3">
                            Activity
                            <span className="adm-heading__count">last 14 days</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <TrendTile
                                label="Text messages"
                                value={stats?.messages}
                                points={trends?.messages}
                                days={days}
                            />
                            <TrendTile
                                label="Calls placed"
                                value={trends?.calls?.reduce((a, b) => a + b, 0)}
                                points={trends?.calls}
                                days={days}
                            />
                            <TrendTile
                                label="Squawk posts"
                                value={stats?.birdyPosts}
                                points={trends?.birdyPosts}
                                days={days}
                            />
                            <TrendTile
                                label="Clout posts"
                                value={trends?.cloutPosts?.reduce((a, b) => a + b, 0)}
                                points={trends?.cloutPosts}
                                days={days}
                            />
                            <TrendTile
                                label="Photos taken"
                                value={trends?.photos?.reduce((a, b) => a + b, 0)}
                                points={trends?.photos}
                                days={days}
                            />
                            <TrendTile
                                label="App accounts"
                                value={stats?.appAccounts}
                                points={trends?.accounts}
                                days={days}
                            />
                        </div>
                    </div>
                </>
            )}

            <Card className="p-4 text-[12.5px] leading-relaxed text-adm-3">
                <span className="font-semibold text-adm-2">Quick guide.</span> Search a player to inspect their phone: number, passcode,
                installed apps, app accounts (password resets, force logout), Birdy activity, texts and calls. Use the Birdy tab to trace
                any post back to the player behind it, and Mutes to restrict what a player can do on the phone. Every action you take here
                is written to the audit log.
            </Card>
        </div>
    );
}
