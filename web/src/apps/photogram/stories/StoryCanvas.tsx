import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

export function StoryCanvas({ boxRef, className = '', style, children }: {
    boxRef?:    RefObject<HTMLDivElement | null>;
    className?: string;
    style?:     CSSProperties;
    children:   ReactNode;
}) {
    const outer = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);

    useLayoutEffect(() => {
        const el = outer.current;
        if (!el) return;
        const fit = () => {
            const w = Math.min(el.clientWidth, el.clientHeight * 9 / 16);
            setSize(prev => (prev && prev.w === w ? prev : { w, h: w * 16 / 9 }));
        };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div ref={outer} className="absolute inset-0 flex items-center justify-center">
            {size && (
                <div ref={boxRef} className={`relative overflow-hidden ${className}`} style={{ width: size.w, height: size.h, ...style }}>
                    {children}
                </div>
            )}
        </div>
    );
}

export function TagLabel({ handle }: { handle: string }) {
    return (
        <span className="block whitespace-nowrap rounded-[10px] bg-white px-3 py-1.5 text-[16px] font-semibold text-black shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
            @{handle}
        </span>
    );
}
