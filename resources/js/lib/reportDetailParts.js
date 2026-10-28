const text = (key, label, width = 22) => ({ key, label, width, type: 'text' });
const money = (key, label, balance = false) => ({ key, label, width: 18, type: 'money', balance });
export const debtColumns = [text('name', 'المشترك'), text('accountNumber', 'رقم الحساب'), text('branchName', 'الفرع'), money('current', 'حتى 30 يومًا'), money('days_60', '31–60 يومًا'), money('days_90', '61–90 يومًا'), money('older', 'أكثر من 90 يومًا'), money('balance', 'الرصيد عليه', true), text('lastPaymentDate', 'آخر دفعة')];
export const boxColumns = [text('number', 'الصندوق', 12), text('collector', 'المحصّل'), text('branchName', 'الفرع'), text('type', 'النوع'), text('status', 'الحالة'), text('currency', 'العملة', 10), { ...money('amount', 'المبلغ المسجل'), type: 'decimal' }, { key: 'count', label: 'عدد الحركات', type: 'int', width: 12 }];
export const statementColumns = [text('day', 'التاريخ', 14), text('voucherNumber', 'السند', 16), text('description', 'البيان', 42), money('debit', 'عليه (مدين)'), money('credit', 'له (دائن)'), money('balance', 'الرصيد', true)];

export function detailExcelPart(key, name, columns, rows) {
    return {
        key, name, default: true, rows,
        columns: columns.map(({ balance, ...column }) => ({
            ...column,
            sum: key === 'debts' ? column.type === 'money' : key === 'statement' ? ['debit', 'credit'].includes(column.key) : column.key === 'count',
        })),
    };
}
