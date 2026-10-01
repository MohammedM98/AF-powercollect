import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AccountStatement from './AccountStatement';
import { StandingDiscountBadge } from './AccountSummary';
import { StatementActions, StatementForms } from './StatementForms';
import SubscriptionSwitcher from './SubscriptionSwitcher';

/**
 * A subscriber's account statement: every charge (عليه), payment and
 * discount (له), oldest first, with the balance after each line.
 */
export default function Statement(statement) {
    const { subscriber, subscriptions, entries, summary, canRecordPayment, canAdjustBalance, paymentMethods, transactionTypes } = statement;
    // The form open over the statement: 'payment', 'charge' or 'discount', or a line to correct or delete.
    const [openForm, setOpenForm] = useState(null);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <Link href="/subscribers" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
                            → المشتركون
                        </Link>
                        <h2 className="mt-1 text-3xl font-bold text-gray-900">كشف حساب المشترك</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            {subscriber.fullName} · حساب <span dir="ltr">{subscriber.accountNumber}</span> · {subscriber.tariffCategoryLabel}
                            {subscriber.tariffSegmentName && ` (${subscriber.tariffSegmentName})`}
                            {subscriber.meterBoxNumber && ` · طبلون ${subscriber.meterBoxNumber}`} · {subscriber.branchName}
                        </p>
                        {subscriber.standingDiscount && (
                            <div className="mt-2">
                                <StandingDiscountBadge discount={subscriber.standingDiscount} />
                            </div>
                        )}
                    </div>
                    <StatementActions canRecordPayment={canRecordPayment} canAdjustBalance={canAdjustBalance} onOpen={setOpenForm} />
                </>
            }
        >
            <Head title={`كشف حساب ${subscriber.fullName}`} />

            <SubscriptionSwitcher
                subscriberNumber={subscriber.subscriberNumber}
                subscriptions={subscriptions}
                currentId={subscriber.id}
                onSelect={(subscription) => router.visit(`/subscribers/${subscription.id}/statement`)}
            />

            <AccountStatement
                entries={entries}
                summary={summary}
                paymentMethods={paymentMethods}
                transactionTypes={transactionTypes}
                onCorrect={(entry) => setOpenForm({ action: 'correct', entry })}
                onDelete={(entry) => setOpenForm({ action: 'delete', entry })}
            />

            <StatementForms statement={statement} openForm={openForm} onClose={() => setOpenForm(null)} />
        </AuthenticatedLayout>
    );
}
