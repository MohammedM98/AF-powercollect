import Icon from '@/Components/Icon';
import { describeBalance } from '@/lib/accountStatement';

const BALANCE_TONES = {
    owes: 'text-brand-700',
    credit: 'text-emerald-700',
    settled: 'text-gray-900',
};

/** A balance as it reads on the account: "50 شيكل عليه", "9.10 شيكل له" or settled. */
export function BalanceText({ balance }) {
    return (
        <span className={`font-bold tabular-nums ${BALANCE_TONES[balance.tone]}`}>
            {balance.tone === 'settled' ? '0 شيكل — مسدّد' : `${balance.amount} شيكل ${balance.label}`}
        </span>
    );
}

/** The subscriber and their current balance, at the top of the payment, charge and discount forms. */
export function AccountHeader({ subscriber, balance }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 text-sm">
            <div>
                <p className="font-semibold text-gray-900">{subscriber.fullName}</p>
                <p className="mt-0.5 text-gray-500">
                    حساب <span dir="ltr">{subscriber.accountNumber}</span>
                </p>
            </div>
            <p className="text-gray-600">
                الرصيد الحالي: <BalanceText balance={describeBalance(balance)} />
            </p>
        </div>
    );
}

/** The subscriber's standing discount, taken off each weekly reading, beside their name. */
export function StandingDiscountBadge({ discount }) {
    return (
        <span
            title={discount.notes ?? undefined}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
        >
            <Icon name="discount" className="h-3.5 w-3.5" />
            خصم دائم: {discount.terms}
        </span>
    );
}

/** What the balance will be once the form is saved. */
export function BalanceAfter({ label, balanceAfter, placeholder }) {
    return (
        <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            {label}: {balanceAfter ? <BalanceText balance={balanceAfter} /> : <span className="text-gray-400">{placeholder}</span>}
        </p>
    );
}
