export const bankAuditReasonPresets = [
    { value: 'missing', label: 'غير موجودة في البنك' },
    { value: 'partial', label: 'وصل جزء من المبلغ' },
    { value: 'amount', label: 'قيمة البنك غير مطابقة' },
    { value: 'details', label: 'اختلاف في بيانات الحوالة' },
];

/** Presets are editable note text; only a missing transfer determines the bank amount. */
export function bankAuditReasonChoice(data, choice) {
    const preset = bankAuditReasonPresets.find((option) => option.value === choice);

    return preset ? { ...data, reason: preset.label, ...(choice === 'missing' ? { bank_amount: '0' } : {}) } : data;
}
