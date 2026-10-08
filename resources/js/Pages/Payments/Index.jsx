import { useEffect, useRef, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import KpiTile from '@/Components/KpiTile';
import { describeBalance } from '@/lib/accountStatement';
import { formatMoney, initials } from '@/lib/format';
import { balanceText } from '@/Pages/Subscriptions/AccountFormParts';
import PaymentModal from '@/Pages/Subscriptions/PaymentModal';

const STATUS_DOTS = { active: 'bg-emerald-500', suspended: 'bg-amber-500', disconnected: 'bg-gray-400' };

const BALANCE_TONES = {
    owes: 'bg-brand-50 text-brand-700',
    credit: 'bg-emerald-50 text-emerald-700',
    settled: 'bg-gray-100 text-gray-600',
};

/** How long after the last key the search runs. */
const SEARCH_DELAY = 300;

/** One search result: who, where and what they owe, with the button that opens their payment form. */
function SubscriptionResult({ subscription, onPay, autoFocus = false }) {
    const described = describeBalance(subscription.balance);

    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 transition hover:bg-gray-50/70">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-graphite-gradient font-display text-[15px] font-bold text-white">
                {initials(subscription.fullName)}
                <span
                    className={`absolute -bottom-0.5 -start-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-surface ${STATUS_DOTS[subscription.status] ?? 'bg-gray-400'}`}
                    title={subscription.statusLabel}
                />
            </span>

            <div className="min-w-0 flex-1 basis-56">
                <p className="break-words text-base font-bold text-gray-900">{subscription.fullName}</p>
                <p className="mt-0.5 text-[13.5px] text-gray-500">
                    حساب{' '}
                    <span dir="ltr" className="font-display">
                        {subscription.accountNumber}
                    </span>
                    {subscription.meterBoxNumber && ` · طبلون ${subscription.meterBoxNumber}`}
                    {subscription.phone && (
                        <>
                            {' · '}
                            <span dir="ltr" className="font-display">
                                {subscription.phone}
                            </span>
                        </>
                    )}
                    {` · ${subscription.branchName}`}
                </p>
            </div>

            <div className="flex flex-col items-end gap-1">
                <span className={`whitespace-nowrap rounded-[10px] px-2.5 py-0.5 font-display text-[16px] font-bold ${BALANCE_TONES[described.tone]}`}>{balanceText(described)}</span>
                {Number(subscription.weeklyMinimumPayment) > 0 && (
                    <span className="text-xs text-gray-500">الحد الأدنى الأسبوعي {formatMoney(subscription.weeklyMinimumPayment)} ₪</span>
                )}
            </div>

            <button
                type="button"
                autoFocus={autoFocus}
                onClick={() => onPay(subscription)}
                className="inline-flex h-11 items-center gap-2 rounded-control bg-graphite-gradient px-5 text-sm font-bold text-white shadow-card transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
                <Icon name="banknotes" className="h-[18px] w-[18px]" />
                تسجيل دفعة
            </button>
        </li>
    );
}

