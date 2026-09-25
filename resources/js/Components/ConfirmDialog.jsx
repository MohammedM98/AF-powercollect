import { useId } from 'react';
import Modal from '@/Components/Modal';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import DangerButton from '@/Components/DangerButton';

/**
 * A yes/no question in the app's own modal style, used instead of the
 * browser's confirm(). Closing it (Escape, the backdrop, or the cancel
 * button) counts as "no".
 *
 * `tone="danger"` is for throwing work away: the confirm button turns
 * red and the safe choice (cancel) gets the focus. Otherwise confirm is
 * focused, so Enter answers straight away.
 */
export default function ConfirmDialog({
    show,
    onConfirm,
    onCancel,
    title,
    message,
    confirmLabel = 'تأكيد',
    cancelLabel = 'إلغاء',
    icon = 'check',
    tone = 'primary',
}) {
    const id = useId();
    const isDanger = tone === 'danger';
    const ConfirmButton = isDanger ? DangerButton : PrimaryButton;

    return (
        <Modal show={show} onClose={onCancel} maxWidth="md" centered>
            <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`}>
                <div className="flex items-start gap-4 px-7 pb-6 pt-7">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                        <Icon name={icon} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                        <h3 id={`${id}-title`} className="text-lg font-bold text-gray-900">
                            {title}
                        </h3>
                        <p id={`${id}-message`} className="mt-1.5 text-sm leading-6 text-gray-600">
                            {message}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-7 py-4">
                    <SecondaryButton onClick={onCancel} autoFocus={isDanger}>
                        {cancelLabel}
                    </SecondaryButton>
                    <ConfirmButton type="button" onClick={onConfirm} autoFocus={!isDanger}>
                        {confirmLabel}
                    </ConfirmButton>
                </div>
            </div>
        </Modal>
    );
}

/**
 * The "are you sure?" shown before a create/edit form is sent. `isEdit`
 * picks the wording for changing an existing record over adding a new one.
 */
export function SaveConfirmDialog({ show, isEdit, onConfirm, onCancel }) {
    return (
        <ConfirmDialog
            show={show}
            onConfirm={onConfirm}
            onCancel={onCancel}
            title={isEdit ? 'حفظ التعديلات؟' : 'إضافة السجل؟'}
            message={
                isEdit
                    ? 'سيتم حفظ التعديلات التي أجريتها على هذا السجل. هل تريد المتابعة؟'
                    : 'سيتم إضافة سجل جديد بالبيانات التي أدخلتها. هل تريد المتابعة؟'
            }
            confirmLabel={isEdit ? 'نعم، احفظ التعديلات' : 'نعم، أضف'}
            cancelLabel="مراجعة البيانات"
        />
    );
}
