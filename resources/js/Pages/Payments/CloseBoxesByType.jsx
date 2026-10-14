import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { boxTypes, boxTypeStyles, BoxTypeIcon } from './CollectorCashBox';
import { financialAmountsLine } from './FinancialBoxComponents';
import { financialBoxesTotals } from '@/lib/financialBoxes';

/**
 * Closes every open box of one type at once, for those who may confirm
 * the branch's boxes closed: the open boxes of the picked type (one
 * person's when the entries are narrowed to them) with their totals, and,
 * for cash, the confirmation that the cash was counted.
 */
export default function CloseBoxesByType({ boxes, branchId, userId, initialType, actionsUrl, onClose }) {
    const { errors } = usePage().props;
    const types = Object.keys(boxTypes);
    const [type, setType] = useState(initialType && types.includes(initialType) ? initialType : (types.find((value) => boxes.some((box) => box.type === value)) ?? types[0]));
    const [cashCounted, setCashCounted] = useState(false);
    const [processing, setProcessing] = useState(false);
    const shown = boxes.filter((box) => box.type === type);
    const cash = type === 'cash';
    const totals = financialBoxesTotals(shown);

    function submit() {
        router.post(`${actionsUrl}/receive-type`, { branch_id: branchId, type, user_id: userId || null, cash_counted: cash && cashCounted }, {
            preserveScroll: true,
            onStart: () => setProcessing(true),
            onFinish: () => setProcessing(false),
            onSuccess: () => onClose(),
        });
    }

    return <Modal show onClose={onClose} maxWidth="2xl" centered panelClassName="flex max-h-[calc(100dvh-4rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 p-6">
            <div>
                <h2 className="text-xl font-bold text-gray-900">إغلاق الصناديق حسب النوع</h2>
                <p className="mt-1 text-sm text-gray-500">يؤكّد إغلاق كل الصناديق المفتوحة من النوع المختار{userId ? ' للموظف المختار' : ''}؛ بعد التأكيد تُقفل حركاتها وتذهب إلى التدقيق.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="إغلاق النافذة" className="rounded-control p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"><Icon name="close" className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <SegmentedTabs label="نوع الصندوق" value={type} onChange={(value) => { setType(value); setCashCounted(false); }} options={types.map((value) => ({ value, label: `${boxTypeStyles[value].label} · ${boxes.filter((box) => box.type === value).length}` }))} />
            {errors?.action && <p role="alert" className="rounded-control bg-red-500/10 p-3 text-sm text-red-700">{errors.action}</p>}
            {!shown.length ? <p className="rounded-control border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">لا توجد صناديق مفتوحة من هذا النوع يمكنك إغلاقها.</p> : <ul className="divide-y divide-gray-100 rounded-panel border border-gray-100">
                {shown.map((box) => <li key={box.id} className="flex flex-wrap items-center gap-3 p-3">
                    <BoxTypeIcon type={box.type} className="h-9 w-9" />
                    <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-gray-900">صندوق <bdi dir="ltr" className="font-display">{box.number}</bdi></span>
                        <span className="block text-xs text-gray-500">{box.person ?? '—'} · <b className="font-display">{box.count}</b> حركة سارية</span>
                    </span>
                    <b className="text-sm text-gray-900">{financialAmountsLine(box.totals)}</b>
                </li>)}
            </ul>}
        </div>
        <footer className="shrink-0 space-y-3 border-t border-gray-100 p-4 sm:px-6">
            {cash && shown.length > 0 && <label className="flex cursor-pointer items-start gap-3 rounded-control border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-gray-800">
                <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" checked={cashCounted} onChange={(event) => setCashCounted(event.target.checked)} />
                <span>عددتُ نقد كل صندوق من هذه الصناديق ووجدته مطابقًا لإجماليه: <b className="text-gray-900">{financialAmountsLine(totals)}</b></span>
            </label>}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600"><b className="font-display text-gray-900">{shown.length}</b> صناديق · {financialAmountsLine(totals)}</p>
                <div className="flex flex-wrap items-center gap-2">
                    <SecondaryButton onClick={onClose}>إلغاء</SecondaryButton>
                    <PrimaryButton disabled={processing || !shown.length || (cash && !cashCounted)} onClick={submit}><Icon name="check" className="h-4 w-4" />تأكيد إغلاق {shown.length} صناديق</PrimaryButton>
                </div>
            </div>
        </footer>
    </Modal>;
}
