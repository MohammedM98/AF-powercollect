import StatusPill from '@/Components/DataTable/StatusPill';

export default function LatePaymentDetails({ paidOn, recordedAt, reason, compact = false }) {
    if (!paidOn) return null;

    return <span className="block max-w-xs space-y-1 whitespace-normal text-sm leading-6" title={compact ? reason : undefined}>
        <StatusPill tone="amber" label="تسجيل متأخر" />
        <span className="block text-gray-700">الدفع الفعلي: <bdi dir="ltr" className="font-display">{paidOn}</bdi></span>
        <span className="block text-gray-500">التسجيل بالنظام: <bdi dir="ltr" className="font-display">{recordedAt}</bdi></span>
        {!compact && reason && <span className="block break-words text-gray-600">سبب التأخير: {reason}</span>}
    </span>;
}
