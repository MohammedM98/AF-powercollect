import StatusPill from '@/Components/DataTable/StatusPill';
import { describeBalance } from '@/lib/accountStatement';

const STATUS_TONES = {
    active: 'green',
    suspended: 'amber',
    disconnected: 'gray',
};

const BALANCE_TONES = {
    owes: 'text-brand-700',
    credit: 'text-emerald-700 dark:text-emerald-400',
    settled: 'text-gray-900',
};

function Balance({ value, className = '' }) {
    const balance = describeBalance(value);

    return (
        <span className={`whitespace-nowrap font-bold tabular-nums ${BALANCE_TONES[balance.tone]} ${className}`}>
            {balance.tone === 'settled' ? '0 شيكل — مسدّد' : `${balance.amount} شيكل ${balance.label}`}
        </span>
    );
}

/**
 * Every subscription of the same person above their statement, each with
 * its balance, plus what they owe across all of them. Picking another one
 * shows that subscription's records. Hidden when the person has only one.
 */
export default function SubscriptionSwitcher({ subscriberNumber, subscriptions, currentId, onSelect }) {
    if (!subscriptions || subscriptions.length < 2) {
        return null;
    }

    const total = subscriptions.reduce((sum, subscription) => sum + Math.round(Number(subscription.balance) * 100), 0) / 100;

    return (
        <section className="mb-5 rounded-panel border border-gray-100 bg-surface p-4 sm:p-5" aria-label="اشتراكات المشترك">
            <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h4 className="text-base font-bold text-gray-900">
                    اشتراكات المشترك
                    {subscriberNumber && (
                        <>
                            {' '}
                            رقم <bdi dir="ltr">{subscriberNumber}</bdi>
                        </>
                    )}
                    <span className="ms-2 text-sm font-medium text-gray-500">{subscriptions.length} اشتراكات</span>
                </h4>
                <p className="text-sm text-gray-600">
                    الرصيد الإجمالي: <Balance value={total} />
                </p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {subscriptions.map((subscription) => {
                    const current = subscription.id === currentId;

                    return (
                        <button
                            key={subscription.id}
                            type="button"
                            aria-current={current ? 'true' : undefined}
                            disabled={current}
                            onClick={() => onSelect(subscription)}
                            className={`flex min-w-0 flex-col gap-1.5 rounded-xl border-[1.5px] px-3.5 py-3 text-start transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${
                                current ? 'cursor-default border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                            <span className="flex items-center justify-between gap-2">
                                <span className="text-xs text-gray-500">
                                    رقم الاشتراك{' '}
                                    <bdi dir="ltr" className="font-semibold text-gray-700">
                                        {subscription.accountNumber}
                                    </bdi>
                                </span>
                                <StatusPill tone={STATUS_TONES[subscription.status]} label={subscription.statusLabel} />
                            </span>
                            <b className="truncate text-[15px] text-gray-900">{subscription.fullName}</b>
                            <span className="truncate text-xs text-gray-500">
                                {[subscription.meterBoxNumber && `طبلون ${subscription.meterBoxNumber}`, subscription.tariffCategoryLabel]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </span>
                            <Balance value={subscription.balance} className="text-sm" />
                            {current && <span className="text-xs font-semibold text-gray-500">المعروض الآن</span>}
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
