import AddButton from '@/Components/AddButton';
import ChargeModal from './ChargeModal';
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
 * names the one showing ('payment', 'charge', 'discount' or null).
 * `statement` is the statement's page props.
 */
export function StatementForms({ statement, openForm, onClose }) {
    const { subscriber, summary, canRecordPayment, canAdjustBalance } = statement;

    return (
        <>
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
