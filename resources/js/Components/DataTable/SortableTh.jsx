export default function SortableTh({ column, label, sortState, onSort, className = '' }) {
    const { sort, direction } = sortState;
    const active = sort === column;

    return (
        <th aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-6 py-3 ${className}`}>
            <button
                type="button"
                onClick={() => onSort(column)}
                className="inline-flex items-center gap-1 rounded text-xs font-medium text-gray-500 transition hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
                {label}
                {active ? (
                    direction === 'asc' ? (
                        <svg className="h-3.5 w-3.5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                        </svg>
                    ) : (
                        <svg className="h-3.5 w-3.5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    )
                ) : (
                    <svg className="h-3.5 w-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                    </svg>
                )}
            </button>
        </th>
    );
}
