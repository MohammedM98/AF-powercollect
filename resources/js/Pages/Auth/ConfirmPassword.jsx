import { Head, useForm } from '@inertiajs/react';
import GuestLayout from '@/Layouts/GuestLayout';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PasswordInput from '@/Components/PasswordInput';
import PrimaryButton from '@/Components/PrimaryButton';

export default function ConfirmPassword() {
    const { data, setData, post, processing, errors, reset } = useForm({ password: '' });

    function submit(e) {
        e.preventDefault();
        post('/confirm-password', {
            onFinish: () => reset('password'),
        });
    }

    return (
        <GuestLayout>
            <Head title="تأكيد كلمة المرور" />

            <div className="mb-4 text-sm text-gray-600">هذه منطقة آمنة من التطبيق. الرجاء تأكيد كلمة المرور قبل المتابعة.</div>

            <form onSubmit={submit}>
                <div>
                    <InputLabel htmlFor="password" value="كلمة المرور" />
                    <PasswordInput
                        id="password"
                        className="mt-1 block w-full"
                        value={data.password}
                        autoFocus
                        autoComplete="current-password"
                        onChange={(e) => setData('password', e.target.value)}
                    />
                    <InputError message={errors.password} className="mt-2" />
                </div>

                <div className="mt-4 flex justify-end">
                    <PrimaryButton disabled={processing}>تأكيد</PrimaryButton>
                </div>
            </form>
        </GuestLayout>
    );
}
