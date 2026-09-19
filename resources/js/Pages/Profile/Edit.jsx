import { Head, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import DeleteUserForm from './Partials/DeleteUserForm';

export default function Edit({ user, status }) {
    const { errors } = usePage().props;

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-bold text-gray-900">الملف الشخصي</h2>}>
            <Head title="الملف الشخصي" />

            <div className="mb-4 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700">
                تجربة React عبر Inertia — بقية النظام لا يزال Blade.
            </div>

            <div className="max-w-2xl space-y-6">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-8">
                    <div className="max-w-xl">
                        <UpdateProfileInformationForm user={user} status={status} />
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-8">
                    <div className="max-w-xl">
                        <UpdatePasswordForm />
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-8">
                    <div className="max-w-xl">
                        <DeleteUserForm errors={errors} />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
