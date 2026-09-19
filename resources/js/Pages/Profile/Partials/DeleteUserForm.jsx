import { useState } from 'react';
import Modal from '@/Components/Modal';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import SecondaryButton from '@/Components/SecondaryButton';
import DangerButton from '@/Components/DangerButton';

export default function DeleteUserForm({ errors }) {
    const [confirming, setConfirming] = useState(false);
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

    // Deleting the account logs the user out and redirects to the public
    // welcome page — a plain Blade route, not an Inertia one — so this is a
    // real HTML form submit (full navigation), not Inertia's router.delete.
    // See the note in AuthenticatedLayout.jsx for why that distinction matters.
    const bag = errors.userDeletion ?? {};

    return (
        <section className="space-y-6">
            <header>
                <h2 className="text-lg font-medium text-gray-900">حذف الحساب</h2>
                <p className="mt-1 text-sm text-gray-600">
                    بمجرد حذف حسابك، سيتم حذف جميع موارده وبياناته نهائيًا. قبل حذف حسابك، يرجى تنزيل أي بيانات أو معلومات ترغب في الاحتفاظ بها.
                </p>
            </header>

            <DangerButton onClick={() => setConfirming(true)}>حذف الحساب</DangerButton>

            <Modal show={confirming} onClose={() => setConfirming(false)}>
                <form method="POST" action="/profile" className="p-6">
                    <input type="hidden" name="_token" value={csrfToken} />
                    <input type="hidden" name="_method" value="DELETE" />

                    <h2 className="text-lg font-medium text-gray-900">هل أنت متأكد أنك تريد حذف حسابك؟</h2>

                    <p className="mt-1 text-sm text-gray-600">
                        بمجرد حذف حسابك، سيتم حذف جميع موارده وبياناته نهائيًا. الرجاء إدخال كلمة المرور لتأكيد رغبتك في حذف حسابك نهائيًا.
                    </p>

                    <div className="mt-6">
                        <InputLabel htmlFor="password" value="كلمة المرور" className="sr-only" />
                        <TextInput id="password" name="password" type="password" className="mt-1 block w-3/4" placeholder="كلمة المرور" />
                        <InputError message={bag.password} className="mt-2" />
                    </div>

                    <div className="mt-6 flex justify-end">
                        <SecondaryButton onClick={() => setConfirming(false)}>إلغاء</SecondaryButton>
                        <DangerButton type="submit" className="ms-3">
                            حذف الحساب
                        </DangerButton>
                    </div>
                </form>
            </Modal>
        </section>
    );
}
