import { useForm } from '@inertiajs/react';
import FormModal from '@/Components/FormModal';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import { plainDigits } from '@/lib/formValidation';

function Field({ id, label, required, error, children }) {
    return (
        <div>
            <InputLabel htmlFor={id}>
                {label}
                {required && <span className="text-red-500"> *</span>}
            </InputLabel>
            <div className="mt-1">{children}</div>
            <InputError message={error} className="mt-1" />
        </div>
    );
}

/**
 * The quick "personal details" form from a subscriber's row menu: name,
 * identity number, mobile number and address only. They belong to the
 * person, so the change reaches every subscription of theirs.
 */
export default function PersonalDetailsModal({ subscriber, onClose }) {
    const form = useForm({
        full_name: subscriber.full_name ?? '',
        national_id: subscriber.national_id ?? '',
        phone: subscriber.phone ?? '',
        address: subscriber.address ?? '',
    });
    const save = (options) => form.patch(`/subscribers/${subscriber.id}/personal-details`, options);
    const subscriptions = subscriber.subscriptionCount ?? 1;

    return (
        <FormModal show onClose={onClose} form={{ ...form, isEdit: true, save }} title="تعديل البيانات الشخصية" icon="pencil" maxWidth="lg">
            <div className="space-y-4">
                {subscriptions > 1 && (
                    <p className="rounded-control bg-blue-500/10 px-3 py-2 text-sm text-gray-700">
                        هذه البيانات مشتركة بين اشتراكات هذا الشخص ({subscriptions})، وتتغير فيها كلها.
                    </p>
                )}

                <Field id="personal_full_name" label="الاسم الكامل" required error={form.errors.full_name}>
                    <TextInput
                        id="personal_full_name"
                        required
                        className="w-full"
                        value={form.data.full_name}
                        onChange={(event) => form.setData('full_name', event.target.value)}
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="personal_national_id" label="رقم الهوية" required error={form.errors.national_id}>
                        <TextInput
                            id="personal_national_id"
                            required
                            dir="ltr"
                            inputMode="numeric"
                            maxLength={9}
                            pattern="[0-9]{9}"
                            data-feedback
                            title="رقم الهوية يجب أن يتكون من 9 أرقام"
                            placeholder="9 أرقام"
                            className="w-full"
                            value={form.data.national_id}
                            onChange={(event) => form.setData('national_id', plainDigits(event.target.value))}
                        />
                    </Field>

                    <Field id="personal_phone" label="رقم الجوال" required error={form.errors.phone}>
                        <TextInput
                            id="personal_phone"
                            required
                            type="tel"
                            dir="ltr"
                            inputMode="numeric"
                            maxLength={10}
                            pattern="05[69][0-9]{7}"
                            data-feedback
                            title="رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 059 أو 056"
                            placeholder="059XXXXXXX"
                            className="w-full"
                            value={form.data.phone}
                            onChange={(event) => form.setData('phone', plainDigits(event.target.value))}
                        />
                    </Field>
                </div>

                <Field id="personal_address" label="العنوان" error={form.errors.address}>
                    <TextInput
                        id="personal_address"
                        className="w-full"
                        value={form.data.address}
                        onChange={(event) => form.setData('address', event.target.value)}
                    />
                </Field>
            </div>
        </FormModal>
    );
}
