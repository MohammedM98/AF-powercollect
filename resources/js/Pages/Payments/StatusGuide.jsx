import Icon from '@/Components/Icon';
import StatusPill from '@/Components/DataTable/StatusPill';
import { boxStatusLabels } from '@/lib/financialBoxes';

const boxStatuses = [
    [boxStatusLabels.open, 'يجمع دفعات المحصّل الجديدة من نوعه حتى يؤكّد الفرع إغلاقه.'],
    [boxStatusLabels.received, 'أكّد مسؤول الفرع أو صاحب صلاحية الإغلاق إغلاقه فقُفلت حركاته، ويظهر تلقائيًا لقسم التدقيق ضمن فترة إغلاقه الأسبوعية.'],
];

const entryStatuses = [
    ['سارية', 'green', 'حركة قائمة تُحسب في إجمالي الصندوق.'],
    ['ملغاة', 'gray', 'أُلغيت أو أُرجعت من كشف المشترك، فلا تُحسب في الإجمالي.'],
    ['غير موجودة في البنك', 'red', 'حوالة لم يُعثر عليها في البنك عند التحقق منها، وتحتاج متابعة.'],
    ['مرفوضة', 'red', 'مقاصة رُفضت عند التحقق منها، وتحتاج متابعة.'],
];

/**
 * What each status on the financial boxes pages means, folded under one
 * line until asked for: a box's status and an entry's. Confirming or
 * rejecting transfers and clearings is the auditors' work, said once here.
 */
export default function StatusGuide({ className = '' }) {
    return <details className={`group rounded-panel border border-gray-100 bg-surface text-sm shadow-sm ${className}`}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 font-semibold text-gray-700 marker:hidden hover:text-gray-900 [&::-webkit-details-marker]:hidden">
            <Icon name="info" className="h-4 w-4 text-gray-400" />
            ما معنى الحالات؟
            <Icon name="chevron-down" className="ms-auto h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-5 border-t border-gray-100 p-4 md:grid-cols-2">
            <section aria-label="حالة الصندوق">
                <h3 className="mb-2 text-xs font-bold text-gray-500">حالة الصندوق</h3>
                <dl className="space-y-2">
                    {boxStatuses.map(([[label, tone], meaning]) => <div key={label} className="flex items-start gap-3">
                        <dt className="w-40 shrink-0"><StatusPill tone={tone} label={label} /></dt>
                        <dd className="leading-6 text-gray-600">{meaning}</dd>
                    </div>)}
                </dl>
            </section>
            <section aria-label="حالة الحركة">
                <h3 className="mb-2 text-xs font-bold text-gray-500">حالة الحركة</h3>
                <dl className="space-y-2">
                    {entryStatuses.map(([label, tone, meaning]) => <div key={label} className="flex items-start gap-3">
                        <dt className="w-40 shrink-0"><StatusPill tone={tone} label={label} /></dt>
                        <dd className="leading-6 text-gray-600">{meaning}</dd>
                    </div>)}
                </dl>
            </section>
            <p className="flex items-start gap-2 rounded-control bg-gray-50 p-3 leading-6 text-gray-600 md:col-span-2"><Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />يدقّق قسم التدقيق الصناديق النقدية والحوالات والمقاصات بعد إغلاقها، وتُرتّب له تلقائيًا ضمن فترات أسبوعية.</p>
        </div>
    </details>;
}
