import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { extractSummary, extractTable, paginatedProp, printScopeUrl } from '@/lib/print';
import {
    defaultLayout,
    deleteTemplate,
    fitLayout,
    pageCss,
    paperSize,
    rememberedLayout,
    rememberLayout,
    savedTemplates,
    saveTemplate,
} from '@/lib/printLayout';
import PrintPaper from './PrintPaper';
import PrintSettingsPanel from './PrintSettingsPanel';

/** Pixels in a millimetre on screen (96 dpi). */
const PX_PER_MM = 96 / 25.4;

const ZOOMS = [
    { value: 'fit', label: 'ملاءمة الشاشة' },
    { value: '0.5', label: '50%' },
    { value: '0.75', label: '75%' },
    { value: '1', label: '100%' },
];

/**
 * A list page opened for printing (see lib/print.js): the settings on one
 * side and the sheet as it will print on the other, changing as the
 * settings change. The page itself is drawn out of sight and its table
 * read from it, so the printout lists the same rows in the same order,
 * then laid out however the user likes. The layout is remembered for the
 * page, and can be kept as named templates.
 */
export default function PrintDesigner({ settings, children }) {
    const { props } = usePage();
    const sourceRef = useRef(null);
    const stageRef = useRef(null);
    const pageKey = window.location.pathname;
    const [table, setTable] = useState(null);
    const [summary, setSummary] = useState('');
    const [layout, setLayout] = useState(null);
    const [templates, setTemplates] = useState(() => savedTemplates(pageKey));
    const [zoom, setZoom] = useState('fit');
    const [fitZoom, setFitZoom] = useState(1);
    const list = paginatedProp(props);
    const isCut = settings.allRows && list && list.total > list.data.length;
    const context = { appName: props.appName, branchName: props.auth?.user?.branchName, userName: props.auth?.user?.name };

    function freshLayout(columns) {
        return defaultLayout({ columns, title: settings.title || document.title, company: props.appName ?? '' });
    }

    // The printout is light whatever the app's theme.
    useEffect(() => {
        const root = document.documentElement;
        root.classList.add('print-mode');
        root.classList.remove('dark');

        return () => root.classList.remove('print-mode');
    }, []);

    // Read the page's table now and whenever it redraws.
    useEffect(() => {
        let frame = null;

        function read() {
            frame = null;
            const extracted = extractTable(sourceRef.current);

            if (extracted) {
                setTable(extracted);
                setSummary(extractSummary(sourceRef.current));
                setLayout((current) => {
                    const fresh = freshLayout(extracted.columns);

                    return fitLayout(current ?? rememberedLayout(pageKey), fresh);
                });
            }
        }

        read();
        const observer = new MutationObserver(() => {
            frame ??= requestAnimationFrame(read);
        });
        observer.observe(sourceRef.current, { childList: true, subtree: true, characterData: true });

        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (layout) {
            rememberLayout(pageKey, layout);
        }
    }, [layout, pageKey]);

    // "Fit" scales the sheet to the width beside the settings.
    useLayoutEffect(() => {
        if (!layout || !stageRef.current) {
            return;
        }

        const stage = stageRef.current;
        const update = () => setFitZoom(Math.min(1, (stage.clientWidth - 48) / (paperSize(layout).width * PX_PER_MM)));
        update();
        const observer = new ResizeObserver(update);
        observer.observe(stage);

        return () => observer.disconnect();
    }, [layout]);

    function applyTemplate(name) {
        const template = templates.find((item) => item.name === name);

        if (template && table) {
            setLayout(fitLayout(template.layout, freshLayout(table.columns)));
        }
    }

    return (
        <div className="pd-root min-h-screen bg-gray-100 text-gray-900">
            {layout && <style>{pageCss(layout)}</style>}

            <div
                role="toolbar"
                aria-label="أدوات الطباعة"
                className="pd-toolbar sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6"
            >
                <span className="flex items-center gap-2 font-bold text-gray-900">
                    <Icon name="printer" className="h-5 w-5" />
                    تصميم الطباعة
                </span>
                {isCut && (
                    <span role="status" className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700">
                        <Icon name="warning" className="h-4 w-4 shrink-0" />
                        تُطبع أول {list.data.length.toLocaleString('en')} نتيجة من {list.total.toLocaleString('en')}
                    </span>
                )}
                <div className="ms-auto flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                        <Icon name="search" className="h-4 w-4" />
                        <span className="sr-only sm:not-sr-only">التكبير</span>
                        <select value={zoom} onChange={(e) => setZoom(e.target.value)} className="!py-1.5 text-sm" aria-label="تكبير المعاينة">
                            {ZOOMS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <PrimaryButton type="button" onClick={() => window.print()} disabled={!layout} autoFocus>
                        <Icon name="printer" className="h-4 w-4" />
                        طباعة
                    </PrimaryButton>
                    <SecondaryButton onClick={() => window.close()}>
                        <Icon name="close" className="h-4 w-4" />
                        إغلاق
                    </SecondaryButton>
                </div>
            </div>

            <div className="pd-body lg:grid lg:grid-cols-[380px_minmax(0,1fr)]">
                <aside
                    aria-label="إعدادات الطباعة"
                    className="pd-panel border-e border-gray-200 bg-white lg:sticky lg:top-[65px] lg:h-[calc(100vh-65px)] lg:overflow-y-auto"
                >
                    {layout ? (
                        <PrintSettingsPanel
                            layout={layout}
                            onChange={setLayout}
                            scope={{
                                allRows: settings.allRows,
                                total: list?.total,
                                onChange: (allRows) => window.location.assign(printScopeUrl(allRows)),
                            }}
                            templates={templates}
                            onSaveTemplate={(name) => setTemplates(saveTemplate(pageKey, name, layout))}
                            onApplyTemplate={applyTemplate}
                            onDeleteTemplate={(name) => setTemplates(deleteTemplate(pageKey, name))}
                            onReset={() => table && setLayout(freshLayout(table.columns))}
                        />
                    ) : (
                        <p className="p-6 text-sm text-gray-500">جارٍ تجهيز الجدول...</p>
                    )}
                </aside>

                <main ref={stageRef} className="pd-stage overflow-auto p-6">
                    {layout && table ? (
                        <PrintPaper layout={layout} table={table} summary={summary} context={context} zoom={zoom === 'fit' ? fitZoom : Number(zoom)} />
                    ) : (
                        !table && <p className="text-center text-sm text-gray-500">لا يوجد جدول للطباعة في هذه الصفحة.</p>
                    )}
                </main>
            </div>

            {/* The page itself, out of sight, for its table to be read from. */}
            <div ref={sourceRef} className="pd-source" aria-hidden="true" inert>
                {children}
            </div>
        </div>
    );
}
