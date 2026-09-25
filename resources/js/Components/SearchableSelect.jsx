import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/Components/Icon';

export default function SearchableSelect({
    id,
    value,
    onChange,
    options,
    placeholder = '---',
    searchPlaceholder = 'بحث...',
    emptyLabel = 'لا توجد نتائج',
    disabled = false,
    active = false,
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
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                className={`flex w-full items-center justify-between gap-2 rounded-control border bg-surface px-3.5 py-2.5 text-start text-sm transition focus:outline-none focus-visible:border-gray-900 focus-visible:ring-4 focus-visible:ring-gray-900/10 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-gray-50 disabled:text-gray-500 ${
                    open || active ? 'border-gray-400' : 'border-gray-200 hover:border-gray-300'
                }`}
            >
                <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>{selected ? selected.label : placeholder}</span>
                <Icon name="chevron-down" className={`h-4 w-4 shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="animate-modal-panel absolute z-20 mt-2 w-full min-w-[12rem] overflow-hidden rounded-2xl border border-gray-100 bg-surface shadow-lift">
                    <div className="border-b border-gray-100 p-2">
                        <input
                            ref={searchRef}
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={searchPlaceholder}
                            className="block w-full py-2 text-sm"
                        />
                    </div>
                    <ul className="max-h-56 overflow-y-auto p-1.5 text-sm">
                        <li>
                            <button
                                type="button"
                                onClick={() => select(null)}
                                className="block w-full rounded-lg px-3 py-2 text-start text-gray-500 hover:bg-gray-50"
                            >
                                {placeholder}
                            </button>
                        </li>
                        {filtered.length === 0 ? (
                            <li className="px-3 py-2 text-gray-400">{emptyLabel}</li>
                        ) : (
                            filtered.map((option) => {
                                const isSelected = String(option.value) === String(value);

                                return (
                                    <li key={option.value}>
                                        <button
                                            type="button"
                                            onClick={() => select(option)}
                                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start hover:bg-gray-50 ${
                                                isSelected ? 'font-semibold text-gray-900' : 'text-gray-700'
                                            }`}
                                        >
                                            {option.label}
                                            {isSelected && <Icon name="check" className="h-4 w-4 shrink-0 text-brand-500" strokeWidth={2} />}
                                        </button>
                                    </li>
                                );
                            })
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
