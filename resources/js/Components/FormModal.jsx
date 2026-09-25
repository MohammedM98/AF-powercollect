import { useState } from 'react';
import Modal from '@/Components/Modal';
import ConfirmDialog, { SaveConfirmDialog } from '@/Components/ConfirmDialog';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';

/**
 * The create/edit modal every resource uses: a header with an icon and
 * title, the form fields as children, and Cancel/Save buttons.
 *
 * `form` comes from useResourceForm(). Saving asks for confirmation first
 * (unless `confirmBeforeSave` is false), and closing with unsaved input
 * asks whether to discard it. Closing clears the form, and a successful
 * save closes the modal. `visitOptions` are passed on to the save request.
 */
export default function FormModal({
    show,
    onClose,
    form,
    title,
    icon,
    maxWidth = 'lg',
    visitOptions = {},
    bodyClassName = '',
    confirmBeforeSave = true,
    children,
}) {
    // The question shown over the form: 'save' before sending it, 'discard' before throwing away unsaved input.
    const [pendingConfirmation, setPendingConfirmation] = useState(null);

    function close() {
        setPendingConfirmation(null);
        form.resetAndClearErrors();
        onClose();
    }

    function requestClose() {
        if (form.isDirty) {
            setPendingConfirmation('discard');
        } else {
            close();
        }
    }

    function save() {
        setPendingConfirmation(null);
        form.save({ preserveScroll: true, onSuccess: close, ...visitOptions });
    }

    function submit(e) {
        e.preventDefault();

        if (confirmBeforeSave) {
            setPendingConfirmation('save');
        } else {
            save();
        }
    }

    return (
        <>
            <Modal show={show} onClose={requestClose} maxWidth={maxWidth}>
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
                            onClick={requestClose}
                            aria-label="إغلاق"
                            className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
                        >
                            <Icon name="close" />
                        </button>
                    </div>

                    <div className={`flex-1 overflow-y-auto px-7 py-6 ${bodyClassName}`}>{children}</div>

                    <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-7 py-4">
                        <SecondaryButton onClick={requestClose}>إلغاء</SecondaryButton>
                        <PrimaryButton disabled={form.processing}>{form.processing ? 'جارٍ الحفظ...' : 'حفظ'}</PrimaryButton>
                    </div>
                </form>
            </Modal>

            <SaveConfirmDialog
                show={show && pendingConfirmation === 'save'}
                isEdit={form.isEdit}
                onConfirm={save}
                onCancel={() => setPendingConfirmation(null)}
            />

            <ConfirmDialog
                show={show && pendingConfirmation === 'discard'}
                onConfirm={close}
                onCancel={() => setPendingConfirmation(null)}
                title="تجاهل التغييرات؟"
                message="أدخلت بيانات لم تُحفظ بعد. إذا أغلقت النافذة الآن فستفقدها."
                confirmLabel="تجاهل التغييرات"
                cancelLabel="البقاء ومتابعة التعديل"
                icon="alert"
                tone="danger"
            />
        </>
    );
}
