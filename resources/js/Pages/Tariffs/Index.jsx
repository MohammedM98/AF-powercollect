import { useState } from 'react';
import { Head } from '@inertiajs/react';
import SettingsLayout from '@/Layouts/SettingsLayout';
import AddButton from '@/Components/AddButton';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import DataTableFilterMenu from '@/Components/DataTable/DataTableFilterMenu';
import SortableTh from '@/Components/DataTable/SortableTh';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import { formatCurrency } from '@/lib/currency';
import Icon from '@/Components/Icon';
import TariffModal from './TariffModal';
import TariffSegmentModal from './TariffSegmentModal';

export default function Index({ tariffs, segmentGroups, canCreate, canCreateSegment, categoryOptions, filters, filterOptions }) {
    const [modalTariff, setModalTariff] = useState(null);
    const [creating, setCreating] = useState(false);
    // The tariff a new segment is being added under, and the segment being renamed.
    const [creatingSegmentFor, setCreatingSegmentFor] = useState(null);
    const [modalSegment, setModalSegment] = useState(null);
    const tariffOptions = segmentGroups.map((group) => ({ value: group.id, label: group.categoryLabel }));
    const { setPerPage, sort, filterValues, setFilter, clearFilters } = useDataTable('/tariffs', filters);

    return (
        <SettingsLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold text-gray-900">التعرفات</h2>
                    </div>
                    {canCreate && (
                        <div className="shrink-0">
                            <AddButton onClick={() => setCreating(true)}>تعرفة جديدة</AddButton>
                        </div>
                    )}
                </>
            }
        >
            <Head title="التعرفات" />

            <DataTableToolbar
                showSearch={false}
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={tariffs.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="tariffs"
                        groups={filterOptions}
                        values={filterValues}
                        onChange={setFilter}
                        onClear={clearFilters}
                    />
                }
            />

            <div className="data-table-container">
                <table className="data-table w-full text-sm text-start">
                    <thead>
                        <tr>
                            <SortableTh column="category" label="الفئة" sortState={filters} onSort={sort} />
                            <SortableTh column="rate" label="السعر (شيكل)" sortState={filters} onSort={sort} />
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {tariffs.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={3}>
                                    لا توجد تعرفات بعد.
                                </td>
                            </tr>
                        ) : (
                            tariffs.data.map((tariff) => (
                                <tr key={tariff.id}>
                                    <td>
                                        <RowIdentity icon="dollar" name={tariff.categoryLabel} />
                                    </td>
                                    <td className="text-end text-gray-600" dir="ltr">
                                        {formatCurrency(tariff.rate)}
                                    </td>
                                    <td className="text-end">
                                        {tariff.canUpdate && (
                                            <RowActionsMenu>
                                                <button onClick={() => setModalTariff(tariff)}>تعديل</button>
                                            </RowActionsMenu>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={tariffs} filters={filters} baseUrl="/tariffs" />

            <section className="mt-8 rounded-card border border-gray-100 bg-surface shadow-card">
                <div className="border-b border-gray-100 px-6 py-4">
                    <h3 className="text-base font-bold text-gray-900">تصنيف الزبائن</h3>
                    <p className="mt-0.5 text-sm text-gray-500">مثل المساجد والمدارس والمستشفيات — للتجميع والتقارير، ويبقى السعر سعر التعرفة.</p>
                </div>

                {segmentGroups.length === 0 ? (
                    <p className="px-6 py-8 text-center text-sm text-gray-500">أضف تعرفة أولًا، ثم أضف تصنيف الزبائن لها هنا.</p>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {segmentGroups.map((group) => (
                            <li key={group.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start">
                                <span className="w-24 shrink-0 pt-1.5 text-sm font-bold text-gray-900">{group.categoryLabel}</span>
                                <div className="flex flex-1 flex-wrap items-center gap-2">
                                    {group.segments.length === 0 && (
                                        <span className="py-1.5 text-sm text-gray-400">
                                            لا يوجد تصنيف للزبائن — يُسجَّل المشتركون «{group.categoryLabel}» فقط.
                                        </span>
                                    )}
                                    {group.segments.map((segment) => {
                                        const content = (
                                            <>
                                                {segment.name}
                                                <span className="text-xs font-normal tabular-nums text-gray-400">
                                                    {segment.subscribersCount} مشترك
                                                </span>
                                                {segment.canUpdate && <Icon name="pencil" className="h-3.5 w-3.5 text-gray-400" />}
                                            </>
                                        );
                                        const chipClass =
                                            'inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1.5 text-sm font-semibold text-gray-800';

                                        return segment.canUpdate ? (
                                            <button
                                                key={segment.id}
                                                type="button"
                                                onClick={() => setModalSegment(segment)}
                                                title="تعديل تصنيف الزبائن"
                                                className={`${chipClass} transition hover:border-gray-300 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900`}
                                            >
                                                {content}
                                            </button>
                                        ) : (
                                            <span key={segment.id} className={chipClass}>
                                                {content}
                                            </span>
                                        );
                                    })}
                                </div>
                                {canCreateSegment && (
                                    <div className="shrink-0">
                                        <AddButton variant="soft" onClick={() => setCreatingSegmentFor(group.id)}>
                                            إضافة تصنيف للزبائن
                                        </AddButton>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <TariffModal show={creating} onClose={() => setCreating(false)} tariff={null} categoryOptions={categoryOptions} />

            {/* Keyed by tariff id so switching who's being edited remounts
                the form with fresh initial values — useForm() only captures
                its initial data once, it won't pick up a changed `tariff`
                prop on an already-mounted instance. */}
            {modalTariff && (
                <TariffModal key={modalTariff.id} show onClose={() => setModalTariff(null)} tariff={modalTariff} categoryOptions={categoryOptions} />
            )}

            {creatingSegmentFor && (
                <TariffSegmentModal
                    key={`new-${creatingSegmentFor}`}
                    show
                    onClose={() => setCreatingSegmentFor(null)}
                    segment={null}
                    tariffId={creatingSegmentFor}
                    tariffOptions={tariffOptions}
                />
            )}

            {modalSegment && (
                <TariffSegmentModal
                    key={modalSegment.id}
                    show
                    onClose={() => setModalSegment(null)}
                    segment={modalSegment}
                    tariffOptions={tariffOptions}
                />
            )}
        </SettingsLayout>
    );
}
