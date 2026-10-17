import Icon from '@/Components/Icon';
import { useRowClick } from '@/hooks/useRowClick';
import { BoxStage } from './CollectorCashBox';
import { FinancialBoxAmount, FinancialBoxButton, FinancialBoxDates, FinancialBoxEntries, FinancialBoxStatus, FinancialBoxTimes, FinancialBoxType, financialAmountsLine } from './FinancialBoxComponents';
import './financial-boxes.css';

/**
 * The same aligned box rows for the branch and the collector's history: the
 * box's number and week, its type, then whose it is, its entries, total,
 * dates and state. The branch sees when each box was opened, closed and
 * sent and by whom, and with `selection` picks boxes to send together;
 * the audit (`byBranch`) also sees which branch sent each.
 */
export default function FinancialBoxList({ boxes, onOpen, onSend, periodFor, sortState, onSort, collector = false, byBranch = false, renderActions, selection }) {
    const rowClick = useRowClick();

    function heading(column, label) {
        if (!onSort) {
            return label;
        }

        const active = sortState?.sort === column;

        return <button type="button" onClick={() => onSort(column)} className="inline-flex items-center gap-1 rounded-md hover:text-gray-900" aria-label={`${label}${active ? sortState.direction === 'asc' ? '، ترتيب تصاعدي' : '، ترتيب تنازلي' : '، ترتيب'}`}>
            {label}<Icon name="chevron-down" className={`h-3.5 w-3.5 ${active ? 'text-brand-500' : 'opacity-40'} ${active && sortState.direction === 'asc' ? 'rotate-180' : ''}`} />
        </button>;
    }

    if (!boxes.length) {
        return <p className="px-4 py-14 text-center text-sm text-gray-500">لا توجد صناديق بهذه الفلاتر.</p>;
    }

    return <div className="financial-box-list">
        <table className="financial-box-list-table"><caption className="sr-only">الصناديق المالية</caption><thead><tr className="financial-box-list-heading">
            <th><span className="inline-flex items-center gap-2">{selection && <input type="checkbox" checked={boxes.length > 0 && boxes.every((box) => selection.picked.has(box.id))} onChange={() => selection.toggleAll(boxes.map((box) => box.id))} aria-label="تحديد كل الصناديق المعروضة" className="h-[18px] w-[18px] rounded border-gray-300 text-brand-600 focus:ring-brand-500" />}{heading('number', 'رقم الصندوق')}</span></th><th>النوع</th><th>{collector ? 'أغلقه / المستلم' : byBranch ? 'الفرع · الموظف' : 'الموظف'}</th><th>الحركات</th><th>{heading('total', 'الإجمالي')}</th><th>{collector ? heading('dates', 'فُتح ← أُغلق') : heading('dates', 'الأوقات')}</th><th>{heading('status', 'الحالة')}</th><th data-actions=""><span className="sr-only">الإجراءات</span></th>
        </tr></thead>
        <tbody className="financial-box-list-rows">
            {boxes.map((box) => <tr key={box.id} className={`financial-box-list-row ${selection?.picked.has(box.id) ? 'is-picked' : ''}`} {...rowClick(() => onOpen(box))}>
                <td className="financial-box-list-number flex items-center gap-3">{selection && <input type="checkbox" checked={selection.picked.has(box.id)} onChange={() => selection.toggle(box.id)} onClick={(event) => event.stopPropagation()} aria-label={`تحديد الصندوق ${box.number}`} className="h-[18px] w-[18px] shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />}<button type="button" className="min-w-0 text-start" onClick={() => onOpen(box)} aria-label={`عرض صندوق ${box.number}`}><b dir="ltr" className="block font-display text-lg text-gray-900">{box.number}</b>{periodFor && periodFor(box) !== '—' && <span className="block text-[13px] text-gray-600">{periodFor(box)}</span>}</button></td>
                <td className="financial-box-list-type"><FinancialBoxType box={box} /></td>
                <td className="financial-box-list-person">
                    {byBranch ? <div className="min-w-0"><span className="flex items-center gap-1.5 text-[15px] font-semibold text-gray-900"><Icon name="building" className="h-4 w-4 shrink-0 text-gray-500" />{box.branchName ?? '—'}</span><span className="block text-[13px] text-gray-600">{box.user?.name ?? '—'}</span></div> : collector ? <div><span className="block text-[15px] font-semibold text-gray-900">{box.closedBy ?? '—'}</span>{box.receivedAt && <small className="block text-[13px] text-gray-600">المستلم: {financialAmountsLine(box.receivedAmounts ?? {})}</small>}</div> : <span className="min-w-0 break-words text-[15px] font-semibold text-gray-900">{box.user?.name ?? '—'}{box.isOwn && <span className="text-sm font-normal text-gray-600"> (أنت)</span>}</span>}
                </td>
                <td className="financial-box-list-entries"><FinancialBoxEntries box={box} /></td>
                <td className="financial-box-list-amount"><FinancialBoxAmount box={box} /></td>
                <td className="financial-box-list-dates">{collector ? <FinancialBoxDates box={box} /> : <FinancialBoxTimes box={box} />}</td>
                <td className="financial-box-list-status">{collector ? <BoxStage box={box} /> : <FinancialBoxStatus box={box} />}</td>
                <td className="financial-box-list-actions">{renderActions ? renderActions(box) : <FinancialBoxButton box={box} onOpen={onOpen} onSend={onSend} />}</td>
            </tr>)}
        </tbody></table>
    </div>;
}
