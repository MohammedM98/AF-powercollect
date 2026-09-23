import { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import SortableTh from '@/Components/DataTable/SortableTh';
import Pagination from '@/Components/DataTable/Pagination';
import { useDataTable } from '@/hooks/useDataTable';
import GovernorateModal from './GovernorateModal';
import AreaModal from '../Areas/AreaModal';
import SubAreaModal from '../SubAreas/SubAreaModal';

export default function Index({ governorates, selectedGovernorate, selectedArea, status, filters, governorateOptions, areaOptions }) {
    const [modalGovernorate, setModalGovernorate] = useState(null);
    const [creatingGovernorate, setCreatingGovernorate] = useState(false);
    const [modalArea, setModalArea] = useState(null);
    const [creatingArea, setCreatingArea] = useState(false);
    const [modalSubArea, setModalSubArea] = useState(null);
    const [creatingSubArea, setCreatingSubArea] = useState(false);

    const extraParams = { selected: selectedGovernorate?.id, selectedArea: selectedArea?.id };
    const { search, setSearch, sort, setPerPage } = useDataTable('/governorates', filters, extraParams);

    function selectGovernorate(id) {
        router.get(
            '/governorates',
            { search, sort: filters.sort, direction: filters.direction, per_page: filters.per_page, selected: id },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    function selectArea(id) {
        router.get(
            '/governorates',
            {
                search,
                sort: filters.sort,
                direction: filters.direction,
                per_page: filters.per_page,
                selected: selectedGovernorate?.id,
                selectedArea: id,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">المحافظات والمناطق</h2>
                    </div>
                    <div className="shrink-0">
                        <button
                            onClick={() => setCreatingGovernorate(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            محافظة جديدة
                        </button>
                    </div>
                </>
            }
        >
            <Head title="المحافظات والمناطق" />







            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {/* Governorates list */}
                <div>
                    <DataTableToolbar
                        search={search}
                        onSearchChange={setSearch}
                        placeholder="بحث بالاسم..."
                        perPage={filters.per_page}
                        onPerPageChange={setPerPage}
                        total={governorates.total}
                    />

                    <div className="data-table-container">
                        <table className="data-table w-full text-sm text-start">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                                <tr>
                                    <SortableTh column="name" label="الاسم" sortState={filters} onSort={sort} />
                                    <th className="px-6 py-3">عدد المناطق</th>
                                    <th className="px-6 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {governorates.data.length === 0 ? (
                                    <tr>
                                        <td className="px-6 py-4 text-gray-500" colSpan={3}>
                                            لا توجد نتائج مطابقة.
                                        </td>
                                    </tr>
                                ) : (
                                    governorates.data.map((governorate) => {
                                        const isSelected = selectedGovernorate?.id === governorate.id;
                                        return (
                                            <tr
                                                key={governorate.id}
                                                onClick={() => selectGovernorate(governorate.id)}
                                                className={`cursor-pointer transition ${isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                                            >
                                                <td className={`px-6 py-4 font-medium ${isSelected ? 'text-brand-700' : 'text-gray-900'}`}>
                                                    {governorate.name}
                                                </td>
                                                <td className="px-6 py-4 text-gray-600">{governorate.areasCount}</td>
                                                <td className="px-6 py-4 text-end">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setModalGovernorate(governorate);
                                                        }}
                                                        className="font-medium text-brand-600 hover:underline"
                                                    >
                                                        تعديل
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    <Pagination meta={governorates} filters={filters} baseUrl="/governorates" extraParams={extraParams} />
                </div>

                {/* Selected governorate's areas */}
                <div>
                    {!selectedGovernorate ? (
                        <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
                            <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.5"
                                    d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                                />
                            </svg>
                            <p className="mt-3 text-sm font-medium text-gray-600">اختر محافظة من القائمة لعرض مناطقها</p>
                            <p className="mt-1 text-sm text-gray-400">أو أنشئ محافظة جديدة لتبدأ بإضافة مناطقها</p>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
                            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                                <h3 className="text-base font-bold text-gray-900">مناطق {selectedGovernorate.name}</h3>
                                <button
                                    onClick={() => setCreatingArea(true)}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    إضافة منطقة
                                </button>
                            </div>

                            {selectedGovernorate.areas.length === 0 ? (
                                <p className="px-6 py-8 text-center text-sm text-gray-500">لا توجد مناطق في هذه المحافظة بعد.</p>
                            ) : (
                                <ul className="divide-y">
                                    {selectedGovernorate.areas.map((area) => {
                                        const isSelected = selectedArea?.id === area.id;
                                        return (
                                            <li
                                                key={area.id}
                                                onClick={() => selectArea(area.id)}
                                                className={`flex cursor-pointer items-center justify-between px-6 py-3 transition ${isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                                            >
                                                <span className={`text-sm font-medium ${isSelected ? 'text-brand-700' : 'text-gray-900'}`}>
                                                    {area.name}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setModalArea(area);
                                                    }}
                                                    className="text-sm font-medium text-brand-600 hover:underline"
                                                >
                                                    تعديل
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* Selected area's sub-areas (منطقة 2) */}
                <div>
                    {!selectedArea ? (
                        <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
                            <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.5"
                                    d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                                />
                            </svg>
                            <p className="mt-3 text-sm font-medium text-gray-600">اختر منطقة من القائمة لعرض منطقة 2 الخاصة بها</p>
                            <p className="mt-1 text-sm text-gray-400">أو أنشئ منطقة جديدة لتبدأ بإضافة مناطق 2 لها</p>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
                            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                                <h3 className="text-base font-bold text-gray-900">منطقة 2 لـ {selectedArea.name}</h3>
                                <button
                                    onClick={() => setCreatingSubArea(true)}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    إضافة منطقة 2
                                </button>
                            </div>

                            {selectedArea.subAreas.length === 0 ? (
                                <p className="px-6 py-8 text-center text-sm text-gray-500">لا توجد منطقة 2 لهذه المنطقة بعد.</p>
                            ) : (
                                <ul className="divide-y">
                                    {selectedArea.subAreas.map((subArea) => (
                                        <li key={subArea.id} className="flex items-center justify-between px-6 py-3">
                                            <span className="text-sm font-medium text-gray-900">{subArea.name}</span>
                                            <button
                                                onClick={() => setModalSubArea(subArea)}
                                                className="text-sm font-medium text-brand-600 hover:underline"
                                            >
                                                تعديل
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <GovernorateModal show={creatingGovernorate} onClose={() => setCreatingGovernorate(false)} governorate={null} />

            {/* Keyed by governorate id so switching who's being edited
                remounts the form with fresh initial values — useForm() only
                captures its initial data once, it won't pick up a changed
                `governorate` prop on an already-mounted instance. */}
            {modalGovernorate && (
                <GovernorateModal key={modalGovernorate.id} show onClose={() => setModalGovernorate(null)} governorate={modalGovernorate} />
            )}

            {/* Keyed by the selected governorate so its id is re-captured as
                the form's default whenever the selection changes —
                useForm() only reads defaultGovernorateId once per mount. */}
            <AreaModal
                key={`create-${selectedGovernorate?.id ?? 'none'}`}
                show={creatingArea}
                onClose={() => setCreatingArea(false)}
                area={null}
                governorates={governorateOptions}
                defaultGovernorateId={selectedGovernorate?.id ?? ''}
            />

            {modalArea && (
                <AreaModal
                    key={modalArea.id}
                    show
                    onClose={() => setModalArea(null)}
                    area={modalArea}
                    governorates={governorateOptions}
                />
            )}

            {/* Keyed by the selected area so its id is re-captured as the
                form's default whenever the selection changes — useForm()
                only reads defaultAreaId once per mount. */}
            <SubAreaModal
                key={`create-${selectedArea?.id ?? 'none'}`}
                show={creatingSubArea}
                onClose={() => setCreatingSubArea(false)}
                subArea={null}
                areas={areaOptions}
                defaultAreaId={selectedArea?.id ?? ''}
            />

            {modalSubArea && (
                <SubAreaModal
                    key={modalSubArea.id}
                    show
                    onClose={() => setModalSubArea(null)}
                    subArea={modalSubArea}
                    areas={areaOptions}
                />
            )}
        </AuthenticatedLayout>
    );
}
