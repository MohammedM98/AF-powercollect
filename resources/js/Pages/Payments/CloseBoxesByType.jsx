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
import BoxBreakdown from './BoxBreakdown';

/**
 * Closes the open boxes of one type the closer ticks, together, for those
 * who may confirm the branch's boxes closed: the open boxes of the picked
 * type (one person's when the entries are narrowed to them) with their
 * totals, the ticked boxes' entries summed up by bank, service or currency
 * paid (every box's while none is ticked), and, for cash, the confirmation
 * that the cash was counted.
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

    return <Modal show onClose={onClose} maxWidth="2xl" centered panelClassName="flex max-h-[calc(100dvh-4rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 p-6">
            <div>
                <h2 className="text-xl font-bold text-gray-900">إغلاق الصناديق حسب النوع</h2>
                <p className="mt-1 text-sm text-gray-500">اختر الصناديق المفتوحة{userId ? ' للموظف المختار' : ''} التي تريد إغلاقها من النوع المختار؛ بعد التأكيد تُقفل حركاتها وتذهب إلى التدقيق.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="إغلاق النافذة" className="rounded-control p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"><Icon name="close" className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <SegmentedTabs label="نوع الصندوق" value={type} onChange={pickType} options={types.map((value) => ({ value, label: `${boxTypeStyles[value].label} · ${boxes.filter((box) => box.type === value).length}` }))} />
            {errors?.action && <p role="alert" className="rounded-control bg-red-500/10 p-3 text-sm text-red-700">{errors.action}</p>}
            <BoxBreakdown type={type} entries={(selected.length ? selected : shown).flatMap((box) => box.entries ?? [])} />
            {!shown.length ? <p className="rounded-control border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">لا توجد صناديق مفتوحة من هذا النوع يمكنك إغلاقها.</p> : <ul className="divide-y divide-gray-100 rounded-panel border border-gray-100">
                <li><label className="flex cursor-pointer items-center gap-3 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
                    <input type="checkbox" className="rounded border-gray-300 text-gray-900 focus:ring-gray-900" checked={allSelected} onChange={toggleAll} />
                    تحديد الكل <span className="font-display text-xs font-normal text-gray-500">({selected.length} من {shown.length})</span>
                </label></li>
                {shown.map((box) => <li key={box.id}><label className={`flex cursor-pointer flex-wrap items-center gap-3 p-3 transition ${selectedIds.includes(box.id) ? 'bg-gray-50' : 'hover:bg-gray-50/60'}`}>
                    <input type="checkbox" className="rounded border-gray-300 text-gray-900 focus:ring-gray-900" checked={selectedIds.includes(box.id)} onChange={() => toggle(box.id)} aria-label={`اختيار صندوق ${box.number}`} />
                    <BoxTypeIcon type={box.type} className="h-9 w-9" />
                    <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-gray-900">صندوق <bdi dir="ltr" className="font-display">{box.number}</bdi></span>
                        <span className="block text-xs text-gray-500">{box.person ?? '—'} · <b className="font-display">{box.count}</b> حركة سارية</span>
                    </span>
                    <b className="text-sm text-gray-900">{financialAmountsLine(financialBoxesTotals([box]))}</b>
                </label></li>)}
            </ul>}
        </div>
        <footer className="shrink-0 space-y-3 border-t border-gray-100 p-4 sm:px-6">
            {cash && selected.length > 0 && <label className="flex cursor-pointer items-start gap-3 rounded-control border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-gray-800">
                <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" checked={cashCounted} onChange={(event) => setCashCounted(event.target.checked)} />
                <span>عددتُ نقد كل صندوق من الصناديق المختارة ووجدته مطابقًا لإجماليه: <b className="text-gray-900">{financialAmountsLine(totals)}</b></span>
            </label>}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">{selected.length ? <>{selected.length === 1 ? 'صندوق واحد مختار' : <><b className="font-display text-gray-900">{selected.length}</b> صناديق مختارة</>} · {financialAmountsLine(totals)}</> : 'لم تختر أي صندوق بعد'}</p>
                <div className="flex flex-wrap items-center gap-2">
                    <SecondaryButton onClick={onClose}>إلغاء</SecondaryButton>
                    <PrimaryButton disabled={processing || !selected.length || (cash && !cashCounted)} onClick={submit}><Icon name="check" className="h-4 w-4" />{selected.length === 1 ? 'تأكيد إغلاق الصندوق' : `تأكيد إغلاق ${selected.length} صناديق`}</PrimaryButton>
                </div>
            </div>
        </footer>
    </Modal>;
}
