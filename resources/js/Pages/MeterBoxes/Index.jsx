import { useState } from 'react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import SortableTh from '@/Components/DataTable/SortableTh';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import MeterBoxModal from './MeterBoxModal';

export default function Index({ meterBoxes, status, branches, canChooseBranch, governorates, areas, filters }) {
    const [modalMeterBox, setModalMeterBox] = useState(null);
    const [creating, setCreating] = useState(false);
    const { search, setSearch, sort, setPerPage } = useDataTable('/meter-boxes', filters);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">الطبلونات</h2>
                    </div>
                    <div className="shrink-0">
                        <button
                            onClick={() => setCreating(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            طبلون جديد
                        </button>
                    </div>
                </>
            }
        >
            <Head title="الطبلونات" />

            {status === 'meter-box-created' && <div className="mb-4 text-sm font-medium text-green-600">تم إنشاء الطبلون.</div>}
            {status === 'meter-box-updated' && <div className="mb-4 text-sm font-medium text-green-600">تم تحديث الطبلون.</div>}

            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="بحث بالاسم أو رقم الطبلون..."
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={meterBoxes.total}
            />

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm text-start">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <SortableTh column="name" label="الاسم" sortState={filters} onSort={sort} />
                            <SortableTh column="box_number" label="رقم الطبلون" sortState={filters} onSort={sort} />
                            <th className="px-6 py-3">الفرع</th>
                            <th className="px-6 py-3">المحافظة / المنطقة</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {meterBoxes.data.length === 0 ? (
                            <tr>
                                <td className="px-6 py-4 text-gray-500" colSpan={5}>
                                    لا توجد نتائج مطابقة.
                                </td>
                            </tr>
                        ) : (
                            meterBoxes.data.map((meterBox) => (
                                <tr key={meterBox.id} className="transition hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{meterBox.name}</td>
                                    <td className="px-6 py-4 text-gray-600" dir="ltr">
                                        {meterBox.box_number}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{meterBox.branchName}</td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {[meterBox.governorateName, meterBox.areaName].filter(Boolean).join(' / ') || '—'}
                                    </td>
                                    <td className="px-6 py-4 text-end">
                                        <button onClick={() => setModalMeterBox(meterBox)} className="font-medium text-brand-600 hover:underline">
                                            تعديل
                                        </button>
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
                />
            )}
        </AuthenticatedLayout>
    );
}
