import { useId, useState } from 'react';
import Icon from '@/Components/Icon';
import ChoiceChips from '@/Components/ChoiceChips';
import Switch from '@/Components/Switch';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import ConfirmDialog from '@/Components/ConfirmDialog';
import { moveColumn, PAPER_SIZES } from '@/lib/printLayout';

const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900';

const ORIENTATIONS = [
    { value: 'portrait', label: 'طولي', icon: 'portrait' },
    { value: 'landscape', label: 'عرضي', icon: 'landscape' },
];

const DENSITIES = [
    { value: 'compact', label: 'مضغوطة', icon: 'rows-compact' },
    { value: 'normal', label: 'عادية', icon: 'rows-comfortable' },
    { value: 'relaxed', label: 'واسعة', icon: 'list' },
];

const BORDERS = [
    { value: 'grid', label: 'شبكة كاملة', icon: 'table' },
    { value: 'rows', label: 'خطوط أفقية', icon: 'list' },
    { value: 'none', label: 'بدون خطوط', icon: 'close' },
];

const ALIGNMENTS = [
    { value: 'auto', label: 'تلقائي' },
    { value: 'start', label: 'يمين' },
    { value: 'center', label: 'وسط' },
    { value: 'end', label: 'يسار' },
];

const ACCENTS = [
    { value: '#111827', label: 'أسود' },
    { value: '#A51D26', label: 'عنابي' },
    { value: '#1D4ED8', label: 'أزرق' },
    { value: '#047857', label: 'أخضر' },
    { value: '#6B7280', label: 'رمادي' },
];

/** One part of the settings, opened or folded by its title. */
function Section({ icon, title, children, open = false }) {
    return (
        <details open={open} className="group border-b border-gray-100">
            <summary
                className={`flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 text-sm font-bold text-gray-900 hover:bg-gray-50 ${FOCUS_RING} [&::-webkit-details-marker]:hidden`}
            >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                    <Icon name={icon} className="h-4 w-4" />
                </span>
                <span className="flex-1">{title}</span>
                <Icon name="chevron-down" className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-4 px-5 pb-5 pt-1">{children}</div>
        </details>
    );
}

function Field({ label, children, hint }) {
    const id = useId();

    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-gray-700">
                {label}
            </label>
            {children(id)}
            {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
        </div>
    );
}

function Group({ label, children }) {
    return (
        <div>
            <span className="mb-1.5 block text-xs font-semibold text-gray-700">{label}</span>
            {children}
        </div>
    );
}

