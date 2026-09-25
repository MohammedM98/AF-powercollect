import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';

/**
 * The standalone Create/Edit page every resource uses: a titled card
 * holding the form fields (children), with Save and Cancel.
 *
 * `form` comes from useResourceForm(); `cancelHref` is where Cancel goes.
 * Pass `layout={SettingsLayout}` for pages under the Settings tabs.
 */
export default function FormPage({ title, form, cancelHref, layout: Layout = AuthenticatedLayout, widthClass = 'max-w-2xl', children }) {
    function submit(e) {
        e.preventDefault();
        form.save();
    }

    return (
        <Layout header={<h2 className="text-xl font-bold text-gray-900">{title}</h2>}>
            <Head title={title} />

            <div className={widthClass}>
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <form onSubmit={submit}>
                        {children}

                        <div className="mt-6 flex items-center gap-4">
                            <PrimaryButton disabled={form.processing}>حفظ</PrimaryButton>
                            <a href={cancelHref} className="text-sm text-gray-600 underline">
                                إلغاء
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </Layout>
    );
}
