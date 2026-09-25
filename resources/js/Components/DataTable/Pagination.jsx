import { router } from '@inertiajs/react';

function pageNumbers(current, last) {
    const delta = 1;
    const range = [];

    for (let i = Math.max(2, current - delta); i <= Math.min(last - 1, current + delta); i++) {
        range.push(i);
    }

    if (current - delta > 2) {
        range.unshift('…');
    }
    if (current + delta < last - 1) {
        range.push('…');
    }

    range.unshift(1);
    if (last > 1) {
        range.push(last);
    }

    return [...new Set(range)];
}

export default function Pagination({ meta, filters, baseUrl, extraParams = {} }) {
    const { current_page: current, last_page: last, from, to, total } = meta;

    if (total === 0) {
        return null;
    }

    function goTo(page) {
        router.get(baseUrl, { ...extraParams, ...filters, page }, { preserveState: true, preserveScroll: true, replace: true });
    }

    return (
        <div className="data-table-pagination flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-gray-500">
                عرض {from}–{to} من {total}
            </p>

            {last > 1 && (
                <nav aria-label="صفحات الجدول" className="flex flex-wrap items-center justify-center gap-1">
                    <button
                        type="button"
                        disabled={current === 1}
                        onClick={() => goTo(current - 1)}
                        className="rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        السابق
                    </button>

                    {pageNumbers(current, last).map((page, index) =>
                        page === '…' ? (
                            <span key={`ellipsis-${index}`} className="px-2 text-sm text-gray-400">
                                …
                            </span>
                        ) : (
                            <button
                                type="button"
                                key={page}
                                aria-current={page === current ? 'page' : undefined}
                                onClick={() => goTo(page)}
                                className={`min-w-[2.25rem] rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                                    page === current
                                        ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                                        : 'text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {page}
                            </button>
                        ),
                    )}

                    <button
                        type="button"
                        disabled={current === last}
                        onClick={() => goTo(current + 1)}
                        className="rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        التالي
                    </button>
                </nav>
            )}
        </div>
    );
}
