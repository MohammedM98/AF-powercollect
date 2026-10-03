import { useEffect, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import ChargeModal from './ChargeModal';
import ClearingModal from './ClearingModal';
import AmendTransactionModal from './AmendTransactionModal';
import DeleteTransactionModal from './DeleteTransactionModal';
import ForceDeleteTransactionModal from './ForceDeleteTransactionModal';
import DiscountModal from './DiscountModal';
import PaymentModal from './PaymentModal';

const ACTION_TONES = {
    payment:
        'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 hover:border-emerald-600 hover:bg-emerald-600 hover:text-white focus-visible:border-emerald-600 focus-visible:bg-emerald-600 focus-visible:text-white dark:text-emerald-400 dark:hover:text-white dark:focus-visible:text-white',
    charge:
        'border-amber-500/25 bg-amber-500/10 text-amber-700 hover:border-amber-600 hover:bg-amber-600 hover:text-white focus-visible:border-amber-600 focus-visible:bg-amber-600 focus-visible:text-white dark:text-amber-400 dark:hover:text-white dark:focus-visible:text-white',
    discount:
        'border-violet-500/25 bg-violet-500/10 text-violet-700 hover:border-violet-600 hover:bg-violet-600 hover:text-white focus-visible:border-violet-600 focus-visible:bg-violet-600 focus-visible:text-white dark:text-violet-400 dark:hover:text-white dark:focus-visible:text-white',
    clearing:
        'border-teal-500/25 bg-teal-500/10 text-teal-700 hover:border-teal-600 hover:bg-teal-600 hover:text-white focus-visible:border-teal-600 focus-visible:bg-teal-600 focus-visible:text-white dark:text-teal-400 dark:hover:text-white dark:focus-visible:text-white',
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
                            className={`flex h-11 w-full items-center gap-2.5 rounded-xl border px-3 text-start text-sm font-semibold transition focus-visible:outline-none ${ACTION_TONES[item.action]}`}
                        >
                            <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                            <span>{item.label}</span>
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
 * 'clearing' or null), or is `{ action: 'amend' | 'correct' | 'delete' | 'erase', entry }`
 * for one of a line's audit-safe actions. `statement` is the statement's page props.
 */
export function StatementForms({ statement, openForm, onClose }) {
    const { subscriber, summary, canRecordPayment, canAdjustBalance, correctionReasons } = statement;
    const amending = openForm?.action === 'amend' ? openForm.entry : null;
    const correcting = openForm?.action === 'correct' ? openForm.entry : null;
    const deleting = openForm?.action === 'delete' ? openForm.entry : null;
    const erasing = openForm?.action === 'erase' ? openForm.entry : null;
    // A correction's form works from the balance without the line it replaces.
    const balanceWithout = (entry) => (Number(summary.balance) - Number(entry.recorded.effect)).toFixed(2);

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
                />
            )}

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

            {erasing && (
                <ForceDeleteTransactionModal key={`erase-${erasing.id}`} onClose={onClose} subscriber={subscriber} balance={summary.balance} entry={erasing} />
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
