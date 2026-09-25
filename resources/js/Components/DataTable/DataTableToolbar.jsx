const PAGE_SIZES = [15, 25, 50, 100];

export default function DataTableToolbar({
    search,
    onSearchChange,
    placeholder = 'بحث...',
    perPage,
    onPerPageChange,
    total,
    showSearch = true,
    filterMenu,
}) {
    return (
        <div className="data-table-toolbar flex flex-wrap items-center justify-between gap-3">
            {showSearch ? (
                <div className="relative w-full sm:max-w-xs">
                    <svg
                        className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
                        />
                    </svg>
                    <input
                        type="text"
                        aria-label={placeholder}
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder={placeholder}
                        className="block w-full rounded-lg border-transparent bg-gray-50 py-2 ps-9 text-sm placeholder:text-gray-500 focus:border-gray-900 focus:bg-white focus:ring-gray-900"
                    />
                </div>
            ) : (
                <div />
            )}

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-4 text-sm text-gray-500">
                    {typeof total === 'number' && <span>{total.toLocaleString('ar')} نتيجة</span>}
                    <label className="flex items-center gap-2">
                        <span>عرض</span>
                        <select
                            value={perPage}
                            onChange={(e) => onPerPageChange(Number(e.target.value))}
                            className="rounded-md border-gray-300 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-gray-900"
                        >
                            {PAGE_SIZES.map((size) => (
                                <option key={size} value={size}>
                                    {size}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                {filterMenu}
            </div>
        </div>
    );
}
