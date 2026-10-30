import { useMemo } from 'react';
import { Smartphone, Unplug } from 'lucide-react';
import { encode } from 'uqr';

import { t } from '@/i18n';
import { GroupCard, ListGroup, ListRow } from '@/ui/ListGroup';
import { SubPage } from '@/apps/settings/SettingsSubPage';
import { chooseUrl, closeRemote, openRemote, useRemoteStore, type RemoteError, type RemoteUrl } from './session';

function QrCode({ text }: { text: string }) {
    const path = useMemo(() => {
        const { data } = encode(text, { ecc: 'M', border: 0 });
        let d = '';
        data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
        return { d, size: data.length };
    }, [text]);

    return (
        <svg viewBox={`-2 -2 ${path.size + 4} ${path.size + 4}`} className="h-[220px] w-[220px] rounded-[14px] bg-white" shapeRendering="crispEdges">
            <path d={path.d} fill="#000" />
        </svg>
    );
}

function urlLabel(item: RemoteUrl): string {
    if (item.id === 'custom')   return t('remote.addrCustom', 'Server site');
    if (item.id === 'endpoint') return t('remote.addrServer', 'Server address');
    return item.name ?? item.id;
}

function hostOf(url: string): string {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function errorText(error: RemoteError): string {
    switch (error) {
        case 'unavailable': return t('remote.errUnavailable', 'This server has no address a phone can open. Ask the staff to set sd_phone_remote_url.');
        case 'cooldown':    return t('remote.errCooldown', 'Wait a moment before making another code.');
        case 'p2p':         return t('remote.errP2p', 'Could not connect directly to that phone. Try with both on the same Wi-Fi network.');
        case 'expired':     return t('remote.errExpired', 'The code expired before a phone scanned it.');
        default:            return t('remote.errServer', 'Could not make a code right now.');
    }
}

export function RemotePage({ onBack }: { onBack: () => void }) {
    const status = useRemoteStore(s => s.status);
    const error  = useRemoteStore(s => s.error);
    const urls   = useRemoteStore(s => s.urls);
    const choice = useRemoteStore(s => s.choice);
    const url    = urls.find(u => u.id === choice)?.url ?? null;

    return (
        <SubPage title={t('remote.title', 'Phone Remote')} backLabel={t('settings.settings', 'Settings')} onBack={onBack}>
            {status === 'connected' ? (
                <ListGroup footer={t('remote.connectedFooter', 'Touches and typing on your phone reach this one directly, without passing through the server.')}>
                    <ListRow
                        label={t('remote.connected', 'Connected')}
                        left={<Smartphone className="h-[20px] w-[20px] text-ios-green" strokeWidth={2} />}
                        chevron={false}
                        divider
                    />
                    <ListRow
                        label={t('remote.disconnect', 'Disconnect')}
                        left={<Unplug className="h-[19px] w-[19px] text-ios-red" strokeWidth={2} />}
                        destructive
                        chevron={false}
                        onPress={closeRemote}
                    />
                </ListGroup>
            ) : status === 'waiting' || status === 'connecting' ? (
                <>
                    <GroupCard
                        className="mx-4 flex flex-col items-center gap-3 px-4 py-5"
                        footer={t('remote.scanFooter', 'Point your phone camera at the code. It opens in any browser, and the code works once, for 5 minutes.')}
                    >
                        {url && <QrCode text={url} />}
                        <p className="text-center text-[15px] font-semibold text-black dark:text-white">
                            {status === 'connecting'
                                ? t('remote.connecting', 'Connecting…')
                                : t('remote.scan', 'Scan with your phone')}
                        </p>
                        {url && <p className="select-text break-all text-center text-[12px] text-ios-gray">{url}</p>}
                    </GroupCard>
                    {status === 'waiting' && urls.length > 1 && (
                        <ListGroup
                            header={t('remote.network', 'Network')}
                            footer={t('remote.networkFooter', 'If the phone does not open the page, pick the network it is connected to.')}
                        >
                            {urls.map((item, i) => (
                                <ListRow
                                    key={item.id}
                                    label={urlLabel(item)}
                                    sub={hostOf(item.url)}
                                    selected={item.id === choice}
                                    divider={i < urls.length - 1}
                                    onPress={() => chooseUrl(item.id)}
                                />
                            ))}
                        </ListGroup>
                    )}
                    <ListGroup>
                        <ListRow label={t('remote.cancel', 'Cancel')} destructive chevron={false} onPress={closeRemote} />
                    </ListGroup>
                </>
            ) : (
                <ListGroup
                    header={status === 'failed' ? errorText(error) : undefined}
                    footer={t('remote.idleFooter', 'Control this phone from your real phone: scan a code and touch its screen to tap, scroll and type here.')}
                >
                    <ListRow
                        label={status === 'opening' ? t('remote.making', 'Making a code…') : t('remote.makeCode', 'Show Code')}
                        left={<Smartphone className="h-[20px] w-[20px] text-ios-blue" strokeWidth={2} />}
                        chevron={false}
                        disabled={status === 'opening'}
                        onPress={() => void openRemote()}
                    />
                </ListGroup>
            )}
        </SubPage>
    );
}
