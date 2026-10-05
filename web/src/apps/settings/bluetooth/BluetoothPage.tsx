import { useCallback, useEffect, useRef, useState } from 'react';
import { Bluetooth, BluetoothOff, Car, Headphones, Info, Loader2, RefreshCw, Speaker, Watch } from 'lucide-react';

import { t } from '@/i18n';
import type { BluetoothDevice } from '@/stores/bluetoothStore';
import { useBluetoothStore } from '@/stores/bluetoothStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { ListGroup, ListRow, ToggleRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';

const RESCAN_MS = 2000;

export const DEVICE_GLYPHS: Record<string, typeof Bluetooth> = {
    vehicle: Car,
    audio:   Speaker,
    headset: Headphones,
    wearable: Watch,
};

function DeviceGlyph({ kind }: { kind: string }) {
    const Icon = DEVICE_GLYPHS[kind] ?? Bluetooth;
    return <Icon className="h-[20px] w-[20px] text-black dark:text-white" strokeWidth={2} />;
}

function statusOf(d: BluetoothDevice): string {
    if (d.connected) return t('settings.btConnected', 'Connected');
    if (!d.inRange)  return t('settings.btNotInRange', 'Not in range');
    if (d.full)      return t('settings.btInUse', 'In use');
    if (d.paired)    return t('settings.btNotConnected', 'Not connected');
    return '';
}

export function BluetoothPage({ onBack }: { onBack: () => void }) {
    const enabled = useBluetoothStore(s => s.enabled);
    const devices = useBluetoothStore(s => s.devices);
    const loading = useBluetoothStore(s => s.loading);
    const busyId  = useBluetoothStore(s => s.busyId);
    const scan       = useBluetoothStore(s => s.scan);
    const setEnabled = useBluetoothStore(s => s.setEnabled);
    const pair       = useBluetoothStore(s => s.pair);
    const forget     = useBluetoothStore(s => s.forget);
    const disconnect = useBluetoothStore(s => s.disconnect);

    const [confirm, setConfirm] = useState<BluetoothDevice | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    useEffect(() => {
        void scan();
        const id = window.setInterval(() => { if (enabledRef.current) void scan(true); }, RESCAN_MS);
        return () => window.clearInterval(id);
    }, [scan]);

    const onRowPress = useCallback(async (d: BluetoothDevice) => {
        if (busyId) return;
        if (d.connected) { void disconnect(d.id); return; }
        if (!d.inRange) { setConfirm(d); return; }
        if (d.full) return;
        const ok = await pair(d.id);
        if (!ok) setFailed(d.name);
    }, [busyId, disconnect, pair]);

    const infoButton = useCallback((d: BluetoothDevice) => (
        <button
            type="button"
            aria-label={t('settings.btForget', 'Forget Device')}
            onClick={e => { e.stopPropagation(); setConfirm(d); }}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full active:opacity-60"
        >
            <Info className="h-[19px] w-[19px] text-ios-blue" strokeWidth={2} />
        </button>
    ), []);

    const paired = devices.filter(d => d.paired);
    const other  = devices.filter(d => !d.paired);

    return (
        <SubPage title={t('settings.bluetooth', 'Bluetooth')} onBack={onBack}>
            <ListGroup>
                <ToggleRow
                    label={t('settings.bluetooth', 'Bluetooth')}
                    on={enabled}
                    onToggle={() => void setEnabled(!enabled)}
                />
            </ListGroup>

            {!enabled && (
                <EmptyState
                    icon={<BluetoothOff className="h-8 w-8 text-black/45 dark:text-white/45" strokeWidth={1.75} />}
                    title={t('settings.btOffTitle', 'Bluetooth is off')}
                    subtitle={t('settings.btOffBody', 'Turn it on to find devices around you.')}
                />
            )}

            {enabled && paired.length > 0 && (
                <ListGroup header={t('settings.btMyDevices', 'My Devices')}>
                    {paired.map((d, i) => (
                        <ListRow
                            key={d.id}
                            label={d.name}
                            value={statusOf(d)}
                            left={<DeviceGlyph kind={d.kind} />}
                            right={busyId === d.id
                                ? <Loader2 className="h-[16px] w-[16px] animate-spin text-ios-gray" />
                                : infoButton(d)}
                            divider={i < paired.length - 1}
                            onPress={() => void onRowPress(d)}
                        />
                    ))}
                </ListGroup>
            )}

            {enabled && (
                <ListGroup
                    header={t('settings.btOtherDevices', 'Other Devices')}
                    footer={t('settings.btFooter', 'Devices stay paired until you forget them, and reconnect on their own when you are back in range.')}
                >
                    {other.length === 0 ? (
                        <ListRow
                            label={loading
                                ? t('settings.btSearching', 'Searching…')
                                : t('settings.btNothingNearby', 'Nothing nearby')}
                            left={loading
                                ? <Loader2 className="h-[16px] w-[16px] animate-spin text-ios-gray" />
                                : <Bluetooth className="h-[20px] w-[20px] text-ios-gray" strokeWidth={2} />}
                            chevron={false}
                            divider
                        />
                    ) : other.map(d => (
                        <ListRow
                            key={d.id}
                            label={d.name}
                            value={statusOf(d)}
                            left={<DeviceGlyph kind={d.kind} />}
                            right={busyId === d.id
                                ? <Loader2 className="h-[16px] w-[16px] animate-spin text-ios-gray" />
                                : undefined}
                            divider
                            onPress={() => void onRowPress(d)}
                        />
                    ))}
                    <ListRow
                        label={t('settings.btScanAgain', 'Scan for Devices')}
                        left={<RefreshCw className={`h-[19px] w-[19px] text-ios-blue ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />}
                        onPress={() => { if (!loading) void scan(); }}
                    />
                </ListGroup>
            )}

            {confirm && (
                <AlertDialog
                    title={confirm.name}
                    message={t('settings.btForgetBody', 'Your phone will stop connecting to this device.')}
                    confirmLabel={t('settings.btForget', 'Forget Device')}
                    cancelLabel={t('common.cancel', 'Cancel')}
                    destructive
                    onConfirm={() => { const d = confirm; setConfirm(null); void forget(d.id); }}
                    onCancel={() => setConfirm(null)}
                />
            )}

            {failed && (
                <AlertDialog
                    title={t('settings.btFailedTitle', 'Could not connect')}
                    message={t('settings.btFailedBody', '{name} did not accept the connection.', { name: failed })}
                    confirmLabel={t('common.ok', 'OK')}
                    hideCancel
                    onConfirm={() => setFailed(null)}
                    onCancel={() => setFailed(null)}
                />
            )}
        </SubPage>
    );
}
