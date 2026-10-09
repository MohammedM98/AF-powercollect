import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** A field's popup stays on screen and outside clipped table and modal panels. */
export default function FieldPopover({ anchor, onClose, children, label, role = 'dialog', width = 320 }) {
    const panel = useRef(null);
    const [position, setPosition] = useState(null);

    useLayoutEffect(() => {
        const rect = anchor.getBoundingClientRect();
        const availableWidth = Math.min(width, window.innerWidth - 24);
        const height = Math.min(panel.current.offsetHeight, window.innerHeight - 24);
        const below = window.innerHeight - rect.bottom - 8;
        const top = below >= height ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
        setPosition({ top, left: Math.max(12, Math.min(rect.right - availableWidth, window.innerWidth - availableWidth - 12)), width: availableWidth, maxHeight: window.innerHeight - top - 12 });
    }, [anchor, width]);

    useEffect(() => {
        if (position) panel.current?.querySelector('[data-autofocus]')?.focus();
    }, [position]);

    useEffect(() => {
        function dismiss(event) {
            if (!panel.current?.contains(event.target) && !anchor.contains(event.target) && !event.target.closest?.('[data-field-popover]')) onClose(false);
        }
        function keyboard(event) {
            if (event.key === 'Escape') {
                const popovers = document.querySelectorAll('[data-field-popover]');
                if (panel.current !== popovers[popovers.length - 1]) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                onClose(true);
            }
        }
        function move(event) {
            if (!(event.target instanceof Node) || (!panel.current?.contains(event.target) && !event.target.closest?.('[data-field-popover]'))) onClose(false);
        }
        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('keydown', keyboard, true);
        window.addEventListener('resize', move);
        window.addEventListener('scroll', move, true);
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('keydown', keyboard, true);
            window.removeEventListener('resize', move);
            window.removeEventListener('scroll', move, true);
        };
    }, [anchor, onClose]);

    return createPortal(<div ref={panel} data-field-popover role={role} aria-label={label} dir="rtl" style={{ width: `min(${width}px, calc(100vw - 24px))`, maxHeight: 'calc(100dvh - 24px)', ...position, visibility: position ? 'visible' : 'hidden' }} className="field-popover fixed z-[80] overflow-y-auto rounded-2xl border border-gray-200 bg-surface p-3 text-base text-gray-900 shadow-lift" onClick={(event) => event.stopPropagation()}>{children}</div>, document.body);
}
