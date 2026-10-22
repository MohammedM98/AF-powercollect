import { useState } from 'react';
import { Head, Link, router, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AddButton from '@/Components/AddButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import StatusPill from '@/Components/DataTable/StatusPill';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import Pagination from '@/Components/DataTable/Pagination';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import Modal from '@/Components/Modal';
import FormField from '@/Components/Form/FormField';
import FormSelect from '@/Components/Form/FormSelect';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import Icon from '@/Components/Icon';
import { useDataTable } from '@/hooks/useDataTable';
import { useRowClick } from '@/hooks/useRowClick';
import { formatNumber } from '@/lib/format';
import { STAGES } from '@/lib/readingBoard';
import PageHeader from '@/Components/PageHeader';

/** A new cycle: one of the branch's weeks and the day it is read. */
function NewCycleModal({ branchOptions, weekOptions, defaultBranchId, onClose }) {
    const form = useForm({ branch_id: defaultBranchId ? String(defaultBranchId) : '', week_start: '', reading_date: '', notes: '' });
    const weeks = (weekOptions[form.data.branch_id] ?? []).filter((week) => !week.taken);
    const week = weeks.find((candidate) => candidate.value === form.data.week_start);

    function chooseWeek(value) {
        const chosen = weeks.find((candidate) => candidate.value === value);
        form.setData((data) => ({ ...data, week_start: value, reading_date: chosen?.defaultReadingDate ?? '' }));
    }

    function submit(event) {
        event.preventDefault();
        form.post('/reading-cycles', { onSuccess: onClose });
    }

    return (
        <Modal show onClose={onClose} maxWidth="lg" centered>
            <form onSubmit={submit} aria-labelledby="new-cycle-title">
                <div className="flex items-start gap-4 px-7 pb-2 pt-7">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                        <Icon name="calendar" strokeWidth={2} />
                    </span>
                    <div>
                        <h3 id="new-cycle-title" className="text-lg font-bold text-gray-900">دورة قراءة جديدة</h3>
                        <p className="mt-1 text-sm text-gray-600">تُحضَّر قبل يوم القراءة بيوم أو أكثر. لا تُدخل القراءات إلا في يوم القراءة.</p>
                    </div>
                </div>
                <div className="space-y-4 px-7 py-5">
                    {branchOptions.length > 0 && (
                        <FormSelect id="cycle-branch" label="الفرع" required value={form.data.branch_id} onChange={(value) => form.setData((data) => ({ ...data, branch_id: value, week_start: '', reading_date: '' }))} options={branchOptions} error={form.errors.branch_id} />
                    )}
                    <FormSelect
                        id="cycle-week"
                        label="أسبوع القراءة"
                        required
                        value={form.data.week_start}
                        onChange={chooseWeek}
                        options={weeks.map((candidate) => ({ value: candidate.value, label: candidate.label }))}
                        blockedMessage={!form.data.branch_id ? 'اختر الفرع أولًا' : null}
                        emptyMessage="لكل الأسابيع القريبة دورات من قبل"
                        error={form.errors.week_start}
                    />
                    <FormField id="cycle-date" label="يوم القراءة" required error={form.errors.reading_date} hint={week ? `يوم القراءة المعتاد ${week.end}؛ يمكن تأخيره حتى ${week.maxReadingDate} إذا كان للفرع ظرف خاص.` : undefined}>
                        <input type="date" min={week?.defaultReadingDate} max={week?.maxReadingDate} value={form.data.reading_date} onChange={(event) => form.setData('reading_date', event.target.value)} className="block w-full text-sm" disabled={!week} />
                    </FormField>
                    <FormField id="cycle-notes" label="ملاحظات" error={form.errors.notes}>
                        <textarea rows={2} value={form.data.notes} onChange={(event) => form.setData('notes', event.target.value)} className="block w-full text-sm" />
                    </FormField>
                </div>
                <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-7 py-4">
                    <SecondaryButton onClick={onClose}>إلغاء</SecondaryButton>
                    <PrimaryButton type="submit" disabled={form.processing || !week}>إنشاء الدورة</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}

/**
 * Each branch's reading cycles: the week, its reading day, and how far the
 * allocation of its meter boxes has come.
 */
export default function Index({ cycles, canCreate, branchOptions, weekOptions, defaultBranchId, filters, filterOptions }) {
    const [creating, setCreating] = useState(false);
    const rowClick = useRowClick();
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, setFilters, clearFilters } = useDataTable('/reading-cycles', filters);

    return (
        <AuthenticatedLayout
            header={
                <PageHeader
                    title="توزيع القراءات"
                    info="دورات القراءة لكل فرع: توزيع الطبلونات على القرّاء الميدانيين والكشوف الورقية واعتمادها."
                    actions={canCreate && <AddButton onClick={() => setCreating(true)}>دورة قراءة جديدة</AddButton>}
                />
            }
        >
            <Head title="توزيع القراءات" />

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث في الملاحظات..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={cycles.total}
                printable={false}
                filterMenu={filterOptions.length > 0 ? <DataTableFilterMenu tableKey="reading_cycles" groups={filterOptions} values={filterValues} onChange={setFilter} onChangeMany={setFilters} onClear={clearFilters} /> : null}
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start" aria-label="دورات القراءة">
                    <thead>
                        <tr>
                            <SortableTh column="reading_date" label="يوم القراءة" sortState={filters} onSort={sort} />
                            <SortableTh column="week_start" label="الأسبوع" sortState={filters} onSort={sort} />
                            <th>الفرع</th>
                            <th>المرحلة</th>
                            <th>التوزيع</th>
                            <th>قراءات للمراجعة</th>
                            <ActionsTh />
                        </tr>
                    </thead>
                    <tbody>
                        {cycles.data.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="text-gray-500">لا توجد دورات قراءة بعد.</td>
                            </tr>
                        ) : (
                            cycles.data.map((cycle) => (
                                <tr key={cycle.id} {...rowClick(() => router.visit(`/reading-cycles/${cycle.id}`))}>
                                    <td data-label="يوم القراءة">
                                        <RowIdentity icon="calendar" name={<Link href={`/reading-cycles/${cycle.id}`} className="hover:underline">{cycle.readingDayName} <span dir="ltr">{cycle.readingDate}</span></Link>} subtitle={cycle.movedReadingDay ? 'يوم قراءة مؤجل لهذه الدورة' : cycle.notes} />
                                    </td>
                                    <td data-label="الأسبوع" className="whitespace-nowrap text-gray-600" dir="ltr">{cycle.weekStart} → {cycle.weekEnd}</td>
                                    <td data-label="الفرع" className="text-gray-600">{cycle.branchName}</td>
                                    <td data-label="المرحلة"><StatusPill tone={STAGES[cycle.stage].tone} label={STAGES[cycle.stage].label} /></td>
                                    <td data-label="التوزيع" className="text-gray-700">
                                        {formatNumber(cycle.mobileCount)} للقرّاء · {formatNumber(cycle.paperCount)} ورقي
                                        <span className="block text-xs text-gray-500">معتمد {formatNumber(cycle.approvedCount)}</span>
                                    </td>
                                    <td data-label="قراءات للمراجعة">{cycle.reviewCount > 0 ? <StatusPill tone="amber" label={formatNumber(cycle.reviewCount)} /> : <span className="text-gray-400">—</span>}</td>
                                    <td data-actions="" className="text-end"><RowActionsMenu onView={() => router.visit(`/reading-cycles/${cycle.id}`)} /></td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={cycles} filters={filters} baseUrl="/reading-cycles" />

            {creating && <NewCycleModal branchOptions={branchOptions} weekOptions={weekOptions} defaultBranchId={defaultBranchId} onClose={() => setCreating(false)} />}
        </AuthenticatedLayout>
    );
}
