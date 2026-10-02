import { useEffect, useRef } from 'react';
import { usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { hideUnprintedColumns, paginatedProp } from '@/lib/print';

// The time printed under the heading, in the app's Arabic with Western digits.
const PRINTED_AT_FORMAT = new Intl.DateTimeFormat('ar-SY-u-nu-latn', { dateStyle: 'long', timeStyle: 'short' });

/**
 * A list page opened for printing (see lib/print.js): a heading with the
 * company, branch, title and time instead of the menus, then the page's
 * table with only the picked columns. The browser's print window opens
 * once the page has drawn; the bar on top (not printed) prints again or
 * closes the tab.
 */
export default function PrintSheet({ settings, children }) {
    const { props } = usePage();
    const sheetRef = useRef(null);
    const list = paginatedProp(props);
    const rowCount = list?.data?.length;
    const isCut = list && list.total > list.data.length && new URLSearchParams(window.location.search).get('print_all') === '1';

    useEffect(() => {
        const root = document.documentElement;
        root.classList.add('print-mode');
        root.classList.remove('dark');

        const sheet = sheetRef.current;
        const apply = () => hideUnprintedColumns(sheet, settings.columns);
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(sheet, { childList: true, subtree: true });

        let timeout;
        document.fonts.ready.then(() => {
            timeout = setTimeout(() => window.print(), 400);
        });

        return () => {
            observer.disconnect();
            clearTimeout(timeout);
            root.classList.remove('print-mode');
        };
    }, [settings]);

    return (
        <div className="min-h-screen bg-white text-gray-900">
            <div className="print-toolbar sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white/90 px-6 py-3 backdrop-blur">
                <span className="text-sm text-gray-500">
                    معاينة الطباعة
                    {isCut && <> — تُطبع أول {list.data.length.toLocaleString('en')} نتيجة من {list.total.toLocaleString('en')}</>}
                </span>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-2 rounded-control bg-brand-gradient px-4 py-2 text-sm font-semibold text-white"
                    >
                        <Icon name="printer" className="h-4 w-4" />
                        طباعة
                    </button>
                    <button
                        type="button"
                        onClick={() => window.close()}
                        className="rounded-control border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
                    >
                        إغلاق
                    </button>
                </div>
            </div>

            <div ref={sheetRef} className="print-sheet mx-auto max-w-screen-2xl px-6 py-6">
                <header className="print-sheet-header mb-4 flex items-start justify-between gap-6 border-b-2 border-gray-900 pb-3">
                    <div className="flex items-center gap-3">
                        <img src="/images/logo-af.webp" alt="" className="h-12 w-auto" />
                        <div>
                            <div className="text-lg font-bold">{props.appName}</div>
                            {props.auth?.user?.branchName && <div className="text-sm text-gray-600">{props.auth.user.branchName}</div>}
                        </div>
                    </div>
                    <div className="text-end">
                        <h1 className="text-xl font-bold">{settings.title}</h1>
                        <div className="mt-1 text-xs text-gray-600">
                            {PRINTED_AT_FORMAT.format(new Date())} — {props.auth?.user?.name}
                            {typeof rowCount === 'number' && <> — عدد الصفوف: {rowCount.toLocaleString('en')}</>}
                        </div>
                    </div>
                </header>
                <div className="print-sheet-content">{children}</div>
            </div>
        </div>
    );
}
