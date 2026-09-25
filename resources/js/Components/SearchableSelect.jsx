import { useEffect, useMemo, useRef, useState } from 'react';

export default function SearchableSelect({
    id,
    value,
    onChange,
    options,
    placeholder = '---',
    searchPlaceholder = 'بحث...',
    emptyLabel = 'لا توجد نتائج',
    disabled = false,
    className = '',
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef(null);
    const searchRef = useRef(null);

    const selected = options.find((option) => String(option.value) === String(value));

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options;
    }, [options, query]);

    useEffect(() => {
        if (!open) {
            return;
        }

        function onPointerDown(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setOpen(false);
                setQuery('');
            }
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                setOpen(false);
                setQuery('');
            }
        }

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    useEffect(() => {
        if (open) {
            searchRef.current?.focus();
        }
    }, [open]);

    function select(option) {
        onChange(option ? String(option.value) : '');
        setOpen(false);
        setQuery('');
    }

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                type="button"
                id={id}
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
                className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-start text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
            >
                <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>{selected ? selected.label : placeholder}</span>
                <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
            </button>

            {open && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                    <div className="border-b border-gray-100 p-2">
                        <input
                            ref={searchRef}
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={searchPlaceholder}
                            className="block w-full rounded-md border-gray-300 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-gray-900"
                        />
                    </div>
                    <ul className="max-h-56 overflow-y-auto py-1 text-sm">
                        <li>
                            <button
                                type="button"
                                onClick={() => select(null)}
                                className="block w-full px-3 py-2 text-start text-gray-500 hover:bg-gray-50"
                            >
                                {placeholder}
                            </button>
                        </li>
                        {filtered.length === 0 ? (
                            <li className="px-3 py-2 text-gray-400">{emptyLabel}</li>
                        ) : (
                            filtered.map((option) => (
                                <li key={option.value}>
                                    <button
                                        type="button"
                                        onClick={() => select(option)}
                                        className={`block w-full px-3 py-2 text-start hover:bg-brand-50 ${
                                            String(option.value) === String(value) ? 'bg-brand-50 font-medium text-brand-700' : 'text-gray-700'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
