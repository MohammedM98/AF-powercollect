import { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import { useDataTable } from '@/hooks/useDataTable';
import BoxTabs from './BoxTabs';
import CloseBoxesByType from './CloseBoxesByType';
import OpenEntriesTable from './OpenEntriesTable';
import StatusGuide from './StatusGuide';

/**
 * The open entries tab of the financial boxes page, for those who close
 * the branch's boxes: every entry of the branch's open boxes, theirs among
 * them, which a filter narrows to one person's and another to one type of
 * box. The entries of a closed box are looked over inside that box, on the
 * boxes tab. Those who may confirm the branch's boxes closed can close
 * every open box of one type at once.
 */
export default function Entries({ started, branch, branches, people, tabs, entries, filters, counts, closableBoxes = null, pendingCount, urls }) {
    const [closingByType, setClosingByType] = useState(false);
    const extraParams = { branch_id: branch.id };
    const table = useDataTable(urls.index, filters, extraParams);

    return <AuthenticatedLayout badges={{ '/payments/summary': pendingCount }} header={<>
        <div>
            <p className="text-sm font-semibold text-gray-500">{branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : branch.name}</p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"><h2 className="text-3xl font-bold text-gray-900">الصناديق المالية</h2><BoxTabs tabs={tabs} current="entries" /></div>
        </div>
        {started && closableBoxes && <div className="shrink-0"><PrimaryButton type="button" onClick={() => setClosingByType(true)} disabled={!closableBoxes.length}><Icon name="lock" className="h-4 w-4" />إغلاق الصناديق حسب النوع{closableBoxes.length > 0 && <span className="rounded-full bg-white/20 px-2 py-0.5 font-display text-xs">{closableBoxes.length}</span>}</PrimaryButton></div>}
    </>}>
        <Head title="الحركات المفتوحة" />
        {started && <p className="mb-4 flex items-center gap-2 text-sm text-gray-500"><Icon name="unlock" className="h-4 w-4 shrink-0" /><span>تعرض هذه الصفحة حركات الصناديق المفتوحة فقط؛ حركات الصناديق المغلقة تجدها داخل كل صندوق في تبويب <b className="font-semibold text-gray-900">الصناديق</b>.</span></p>}
        {started && <StatusGuide className="mb-4" />}
        {!started ? <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">لم يُفعّل نظام الصناديق في هذا الفرع بعد. يُفعّله مسؤول الفرع من صفحة إدارة الإغلاق.</p> : (
            <OpenEntriesTable table={table} entries={entries} filters={filters} counts={counts} url={urls.index} extraParams={extraParams} people={people} label="حركات الفرع" />
        )}
        {closingByType && <CloseBoxesByType boxes={closableBoxes} branchId={branch.id} userId={table.filterValues.user} initialType={table.filterValues.type ?? ''} actionsUrl={urls.actions} onClose={() => setClosingByType(false)} />}
    </AuthenticatedLayout>;
}
