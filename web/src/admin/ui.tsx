import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import clsx from 'clsx';

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'subtle';

const BTN: Record<BtnVariant, string> = {
    primary: 'adm-btn adm-btn--primary',
    ghost:   'adm-btn',
    subtle:  'adm-btn adm-btn--subtle',
    danger:  'adm-btn adm-btn--danger',
};

interface BtnProps {
    children:  ReactNode;
    onClick?:  () => void;
    variant?:  BtnVariant;
    disabled?: boolean;
    busy?:     boolean;
    className?: string;
    title?:    string;
}

export function Btn({ children, onClick, variant = 'ghost', disabled, busy, className, title }: BtnProps) {
    return (
        <button
            type="button"
            title={title}
            disabled={disabled || busy}
            onClick={onClick}
            className={clsx(BTN[variant], className)}
        >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {children}
        </button>
    );
}

export function Segment<T extends string>({ value, options, onChange }: {
    value: T;
    options: { id: T; label: ReactNode }[];
    onChange: (next: T) => void;
}) {
    return (
        <div className="adm-segment">
            {options.map(o => (
                <button key={o.id} type="button" data-on={value === o.id} onClick={() => onChange(o.id)}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} className={clsx('adm-btn', on && 'adm-btn--on')}>
            {children}
        </button>
    );
}

const BADGE_TONES = {
    neutral: 'bg-white/[0.06] text-adm-2',
    green:   'bg-adm-ok/[0.12] text-adm-ok',
    red:     'bg-adm-danger/[0.12] text-adm-danger',
    blue:    'bg-white/[0.06] text-adm-1',
    amber:   'bg-adm-warn/[0.12] text-adm-warn',
};

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: keyof typeof BADGE_TONES; className?: string }) {
    return (
        <span
            className={clsx(
                'inline-flex h-[18px] items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] font-medium tabular-nums',
                BADGE_TONES[tone],
                className,
            )}
        >
            {children}
        </span>
    );
}

export function Checkbox({ checked, disabled, onChange, className }: {
    checked:   boolean;
    disabled?: boolean;
    onChange?: (next: boolean) => void;
    className?: string;
}) {
    return (
        <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={e => onChange?.(e.target.checked)}
            className={clsx('adm-check', className)}
        />
    );
}

export function OnlineDot({ online }: { online?: boolean }) {
    return (
        <span
            title={online ? 'Online' : 'Offline'}
            className={clsx('inline-block h-1.5 w-1.5 shrink-0 rounded-full', online ? 'bg-adm-ok' : 'bg-adm-4')}
        />
    );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
    return (
        <div className={clsx('adm-card', className)}>
            {(title !== undefined || actions !== undefined) && (
                <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-adm-hair px-4 py-2">
                    <div className="adm-label">{title}</div>
                    {actions}
                </div>
            )}
            {children}
        </div>
    );
}

export function Input({ value, onChange, placeholder, autoFocus, mono, type = 'text', onEnter }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    mono?: boolean;
    type?: string;
    onEnter?: () => void;
}) {
    return (
        <input
            type={type}
            value={value}
            autoFocus={autoFocus}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onEnter?.(); }}
            className={clsx('adm-input', mono && 'font-mono')}
        />
    );
}

export function Spinner({ className }: { className?: string }) {
    return <Loader2 size={16} className={clsx('animate-spin text-adm-3', className)} />;
}

export function CenterNote({ children }: { children: ReactNode }) {
    return <div className="flex min-h-[120px] items-center justify-center gap-2 text-[12.5px] text-adm-3">{children}</div>;
}

export function LoadMore({ onClick, loading, hasMore }: { onClick: () => void; loading: boolean; hasMore: boolean }) {
    if (!hasMore) return null;
    return (
        <div className="flex justify-center py-3">
            <Btn onClick={onClick} busy={loading}>Load more</Btn>
        </div>
    );
}

const escStack: Array<() => void> = [];

export function useEscapeHandler(handler: () => void) {
    const latest = useRef(handler);
    latest.current = handler;

    useEffect(() => {
        const entry = () => latest.current();
        escStack.push(entry);
        return () => {
            const at = escStack.indexOf(entry);
            if (at >= 0) escStack.splice(at, 1);
        };
    }, []);
}

export function closeTopmostOverlay() {
    const top = escStack[escStack.length - 1];
    if (!top) return false;
    top();
    return true;
}

export function useAdminSurface() {
    const [host, setHost] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setHost(document.querySelector<HTMLElement>('[data-admin-surface]'));
    }, []);
    return host;
}

const ModalClose = createContext<() => void>(() => {});

