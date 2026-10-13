import BaseModal from '@/Components/Modal';
import Icon from './ClosingIcon';
import { PrimaryButton, StatusPill, MoneyStack, BoxTransactions, money } from './ClosingComponents';
import { boxTypes } from '../Payments/CollectorCashBox';
import './closing.css';

const currencies = { ILS: 'شيكل', USD: 'دولار', JOD: 'دينار' };
export const boxStatuses = { open: ['مفتوح', 'blue'], pending: ['بانتظار تأكيد الإغلاق', 'amber'], received: ['أُكّد إغلاقه', 'green'] };

function Modal({ panelClassName = '', ...props }) {
    return <BaseModal {...props} centered panelClassName={`closing-ui closing-dialog ${panelClassName}`} />;
}

/**
 * One of the branch's boxes in a dialog: its entries to review, any to send
 * back to the collector, and the button that confirms it closed.
 */
export default function BoxDetails({ box, access, onClose, perform }) {
    const cash = box.type === 'cash';
    const canReview = box.canCount;
    const confirmable = !box.frozen && box.canCount && ['open', 'pending'].includes(box.status) && box.kind !== 'direct';
    const waiting = box.payments.filter((entry) => entry.returned_at && !entry.replied_at && entry.transaction?.status === 'active').length;
    const counted = cash && box.head_counts && box.expected_counts && Object.keys(currencies).some((currency) => Number(box.head_counts[currency] ?? 0) !== Number(box.expected_counts[currency] ?? 0));
    return <Modal show onClose={onClose} maxWidth="2xl"><div className="space-y-5 p-6">
        <header className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-gray-900">{box.user?.name ?? 'الدفعات المباشرة'} · {boxTypes[box.type]}</h2><p dir="ltr" className="mt-1 font-display text-xs text-gray-500">{box.number}</p></div><button onClick={onClose} aria-label="إغلاق النافذة"><Icon name="close" className="h-5 w-5 text-gray-500" /></button></header>
        <StatusPill tone={boxStatuses[box.status][1]}>{boxStatuses[box.status][0]}</StatusPill>
        {confirmable && <p className="rounded-xl bg-blue-500/10 p-4 text-sm leading-7 text-blue-600">راجع الدفعات وأرجع ما فيه مشكلة للمحصّل، ثم أكّد إغلاق الصندوق. لا يلزم عدّ النقد؛ تسليم الصناديق للشركة خطوة منفصلة.</p>}
        <BoxTransactions box={box} canReview={canReview} access={access} perform={perform} />
        {!box.frozen && <div className="flex flex-wrap items-center gap-3">
            {confirmable && <PrimaryButton disabled={waiting > 0 || box.payments.length === 0} onClick={() => perform('receive', box)}><Icon name="check" />تأكيد إغلاق الصندوق</PrimaryButton>}
            {confirmable && waiting > 0 && <span className="text-sm text-amber-700">بانتظار ردّ المحصّل على {waiting} {waiting === 1 ? 'حركة' : 'حركات'} أعدتها إليه.</span>}
            {cash && box.isOwn && box.status === 'received' && !box.confirmed_at && <PrimaryButton onClick={() => perform('confirm', box)}>أؤكّد تسليم الصندوق</PrimaryButton>}
        </div>}
        {counted && <BoxCountSummary box={box} />}
        {cash && box.status === 'received' && <MoneyStack amounts={box.head_counts} />}
    </div></Modal>;
}

function BoxCountSummary({ box }) {
    if (!box.expected_counts) return null;
    return <div className="w-full overflow-x-auto rounded-xl border border-gray-200"><table className="dt w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr>{['العملة', 'المتوقع', 'عدّ المحصّل', 'عدّ المستلم', 'الفرق', 'القرار'].map((title) => <th key={title} className="whitespace-nowrap p-3 text-start">{title}</th>)}</tr></thead><tbody>{Object.entries(currencies).map(([currency, label]) => <tr key={currency} className="border-t border-gray-100 text-gray-700"><td className="p-3">{label}</td><td className="p-3" dir="ltr">{money(box.expected_counts[currency], currency)}</td><td className="p-3" dir="ltr">{box.collector_counts ? money(box.collector_counts[currency], currency) : '—'}</td><td className="p-3" dir="ltr">{box.head_counts ? money(box.head_counts[currency], currency) : '—'}</td><td className="p-3" dir="ltr">{box.head_counts ? money(Number(box.head_counts[currency]) - Number(box.expected_counts[currency]), currency) : '—'}</td><td className="p-3">{box.decisions?.[currency] === 'debt' ? 'دين على المحصّل' : box.decisions?.[currency] === 'accepted' ? 'مقبول' : '—'}</td></tr>)}</tbody></table>{box.reason && <p className="border-t border-gray-100 p-3 text-xs text-gray-500">السبب: {box.reason}</p>}</div>;
}
