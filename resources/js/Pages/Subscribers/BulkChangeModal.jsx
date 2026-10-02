import { useId, useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import Modal from '@/Components/Modal';
import Icon from '@/Components/Icon';
import ChoiceChips from '@/Components/ChoiceChips';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import InputError from '@/Components/InputError';
import { normalizeDecimalInput } from '@/lib/format';

const TITLES = {
    minimum_charge: { title: 'تغيير الحد الأدنى', icon: 'wallet' },
    status: { title: 'تغيير الحالة', icon: 'flag' },
};

const MINIMUM_MODES = [
    { value: 'amount', label: 'مبلغ محدد', icon: 'dollar' },
    { value: 'circuit_breaker', label: 'حد القاطع لكل مشترك', icon: 'bolt' },
];

const STATUS_ICONS = { active: 'check', suspended: 'clock', disconnected: 'power' };

/**
 * Set one field — the weekly minimum charge or the status — for every
 * chosen subscriber (`selection`: the ticked ids, or every match of the
 * list's filters), after saying how many it reaches. The change is kept
 * in the bulk changes log and can be undone from there.
 */
export default function BulkChangeModal({ field, selection, count, statusOptions, onClose, onDone }) {
    const id = useId();
    const { errors } = usePage().props;
    const [mode, setMode] = useState('amount');
    const [value, setValue] = useState(field === 'status' ? (statusOptions[0]?.value ?? '') : '');
    const [saving, setSaving] = useState(false);
    const { title, icon } = TITLES[field];
    const needsValue = field === 'status' || mode === 'amount';

    function apply(event) {
        event.preventDefault();
        setSaving(true);
        router.post(
            '/subscribers/bulk-changes',
            { field, mode: field === 'minimum_charge' ? mode : undefined, value: needsValue ? value : undefined, ...selection },
            { preserveScroll: true, onSuccess: onDone, onFinish: () => setSaving(false) },
        );
    }

    return (
        <Modal show onClose={onClose} maxWidth="lg" centered>
            <form onSubmit={apply} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-reach`}>
                <div className="flex items-start gap-4 px-7 pb-2 pt-7">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                        <Icon name={icon} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                        <h3 id={`${id}-title`} className="text-lg font-bold text-gray-900">
                            {title}
                        </h3>
                        <p id={`${id}-reach`} className="mt-1.5 text-sm leading-6 text-gray-600">
                            يُطبَّق على <b className="text-gray-900">{count.toLocaleString('en')}</b> مشترك
                            {selection.all ? ' (كل النتائج المطابقة للبحث والفلاتر)' : ' محدد'}. من كانت قيمته نفسها لا يتغير.
                        </p>
                    </div>
                </div>

                <div className="space-y-4 px-7 py-5">
                    {field === 'minimum_charge' ? (
                        <>
                            <ChoiceChips options={MINIMUM_MODES} value={mode} onChange={setMode} label="طريقة تحديد الحد الأدنى" />
                            {mode === 'amount' ? (
                                <div>
                                    <label htmlFor={`${id}-value`} className="mb-1.5 block text-sm font-semibold text-gray-700">
                                        الحد الأدنى الأسبوعي الجديد (شيكل)
                                    </label>
                                    <input
                                        id={`${id}-value`}
                                        type="text"
                                        inputMode="decimal"
                                        value={value}
                                        onChange={(e) => setValue(normalizeDecimalInput(e.target.value))}
                                        className="block w-full text-sm"
                                        autoFocus
                                        aria-invalid={errors.value ? true : undefined}
                                    />
                                    <InputError message={errors.value} className="mt-1" />
                                </div>
                            ) : (
                                <p className="rounded-control bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                    يأخذ كل مشترك الحد الأدنى لقاطعه. من ليس له قاطع لا يتغير.
                                </p>
                            )}
                            <p className="flex items-start gap-1.5 text-xs text-gray-500">
                                <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                                يسري على القراءات القادمة فقط؛ القراءات المسجلة تبقى كما هي.
                            </p>
                        </>
                    ) : (
                        <ChoiceChips
                            options={statusOptions.map((option) => ({ ...option, icon: STATUS_ICONS[option.value] }))}
                            value={value}
                            onChange={setValue}
                            label="الحالة الجديدة"
                        />
                    )}
                    <InputError message={errors.ids} />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-7 py-4">
                    <SecondaryButton onClick={onClose}>إلغاء</SecondaryButton>
                    <PrimaryButton type="submit" disabled={saving || (needsValue && value === '')} aria-busy={saving}>
                        <Icon name="check" className="h-4 w-4" />
                        {saving ? 'جارٍ التطبيق...' : `تطبيق على ${count.toLocaleString('en')} مشترك`}
                    </PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}
