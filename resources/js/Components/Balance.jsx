import { BALANCE_CHIP_CLASSES, BALANCE_HINTS, BALANCE_TEXT_CLASSES, balanceTone, signedBalance } from '@/lib/balance';

/**
 * A subscription's balance, the same on every page: positive (owed, in the
 * company's favour) in red, negative (credit, in the subscription's favour)
 * with its minus sign in green, zero in grey. Hovering says what it means.
 * `colored={false}` keeps the sign but no colour, for running balances on a
 * statement; `chip` sets it on a soft background.
 */
export default function Balance({ value, colored = true, chip = false, unit = '₪', className = '' }) {
    const tone = balanceTone(value);
    const colors = colored ? (chip ? `rounded-[10px] px-2.5 py-0.5 ${BALANCE_CHIP_CLASSES[tone]}` : BALANCE_TEXT_CLASSES[tone]) : '';

    return (
        <bdi dir="ltr" title={BALANCE_HINTS[tone]} className={`inline-block whitespace-nowrap font-display tabular-nums ${colors} ${className}`}>
            {signedBalance(value)}
            {unit && ` ${unit}`}
        </bdi>
    );
}
