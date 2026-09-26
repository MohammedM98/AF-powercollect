import { useEffect, useRef, useState } from 'react';
import { useFilterVisibility } from '@/hooks/useFilterVisibility';
import SearchableSelect from '@/Components/SearchableSelect';
import Icon from '@/Components/Icon';

export default function DataTableFilterMenu({ tableKey, groups, values, onChange, onClear }) {
    const activeCount = Object.values(values ?? {}).filter(Boolean).length;
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);
    const groupKeys = (groups ?? []).map((group) => group.key);
    const { visibleKeys, isVisible, toggle } = useFilterVisibility(tableKey, groupKeys);

    useEffect(() => {
        if (!open) {
            return;
        }

        function onPointerDown(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setOpen(false);
            }
        }

        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [open]);

    if (!groups || groups.length === 0) {
        return null;
    }

    function toggleAndClear(key) {
        toggle(key);
        if (isVisible(key) && values?.[key]) {
            onChange(key, '');
        }
    }

    const visibleGroups = groups.filter((group) => visibleKeys.includes(group.key));

    return (
        <div className="flex w-full flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
            {visibleGroups.map((group) => (
                <div key={group.key} className="flex w-full min-w-0 flex-col gap-1.5 sm:w-44">
                    <span className={`flex items-center gap-1.5 text-xs font-semibold ${values?.[group.key] ? 'text-gray-900' : 'text-gray-500'}`}>
                        {group.label}
                        {values?.[group.key] && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />}
                    </span>
                    <SearchableSelect
                        value={values?.[group.key] ?? ''}
                        onChange={(value) => onChange(group.key, value)}
                        options={group.options}
                        placeholder="الكل"
                        searchPlaceholder={`بحث في ${group.label}...`}
                        emptyLabel="لا توجد نتائج"
                        active={Boolean(values?.[group.key])}
                    />
                </div>
            ))}

            <div className="relative" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setOpen((current) => !current)}
                    aria-expanded={open}
                    className="flex items-center gap-2 rounded-control border border-gray-200 bg-surface px-3.5 py-2.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                >
                    <Icon name="filter" className="h-4 w-4" />
                    الفلاتر الظاهرة
                    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-display text-[12px] text-gray-500">
                        {visibleKeys.length}/{groups.length}
                    </span>
                </button>

                {open && (
                    <div className="absolute end-0 z-20 mt-2 w-60 rounded-2xl border border-gray-100 bg-surface p-2 shadow-lift">
                        {groups.map((group) => (
                            <label
                                key={group.key}
                                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                                {group.label}
                                <input
                                    type="checkbox"
                                    role="switch"
                                    checked={isVisible(group.key)}
                                    onChange={() => toggleAndClear(group.key)}
                                    className="peer sr-only"
                                />
                                <span
                                    aria-hidden="true"
                                    className="relative h-5 w-9 shrink-0 rounded-full bg-gray-200 transition after:absolute after:start-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface after:shadow after:transition-all peer-checked:bg-brand-500 peer-checked:after:start-[18px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gray-900"
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {activeCount > 0 && (
                <button
                    type="button"
                    onClick={onClear}
                    className="rounded-control px-3 py-2.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"
                >
                    مسح الفلاتر ({activeCount})
                </button>
            )}
        </div>
    );
}
