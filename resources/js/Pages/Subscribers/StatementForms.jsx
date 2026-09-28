import AddButton from '@/Components/AddButton';
import ChargeModal from './ChargeModal';
import DeleteTransactionModal from './DeleteTransactionModal';
import DiscountModal from './DiscountModal';
import PaymentModal from './PaymentModal';

/**
 * The statement's buttons: add a charge or a discount, and record a
 * payment — each shown only to users allowed to. `onOpen` gets 'charge',
 * 'discount' or 'payment'.
 */
export function StatementActions({ canRecordPayment, canAdjustBalance, onOpen }) {
    if (!canRecordPayment && !canAdjustBalance) {
        return null;
    }

    return (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canAdjustBalance && (
                <>
                    <AddButton variant="soft" onClick={() => onOpen('charge')}>
                        إضافة تحميل
                    </AddButton>
                    <AddButton variant="soft" onClick={() => onOpen('discount')}>
                        إضافة خصم
                    </AddButton>
                </>
            )}
            {canRecordPayment && <AddButton onClick={() => onOpen('payment')}>تسجيل دفعة</AddButton>}
        </div>
    );
}

/**
 * The payment, charge and discount forms of a statement; `openForm`
 * names the one showing ('payment', 'charge', 'discount' or null), or is
 * `{ action: 'correct' | 'delete', entry }` to correct or delete a line.
 * `statement` is the statement's page props.
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
                </>
            )}
        </>
    );
}
