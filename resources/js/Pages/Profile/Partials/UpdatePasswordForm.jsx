import { useForm } from '@inertiajs/react';
import InputLabel from '@/Components/InputLabel';
import PasswordInput from '@/Components/PasswordInput';
import InputError from '@/Components/InputError';
import PrimaryButton from '@/Components/PrimaryButton';

export default function UpdatePasswordForm() {
    const { data, setData, put, processing, errors, reset } = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });

    // The server validates this form under the "updatePassword" error bag
    // (validateWithBag), since the profile page has two other forms on it —
    // Inertia mirrors that bag structure into `errors` as-is.
    const bag = errors.updatePassword ?? {};

    function submit(e) {
        e.preventDefault();
        put('/password', {
            preserveScroll: true,
            onSuccess: () => reset(),
        });
    }

    return (
        <section>
            <header>
                <h2 className="text-lg font-medium text-gray-900">تحديث كلمة المرور</h2>
                <p className="mt-1 text-sm text-gray-600">تأكد من استخدام حسابك لكلمة مرور طويلة وعشوائية للحفاظ على الأمان.</p>
            </header>

            <form onSubmit={submit} className="mt-6 space-y-6">
                <div>
                    <InputLabel htmlFor="current_password" value="كلمة المرور الحالية" />
                    <PasswordInput
                        id="current_password"
                        className="mt-1 block w-full"
                        value={data.current_password}
                        autoComplete="current-password"
                        onChange={(e) => setData('current_password', e.target.value)}
                    />
                    <InputError message={bag.current_password} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="password" value="كلمة مرور جديدة" />
                    <PasswordInput
                        id="password"
                        className="mt-1 block w-full"
                        value={data.password}
                        autoComplete="new-password"
                        onChange={(e) => setData('password', e.target.value)}
                    />
                    <InputError message={bag.password} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="password_confirmation" value="تأكيد كلمة المرور" />
                    <PasswordInput
                        id="password_confirmation"
                        className="mt-1 block w-full"
                        value={data.password_confirmation}
                        autoComplete="new-password"
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                    />
                    <InputError message={bag.password_confirmation} className="mt-2" />
                </div>

                <div className="flex items-center gap-4">
                    <PrimaryButton disabled={processing}>حفظ</PrimaryButton>

                </div>
            </form>
        </section>
    );
}
