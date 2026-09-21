import { useState } from 'react';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

export default function MeterBoxForm({ data, setData, errors, branches, canChooseBranch, governorates, areas }) {
    const selectedBranch = canChooseBranch ? branches.find((branch) => String(branch.id) === String(data.branch_id)) : null;

    const [governorateId, setGovernorateId] = useState(selectedBranch?.governorate_id ?? '');
    const [areaId, setAreaId] = useState(selectedBranch?.area_id ?? '');

    const areasInGovernorate = governorateId
        ? areas.filter((area) => String(area.governorate_id) === String(governorateId))
        : [];

    const branchesInArea = areaId
        ? branches.filter((branch) => String(branch.area_id) === String(areaId))
        : [];

    function onGovernorateChange(value) {
        setGovernorateId(value);
        setAreaId('');
        setData('branch_id', '');
    }

    function onAreaChange(value) {
        setAreaId(value);
        setData('branch_id', '');
    }

    return (
        <>
            <div>
                <InputLabel htmlFor="name" value="اسم الطبلون" />
                <TextInput
                    id="name"
                    className="mt-1 block w-full"
                    value={data.name}
                    autoFocus
                    onChange={(e) => setData('name', e.target.value)}
                />
                <InputError message={errors.name} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="box_number" value="رقم الطبلون" />
                <TextInput
                    id="box_number"
                    dir="ltr"
                    className="mt-1 block w-full"
                    value={data.box_number}
                    onChange={(e) => setData('box_number', e.target.value)}
                />
                <InputError message={errors.box_number} className="mt-2" />
            </div>

            {canChooseBranch ? (
                <>
                    <div className="mt-4">
                        <InputLabel htmlFor="governorate_id" value="المحافظة" />
                        {governorates.length === 0 ? (
                            <p className="mt-1 text-sm text-gray-500">لا توجد محافظات بعد.</p>
                        ) : (
                            <select
                                id="governorate_id"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                value={governorateId}
                                onChange={(e) => onGovernorateChange(e.target.value)}
                            >
                                <option value="">— اختر محافظة —</option>
                                {governorates.map((governorate) => (
                                    <option key={governorate.id} value={governorate.id}>
                                        {governorate.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="mt-4">
                        <InputLabel htmlFor="area_id" value="المنطقة" />
                        {!governorateId ? (
                            <p className="mt-1 text-sm text-gray-500">اختر محافظة أولاً لعرض مناطقها.</p>
                        ) : areasInGovernorate.length === 0 ? (
                            <p className="mt-1 text-sm text-gray-500">لا توجد مناطق في هذه المحافظة بعد.</p>
                        ) : (
                            <select
                                id="area_id"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                value={areaId}
                                onChange={(e) => onAreaChange(e.target.value)}
                            >
                                <option value="">— اختر منطقة —</option>
                                {areasInGovernorate.map((area) => (
                                    <option key={area.id} value={area.id}>
                                        {area.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="mt-4">
                        <InputLabel htmlFor="branch_id" value="الفرع" />
                        {!areaId ? (
                            <p className="mt-1 text-sm text-gray-500">اختر منطقة أولاً لعرض فروعها.</p>
                        ) : branchesInArea.length === 0 ? (
                            <p className="mt-1 text-sm text-gray-500">لا توجد فروع في هذه المنطقة بعد.</p>
                        ) : (
                            <select
                                id="branch_id"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                value={data.branch_id}
                                onChange={(e) => setData('branch_id', e.target.value)}
                            >
                                <option value="">— اختر فرعًا —</option>
                                {branchesInArea.map((branch) => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <InputError message={errors.branch_id} className="mt-2" />
                    </div>
                </>
            ) : (
                <p className="mt-4 text-sm text-gray-500">سينتمي هذا الطبلون إلى فرعك.</p>
            )}
        </>
    );
}