/** A small icon-only button, named for screen readers and in its tooltip. */
function IconButton({ icon, label, onClick, disabled = false, tone = 'gray' }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-surface transition hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-30 ${
                tone === 'danger' ? 'text-brand-600' : 'text-gray-600 hover:text-gray-900'
            } ${FOCUS_RING}`}
        >
            <Icon name={icon} className="h-4 w-4" />
        </button>
    );
}

/**
 * Every setting of the printout, in folding sections: templates, which
 * rows, the paper, the heading, the columns (shown, named, ordered,
 * aligned, totalled), the table's look and the footer. Each change shows
 * in the preview at once.
 */
export default function PrintSettingsPanel({ layout, onChange, scope, templates, onSaveTemplate, onApplyTemplate, onDeleteTemplate, onReset }) {
    const [templateName, setTemplateName] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [confirming, setConfirming] = useState(null);

    function set(key, value) {
        onChange({ ...layout, [key]: value });
    }

    function setIn(group, key, value) {
        onChange({ ...layout, [group]: { ...layout[group], [key]: value } });
    }

    function setColumn(index, changes) {
        set(
            'columns',
            layout.columns.map((column, position) => (position === index ? { ...column, ...changes } : column)),
        );
    }

    function setSignature(index, label) {
        setIn(
            'footer',
            'signatures',
            layout.footer.signatures.map((item, position) => (position === index ? label : item)),
        );
    }

    const shownCount = layout.columns.filter((column) => column.visible).length;

    return (
        <div>
            <Section icon="folder" title="القوالب المحفوظة" open>
                <p className="text-xs text-gray-500">يُحفظ آخر تصميم لهذه الصفحة تلقائيًا. احفظه باسم لتعود إليه متى شئت.</p>
                {templates.length > 0 && (
                    <Field label="قالب محفوظ">
                        {(id) => (
                            <div className="flex gap-2">
                                <select
                                    id={id}
                                    value={selectedTemplate}
                                    onChange={(e) => setSelectedTemplate(e.target.value)}
                                    className="block min-w-0 flex-1 text-sm"
                                >
                                    <option value="">— اختر قالبًا —</option>
                                    {templates.map((template) => (
                                        <option key={template.name} value={template.name}>
                                            {template.name}
                                        </option>
                                    ))}
                                </select>
                                <SecondaryButton onClick={() => onApplyTemplate(selectedTemplate)} disabled={selectedTemplate === ''}>
                                    <Icon name="check" className="h-4 w-4" />
                                    تطبيق
                                </SecondaryButton>
                                <IconButton
                                    icon="trash"
                                    tone="danger"
                                    label={selectedTemplate ? `حذف القالب «${selectedTemplate}»` : 'حذف القالب'}
                                    disabled={selectedTemplate === ''}
                                    onClick={() => setConfirming('delete')}
                                />
                            </div>
                        )}
                    </Field>
                )}
                <Field label="حفظ التصميم الحالي كقالب">
                    {(id) => (
                        <form
                            className="flex gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                onSaveTemplate(templateName.trim());
                                setSelectedTemplate(templateName.trim());
                                setTemplateName('');
                            }}
                        >
                            <input
                                id={id}
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="مثلًا: كشف شهري للإدارة"
                                className="block min-w-0 flex-1 text-sm"
                            />
                            <PrimaryButton type="submit" disabled={templateName.trim() === ''}>
                                <Icon name="plus" className="h-4 w-4" />
                                حفظ
                            </PrimaryButton>
                        </form>
                    )}
                </Field>
                <SecondaryButton onClick={() => setConfirming('reset')} className="w-full">
                    <Icon name="undo" className="h-4 w-4" />
                    إرجاع كل الإعدادات إلى الأصل
                </SecondaryButton>
            </Section>

            <Section icon="list" title="الصفوف" open>
                <ChoiceChips
                    options={[
                        { value: 'all', label: `كل النتائج${typeof scope.total === 'number' ? ` (${scope.total.toLocaleString('en')})` : ''}`, icon: 'list' },
                        { value: 'page', label: 'الصفحة المعروضة فقط', icon: 'table' },
                    ]}
                    value={scope.allRows ? 'all' : 'page'}
                    onChange={(value) => scope.onChange(value === 'all')}
                    label="الصفوف المطبوعة"
                />
                <p className="text-xs text-gray-500">بنفس البحث والترتيب والفلاتر التي كانت على الشاشة.</p>
            </Section>

            <Section icon="document" title="الورق">
                <div className="grid grid-cols-2 gap-3">
                    <Field label="حجم الورق">
                        {(id) => (
                            <select id={id} value={layout.paper} onChange={(e) => set('paper', e.target.value)} className="block w-full text-sm">
                                {Object.entries(PAPER_SIZES).map(([value, paper]) => (
                                    <option key={value} value={value}>
                                        {paper.label} ({paper.width}×{paper.height} مم)
                                    </option>
                                ))}
                            </select>
                        )}
                    </Field>
                    <Field label="الهوامش (مم)">
                        {(id) => (
                            <input
                                id={id}
                                type="number"
                                min="0"
                                max="40"
                                value={layout.margin}
                                onChange={(e) => set('margin', Number(e.target.value))}
                                className="block w-full text-sm"
                            />
                        )}
                    </Field>
                </div>
                <Group label="اتجاه الورقة">
                    <ChoiceChips options={ORIENTATIONS} value={layout.orientation} onChange={(value) => set('orientation', value)} label="اتجاه الورقة" />
                </Group>
                <Field label={`حجم الخط: ${layout.fontSize} بكسل`}>
                    {(id) => (
                        <input
                            id={id}
                            type="range"
                            min="8"
                            max="18"
                            value={layout.fontSize}
                            onChange={(e) => set('fontSize', Number(e.target.value))}
                            className="w-full accent-brand-600"
                        />
                    )}
                </Field>
                <Group label="المسافة بين الصفوف">
                    <ChoiceChips options={DENSITIES} value={layout.density} onChange={(value) => set('density', value)} label="المسافة بين الصفوف" />
                </Group>
            </Section>

            <Section icon="page-header" title="الترويسة">
                <Field label="اسم الشركة">
                    {(id) => (
                        <input id={id} type="text" value={layout.header.company} onChange={(e) => setIn('header', 'company', e.target.value)} className="block w-full text-sm" />
                    )}
                </Field>
                <Field label="عنوان الطباعة">
                    {(id) => (
                        <input id={id} type="text" value={layout.header.title} onChange={(e) => setIn('header', 'title', e.target.value)} className="block w-full text-sm" />
                    )}
                </Field>
                <Field label="سطر إضافي تحت العنوان">
                    {(id) => (
                        <textarea
                            id={id}
                            rows={2}
                            value={layout.header.subtitle}
                            onChange={(e) => setIn('header', 'subtitle', e.target.value)}
                            placeholder="مثلًا: عن شهر تشرين الأول"
                            className="block w-full text-sm"
                        />
                    )}
                </Field>
                <div className="grid grid-cols-1 gap-3">
                    <Switch checked={layout.header.logo} onChange={(value) => setIn('header', 'logo', value)} label="إظهار الشعار" />
                    <Switch checked={layout.header.branch} onChange={(value) => setIn('header', 'branch', value)} label="إظهار اسم الفرع" />
                    <Switch checked={layout.header.date} onChange={(value) => setIn('header', 'date', value)} label="إظهار تاريخ ووقت الطباعة" />
                    <Switch checked={layout.header.user} onChange={(value) => setIn('header', 'user', value)} label="إظهار اسم من طبع" />
                    <Switch checked={layout.header.count} onChange={(value) => setIn('header', 'count', value)} label="إظهار عدد الصفوف" />
                    <Switch checked={layout.header.centered} onChange={(value) => setIn('header', 'centered', value)} label="ترويسة في المنتصف" />
                    <Switch
                        checked={layout.header.repeatTitle}
                        onChange={(value) => setIn('header', 'repeatTitle', value)}
                        label="تكرار العنوان أعلى كل صفحة"
                    />
                </div>
            </Section>

            <Section icon="columns" title={`الأعمدة (${shownCount} من ${layout.columns.length})`} open>
                <p className="text-xs text-gray-500">أظهر أو أخفِ، غيّر الاسم، رتّب بالأسهم، واختر المحاذاة أو المجموع.</p>
                <div className="flex gap-2">
                    <SecondaryButton onClick={() => set('columns', layout.columns.map((column) => ({ ...column, visible: true })))} className="flex-1 !px-2 !py-1.5 text-xs">
                        إظهار الكل
                    </SecondaryButton>
                    <SecondaryButton onClick={() => set('columns', layout.columns.map((column) => ({ ...column, visible: false })))} className="flex-1 !px-2 !py-1.5 text-xs">
                        إخفاء الكل
                    </SecondaryButton>
                </div>
                <ol className="space-y-2">
                    {layout.columns.map((column, index) => (
                        <li
                            key={column.key}
                            className={`rounded-control border p-2.5 ${column.visible ? 'border-gray-200 bg-surface' : 'border-dashed border-gray-200 bg-gray-50'}`}
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={column.visible}
                                    onChange={(e) => setColumn(index, { visible: e.target.checked })}
                                    aria-label={`طباعة عمود «${column.label}»`}
                                    title="إظهار العمود في الطباعة"
                                    className="rounded border-gray-300 text-brand-600"
                                />
                                <input
                                    type="text"
                                    value={column.label}
                                    onChange={(e) => setColumn(index, { label: e.target.value })}
                                    aria-label={`اسم العمود «${column.key}» في الطباعة`}
                                    className={`block min-w-0 flex-1 !py-1 text-sm ${column.visible ? '' : 'text-gray-400'}`}
                                />
                                <IconButton icon="arrow-up" label={`تحريك «${column.label}» قبل العمود السابق`} disabled={index === 0} onClick={() => set('columns', moveColumn(layout.columns, index, -1))} />
                                <IconButton
                                    icon="arrow-down"
                                    label={`تحريك «${column.label}» بعد العمود التالي`}
                                    disabled={index === layout.columns.length - 1}
                                    onClick={() => set('columns', moveColumn(layout.columns, index, 1))}
                                />
                            </div>
                            {column.visible && (
                                <div className="mt-2 flex flex-wrap items-center gap-3 ps-6 text-xs">
                                    <label className="flex items-center gap-1.5 text-gray-600">
                                        المحاذاة
                                        <select value={column.align} onChange={(e) => setColumn(index, { align: e.target.value })} className="!py-0.5 text-xs">
                                            {ALIGNMENTS.map((alignment) => (
                                                <option key={alignment.value} value={alignment.value}>
                                                    {alignment.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="flex items-center gap-1.5 text-gray-600">
                                        <input
                                            type="checkbox"
                                            checked={column.total}
                                            onChange={(e) => setColumn(index, { total: e.target.checked })}
                                            className="rounded border-gray-300 text-brand-600"
                                        />
                                        مجموع في الأسفل
                                    </label>
                                </div>
                            )}
                        </li>
                    ))}
                </ol>
            </Section>

            <Section icon="swatch" title="شكل الجدول">
                <Group label="خطوط الجدول">
                    <ChoiceChips options={BORDERS} value={layout.table.borders} onChange={(value) => setIn('table', 'borders', value)} label="خطوط الجدول" />
                </Group>
                <Group label="اللون الأساسي (العنوان ورأس الجدول)">
                    <div role="radiogroup" aria-label="اللون الأساسي" className="flex flex-wrap items-center gap-2">
                        {ACCENTS.map((accent) => (
                            <button
                                key={accent.value}
                                type="button"
                                role="radio"
                                aria-checked={layout.table.accent.toLowerCase() === accent.value.toLowerCase()}
                                aria-label={accent.label}
                                title={accent.label}
                                onClick={() => setIn('table', 'accent', accent.value)}
                                className={`h-8 w-8 rounded-full border-2 ${
                                    layout.table.accent.toLowerCase() === accent.value.toLowerCase() ? 'border-gray-900 ring-2 ring-white ring-offset-2 ring-offset-gray-900' : 'border-white shadow'
                                } ${FOCUS_RING}`}
                                style={{ backgroundColor: accent.value }}
                            />
                        ))}
                        <label className="flex items-center gap-1.5 text-xs text-gray-600">
                            لون آخر
                            <input
                                type="color"
                                value={layout.table.accent}
                                onChange={(e) => setIn('table', 'accent', e.target.value)}
                                className="h-8 w-10 cursor-pointer rounded border border-gray-200 p-0.5"
                            />
                        </label>
                    </div>
                </Group>
                <div className="grid grid-cols-1 gap-3">
                    <Switch checked={layout.table.headerShade} onChange={(value) => setIn('table', 'headerShade', value)} label="تظليل رأس الجدول" />
                    <Switch checked={layout.table.zebra} onChange={(value) => setIn('table', 'zebra', value)} label="تلوين الصفوف بالتناوب" />
                    <Switch checked={layout.table.rowNumbers} onChange={(value) => setIn('table', 'rowNumbers', value)} label="ترقيم الصفوف (#)" />
                    <Switch checked={layout.table.wrap} onChange={(value) => setIn('table', 'wrap', value)} label="التفاف النص الطويل في الخلايا" />
                </div>
            </Section>

            <Section icon="page-footer" title="التذييل والتواقيع">
                <Field label="نص أسفل كل صفحة">
                    {(id) => (
                        <input
                            id={id}
                            type="text"
                            value={layout.footer.text}
                            onChange={(e) => setIn('footer', 'text', e.target.value)}
                            placeholder="مثلًا: العنوان ورقم الهاتف"
                            className="block w-full text-sm"
                        />
                    )}
                </Field>
                <div className="grid grid-cols-1 gap-3">
                    <Switch checked={layout.footer.pageNumbers} onChange={(value) => setIn('footer', 'pageNumbers', value)} label="ترقيم الصفحات (صفحة 1 من 3)" />
                    <Switch checked={layout.footer.summary} onChange={(value) => setIn('footer', 'summary', value)} label="إظهار ملخص الصفحة (المجاميع) إن وُجد" />
                </div>
                <Field label="ملاحظات في نهاية الطباعة">
                    {(id) => (
                        <textarea id={id} rows={3} value={layout.footer.notes} onChange={(e) => setIn('footer', 'notes', e.target.value)} className="block w-full text-sm" />
                    )}
                </Field>
                <Group label={`خانات التوقيع (${layout.footer.signatures.length})`}>
                    <div className="space-y-2">
                        {layout.footer.signatures.map((label, index) => (
                            <div key={index} className="flex gap-2">
                                <input
                                    type="text"
                                    value={label}
                                    onChange={(e) => setSignature(index, e.target.value)}
                                    aria-label={`اسم خانة التوقيع ${index + 1}`}
                                    placeholder="مثلًا: المحاسب"
                                    className="block min-w-0 flex-1 text-sm"
                                />
                                <IconButton
                                    icon="trash"
                                    tone="danger"
                                    label={`حذف خانة التوقيع ${label || index + 1}`}
                                    onClick={() =>
                                        setIn(
                                            'footer',
                                            'signatures',
                                            layout.footer.signatures.filter((_, position) => position !== index),
                                        )
                                    }
                                />
                            </div>
                        ))}
                        {layout.footer.signatures.length < 4 && (
                            <SecondaryButton onClick={() => setIn('footer', 'signatures', [...layout.footer.signatures, ''])} className="w-full">
                                <Icon name="plus" className="h-4 w-4" />
                                إضافة خانة توقيع
                            </SecondaryButton>
                        )}
                    </div>
                </Group>
            </Section>

            <ConfirmDialog
                show={confirming === 'delete'}
                onConfirm={() => {
                    onDeleteTemplate(selectedTemplate);
                    setSelectedTemplate('');
                    setConfirming(null);
                }}
                onCancel={() => setConfirming(null)}
                title="حذف القالب؟"
                message={`سيُحذف القالب «${selectedTemplate}» من هذا المتصفح.`}
                confirmLabel="نعم، احذف"
                icon="trash"
                tone="danger"
            />
            <ConfirmDialog
                show={confirming === 'reset'}
                onConfirm={() => {
                    onReset();
                    setConfirming(null);
                }}
                onCancel={() => setConfirming(null)}
                title="إرجاع الإعدادات إلى الأصل؟"
                message="ستعود كل الأعمدة والترويسة والشكل كما كانت أول مرة. القوالب المحفوظة تبقى كما هي."
                confirmLabel="نعم، أرجعها"
                icon="undo"
                tone="danger"
            />
        </div>
    );
}
