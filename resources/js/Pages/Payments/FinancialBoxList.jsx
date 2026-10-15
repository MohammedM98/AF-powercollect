import Icon from '@/Components/Icon';
import { useRowClick } from '@/hooks/useRowClick';
import { BoxStage } from './CollectorCashBox';
import { FinancialBoxAmount, FinancialBoxButton, FinancialBoxDates, FinancialBoxEntries, FinancialBoxIdentity, FinancialBoxStatus, BoxPersonAvatar, financialAmountsLine } from './FinancialBoxComponents';
import './financial-boxes.css';

/** The same aligned box rows for the branch and the collector's history. */
export default function FinancialBoxList({ boxes, onOpen, periodFor, sortState, onSort, collector = false, renderActions }) {
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
            <th>{heading('number', 'الصندوق')}</th><th>{collector ? 'أغلقه / المستلم' : 'الموظف'}</th><th>الحركات</th><th>{heading('total', 'الإجمالي')}</th><th>{heading('dates', 'فُتح ← أُغلق')}</th><th>{heading('status', 'الحالة')}</th><th data-actions=""><span className="sr-only">الإجراءات</span></th>
        </tr></thead>
        <tbody className="financial-box-list-rows">
            {boxes.map((box) => <tr key={box.id} className="financial-box-list-row" {...rowClick(() => onOpen(box))}>
                <td className="financial-box-list-identity"><button type="button" className="min-w-0 text-start" onClick={() => onOpen(box)} aria-label={`عرض صندوق ${box.number}`}><FinancialBoxIdentity box={box} period={periodFor?.(box)} /></button></td>
                <td className="financial-box-list-person">
                    {collector ? <div><span className="block text-sm text-gray-700">{box.closedBy ?? '—'}</span>{box.receivedAt && <small className="block text-xs text-gray-500">المستلم: {financialAmountsLine(box.receivedAmounts ?? {})}</small>}</div> : <><BoxPersonAvatar name={box.user?.name} small /><span className="min-w-0 break-words text-sm text-gray-700">{box.user?.name ?? '—'}{box.isOwn && <span className="text-xs text-gray-400"> (أنت)</span>}</span></>}
                </td>
                <td className="financial-box-list-entries"><FinancialBoxEntries box={box} /></td>
                <td className="financial-box-list-amount"><FinancialBoxAmount box={box} /></td>
                <td className="financial-box-list-dates"><FinancialBoxDates box={box} /></td>
                <td className="financial-box-list-status">{collector ? <BoxStage box={box} /> : <FinancialBoxStatus box={box} />}</td>
                <td className="financial-box-list-actions">{renderActions ? renderActions(box) : <FinancialBoxButton box={box} onOpen={onOpen} />}</td>
            </tr>)}
        </tbody></table>
    </div>;
}
