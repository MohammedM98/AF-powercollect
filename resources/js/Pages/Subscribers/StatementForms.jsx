import { useEffect, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import ChargeModal from './ChargeModal';
import ClearingModal from './ClearingModal';
import DeleteTransactionModal from './DeleteTransactionModal';
import DiscountModal from './DiscountModal';
import PaymentModal from './PaymentModal';

/**
 * The actions of the dropdown, each in its own colour (written out whole so
 * Tailwind keeps every class). All share one size.
 */
const ACTIONS = [
    { form: 'payment', label: 'تسجيل دفعة', icon: 'banknotes', paymentOnly: true, tone: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:bg-emerald-700' },
    { form: 'charge', label: 'تحميل حركة', icon: 'document-plus', tone: 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 focus-visible:bg-amber-500/25' },
    { form: 'discount', label: 'إضافة خصم', icon: 'discount', tone: 'bg-violet-500/15 text-violet-700 hover:bg-violet-500/25 focus-visible:bg-violet-500/25' },
    { form: 'clearing', label: 'مقاصة', icon: 'repeat', tone: 'bg-teal-500/15 text-teal-700 hover:bg-teal-500/25 focus-visible:bg-teal-500/25' },
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
                <div role="menu" className="absolute end-0 top-full z-30 mt-2 flex w-52 flex-col gap-1.5 rounded-2xl border border-gray-200 bg-surface p-2 shadow-lift">
                    {actions.map((action) => (
                        <button
                            key={action.form}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                onOpen(action.form);
                            }}
                            className={`flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold outline-none transition ${action.tone}`}
                        >
                            <Icon name={action.icon} className="h-[18px] w-[18px] shrink-0" />
                            {action.label}
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
                    reasons={correctionReasons.deletion}
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
