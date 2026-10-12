import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Pagination from '@/Components/DataTable/Pagination';
import CollectionNavigation from './CollectionNavigation';
import CollectorCashBox from './CollectorCashBox';

export default function CashBoxes({ cashBox, history, collectionUrls }) {
    const pendingCount = cashBox.boxes.filter((box) => box.status !== 'open' && !box.confirmedAt).length;

    return (
        <AuthenticatedLayout header={<div className="min-w-0"><p className="text-sm font-semibold text-gray-500">{cashBox.branchName ?? 'حسابك الحالي'}</p><h2 className="mt-1 text-3xl font-bold text-gray-900">صناديقي</h2></div>}>
            <Head title="صناديقي" />
            <CollectionNavigation urls={collectionUrls} active="cashBoxes" pendingCount={pendingCount} />
            {cashBox.started ? (
                <>
                    <CollectorCashBox cashBox={{ ...cashBox, boxes: [...cashBox.boxes, ...history.data] }} mode="history" />
                    {history.total > 0 && <Pagination meta={history} filters={{}} baseUrl={collectionUrls.cashBoxes} />}
                </>
            ) : (
                <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">{cashBox.branchName ? 'لم يُفعّل نظام الصناديق في فرعك بعد. يُفعّله مسؤول الفرع من صفحة الإغلاق.' : 'حسابك غير مرتبط بفرع، لذلك لا يوجد سجل صناديق شخصي. يمكنك مراجعة صناديق الفروع من صفحة الإغلاق.'}</p>
            )}
        </AuthenticatedLayout>
    );
}