export function Modal({ title, children, onClose, width = 'w-[420px]' }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    width?: string;
}) {
    const [leaving, setLeaving] = useState(false);
    const host = useAdminSurface();

    const beginClose = useCallback(() => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) onClose();
        else setLeaving(true);
    }, [onClose]);

    useEscapeHandler(beginClose);

    const body = (
        <div
            data-modal
            className={clsx(
                'absolute inset-0 z-40 flex items-center justify-center bg-black/50',
                leaving ? 'adm-anim-fade-out' : 'adm-anim-fade-in',
            )}
            onMouseDown={beginClose}
            onAnimationEnd={e => { if (leaving && e.target === e.currentTarget) onClose(); }}
        >
            <div
                className={clsx(
                    'adm-scroll max-h-[80%] max-w-[92%] overflow-y-auto rounded-[12px] border border-adm-hair-strong bg-adm-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)]',
                    leaving ? 'adm-anim-panel-out' : 'adm-anim-panel-in',
                    width,
                )}
                onMouseDown={e => e.stopPropagation()}
            >
                <div className="flex h-12 items-center gap-3 pe-3 ps-5">
                    <span className="text-[14px] font-semibold text-adm-1">{title}</span>
                    <button type="button" onClick={beginClose} className="adm-btn adm-btn--icon ms-auto" aria-label="Close">
                        <X size={15} />
                    </button>
                </div>
                <div className="px-5 pb-5 pt-1">
                    <ModalClose.Provider value={beginClose}>{children}</ModalClose.Provider>
                </div>
            </div>
        </div>
    );

    return host ? createPortal(body, host) : body;
}

export function ConfirmModal({ title, body, confirmLabel = 'Confirm', danger, requireText, onConfirm, onClose }: {
    title: string;
    body: ReactNode;
    confirmLabel?: string;
    danger?: boolean;
    requireText?: string;
    onConfirm: () => Promise<void> | void;
    onClose: () => void;
}) {
    return (
        <Modal title={title} onClose={onClose} width="w-[400px]">
            <ConfirmBody
                body={body}
                confirmLabel={confirmLabel}
                danger={danger}
                requireText={requireText}
                onConfirm={onConfirm}
            />
        </Modal>
    );
}

function ConfirmBody({ body, confirmLabel, danger, requireText, onConfirm }: {
    body: ReactNode;
    confirmLabel: string;
    danger?: boolean;
    requireText?: string;
    onConfirm: () => Promise<void> | void;
}) {
    const close = useContext(ModalClose);
    const [typed, setTyped] = useState('');
    const [busy, setBusy]   = useState(false);
    const blocked = !!requireText && typed !== requireText;

    return (
        <div className="space-y-4 text-[13px] leading-relaxed text-adm-2">
            <div>{body}</div>
            {requireText && (
                <div className="space-y-1.5">
                    <div className="adm-label">Type <span className="font-mono text-adm-1">{requireText}</span> to confirm</div>
                    <Input value={typed} onChange={setTyped} mono autoFocus />
                </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="adm-btn" onClick={close} disabled={busy}>Cancel</button>
                <button
                    type="button"
                    className={clsx('adm-btn', danger ? 'adm-btn--danger-solid' : 'adm-btn--primary')}
                    disabled={blocked || busy}
                    onClick={() => {
                        setBusy(true);
                        void Promise.resolve(onConfirm()).finally(() => { setBusy(false); close(); });
                    }}
                >
                    {busy && <Loader2 size={13} className="animate-spin" />}
                    {confirmLabel}
                </button>
            </div>
        </div>
    );
}

export function PromptModal({ title, body, placeholder, mono, initial = '', submitLabel = 'Save', validate, onSubmit, onClose }: {
    title: string;
    body?: ReactNode;
    placeholder?: string;
    mono?: boolean;
    initial?: string;
    submitLabel?: string;
    validate?: (v: string) => string | null;
    onSubmit: (value: string) => Promise<void> | void;
    onClose: () => void;
}) {
    const [value, setValue] = useState(initial);
    const [busy, setBusy]   = useState(false);
    const error = validate ? validate(value) : null;
    const submit = () => {
        if (error || busy) return;
        setBusy(true);
        void Promise.resolve(onSubmit(value)).finally(() => { setBusy(false); onClose(); });
    };
    return (
        <Modal title={title} onClose={onClose}>
            <div className="space-y-3 text-[13px] leading-relaxed text-adm-2">
                {body && <div>{body}</div>}
                <Input value={value} onChange={setValue} placeholder={placeholder} mono={mono} autoFocus onEnter={submit} />
                {value !== '' && error && <div className="text-[12px] text-adm-danger">{error}</div>}
                <div className="flex justify-end gap-2 pt-2">
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={value === '' || !!error} busy={busy} onClick={submit}>{submitLabel}</Btn>
                </div>
            </div>
        </Modal>
    );
}

export interface ToastMsg { id: number; text: string; error?: boolean }

export function ToastHost({ toasts }: { toasts: ToastMsg[] }) {
    return (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
            {toasts.map(t => (
                <div
                    key={t.id}
                    className="adm-anim-toast flex h-9 items-center gap-2.5 rounded-lg border border-adm-hair-strong bg-adm-surface-3 pe-3.5 ps-3 text-[12.5px] font-medium text-adm-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                >
                    <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', t.error ? 'bg-adm-danger' : 'bg-adm-ok')} />
                    {t.text}
                </div>
            ))}
        </div>
    );
}

export function useToasts() {
    const [toasts, setToasts] = useState<ToastMsg[]>([]);
    const next = useRef(1);
    const push = useCallback((text: string, error = false) => {
        const id = next.current++;
        setToasts(t => [...t, { id, text, error }]);
        window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
    }, []);
    return { toasts, push };
}
