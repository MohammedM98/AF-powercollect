import { useForm } from '@inertiajs/react';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import PrimaryButton from '@/Components/PrimaryButton';

export default function UpdateProfileInformationForm({ user }) {
    const { data, setData, patch, processing, errors } = useForm({
        name: user.name,
    });

    function submit(e) {
        e.preventDefault();
        patch('/profile');
    }

    return (
        <section>
            <header>
                <h2 className="text-lg font-medium text-gray-900">معلومات الملف الشخصي</h2>
                <p className="mt-1 text-sm text-gray-600">قم بتحديث معلومات ملفك الشخصي.</p>
            </header>

            <form onSubmit={submit} className="mt-6 space-y-6">
                <div>
                    <InputLabel htmlFor="name" value="الاسم" />
                    <TextInput
                        id="name"
                        className="mt-1 block w-full"
                        value={data.name}
                        autoFocus
                        autoComplete="name"
                        onChange={(e) => setData('name', e.target.value)}
                    />
                    <InputError message={errors.name} className="mt-2" />
                </div>

                <div className="flex items-center gap-4">
                    <PrimaryButton disabled={processing}>حفظ</PrimaryButton>
                </div>
            </form>
        </section>
    );
}
