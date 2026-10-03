import { useState } from 'react';
import Modal from '@/Components/Modal';
import ConfirmDialog, { SaveConfirmDialog } from '@/Components/ConfirmDialog';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { clearErrorOnInput, submitOnCtrlEnter, validateFormFields } from '@/lib/formValidation';

const HEADER_TONES = {
    brand: 'bg-brand-500/10 text-brand-600',
    blue: 'bg-blue-500/10 text-blue-600',
    amber: 'bg-amber-500/10 text-amber-700',
    danger: 'bg-red-900/10 text-red-800',
};

/**
 * The create/edit modal every resource uses: a header with an icon and
 * title, the form fields as children, and Cancel/Save buttons.
 *
 * `form` comes from useResourceForm(). Saving asks for confirmation first
 * (unless `confirmBeforeSave` is false; `saveConfirmMessage` replaces the
 * question's explanation), and closing with unsaved input
 * asks whether to discard it. Closing clears the form, and a successful
 * save closes the modal. `visitOptions` are passed on to the save request.
 * Fields are checked in the page first, with their errors shown under
 * them rather than in the browser's pop-ups. Ctrl + Enter (⌘ + Enter on a
 * Mac) saves from any field. `action` renames what saving does — its
 * button, and the question before it: `{ submitLabel, title,
 * confirmLabel, icon, tone }`.
 */
export default function FormModal({
    show,
    onClose,
    form,
    title,
    icon,
    headerTone = 'brand',
    maxWidth = 'lg',
    visitOptions = {},
    bodyClassName = '',
    confirmBeforeSave = true,
    saveConfirmMessage = null,
    action = null,
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

        if (!validateFormFields(e.currentTarget, form)) {
            return;
        }

        if (confirmBeforeSave) {
            setPendingConfirmation('save');
        } else {
            save();
        }
    }

    return (
        <>
            <Modal show={show} onClose={requestClose} maxWidth={maxWidth}>
                <form
                    noValidate
                    onSubmit={submit}
                    onInput={(e) => clearErrorOnInput(e, form)}
                    onKeyDown={submitOnCtrlEnter}
                    className="flex max-h-[90vh] flex-col"
                >
                    <div className="flex items-center justify-between border-b border-gray-100 px-7 py-5">
                        <div className="flex items-center gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${HEADER_TONES[headerTone] ?? HEADER_TONES.brand}`}>
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
                        <span className="me-auto hidden items-center gap-1.5 text-xs text-gray-500 sm:inline-flex">
                            <span className="kbd" dir="ltr">
                                Ctrl + Enter
                            </span>
                            للحفظ
                        </span>
                        <SecondaryButton onClick={requestClose}>إلغاء</SecondaryButton>
                        <PrimaryButton disabled={form.processing}>{form.processing ? 'جارٍ الحفظ...' : (action?.submitLabel ?? 'حفظ')}</PrimaryButton>
                    </div>
                </form>
            </Modal>

            <SaveConfirmDialog
                show={show && pendingConfirmation === 'save'}
                isEdit={form.isEdit}
                message={saveConfirmMessage}
                action={action}
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
