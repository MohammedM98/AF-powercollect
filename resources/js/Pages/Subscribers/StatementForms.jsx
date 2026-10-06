import { useEffect, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import MeterReadingModal from '@/Pages/MeterReadings/MeterReadingModal';
import ChargeModal from './ChargeModal';
import ClearingModal from './ClearingModal';
import AmendTransactionModal from './AmendTransactionModal';
import DeleteTransactionModal from './DeleteTransactionModal';
import EditTransactionAmountModal from './EditTransactionAmountModal';
import ForceDeleteTransactionModal from './ForceDeleteTransactionModal';
import DiscountModal from './DiscountModal';
import PaymentModal from './PaymentModal';

const ACTION_ICON_TONES = {
    payment: 'text-emerald-600 group-hover/item:bg-emerald-600 group-focus-visible/item:bg-emerald-600',
    charge: 'text-amber-600 group-hover/item:bg-amber-600 group-focus-visible/item:bg-amber-600',
    discount: 'text-violet-600 group-hover/item:bg-violet-600 group-focus-visible/item:bg-violet-600',
    clearing: 'text-teal-600 group-hover/item:bg-teal-600 group-focus-visible/item:bg-teal-600',
};

/**
 * The statement's actions, grouped into one coloured menu. Each action is
 * shown only to users allowed to use it. `onOpen` gets 'charge', 'discount',
 * 'clearing' or 'payment'.
 */
export function StatementActions({ canRecordPayment, canAdjustBalance, onOpen }) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);
    const triggerRef = useRef(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        function onPointerDown(event) {
            if (!menuRef.current?.contains(event.target)) {
                setOpen(false);
            }
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                setOpen(false);
                triggerRef.current?.focus();
            }
        }

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown, true);

        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [open]);

    if (!canRecordPayment && !canAdjustBalance) {
        return null;
    }

    const actions = [
        ...(canRecordPayment ? [{ action: 'payment', label: 'تسجيل دفعة', icon: 'banknotes' }] : []),
        ...(canAdjustBalance
            ? [
                  { action: 'charge', label: 'تحميل حركة', icon: 'document-plus' },
                  { action: 'discount', label: 'إضافة خصم', icon: 'discount' },
                  { action: 'clearing', label: 'مقاصة', icon: 'scale' },
              ]
            : []),
    ];

    function choose(action) {
        setOpen(false);
        onOpen(action);
    }

    return (
        <div ref={menuRef} className="relative shrink-0">
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                className="inline-flex h-10 items-center gap-2 rounded-control bg-graphite-gradient px-4 text-sm font-semibold text-white shadow-card transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
                <Icon name="plus" className="h-4 w-4" strokeWidth={2} />
                إضافة حركة
                <Icon name="chevron-down" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
            </button>

            {open && (
                <div role="menu" aria-label="إضافة حركة" className="animate-dropdown absolute end-0 top-full z-40 mt-2 flex w-56 flex-col gap-1 rounded-2xl border border-gray-100 bg-surface p-2 shadow-lift">
                    {actions.map((item) => (
                        <button
                            key={item.action}
                            type="button"
                            role="menuitem"
                            onClick={() => choose(item.action)}
                            className="group/item flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start text-sm font-medium text-gray-900 outline-none transition hover:bg-gray-100 focus-visible:bg-gray-100"
                        >
                            <span
                                className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-gray-100 transition group-hover/item:text-white group-focus-visible/item:text-white ${ACTION_ICON_TONES[item.action]}`}
                            >
                                <Icon name={item.icon} className="h-[17px] w-[17px]" />
                            </span>
                            <span className="flex-1 truncate">{item.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * The payment, charge, discount and clearing forms of a statement;
 * `openForm` names the one showing ('payment', 'charge', 'discount',
 * 'clearing' or null), or is `{ action: 'edit' | 'edit_metadata' | 'delete' | 'delete_reversal' | 'delete_tree' | 'cancel' | 'refund', entry }`
 * for one of a line's audit-safe actions, or `{ action: 'correct_reading', entry }` to correct the
 * weekly reading a line was billed from, in the readings page's own form. `statement` is the statement's page props.
 */
export function StatementForms({ statement, openForm, onClose, onOpen = null }) {
    const { subscriber, summary, canRecordPayment, canAdjustBalance } = statement;
    const amending = openForm?.action === 'edit_metadata' ? openForm.entry : null;
    const editing = openForm?.action === 'edit' ? openForm.entry : null;
    const deleting = ['delete', 'delete_reversal', 'delete_tree'].includes(openForm?.action) ? openForm.entry : null;
    const cancelling = openForm?.action === 'cancel' ? openForm.entry : null;
    const refunding = openForm?.action === 'refund' ? openForm.entry : null;
    const correctingReading = openForm?.action === 'correct_reading' ? openForm.entry.reading : null;

    return (
        <>
            {amending && (
                <AmendTransactionModal
                    key={`amend-${amending.id}`}
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={summary.balance}
                    entry={amending}
                    transferBanks={statement.transferBanks}
                    senderBanks={statement.senderBanks}
                />
            )}


            {editing && (
                <EditTransactionAmountModal
                    key={`edit-${editing.id}`}
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={summary.balance}
                    entry={editing}
                />
            )}

            {cancelling && (
                <DeleteTransactionModal
                    key={`cancel-${cancelling.id}`}
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={summary.balance}
                    entry={cancelling}
                    action="cancel"
                    reasons={cancelling.deletionReasons}
                />
            )}

            {refunding && (
                <DeleteTransactionModal
                    key={`refund-${refunding.id}`}
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={summary.balance}
                    entry={refunding}
                    action="refund"
                    reasons={refunding.deletionReasons}
                    onRecordPayment={canRecordPayment && onOpen ? () => onOpen('payment') : null}
                />
            )}

            {correctingReading && (
                <MeterReadingModal key={`reading-${correctingReading.id}`} show onClose={onClose} reading={correctingReading} weekOptions={[]} />
            )}

            {deleting && (
                <ForceDeleteTransactionModal
                    key={`${openForm.action}-${deleting.id}`}
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={summary.balance}
                    entry={deleting}
                    action={openForm.action}
                />
            )}

            {canRecordPayment && (
                <PaymentModal
                    show={openForm === 'payment'}
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={summary.balance}
                    currencies={statement.currencies}
                    paymentMethods={statement.paymentMethods}
                    transferBanks={statement.transferBanks}
                    senderBanks={statement.senderBanks}
                />
            )}

            {canAdjustBalance && (
                <>
                    <ChargeModal
                        show={openForm === 'charge'}
                        onClose={onClose}
                        subscriber={subscriber}
                        balance={summary.balance}
                        chargeTypes={statement.chargeTypes}
                    />
                    <DiscountModal
                        show={openForm === 'discount'}
                        onClose={onClose}
                        subscriber={subscriber}
                        balance={summary.balance}
                        discountMethods={statement.discountMethods}
                        discountSegments={statement.discountSegments}
                    />
                    <ClearingModal show={openForm === 'clearing'} onClose={onClose} subscriber={subscriber} balance={summary.balance} />
                </>
            )}
        </>
    );
}
