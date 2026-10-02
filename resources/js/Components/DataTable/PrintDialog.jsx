import { useId, useState } from 'react';
import Modal from '@/Components/Modal';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import ChoiceChips from '@/Components/ChoiceChips';
import { printUrl, rememberColumns } from '@/lib/print';

const SCOPES = [
    { value: 'all', label: 'كل النتائج', icon: 'list' },
    { value: 'page', label: 'هذه الصفحة فقط', icon: 'table' },
];

/**
 * Choose what to print from a list page: which columns, every matching
 * row or only the page on screen, and the heading. The printout keeps the
 * table's search, sort and filters (see lib/print.js). The picked columns
 * are remembered for this page.
 */
export default function PrintDialog({ show, onClose, columns, initialLabels, defaultTitle, total, pageKey }) {
    const id = useId();
    const [selected, setSelected] = useState(() => {
        const remembered = columns.filter((column) => initialLabels?.includes(column.label));

        return new Set((remembered.length > 0 ? remembered : columns).map((column) => column.index));
    });
    const [scope, setScope] = useState('all');
    const [title, setTitle] = useState(defaultTitle);

    function toggle(index) {
        const next = new Set(selected);
        next.has(index) ? next.delete(index) : next.add(index);
        setSelected(next);
    }

    function print() {
        const picked = columns.filter((column) => selected.has(column.index));
        rememberColumns(
            pageKey,
            picked.map((column) => column.label),
        );
        window.open(printUrl({ allRows: scope === 'all', columns: picked.map((column) => column.index), title }), '_blank');
        onClose();
    }

    const allSelected = selected.size === columns.length;

    return (
        <Modal show={show} onClose={onClose} maxWidth="lg" centered>
            <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
                <div className="flex items-start gap-4 px-7 pb-2 pt-7">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                        <Icon name="printer" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                        <h3 id={`${id}-title`} className="text-lg font-bold text-gray-900">
                            طباعة الجدول
                        </h3>
                        <p className="mt-1.5 text-sm leading-6 text-gray-600">تُطبع الصفوف بنفس البحث والترتيب والفلاتر المعروضة الآن.</p>
                    </div>
                </div>

                <div className="space-y-5 px-7 py-5">
                    <div>
                        <label htmlFor={`${id}-heading`} className="mb-1.5 block text-sm font-semibold text-gray-700">
                            عنوان الطباعة
                        </label>
                        <input
                            id={`${id}-heading`}
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="block w-full text-sm"
                        />
                    </div>

                    <div>
                        <span className="mb-1.5 block text-sm font-semibold text-gray-700">الصفوف</span>
                        <ChoiceChips
                            options={SCOPES.map((option) =>
                                option.value === 'all' && typeof total === 'number'
                                    ? { ...option, label: `${option.label} (${total.toLocaleString('en')})` }
                                    : option,
                            )}
                            value={scope}
                            onChange={setScope}
                            label="الصفوف"
                        />
                    </div>

                    <fieldset aria-describedby={`${id}-columns-count`}>
                        <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                            <Icon name="columns" className="h-4 w-4 text-gray-500" />
                            الأعمدة
                        </legend>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <span id={`${id}-columns-count`} className="text-xs text-gray-500" aria-live="polite">
                                {selected.size} من {columns.length} أعمدة ستُطبع
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelected(new Set(allSelected ? [] : columns.map((column) => column.index)))}
                                className="rounded text-xs font-semibold text-brand-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                            >
                                {allSelected ? 'إلغاء تحديد كل الأعمدة' : 'تحديد كل الأعمدة'}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {columns.map((column) => (
                                <label
                                    key={column.index}
                                    className={`flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-sm transition ${
                                        selected.has(column.index)
                                            ? 'border-brand-500/40 bg-brand-500/5 text-gray-900'
                                            : 'border-gray-100 bg-gray-50 text-gray-500'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.has(column.index)}
                                        onChange={() => toggle(column.index)}
                                        className="rounded border-gray-300 text-brand-600"
                                    />
                                    <span className="min-w-0 break-words">{column.label}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-7 py-4">
                    <p id={`${id}-print-hint`} className="me-auto flex items-center gap-1.5 text-xs text-gray-500">
                        <Icon name={selected.size === 0 ? 'warning' : 'external'} className="h-4 w-4 shrink-0" />
                        {selected.size === 0 ? 'اختر عمودًا واحدًا على الأقل.' : 'تُفتح المعاينة في نافذة جديدة.'}
                    </p>
                    <SecondaryButton onClick={onClose}>إلغاء</SecondaryButton>
                    <PrimaryButton type="button" onClick={print} disabled={selected.size === 0} aria-describedby={`${id}-print-hint`}>
                        <Icon name="printer" className="h-4 w-4" />
                        طباعة
                    </PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}
