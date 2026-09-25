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
import TariffModal from './TariffModal';

export default function Index({ tariffs, canCreate, categoryOptions, filters, filterOptions }) {
    const [modalTariff, setModalTariff] = useState(null);
    const [creating, setCreating] = useState(false);
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

            <TariffModal show={creating} onClose={() => setCreating(false)} tariff={null} categoryOptions={categoryOptions} />

            {/* Keyed by tariff id so switching who's being edited remounts
                the form with fresh initial values — useForm() only captures
                its initial data once, it won't pick up a changed `tariff`
                prop on an already-mounted instance. */}
            {modalTariff && (
                <TariffModal key={modalTariff.id} show onClose={() => setModalTariff(null)} tariff={modalTariff} categoryOptions={categoryOptions} />
            )}
        </SettingsLayout>
    );
}
