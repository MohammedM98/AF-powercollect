import { useEffect, useRef, useState } from 'react';

// A "Filter" button that opens a popover of select dropdowns, one per
// entry in `groups`. `values` is the current filter[column] map, `onChange`
// is called with (column, value) whenever a select changes, and `onClear`
// resets every filter at once.
export default function DataTableFilterMenu({ groups, values, onChange, onClear }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const activeCount = Object.values(values ?? {}).filter(Boolean).length;

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

    if (!groups || groups.length === 0) {
        return null;
    }

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-50"
            >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
                    />
                </svg>
                فلترة
                {activeCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                        {activeCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute end-0 z-20 mt-2 w-64 rounded-xl border border-gray-100 bg-white p-4 shadow-lg">
                    <div className="space-y-3">
                        {groups.map((group) => (
                            <div key={group.key}>
                                <label className="mb-1 block text-xs font-semibold text-gray-500">{group.label}</label>
                                <select
                                    value={values?.[group.key] ?? ''}
                                    onChange={(e) => onChange(group.key, e.target.value)}
                                    className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
                                >
                                    <option value="">الكل</option>
                                    {group.options.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>

                    {activeCount > 0 && (
                        <button type="button" onClick={onClear} className="mt-3 text-xs font-medium text-brand-600 hover:underline">
                            مسح الفلاتر
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
