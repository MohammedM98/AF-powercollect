import { useEffect, useId, useMemo, useState } from 'react';
import Modal from '@/Components/Modal';
import { DialogHeader } from '@/Components/DialogFrame';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import Switch from '@/Components/Switch';
import TextInput from '@/Components/TextInput';
import { buildWorkbookModel, columnLetter, defaultExcelSettings, excelFileName, fitExcelSettings, formatExcelCell } from '@/lib/excelSheet';

const PREVIEW_ROWS = 80;

const LOOK = [
    ['header', 'العنوان والفرع والفترة أعلى الورقة'],
    ['totals', 'صف الإجمالي', 'ومجموع لكل مجموعة عند التجميع'],
    ['formulas', 'معادلات حيّة', 'الإجماليات SUBTOTAL تتحدّث عند التعديل أو التصفية في Excel'],
    ['freeze', 'تثبيت صف العناوين'],
    ['autofilter', 'فلتر على الأعمدة'],
    ['rtl', 'الورقة من اليمين إلى اليسار'],
    ['zebra', 'صفوف متناوبة اللون'],
    ['currency', 'رمز الشيكل في الخلايا', 'أوقفه إن كانت الأرقام ستُنقل إلى نظام محاسبي'],
    ['pageSetup', 'جاهز للطباعة من Excel', 'A4 بعرض الصفحة، وصف العناوين وترقيم الصفحات في كل صفحة'],
    ['criteria', 'ورقة «معايير التقرير»', 'الفرع والفترة والتصفية، ومن أعدّ الملف ومتى'],
];

/** Settings kept in this browser: the last export of each kind, and the templates saved for it. */
const store = {
    read(key, fallback) {
        try {
            const value = window.localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch {
            return fallback;
        }
    },
    write(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Private browsing: the settings simply aren't remembered.
        }
    },
};

/**
 * The Excel editor: the parts a page can export (see lib/excelSheet.js),
 * which of them the file holds, each part's columns and their order, how
 * its rows are grouped, the title and the file's name and look — beside a
 * preview of the sheets as Excel will show them — then a formatted .xlsx.
 * `loadParts` resolves the parts (a page may fetch rows for them); the
 * settings are kept per `storageKey`, with templates saved under names.
 */
