import { useForm } from '@inertiajs/react';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import GovernorateForm from './GovernorateForm';

export default function GovernorateModal({ show, onClose, governorate, areas }) {
    const isEdit = Boolean(governorate);

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm(
        isEdit
            ? {
                  name: governorate.name,
                  area_ids: governorate.area_ids,
              }
            : {
                  name: '',
                  area_ids: [],
              },
    );

    function close() {
        clearErrors();
        reset();
        onClose();
    }

    function submit(e) {
        e.preventDefault();

        const options = { preserveScroll: true, onSuccess: close };

        if (isEdit) {
            put(`/governorates/${governorate.id}`, options);
        } else {
            post('/governorates', options);
        }
    }

    return (
        <Modal show={show} onClose={close} maxWidth="lg">
            <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.5"
                                    d="M2.25 21h19.5M6.75 21V6.75A2.25 2.25 0 019 4.5h6a2.25 2.25 0 012.25 2.25V21M9 8.25h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15"
                                />
                            </svg>
                        </span>
                        <h3 className="text-lg font-bold text-gray-900">{isEdit ? 'تعديل المحافظة' : 'إنشاء محافظة'}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    <GovernorateForm data={data} setData={setData} errors={errors} areas={areas} currentGovernorateName={governorate?.name} />
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <SecondaryButton onClick={close}>إلغاء</SecondaryButton>
                    <PrimaryButton disabled={processing}>{processing ? 'جارٍ الحفظ...' : 'حفظ'}</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}
