import { useState } from 'react';
import { Head, Link } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { SaveConfirmDialog } from '@/Components/ConfirmDialog';
import PrimaryButton from '@/Components/PrimaryButton';

/**
 * The standalone Create/Edit page every resource uses: a titled card
 * holding the form fields (children), with Save and Cancel. Saving asks
 * for confirmation first.
 *
 * `form` comes from useResourceForm(); `cancelHref` is where Cancel goes.
 * Pass `layout={SettingsLayout}` for pages under the Settings tabs.
 */
export default function FormPage({ title, form, cancelHref, layout: Layout = AuthenticatedLayout, widthClass = 'max-w-2xl', children }) {
    const [confirmingSave, setConfirmingSave] = useState(false);

    function submit(e) {
        e.preventDefault();
        setConfirmingSave(true);
    }

    function save() {
        setConfirmingSave(false);
        form.save();
    }

    return (
        <Layout header={<h2 className="text-3xl font-bold text-gray-900">{title}</h2>}>
            <Head title={title} />

            <div className={widthClass}>
                <div className="rise-in rounded-card border border-gray-100 bg-surface p-6 shadow-card">
                    <form onSubmit={submit}>
                        {children}

                        <div className="mt-6 flex items-center gap-4">
                            <PrimaryButton disabled={form.processing}>حفظ</PrimaryButton>
                            <Link href={cancelHref} prefetch className="text-sm font-semibold text-gray-500 transition hover:text-gray-900">
                                إلغاء
                            </Link>
                        </div>
                    </form>
                </div>
            </div>

            <SaveConfirmDialog show={confirmingSave} isEdit={form.isEdit} onConfirm={save} onCancel={() => setConfirmingSave(false)} />
        </Layout>
    );
}
