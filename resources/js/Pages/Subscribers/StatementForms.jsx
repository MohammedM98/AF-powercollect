import { useEffect, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import ChargeModal from './ChargeModal';
import ClearingModal from './ClearingModal';
import DeleteTransactionModal from './DeleteTransactionModal';
import DiscountModal from './DiscountModal';
import PaymentModal from './PaymentModal';

/**
 * The actions of the dropdown. Each is laid out like an item of the table's
 * row menu (RowMenu) — one size, an icon chip — and takes its own colour
 * (written out whole so Tailwind keeps every class): payment green.
 */
const ACTIONS = [
    { form: 'payment', label: 'تسجيل دفعة', icon: 'banknotes', paymentOnly: true, tone: 'bg-emerald-600' },
    { form: 'charge', label: 'تحميل حركة', icon: 'document-plus', tone: 'bg-amber-600' },
    { form: 'discount', label: 'إضافة خصم', icon: 'discount', tone: 'bg-violet-600' },
    { form: 'clearing', label: 'مقاصة', icon: 'repeat', tone: 'bg-teal-600' },
];

/**
 * The statement's actions in one dropdown: record a payment (green), add a
 * charge, a discount or a clearing — each shown only to users allowed to.
 * `onOpen` gets 'payment', 'charge', 'discount' or 'clearing'.
 */
export function StatementActions({ canRecordPayment, canAdjustBalance, onOpen }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const actions = ACTIONS.filter((action) => (action.paymentOnly ? canRecordPayment : canAdjustBalance));

    useEffect(() => {
        if (!open) {
            return undefined;
        }

        function onPointerDown(event) {
            if (!rootRef.current?.contains(event.target)) {
                setOpen(false);
            }
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
            }
        }

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown, true);

        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [open]);

    if (actions.length === 0) {
        return null;
    }

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className="inline-flex h-10 items-center gap-2 rounded-control bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
                <Icon name="plus" className="h-4 w-4" strokeWidth={2} />
                إضافة حركة
                <Icon name="chevron-down" className="h-4 w-4" strokeWidth={2} />
            </button>
            {open && (
                <div role="menu" className="animate-menu absolute end-0 top-full z-30 mt-2 w-[250px] rounded-[20px] border border-gray-200 bg-surface p-2 shadow-lift">
                    {actions.map((action) => (
                        <button
                            key={action.form}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                onOpen(action.form);
                            }}
                            className="group/item flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start text-sm font-medium text-gray-900 outline-none transition hover:bg-gray-100 focus-visible:bg-gray-100"
                        >
                            <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] text-white ${action.tone}`}>
                                <Icon name={action.icon} className="h-[17px] w-[17px]" />
                            </span>
                            <span className="flex-1 truncate">{action.label}</span>
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
 * 'clearing' or null), or is `{ action: 'correct' | 'delete', entry }` to
 * correct or delete a line. `statement` is the statement's page props.
 */
export function StatementForms({ statement, openForm, onClose }) {
    const { subscriber, summary, canRecordPayment, canAdjustBalance, correctionReasons } = statement;
    const correcting = openForm?.action === 'correct' ? openForm.entry : null;
    const deleting = openForm?.action === 'delete' ? openForm.entry : null;
    // A correction's form works from the balance without the line it replaces.
    const balanceWithout = (entry) => (Number(summary.balance) - Number(entry.recorded.effect)).toFixed(2);

    return (
        <>
            {correcting?.recorded.kind === 'payment' && (
                <PaymentModal
                    key={`correct-${correcting.id}`}
                    show
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={balanceWithout(correcting)}
                    currencies={statement.currencies}
                    paymentMethods={statement.paymentMethods}
                    transferBanks={statement.transferBanks}
                    correcting={correcting}
                    correctionReasons={correctionReasons.payment}
                />
            )}

            {correcting?.recorded.kind === 'charge' && (
                <ChargeModal
                    key={`correct-${correcting.id}`}
                    show
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={balanceWithout(correcting)}
                    chargeTypes={statement.chargeTypes}
                    correcting={correcting}
                    correctionReasons={correctionReasons.adjustment}
                />
            )}

            {correcting?.recorded.kind === 'discount' && (
                <DiscountModal
                    key={`correct-${correcting.id}`}
                    show
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={balanceWithout(correcting)}
                    discountMethods={statement.discountMethods}
                    correcting={correcting}
                    correctionReasons={correctionReasons.adjustment}
                />
            )}

            {correcting?.recorded.kind === 'clearing' && (
                <ClearingModal
                    key={`correct-${correcting.id}`}
                    show
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={balanceWithout(correcting)}
                    correcting={correcting}
                    correctionReasons={correctionReasons.adjustment}
                />
            )}

            {deleting && (
                <DeleteTransactionModal
                    key={`delete-${deleting.id}`}
                    onClose={onClose}
                    subscriber={subscriber}
                    balance={summary.balance}
                    entry={deleting}
                    reasons={deleting.deletionReasons}
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
