export default function DataTableFilterMenu({ groups, values, onChange, onClear }) {
    const activeCount = Object.values(values ?? {}).filter(Boolean).length;

    if (!groups || groups.length === 0) {
        return null;
    }

    return (
        <div className="flex w-full flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
            {groups.map((group) => (
                <label key={group.key} className="flex min-w-0 flex-col gap-1.5 w-full sm:w-44">
                    <span className="text-xs font-semibold text-gray-500">{group.label}</span>
                    <select
                        value={values?.[group.key] ?? ''}
                        onChange={(event) => onChange(group.key, event.target.value)}
                        className="block w-full rounded-md border-gray-200 py-1.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                    >
                        <option value="">الكل</option>
                        {group.options.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            ))}
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
