import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import FieldPopover from '@/Components/FieldPopover';

/**
 * A drop-down with a search box. Each option is `{ value, label, hint? }`:
 * `hint` is a quiet second part (a price, say) shown beside the label,
 * in the list and on the closed field, and searched with it. `required`
 * (with `name`) makes the form's own check report a missing choice.
 *
 * For a list too long to send with the page, pass `loadOptions(search)`,
 * which resolves `{ options, hasMore }`: the list is then fetched as the
 * box opens and as the user types, instead of filtered here. `options`
 * is what shows before any search, such as the option already chosen.
 * `onChange` also gets the option picked, so a caller can read its extras.
 */
export default function SearchableSelect({
    id,
    name,
    required = false,
    value,
    onChange,
    options,
    placeholder = '---',
    searchPlaceholder = 'بحث...',
    emptyLabel = 'لا توجد نتائج',
    disabled = false,
    active = false,
    className = '',
    loadOptions = null,
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    // With loadOptions: what the last search found (null before any), whether more matched, and whether one is under way or failed.
    const [found, setFound] = useState(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [chosen, setChosen] = useState(null);
    const requestNumber = useRef(0);
    const containerRef = useRef(null);
    const searchRef = useRef(null);
    const buttonRef = useRef(null);
    const close = useCallback((restore) => {
        setOpen(false);
        setQuery('');
        if (restore) buttonRef.current?.focus();
    }, []);

    const isMatch = (option) => String(option.value) === String(value);
    const selected = options.find(isMatch) ?? found?.find(isMatch) ?? (chosen && isMatch(chosen) ? chosen : undefined);

    const filtered = useMemo(() => {
        if (loadOptions) {
            return found ?? [];
        }

        const q = query.trim().toLowerCase();
        return q ? options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(q)) : options;
    }, [options, query, loadOptions, found]);

    // A new way of searching (another branch picked, say) makes the old results stale.
    useEffect(() => {
        setFound(null);
    }, [loadOptions]);

    // Search as the box opens and as the user types; only the latest search counts.
    useEffect(() => {
        if (!loadOptions || !open) {
            return undefined;
        }

        const request = ++requestNumber.current;
        setLoading(true);
        setFailed(false);

        const timeout = setTimeout(
            () => {
                Promise.resolve(loadOptions(query.trim()))
                    .then((result) => {
                        if (request === requestNumber.current) {
                            setFound(result.options);
                            setHasMore(Boolean(result.hasMore));
                            setLoading(false);
                        }
                    })
                    .catch(() => {
                        if (request === requestNumber.current) {
                            setFailed(true);
                            setLoading(false);
                        }
                    });
            },
            query ? 250 : 0,
        );

        return () => clearTimeout(timeout);
    }, [open, query, loadOptions]);

    useEffect(() => {
        if (open) {
            searchRef.current?.focus();
        }
    }, [open]);

    function select(option) {
        setChosen(option);
        onChange(option ? String(option.value) : '', option);
        close(true);
    }

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                ref={buttonRef}
                type="button"
                id={id}
                disabled={disabled}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                className={`flex h-[42px] w-full items-center justify-between gap-2 rounded-control border bg-surface px-3 text-start text-base leading-6 transition focus:outline-none focus-visible:border-gray-900 focus-visible:ring-4 focus-visible:ring-gray-900/10 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-gray-50 disabled:text-gray-500 ${
                    open || active ? 'border-gray-400' : 'border-gray-200 hover:border-gray-300'
                }`}
            >
                <span className={`flex min-w-0 items-baseline gap-2 ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
                    <span className="truncate">{selected ? selected.label : placeholder}</span>
                    {selected?.hint && <span className="shrink-0 text-sm text-gray-500">{selected.hint}</span>}
                </span>
                <Icon name="chevron-down" className={`h-4 w-4 shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>

            {required && (
                <input
                    type="text"
                    name={name}
                    required
                    value={value ?? ''}
                    onChange={() => {}}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                    // The form focuses the first missing field; send it on to the drop-down.
                    onFocus={() => buttonRef.current?.focus()}
                />
            )}

            {open && (
                <FieldPopover anchor={buttonRef.current} onClose={close} label={searchPlaceholder} width={Math.max(260, buttonRef.current.offsetWidth)}>
                    <div className="border-b border-gray-100 p-2">
                        <input
                            ref={searchRef}
                            data-autofocus
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
                        {failed ? (
                            <li className="px-3 py-2 text-red-600">تعذّر تحميل الخيارات، حاول مرة أخرى.</li>
                        ) : loading && found === null ? (
                            <li className="px-3 py-2 text-gray-400">جارٍ التحميل...</li>
                        ) : filtered.length === 0 ? (
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
                                            <span className="min-w-0 truncate">{option.label}</span>
                                            <span className="flex shrink-0 items-center gap-2">
                                                {option.hint && <span className="text-xs text-gray-500">{option.hint}</span>}
                                                {isSelected && <Icon name="check" className="h-4 w-4 shrink-0 text-brand-500" strokeWidth={2} />}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })
                        )}
                    </ul>
                    {loadOptions && hasMore && !failed && (
                        <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">اكتب للبحث عن المزيد من النتائج.</p>
                    )}
                </FieldPopover>
            )}
        </div>
    );
}
