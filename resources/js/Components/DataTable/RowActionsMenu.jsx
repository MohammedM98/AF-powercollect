import { useEffect, useRef, useState } from 'react';

// A "..." kebab button that opens a small dropdown of row actions. Pass
// menu items as children, styled like AuthenticatedLayout's dropdown:
// <button className="block w-full px-4 py-2 text-start text-sm text-gray-700 hover:bg-gray-50">...</button>
export default function RowActionsMenu({ children }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;

        function onClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        }

        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

    return (
        <div className="relative inline-block text-start" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                </svg>
            </button>

            {open && (
                <div
                    onClick={() => setOpen(false)}
                    className="absolute end-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-gray-100 bg-white py-1 shadow-lg"
                >
                    {children}
                </div>
            )}
        </div>
    );
}
