import { useEffect, useRef, useState } from 'react';
import { useFilterVisibility } from '@/hooks/useFilterVisibility';
import SearchableSelect from '@/Components/SearchableSelect';

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
        <div className="flex w-full flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
            {visibleGroups.map((group) => (
                <div key={group.key} className="flex min-w-0 flex-col gap-1.5 w-full sm:w-44">
                    <span className="text-xs font-semibold text-gray-500">{group.label}</span>
                    <SearchableSelect
                        value={values?.[group.key] ?? ''}
                        onChange={(value) => onChange(group.key, value)}
                        options={group.options}
                        placeholder="الكل"
                        searchPlaceholder={`بحث في ${group.label}...`}
                        emptyLabel="لا توجد نتائج"
                    />
                </div>
            ))}

            <div className="relative" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setOpen((current) => !current)}
                    aria-expanded={open}
                    className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
                        />
                    </svg>
                    الفلاتر الظاهرة
                </button>

                {open && (
                    <div className="absolute end-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                        {groups.map((group) => (
                            <label key={group.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                                <input
                                    type="checkbox"
                                    checked={isVisible(group.key)}
                                    onChange={() => toggleAndClear(group.key)}
                                    className="h-4 w-4 rounded border-gray-300 text-brand-600 shadow-sm focus:ring-brand-500"
                                />
                                {group.label}
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {activeCount > 0 && (
                <button
                    type="button"
                    onClick={onClear}
                    className="rounded-md px-3 py-2 text-xs font-medium text-brand-600 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                    مسح الفلاتر ({activeCount})
                </button>
            )}
        </div>
    );
}
