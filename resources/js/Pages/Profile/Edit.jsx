import { Head, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import DeleteUserForm from './Partials/DeleteUserForm';

export default function Edit({ user }) {
    const { errors } = usePage().props;

    return (
        <AuthenticatedLayout header={<h2 className="text-3xl font-bold text-gray-900">الملف الشخصي</h2>}>
            <Head title="الملف الشخصي" />

            <div className="max-w-2xl space-y-6">
                <div className="rounded-card border border-gray-100 bg-surface p-4 shadow-card sm:p-8">
                    <div className="max-w-xl">
                        <UpdateProfileInformationForm user={user} />
                    </div>
                </div>

                <div className="rounded-card border border-gray-100 bg-surface p-4 shadow-card sm:p-8">
                    <div className="max-w-xl">
                        <UpdatePasswordForm />
                    </div>
                </div>

                <div className="rounded-card border border-gray-100 bg-surface p-4 shadow-card sm:p-8">
                    <div className="max-w-xl">
                        <DeleteUserForm errors={errors} />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
