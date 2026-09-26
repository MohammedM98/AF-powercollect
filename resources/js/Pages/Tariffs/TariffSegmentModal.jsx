import FormModal from '@/Components/FormModal';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import { useResourceForm } from '@/hooks/useResourceForm';

/**
 * Add a customer segment under a tariff, or rename one. `tariffId`
 * preselects the tariff for a new segment; an existing segment stays
 * under its own tariff.
 */
export default function TariffSegmentModal({ show, onClose, segment, tariffId, tariffOptions }) {
    const form = useResourceForm('/tariff-segments', segment, {
        tariff_id: segment?.tariff_id ?? tariffId ?? tariffOptions[0]?.value ?? '',
        name: segment?.name ?? '',
    });
    const { data, setData, errors, isEdit } = form;

    return (
        <FormModal show={show} onClose={onClose} form={form} title={isEdit ? 'تعديل التصنيف' : 'إضافة تصنيف'} icon="users" bodyClassName="space-y-4">
            <div>
                <InputLabel htmlFor="tariff_id" value="نوع الاشتراك" />
                <select
                    id="tariff_id"
                    className="mt-1 block w-full disabled:bg-gray-50 disabled:text-gray-500"
                    value={data.tariff_id}
                    disabled={isEdit}
                    onChange={(e) => setData('tariff_id', e.target.value)}
                >
                    {tariffOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <InputError message={errors.tariff_id} className="mt-2" />
            </div>

            <div>
                <InputLabel htmlFor="name" value="اسم التصنيف" />
                <TextInput
                    id="name"
                    className="mt-1 block w-full"
                    value={data.name}
                    placeholder="مثل: مساجد، مدارس، مستشفيات"
                    autoFocus
                    onChange={(e) => setData('name', e.target.value)}
                />
                <InputError message={errors.name} className="mt-2" />
            </div>

            <p className="rounded-control bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500">
                التصنيف للتجميع والتقارير فقط؛ يدفع المشترك سعر التعرفة نفسه.
            </p>
        </FormModal>
    );
}