export default function ExcelStudio({ show, onClose, title, storageKey, loadParts, defaults, meta = {} }) {
    const id = useId();
    const [parts, setParts] = useState(null);
    const [failed, setFailed] = useState(false);
    const [settings, setSettings] = useState(null);
    const [editing, setEditing] = useState(null);
    const [sheetIndex, setSheetIndex] = useState(0);
    const [activeCell, setActiveCell] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [templateName, setTemplateName] = useState('');
    const [templates, setTemplates] = useState([]);
    const [tab, setTab] = useState('settings');

    useEffect(() => {
        if (!show) {
            return;
        }

        let cancelled = false;
        setParts(null);
        setFailed(false);
        setError('');
        setTemplates(store.read(`excel-templates:${storageKey}`, []));
        Promise.resolve(loadParts())
            .then((loaded) => {
                if (cancelled) return;
                const base = defaultExcelSettings(loaded, defaults);
                setParts(loaded);
                setSettings(fitExcelSettings(store.read(`excel-settings:${storageKey}`, null), loaded, base));
                setEditing(loaded.find((part) => part.columns.length > 2)?.key ?? loaded[0]?.key ?? null);
                setSheetIndex(0);
                setActiveCell(null);
            })
            .catch(() => !cancelled && setFailed(true));

        return () => {
            cancelled = true;
        };
    }, [show]);

    const sheets = useMemo(() => (parts && settings ? buildWorkbookModel(parts, settings, meta) : []), [parts, settings, meta]);
    const sheet = sheets[Math.min(sheetIndex, Math.max(sheets.length - 1, 0))] ?? null;
    const firstFormula = useMemo(() => {
        for (const row of sheet?.rows ?? []) {
            const index = row.cells.findIndex((cell) => cell.f);
            if (index >= 0) return { address: `${columnLetter(index)}${row.row}`, formula: row.cells[index].f };
        }
        return null;
    }, [sheet]);
    const shownCell = activeCell ?? firstFormula;
    const part = parts?.find((candidate) => candidate.key === editing) ?? null;
    const partSettings = part ? settings.parts[part.key] : null;
    const fileName = settings ? excelFileName(settings.fileName) : '';

    const change = (patch) => setSettings((current) => ({ ...current, ...patch }));
    const changePart = (key, patch) => setSettings((current) => ({ ...current, parts: { ...current.parts, [key]: { ...current.parts[key], ...patch } } }));

    function moveColumn(index, step) {
        const columns = [...partSettings.columns];
        const target = index + step;
        if (target < 0 || target >= columns.length) return;
        [columns[index], columns[target]] = [columns[target], columns[index]];
        changePart(part.key, { columns });
    }

    function saveTemplate() {
        const name = templateName.trim();
        if (!name) return;
        const { title: _title, fileName: _fileName, ...look } = settings;
        const next = [...templates.filter((template) => template.name !== name), { name, settings: look }];
        setTemplates(next);
        store.write(`excel-templates:${storageKey}`, next);
        setTemplateName('');
    }

    function removeTemplate(name) {
        const next = templates.filter((template) => template.name !== name);
        setTemplates(next);
        store.write(`excel-templates:${storageKey}`, next);
    }

    async function download() {
        setSaving(true);
        setError('');
        try {
            const { workbookBlob, saveBlob } = await import('@/lib/excelWorkbook');
            saveBlob(await workbookBlob(sheets, settings), fileName);
            const { title: _title, fileName: _fileName, ...look } = settings;
            store.write(`excel-settings:${storageKey}`, look);
            onClose();
        } catch {
            setError('تعذّر إنشاء الملف. تحقّق من الاتصال وأعد المحاولة.');
        } finally {
            setSaving(false);
        }
    }

    const rowsCount = sheets.reduce((total, current) => total + (current.key === 'criteria' ? 0 : current.count), 0);

    return (
        <Modal show={show} onClose={saving ? undefined : onClose} maxWidth="full" panelClassName="sm:max-w-[1280px]">
            <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} dir="rtl" className="flex h-[min(92dvh,900px)] min-h-0 flex-col">
                <DialogHeader titleId={`${id}-title`} title={title} description="ملف ‎.xlsx منسّق: اختر الأجزاء والأعمدة والعنوان، وشاهد الورقة قبل التنزيل." icon="excel" tone="primary" onClose={onClose} closeDisabled={saving} />

                {failed ? (
                    <p role="alert" className="m-6 rounded-control bg-red-500/10 p-4 text-sm text-red-700">تعذّر تحميل بيانات التقرير. أغلق النافذة وأعد المحاولة.</p>
                ) : !parts || !settings ? (
                    <div className="flex flex-1 items-center justify-center p-10 text-sm text-gray-500" role="status">جارٍ تجهيز بيانات التقرير…</div>
                ) : (
                    <>
                        <div className="flex shrink-0 gap-1 border-b border-gray-100 p-2 lg:hidden" role="tablist">
                            {[['settings', 'الإعدادات'], ['preview', 'المعاينة']].map(([key, label]) => (
                                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`flex-1 rounded-control px-3 py-2 text-sm font-semibold ${tab === key ? 'bg-graphite-gradient text-white' : 'text-gray-600'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_minmax(0,1fr)]">
                            <div className={`min-h-0 overflow-y-auto border-gray-100 px-5 pb-6 lg:block lg:border-e ${tab === 'settings' ? 'block' : 'hidden'}`}>
                                <Section title="ماذا يحوي الملف" hint={`${parts.filter((candidate) => settings.parts[candidate.key].on).length} من ${parts.length}`}>
                                    <ul className="space-y-1.5">
                                        {parts.map((candidate) => (
                                            <li key={candidate.key} className={`flex items-center gap-2 rounded-control border px-3 py-2 ${editing === candidate.key ? 'border-excel-500/50 bg-excel-500/5' : 'border-gray-100'}`}>
                                                <input type="checkbox" className="rounded border-gray-300 text-excel-600 focus:ring-excel-500" checked={settings.parts[candidate.key].on} onChange={(event) => changePart(candidate.key, { on: event.target.checked })} aria-label={`تضمين ${candidate.name}`} />
                                                <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-2 text-start text-sm" onClick={() => setEditing(candidate.key)}>
                                                    <span className="truncate font-semibold text-gray-900">{candidate.name}</span>
                                                    <span className="shrink-0 font-display text-xs text-gray-500">{candidate.rows.length.toLocaleString('en')} صف</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </Section>

                                {part && (
                                    <Section title={`أعمدة «${part.name}»`} hint={`${partSettings.columns.filter((column) => column.on).length} من ${part.columns.length}`}>
                                        <ul className="overflow-hidden rounded-control border border-gray-100">
                                            {partSettings.columns.map((column, index) => {
                                                const definition = part.columns.find((candidate) => candidate.key === column.key);
                                                return (
                                                    <li key={column.key} className="flex items-center gap-2 border-b border-gray-100 px-3 py-1.5 last:border-b-0">
                                                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                                                            <input type="checkbox" className="rounded border-gray-300 text-excel-600 focus:ring-excel-500" checked={column.on} onChange={() => changePart(part.key, { columns: partSettings.columns.map((candidate) => (candidate.key === column.key ? { ...candidate, on: !candidate.on } : candidate)) })} />
                                                            <span className="truncate">{definition.label}</span>
                                                            {definition.sum && <span className="text-xs text-gray-400">مجموع</span>}
                                                        </label>
                                                        <button type="button" onClick={() => moveColumn(index, -1)} disabled={index === 0} className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label={`نقل ${definition.label} للأعلى`}><Icon name="arrow-up" className="h-4 w-4" /></button>
                                                        <button type="button" onClick={() => moveColumn(index, 1)} disabled={index === partSettings.columns.length - 1} className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label={`نقل ${definition.label} للأسفل`}><Icon name="arrow-down" className="h-4 w-4" /></button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        {(part.groupBys ?? []).length > 0 && (
                                            <label className="mt-3 block text-sm font-semibold text-gray-700">
                                                تجميع الصفوف حسب
                                                <select className="mt-1.5 block w-full rounded-control border-gray-200 text-sm" value={partSettings.groupBy} onChange={(event) => changePart(part.key, { groupBy: event.target.value })}>
                                                    <option value="">بدون تجميع</option>
                                                    {part.groupBys.map((group) => (
                                                        <option key={group.key} value={group.key}>{group.label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                        )}
                                    </Section>
                                )}

                                <Section title="العنوان والملف">
                                    <label className="block text-sm font-semibold text-gray-700">
                                        عنوان الملف (أول سطر في كل ورقة)
                                        <TextInput className="mt-1.5 w-full" value={settings.title} onChange={(event) => change({ title: event.target.value })} />
                                    </label>
                                    <label className="mt-3 block text-sm font-semibold text-gray-700">
                                        اسم الملف
                                        <TextInput className="mt-1.5 w-full font-display text-sm" dir="auto" value={settings.fileName} onChange={(event) => change({ fileName: event.target.value })} />
                                    </label>
                                </Section>

                                <Section title="الشكل داخل Excel">
                                    <div className="space-y-3">
                                        {LOOK.map(([key, label, hint]) => (
                                            <div key={key}>
                                                <Switch checked={Boolean(settings[key])} onChange={(value) => change({ [key]: value })} label={label} hint={hint} />
                                            </div>
                                        ))}
                                    </div>
                                </Section>

                                <Section title="القوالب" hint="تُحفظ في هذا المتصفح">
                                    {templates.length > 0 && (
                                        <div className="mb-3 flex flex-wrap gap-2">
                                            {templates.map((template) => (
                                                <span key={template.name} className="inline-flex items-center gap-1 rounded-control border border-gray-200 bg-surface ps-3 text-sm font-semibold">
                                                    <button type="button" className="py-1.5" onClick={() => setSettings((current) => fitExcelSettings({ ...template.settings, title: current.title, fileName: current.fileName }, parts, { ...defaultExcelSettings(parts, defaults), title: current.title, fileName: current.fileName }))}>{template.name}</button>
                                                    <button type="button" className="rounded p-1.5 text-gray-400 hover:text-red-600" onClick={() => removeTemplate(template.name)} aria-label={`حذف القالب ${template.name}`}><Icon name="close" className="h-3.5 w-3.5" /></button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <TextInput className="min-w-0 flex-1 text-sm" placeholder="اسم القالب، مثلاً: نسخة المحاسب" value={templateName} onChange={(event) => setTemplateName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && saveTemplate()} aria-label="اسم القالب" />
                                        <SecondaryButton onClick={saveTemplate} disabled={!templateName.trim()}>حفظ</SecondaryButton>
                                    </div>
                                </Section>
                            </div>

                            <div className={`min-h-0 flex-col bg-gray-50 p-4 lg:flex ${tab === 'preview' ? 'flex' : 'hidden'}`}>
                                <Preview sheet={sheet} sheets={sheets} sheetIndex={sheetIndex} onSheet={(index) => { setSheetIndex(index); setActiveCell(null); }} shownCell={shownCell} onCell={setActiveCell} settings={settings} />
                            </div>
                        </div>
                    </>
                )}

                <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
                    <div className="min-w-0 basis-full text-sm text-gray-500 sm:flex-1 sm:basis-0">
                        {settings && parts && (
                            <>
                                <bdi className="block truncate font-display font-bold text-gray-900">{fileName}</bdi>
                                <span className="block">{sheets.length} {sheets.length === 1 ? 'ورقة' : sheets.length === 2 ? 'ورقتان' : 'أوراق'} · {rowsCount.toLocaleString('en')} صف</span>
                            </>
                        )}
                        {error && <span role="alert" className="block text-red-700">{error}</span>}
                    </div>
                    <SecondaryButton onClick={onClose} disabled={saving}>إلغاء</SecondaryButton>
                    <PrimaryButton type="button" onClick={download} disabled={saving || !sheets.length}>
                        <Icon name="arrow-down-tray" className="h-4 w-4" />
                        {saving ? 'جارٍ إنشاء الملف…' : 'تنزيل ملف Excel'}
                    </PrimaryButton>
                </footer>
            </div>
        </Modal>
    );
}

function Section({ title, hint = null, children }) {
    return (
        <section className="border-b border-gray-100 py-5 last:border-b-0">
            <h3 className="mb-3 flex items-center justify-between gap-2 text-sm font-bold text-gray-900">
                {title}
                {hint && <span className="text-xs font-medium text-gray-500">{hint}</span>}
            </h3>
            {children}
        </section>
    );
}

const ROW_STYLE = {
    title: 'text-base font-bold text-brand-600',
    subtitle: 'font-bold text-gray-900',
    meta: 'text-xs text-gray-500',
    head: 'bg-graphite-gradient text-center font-bold text-white',
    group: 'bg-brand-500/10 font-bold text-brand-600',
    subtotal: 'bg-gray-100 font-bold',
    total: 'border-t-4 border-double border-gray-500 bg-gray-200 font-bold',
};

/** The sheets as Excel will show them: column letters, row numbers, the formula bar and a tab per sheet. */
function Preview({ sheet, sheets, sheetIndex, onSheet, shownCell, onCell, settings }) {
    if (!sheet) {
        return <p className="m-auto text-sm text-gray-500">اختر جزءاً واحداً على الأقل.</p>;
    }

    const shown = sheet.rows.slice(0, PREVIEW_ROWS);
    const width = 40 + sheet.widths.reduce((total, columnWidth) => total + columnWidth * 7.5, 0);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-control border border-gray-200 bg-surface">
            <div className="flex items-center gap-2 bg-excel-600 px-3 py-1.5 text-xs font-semibold text-white">
                <Icon name="excel" className="h-4 w-4" />
                معاينة الورقة
                <span className="ms-auto font-display">{sheet.rows.length.toLocaleString('en')} صف</span>
            </div>
            <div className="flex items-center border-b border-gray-200 text-xs" dir="ltr">
                <span className="min-w-16 border-e border-gray-200 px-3 py-1.5 font-display text-gray-600">{shownCell?.address ?? 'A1'}</span>
                <i className="border-e border-gray-200 px-3 py-1.5 text-gray-400">fx</i>
                <code className="truncate px-3 py-1.5" dir="auto">{shownCell ? (shownCell.formula ? `=${shownCell.formula}` : shownCell.text) : ''}</code>
            </div>
            <div className="min-h-0 flex-1 overflow-auto" dir={settings.rtl ? 'rtl' : 'ltr'}>
                <table className="border-collapse text-xs" style={{ width, tableLayout: 'fixed', fontFamily: 'Arial, sans-serif' }}>
                    <colgroup>
                        <col style={{ width: 40 }} />
                        {sheet.widths.map((columnWidth, index) => (
                            <col key={index} style={{ width: columnWidth * 7.5 }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="sticky top-0 border border-gray-200 bg-gray-50" />
                            {sheet.widths.map((_, index) => (
                                <th key={index} className="sticky top-0 border border-gray-200 bg-gray-50 px-1 py-0.5 font-normal text-gray-500">{columnLetter(index)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((row) => {
                            const merged = ['title', 'subtitle', 'meta', 'group'].includes(row.kind) && row.cells.length === 1;
                            return (
                                <tr key={row.row} className={`${ROW_STYLE[row.kind] ?? ''} ${row.zebra ? 'bg-gray-50' : ''}`}>
                                    <td className="border border-gray-200 bg-gray-50 px-1 text-center font-normal text-gray-400">{row.row}</td>
                                    {row.kind === 'blank' ? (
                                        <td colSpan={sheet.widths.length} className="h-5 border border-gray-200" />
                                    ) : merged ? (
                                        <td colSpan={sheet.widths.length} className="h-6 truncate border border-gray-200 px-2">{row.cells[0].v}</td>
                                    ) : (
                                        sheet.widths.map((_, index) => {
                                            const cell = row.cells[index] ?? { v: '' };
                                            const text = formatExcelCell(cell.v, cell.t, settings.currency);
                                            const address = `${columnLetter(index)}${row.row}`;
                                            const numeric = ['money', 'decimal', 'int'].includes(cell.t);
                                            return (
                                                <td key={index} onClick={() => onCell({ address, formula: cell.f, text })} className={`h-6 cursor-cell truncate border border-gray-200 px-2 ${numeric ? 'font-display tabular-nums' : ''} ${shownCell?.address === address ? 'outline outline-2 -outline-offset-2 outline-excel-500' : ''}`} style={{ textAlign: numeric ? (settings.rtl ? 'left' : 'right') : undefined }}>
                                                    {cell.f && <span className="me-1 text-[9px] italic text-excel-600">ƒ</span>}
                                                    {text}
                                                </td>
                                            );
                                        })
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {sheet.rows.length > PREVIEW_ROWS && <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">تعرض المعاينة أول {PREVIEW_ROWS} صفاً من {sheet.rows.length.toLocaleString('en')}؛ الملف يحوي كل الصفوف.</p>}
            <div className="flex gap-0.5 overflow-x-auto border-t border-gray-200 bg-gray-50 px-2" role="tablist" aria-label="أوراق الملف">
                {sheets.map((candidate, index) => (
                    <button key={candidate.key} type="button" role="tab" aria-selected={index === sheetIndex} onClick={() => onSheet(index)} className={`whitespace-nowrap border-t-[3px] px-3 py-1.5 text-xs ${index === sheetIndex ? 'border-excel-600 bg-surface font-bold text-excel-700' : 'border-transparent text-gray-500'}`}>
                        {candidate.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
