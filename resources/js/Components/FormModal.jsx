import Modal from '@/Components/Modal';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';

/**
 * The create/edit modal every resource uses: a header with an icon and
 * title, the form fields as children, and Cancel/Save buttons.
 *
 * `form` comes from useResourceForm(). Closing clears the form, and a
 * successful save closes the modal. `visitOptions` are passed on to the
 * save request.
 */
export default function FormModal({ show, onClose, form, title, icon, maxWidth = 'lg', visitOptions = {}, bodyClassName = '', children }) {
    function close() {
        form.resetAndClearErrors();
        onClose();
    }

    function submit(e) {
        e.preventDefault();
        form.save({ preserveScroll: true, onSuccess: close, ...visitOptions });
    }

    return (
        <Modal show={show} onClose={close} maxWidth={maxWidth}>
            <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
                <div className="flex items-center justify-between border-b border-gray-100 px-7 py-5">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                            <Icon name={icon} />
                        </span>
                        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        aria-label="إغلاق"
                        className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
                    >
                        <Icon name="close" />
                    </button>
                </div>

                <div className={`flex-1 overflow-y-auto px-7 py-6 ${bodyClassName}`}>{children}</div>

                <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-7 py-4">
                    <SecondaryButton onClick={close}>إلغاء</SecondaryButton>
                    <PrimaryButton disabled={form.processing}>{form.processing ? 'جارٍ الحفظ...' : 'حفظ'}</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}
