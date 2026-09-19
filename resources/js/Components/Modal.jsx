import { useEffect } from 'react';

export default function Modal({ show, onClose, children, maxWidth = 'md' }) {
    useEffect(() => {
        if (!show) {
            return;
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                onClose?.();
            }
        }

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [show, onClose]);

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
    }[maxWidth];

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto px-4 py-6 sm:px-6" onClick={onClose}>
            <div className="animate-modal-backdrop fixed inset-0 bg-gray-900/60 backdrop-blur-sm" />
            <div
                className={`animate-modal-panel relative mx-auto mb-6 mt-6 w-full transform overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 transition-all ${maxWidthClass}`}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}
