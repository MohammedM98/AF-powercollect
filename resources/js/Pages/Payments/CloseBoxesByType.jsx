import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { formatMoney } from '@/lib/format';
import { boxTypes, boxTypeStyles, BoxTypeIcon } from './CollectorCashBox';
import { BoxPersonAvatar, financialAmountsLine } from './FinancialBoxComponents';
import { financialBoxesTotals } from '@/lib/financialBoxes';
import BoxBreakdown from './BoxBreakdown';

/**
 * Closes the open boxes of one type the closer ticks, together, for those
 * who may confirm the branch's boxes closed: the type, then its open boxes
 * (one person's when the entries are narrowed to them) to tick, then the
 * ticked boxes' entries summed up by bank, service or currency paid, and,
 * for cash, the confirmation that the cash was counted.
 */
export default function CloseBoxesByType({ boxes, branchId, userId, initialType, actionsUrl, onClose }) {
    const { errors } = usePage().props;
    const types = Object.keys(boxTypes);
    const [type, setType] = useState(initialType && types.includes(initialType) ? initialType : (types.find((value) => boxes.some((box) => box.type === value)) ?? types[0]));
    const [cashCounted, setCashCounted] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [processing, setProcessing] = useState(false);
    const shown = boxes.filter((box) => box.type === type);
    const selected = shown.filter((box) => selectedIds.includes(box.id));
    const allSelected = shown.length > 0 && selected.length === shown.length;
    const cash = type === 'cash';
    const totals = financialBoxesTotals(selected);

    function pickType(value) {
        setType(value);
        setSelectedIds([]);
        setCashCounted(false);
    }

    function toggle(id) {
        setSelectedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
        setCashCounted(false);
    }

    function toggleAll() {
        setSelectedIds(allSelected ? [] : shown.map((box) => box.id));
        setCashCounted(false);
    }

    function submit() {
        router.post(`${actionsUrl}/receive-type`, { branch_id: branchId, type, box_ids: selected.map((box) => box.id), cash_counted: cash && cashCounted }, {
            preserveScroll: true,
            onStart: () => setProcessing(true),
            onFinish: () => setProcessing(false),
            onSuccess: () => onClose(),
        });
    }

    return <Modal show onClose={onClose} maxWidth="3xl" centered panelClassName="flex max-h-[calc(100dvh-4rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 p-5 sm:p-6">
            <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600"><Icon name="lock" className="h-5 w-5" /></span>
                <div>
                    <h2 className="text-xl font-bold text-gray-900">إغلاق الصناديق حسب النوع</h2>
                    <p className="mt-1 text-sm leading-6 text-gray-500">اختر النوع ثم الصناديق المفتوحة{userId ? ' للموظف المختار' : ''} التي تريد إغلاقها، وراجع ملخصها قبل التأكيد. بعد التأكيد تُقفل حركاتها وتذهب إلى التدقيق.</p>
                </div>
            </div>
            <button type="button" onClick={onClose} aria-label="إغلاق النافذة" className="rounded-control p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"><Icon name="close" className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-gray-50/60 p-5 sm:p-6">
            <div role="group" aria-label="نوع الصندوق" className="grid gap-2 sm:grid-cols-3">
                {types.map((value) => {
                    const ofType = boxes.filter((box) => box.type === value);
                    const chosen = value === type;
                    return <button key={value} type="button" aria-pressed={chosen} onClick={() => pickType(value)} className={`flex items-center gap-3 rounded-2xl border bg-surface p-3 text-start transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${chosen ? 'border-gray-900 shadow-[0_0_0_3px_rgb(var(--gray-900)/0.08)]' : 'border-gray-100 hover:border-gray-300'}`}>
                        <BoxTypeIcon type={value} className="h-10 w-10" />
                        <span className="min-w-0">
                            <span className="block font-semibold text-gray-900">{boxTypeStyles[value].label}</span>
                            <span className="block truncate text-xs text-gray-500"><b className="font-display text-gray-700">{ofType.length}</b> صناديق · <bdi dir="ltr" className="font-display">{formatMoney(financialBoxesTotals(ofType).ILS)}</bdi> شيكل</span>
                        </span>
                    </button>;
                })}
            </div>

            {errors?.action && <p role="alert" className="rounded-control bg-red-500/10 p-3 text-sm text-red-700">{errors.action}</p>}

            <section aria-label="الصناديق المفتوحة" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-gray-900">اختر الصناديق <span className="font-display text-sm font-normal text-gray-500">({selected.length} من {shown.length})</span></h3>
                    {shown.length > 1 && <button type="button" onClick={toggleAll} className="rounded-lg px-2 py-1 text-sm font-semibold text-brand-600 transition hover:bg-brand-500/10">{allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</button>}
                </div>
                {!shown.length ? <p className="rounded-2xl border border-dashed border-gray-200 bg-surface p-6 text-center text-sm text-gray-500">لا توجد صناديق مفتوحة من هذا النوع يمكنك إغلاقها.</p> : <ul className="grid gap-2 sm:grid-cols-2">
                    {shown.map((box) => {
                        const picked = selectedIds.includes(box.id);
                        return <li key={box.id}><label className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-surface p-3 transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gray-900 ${picked ? 'border-gray-900 shadow-[0_0_0_3px_rgb(var(--gray-900)/0.08)]' : 'border-gray-100 hover:border-gray-300'}`}>
                            <input type="checkbox" className="sr-only" checked={picked} onChange={() => toggle(box.id)} aria-label={`اختيار صندوق ${box.number}`} />
                            <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition ${picked ? 'border-gray-900 bg-gray-900 text-surface' : 'border-gray-300'}`}>{picked && <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                            <BoxPersonAvatar name={box.person} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-gray-900">{box.person ?? '—'}</span>
                                <span className="block text-xs text-gray-500">صندوق <bdi dir="ltr" className="font-display">{box.number}</bdi> · <b className="font-display text-gray-700">{box.count}</b> حركة</span>
                            </span>
                            <span className="shrink-0 text-end"><b dir="ltr" className="block font-display text-gray-900">{formatMoney(financialBoxesTotals([box]).ILS)}</b><span className="text-xs text-gray-500">شيكل</span></span>
                        </label></li>;
                    })}
                </ul>}
            </section>

            {shown.length > 0 && (selected.length ? <BoxBreakdown type={type} entries={selected.flatMap((box) => box.entries ?? [])} /> : <p className="flex items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-surface p-4 text-sm text-gray-500"><Icon name="list" className="h-5 w-5 shrink-0 text-gray-400" />اختر صندوقًا أو أكثر ليظهر ملخصه {type === 'bank_transfer' ? 'حسب البنك' : type === 'clearing' ? 'حسب الخدمة' : 'حسب عملة الدفع'} قبل الإغلاق.</p>)}
        </div>
        <footer className="shrink-0 space-y-3 border-t border-gray-100 bg-surface p-4 sm:px-6">
            {cash && selected.length > 0 && <label className="flex cursor-pointer items-start gap-3 rounded-control border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-gray-800">
                <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" checked={cashCounted} onChange={(event) => setCashCounted(event.target.checked)} />
                <span>عددتُ نقد كل صندوق من الصناديق المختارة ووجدته مطابقًا لإجماليه: <b className="text-gray-900">{financialAmountsLine(totals)}</b></span>
            </label>}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">{selected.length ? <>{selected.length === 1 ? 'صندوق واحد مختار' : <><b className="font-display text-gray-900">{selected.length}</b> صناديق مختارة</>} · <b className="text-gray-900">{financialAmountsLine(totals)}</b></> : 'لم تختر أي صندوق بعد'}</p>
                <div className="flex flex-wrap items-center gap-2">
                    <SecondaryButton onClick={onClose}>إلغاء</SecondaryButton>
                    <PrimaryButton disabled={processing || !selected.length || (cash && !cashCounted)} onClick={submit}><Icon name="check" className="h-4 w-4" />{selected.length === 1 ? 'تأكيد إغلاق الصندوق' : selected.length ? `تأكيد إغلاق ${selected.length} صناديق` : 'تأكيد الإغلاق'}</PrimaryButton>
                </div>
            </div>
        </footer>
    </Modal>;
}