/** What the user collected today, as figures and their latest payments. */
function TodaysPayments({ today }) {
    return (
        <section aria-labelledby="todays-payments" className="space-y-4">
            <h3 id="todays-payments" className="text-lg font-bold text-gray-900">
                ما حصّلته اليوم
            </h3>

            <div className="grid gap-4 sm:grid-cols-3">
                <KpiTile hero label="إجمالي دفعاتك اليوم" value={formatMoney(today.total)} unit="شيكل" hint={`${today.count.toLocaleString('en')} ${today.count === 1 ? 'دفعة' : 'دفعات'}`} />
                <KpiTile icon="banknotes" label="نقدًا" value={formatMoney(today.cash)} unit="شيكل" />
                <KpiTile icon="bank" label="تحويلات بنكية" value={formatMoney(today.transfers)} unit="شيكل" />
            </div>

            {today.payments.length > 0 ? (
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-panel border border-gray-100 bg-surface shadow-card">
                    {today.payments.map((payment) => (
                        <li key={payment.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-sm">
                            <span className="min-w-0 flex-1 basis-48 font-semibold text-gray-900">{payment.subscriptionName}</span>
                            <span className="text-gray-500">
                                {payment.methodLabel}
                                {payment.bankName && ` · ${payment.bankName}`}
                            </span>
                            {payment.voucherNumber && (
                                <span dir="ltr" className="font-display text-xs text-gray-500">
                                    #{payment.voucherNumber}
                                </span>
                            )}
                            <span dir="ltr" className="font-display text-xs text-gray-500">
                                {payment.time}
                            </span>
                            <b className="font-display text-base text-emerald-700">{formatMoney(payment.amount)} ₪</b>
                            <a
                                href={payment.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-control border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:text-gray-900"
                            >
                                <Icon name="printer" className="h-4 w-4" />
                                السند
                            </a>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="rounded-panel border border-dashed border-gray-200 bg-surface px-5 py-8 text-center text-sm text-gray-500">لم تسجّل أي دفعة اليوم بعد.</p>
            )}
        </section>
    );
}

export default function Index({ search, subscriptions, hasMoreSubscriptions, today, paymentMethods, transferBanks, senderBanks }) {
    const [term, setTerm] = useState(search);
    const [paying, setPaying] = useState(null);
    const input = useRef(null);
    const lastSearched = useRef(search);

    // Search as the user types, and keep the term in the address so a refresh or the back button returns to it.
    useEffect(() => {
        if (term.trim() === lastSearched.current.trim()) {
            return undefined;
        }

        const timer = setTimeout(() => {
            lastSearched.current = term;
            router.get('/payments', term.trim() ? { search: term.trim() } : {}, {
                only: ['search', 'subscriptions', 'hasMoreSubscriptions'],
                preserveState: true,
                preserveScroll: true,
                replace: true,
            });
        }, SEARCH_DELAY);

        return () => clearTimeout(timer);
    }, [term]);

    // Press "/" anywhere on the page to jump to the search.
    useEffect(() => {
        function onKeyDown(event) {
            if (event.key === '/' && !event.target.closest?.('input, textarea, select') && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                input.current?.focus();
            }
        }

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    const searched = search.trim() !== '';

    return (
        <AuthenticatedLayout
            header={
                <div className="min-w-0">
                    <h2 className="text-3xl font-bold text-gray-900">تسجيل الدفعات</h2>
                    <p className="mt-1 text-sm text-gray-500">ابحث عن المشترك وسجّل دفعته مباشرة.</p>
                </div>
            }
        >
            <Head title="تسجيل الدفعات" />

            <div className="space-y-8">
                <section className="space-y-3">
                    <div className="relative">
                        <Icon name="search" className="pointer-events-none absolute inset-y-0 start-5 my-auto h-6 w-6 text-gray-400" />
                        <input
                            ref={input}
                            type="search"
                            autoFocus
                            aria-label="البحث عن مشترك"
                            value={term}
                            onChange={(event) => setTerm(event.target.value)}
                            onKeyDown={(event) => {
                                // Enter on a single match goes straight to its payment form.
                                if (event.key === 'Enter' && subscriptions.length === 1 && term.trim() === search.trim()) {
                                    event.preventDefault();
                                    setPaying(subscriptions[0]);
                                }
                            }}
                            placeholder="ابحث بالاسم أو رقم الحساب أو رقم الجوال أو رقم الطبلون…"
                            className="block h-16 w-full rounded-panel border-[1.5px] border-gray-200 bg-surface pe-16 ps-14 text-lg shadow-card placeholder:text-gray-400 focus:border-gray-900 focus:ring-4 focus:ring-gray-900/10"
                        />
                        <span className="kbd pointer-events-none absolute inset-y-0 end-5 my-auto h-fit">/</span>
                    </div>

                    {searched &&
                        (subscriptions.length > 0 ? (
                            <>
                                <ul className="divide-y divide-gray-100 overflow-hidden rounded-panel border border-gray-100 bg-surface shadow-card">
                                    {subscriptions.map((subscription) => (
                                        <SubscriptionResult key={subscription.id} subscription={subscription} onPay={setPaying} />
                                    ))}
                                </ul>
                                {hasMoreSubscriptions && <p className="text-center text-sm text-gray-500">هناك نتائج أخرى؛ أضف إلى البحث ما يضيّقه.</p>}
                            </>
                        ) : (
                            <p className="rounded-panel border border-dashed border-gray-200 bg-surface px-5 py-8 text-center text-sm text-gray-500">لا يوجد مشترك يطابق «{search}».</p>
                        ))}
                </section>

                <TodaysPayments today={today} />
            </div>

            {paying && (
                <PaymentModal
                    key={paying.id}
                    show
                    onClose={() => setPaying(null)}
                    subscription={paying}
                    balance={paying.balance}
                    paymentMethods={paymentMethods}
                    transferBanks={transferBanks}
                    senderBanks={senderBanks}
                />
            )}
        </AuthenticatedLayout>
    );
}
