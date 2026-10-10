import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AccountStatement from './AccountStatement';
import { StandingDiscountBadge } from './AccountSummary';
import StopStandingDiscountButton from './StopStandingDiscountButton';
import { StatementActions, StatementForms } from './StatementForms';
import SubscriptionSwitcher from './SubscriptionSwitcher';

/**
 * A subscription's account statement: every charge (عليه), payment and
 * discount (له), oldest first, with the balance after each line.
 */
export default function Statement(statement) {
    const { subscription, subscriptions, entries, summary, canRecordPayment, canAdjustBalance, paymentMethods, transactionTypes } = statement;
    // The form open over the statement: 'payment', 'charge' or 'discount', or a line to correct or delete.
    const [openForm, setOpenForm] = useState(null);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <Link href="/subscriptions" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
                            → المشتركون
                        </Link>
                        <h2 className="mt-1 text-3xl font-bold text-gray-900">كشف حساب المشترك</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            {subscription.fullName} · حساب <span dir="ltr">{subscription.accountNumber}</span> · {subscription.tariffCategoryLabel}
                            {subscription.tariffSegmentName && ` (${subscription.tariffSegmentName})`}
                            {subscription.meterBoxNumber && ` · طبلون ${subscription.meterBoxNumber}`} · {subscription.branchName}
                        </p>
                        {subscription.standingDiscount && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <StandingDiscountBadge discount={subscription.standingDiscount} />
                                {canAdjustBalance && (
                                    <StopStandingDiscountButton
                                        subscriptionId={subscription.id}
                                        subscriptionName={subscription.fullName}
                                        discountLabel={subscription.standingDiscount.segment ? `${subscription.standingDiscount.terms} · ${subscription.standingDiscount.segment}` : subscription.standingDiscount.terms}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                    <StatementActions canRecordPayment={canRecordPayment} canAdjustBalance={canAdjustBalance} onOpen={setOpenForm} />
                </>
            }
        >
            <Head title={`كشف حساب ${subscription.fullName}`} />

            <SubscriptionSwitcher
                subscriberNumber={subscription.subscriberNumber}
                subscriptions={subscriptions}
                currentId={subscription.id}
                onSelect={(subscription) => router.visit(`/subscriptions/${subscription.id}/statement`)}
            />

            <AccountStatement
                subscription={subscription}
                entries={entries}
                summary={summary}
                paymentMethods={paymentMethods}
                transactionTypes={transactionTypes}
                onAction={(action, entry) => setOpenForm({ action, entry })}
            />

            <StatementForms statement={statement} openForm={openForm} onClose={() => setOpenForm(null)} onOpen={setOpenForm} />
        </AuthenticatedLayout>
    );
}
