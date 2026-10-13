import StatusPill from '@/Components/DataTable/StatusPill';
import { formatMoney } from '@/lib/format';

const currencyLabels = { ILS: 'شيكل', USD: 'دولار', JOD: 'دينار' };

/**
 * The columns a box entry shares with the subscriber's statement, in its
 * order, with their widths: the transaction as it was recorded. Each table
 * of entries puts its own number, box, subscriber and state around them.
 */
export const ledgerColumns = {
    before: [['رقم السند', 110], ['الرقم المرجعي', 150], ['البنك', 190], ['تاريخ الحركة', 140]],
    after: [['البيان', 210], ['المبلغ', 120], ['العملة', 80], ['نوع الحركة', 140], ['طريقة الدفع', 120], ['سعر الصرف', 90], ['اسم المستخدم', 140]],
};

function Dash() {
    return <span className="text-gray-300">—</span>;
}

/**
 * The entry's transaction as the statement shows it, from the server's
 * `ledger`; an entry without one (a transaction since removed) shows what
 * the entry itself kept.
 */
export function ledgerOf(entry) {
    if (entry.ledger) return entry.ledger;
    const transaction = entry.transaction ?? {};

    return {
        voucherNumber: entry.voucherNumber ?? transaction.manual_voucher_number ?? transaction.voucher_number ?? null,
        referenceNumber: entry.referenceNumber ?? transaction.reference_number ?? null,
        bankName: entry.bankName ?? transaction.bank_name ?? null,
        senderBankName: entry.senderBank ?? transaction.sender_bank_name ?? null,
    };
}

/** The entry's voucher, reference, bank and date, the cells before its subscriber. */
export function LedgerLeadCells({ ledger }) {
    return <>
        <td dir="ltr" className="text-start font-display font-semibold text-gray-900">{ledger.voucherNumber ?? <Dash />}</td>
        <td dir="ltr" className="text-start font-display text-gray-700" title={ledger.referenceNumber ?? ''}>{ledger.referenceNumber ?? <Dash />}</td>
        <td className="text-gray-700" style={{ whiteSpace: 'normal' }}>{ledger.bankName ? <span className="grid gap-0.5 text-xs leading-5">{ledger.senderBankName && <span>من: {ledger.senderBankName}</span>}<span>إلى: {ledger.bankName}</span></span> : <Dash />}</td>
        <td dir="ltr" className="text-start font-display text-xs text-gray-600">{ledger.date ?? <Dash />}</td>
    </>;
}

/** The entry's description, amount, currency, type, method, rate and recorder, the cells after its subscriber. */
export function LedgerTrailCells({ ledger, amount, currency, cancelled }) {
    return <>
        <td className="text-gray-900" title={ledger.description ?? ''}>{ledger.description ?? <Dash />}</td>
        <td><b dir="ltr" className={`font-display ${cancelled ? 'text-gray-400 line-through' : 'text-emerald-700 dark:text-emerald-400'}`}>{formatMoney(amount)}</b></td>
        <td className="text-gray-700">{ledger.currencyLabel ?? currencyLabels[currency] ?? currency}</td>
        <td>{ledger.typeLabel ? <span className="inline-flex items-center gap-1.5"><StatusPill tone={ledger.isCredit ? 'green' : 'red'} label={ledger.isCredit ? 'له' : 'عليه'} /><span className="font-medium text-gray-900">{ledger.typeLabel}</span></span> : <Dash />}</td>
        <td className="text-gray-700">{ledger.paymentMethodLabel ?? <Dash />}</td>
        <td dir="ltr" className="text-start font-display text-gray-600">{ledger.exchangeRate ?? <Dash />}</td>
        <td className="text-gray-700" title={ledger.recordedByName ?? ''}>{ledger.recordedByName ?? <Dash />}</td>
    </>;
}
