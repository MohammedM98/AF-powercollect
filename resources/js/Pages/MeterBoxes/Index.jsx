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
import MeterBoxModal from './MeterBoxModal';

export default function Index({
    meterBoxes,
    canCreate,
    branches,
    canChooseBranch,
    governorates,
    areas,
    subAreas,
    currentBranchAreaId,
    filters,
    filterOptions,
}) {
    const [modalMeterBox, setModalMeterBox] = useState(null);
    const [creating, setCreating] = useState(false);
    const { search, setSearch, sort, setPerPage, filterValues, setFilter, clearFilters } = useDataTable('/meter-boxes', filters);

    return (
        <SettingsLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold text-gray-900">الطبلونات</h2>
                    </div>
                    {canCreate && (
                        <div className="shrink-0">
                            <AddButton onClick={() => setCreating(true)}>طبلون جديد</AddButton>
                        </div>
                    )}
                </>
            }
        >
            <Head title="الطبلونات" />

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو رقم الطبلون..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={meterBoxes.total}
                filterMenu={
                    <DataTableFilterMenu
                        tableKey="meter_boxes"
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
                            <SortableTh column="name" label="الاسم" sortState={filters} onSort={sort} />
                            <SortableTh column="box_number" label="رقم الطبلون" sortState={filters} onSort={sort} />
                            <th>الفرع</th>
                            <th>المحافظة / المنطقة</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {meterBoxes.data.length === 0 ? (
                            <tr>
                                <td className="text-gray-500" colSpan={5}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            meterBoxes.data.map((meterBox) => (
                                <tr key={meterBox.id}>
                                    <td>
                                        <RowIdentity icon="table" name={meterBox.name} subtitle={meterBox.subAreaName} />
                                    </td>
                                    <td>
                                        <span className="data-chip">{meterBox.box_number}</span>
                                    </td>
                                    <td className="text-gray-600">{meterBox.branchName}</td>
                                    <td className="text-gray-600">
                                        {[meterBox.governorateName, meterBox.areaName, meterBox.subAreaName].filter(Boolean).join(' / ') || '—'}
                                    </td>
                                    <td className="text-end">
                                        {meterBox.canUpdate && (
                                            <RowActionsMenu>
                                                <button onClick={() => setModalMeterBox(meterBox)}>تعديل</button>
                                            </RowActionsMenu>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={meterBoxes} filters={filters} baseUrl="/meter-boxes" />

            <MeterBoxModal
                show={creating}
                onClose={() => setCreating(false)}
                meterBox={null}
                branches={branches}
                canChooseBranch={canChooseBranch}
                governorates={governorates}
                areas={areas}
                subAreas={subAreas}
                currentBranchAreaId={currentBranchAreaId}
            />

            {/* Keyed by meter box id so switching who's being edited remounts
                the form with fresh initial values — useForm() only captures
                its initial data once, it won't pick up a changed `meterBox`
                prop on an already-mounted instance. */}
            {modalMeterBox && (
                <MeterBoxModal
                    key={modalMeterBox.id}
                    show
                    onClose={() => setModalMeterBox(null)}
                    meterBox={modalMeterBox}
                    branches={branches}
                    canChooseBranch={canChooseBranch}
                    governorates={governorates}
                    areas={areas}
                    subAreas={subAreas}
                    currentBranchAreaId={currentBranchAreaId}
                />
            )}
        </SettingsLayout>
    );
}
