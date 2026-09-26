import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// The modals open right now, oldest first. Escape closes only the newest,
// so a confirmation shown over a form doesn't close the form with it.
const openModals = [];

/** Whether a modal is open, so a panel under it can leave the Escape key to the modal. */
export function isModalOpen() {
    return openModals.length > 0;
}

/**
 * Rendered into <body>, so a modal opened from inside another one (or
 * from inside an animated card) still covers the whole screen. `centered`
 * puts the panel in the middle of the screen instead of near the top.
 */
export default function Modal({ show, onClose, children, maxWidth = 'md', centered = false }) {
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        if (!show) {
            return;
        }

        const modal = {};
        openModals.push(modal);

        function onKeyDown(e) {
            if (e.key === 'Escape' && openModals.at(-1) === modal) {
                onCloseRef.current?.();
            }
        }

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            openModals.splice(openModals.indexOf(modal), 1);
        };
    }, [show]);

    if (!show) {
        return null;
    }

    const maxWidthClass = {
        sm: 'sm:max-w-sm',
        md: 'sm:max-w-md',
        lg: 'sm:max-w-lg',
        xl: 'sm:max-w-xl',
        '2xl': 'sm:max-w-2xl',
        '3xl': 'sm:max-w-3xl',
        '4xl': 'sm:max-w-4xl',
        '5xl': 'sm:max-w-5xl',
        '7xl': 'sm:max-w-7xl',
        full: 'sm:max-w-none',
    }[maxWidth];

    return createPortal(
        <div className={`fixed inset-0 z-50 overflow-y-auto px-4 py-6 sm:px-6 ${centered ? 'flex items-center' : ''}`} onClick={onClose}>
            <div className="animate-modal-backdrop fixed inset-0 bg-graphite-900/60 backdrop-blur-sm" />
            <div
                className={`animate-modal-panel relative mx-auto mb-6 mt-6 w-full transform overflow-hidden rounded-panel bg-surface shadow-2xl ring-1 ring-black/5 transition-all ${maxWidthClass}`}
                onClick={(e) => e.stopPropagation()}
            >
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-16 top-0 z-10 h-[2px] rounded-full bg-spectrum opacity-80" />
                {children}
            </div>
        </div>,
        document.body,
    );
}
