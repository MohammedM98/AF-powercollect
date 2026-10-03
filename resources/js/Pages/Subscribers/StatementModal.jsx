import { useId, useState } from 'react';
import { Link } from '@inertiajs/react';
import Modal from '@/Components/Modal';
import Icon from '@/Components/Icon';
import StatusPill from '@/Components/DataTable/StatusPill';
import AccountStatement from './AccountStatement';
import { StandingDiscountBadge } from './AccountSummary';
import { StatementActions, StatementForms } from './StatementForms';
import SubscriptionSwitcher from './SubscriptionSwitcher';

const STATUS_TONES = {
    active: 'green',
    suspended: 'amber',
    disconnected: 'gray',
};

/** Placeholder cards and rows while the statement loads. */
function StatementSkeleton() {
    return (
        <div className="animate-pulse space-y-4" aria-hidden="true">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((card) => (
                    <div key={card} className="h-[118px] rounded-xl border border-gray-100 bg-surface" />
                ))}
            </div>
            <div className="h-28 rounded-panel bg-surface" />
            {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="h-16 rounded-row bg-gray-200/70" />
            ))}
        </div>
    );
}

/**
 * A subscriber's financial history — their account statement — in a wide
 * window over the list, closed with its "إخفاء" button, Esc, or a click
 * outside it. `subscriber` (from the list's row) fills the header at once;
 * `statement` (the statement's props) fills the rest when it arrives.
 * `initialForm` ('payment', 'charge', 'discount' or 'clearing') opens that form as
 * soon as the statement is there. `onSwitch(header)` opens another of the
 * same person's subscriptions in its place.
 */
export default function StatementModal({ subscriber, statement, initialForm = null, onSwitch, onClose }) {
    const titleId = useId();
    // The form open over the statement: 'payment', 'charge' or 'discount', or a line to correct or delete.
    const [openForm, setOpenForm] = useState(initialForm);
    const header = statement?.subscriber ?? subscriber;

    return (
        <>
            <Modal show onClose={onClose} maxWidth="full">
                <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex h-[calc(100dvh-6rem)] min-h-0 flex-col">
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-gray-100 px-4 py-4 sm:px-8 sm:py-5">
                        <div className="flex min-w-0 items-center gap-3.5">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                                <Icon name="ledger" className="h-[22px] w-[22px]" />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <h3 id={titleId} className="text-xl font-bold text-gray-900">
                                        كشف حساب {header.fullName}
                                    </h3>
                                    <StatusPill tone={STATUS_TONES[header.status]} label={header.statusLabel} />
                                    {header.standingDiscount && <StandingDiscountBadge discount={header.standingDiscount} />}
                                </div>
                                <p className="mt-0.5 text-sm text-gray-500">
                                    {header.subscriberNumber && (
                                        <>
                                            مشترك <span dir="ltr">{header.subscriberNumber}</span> ·{' '}
                                        </>
                                    )}
                                    {header.accountNumber && (
                                        <>
                                            حساب <span dir="ltr">{header.accountNumber}</span> ·{' '}
                                        </>
                                    )}
                                    {header.tariffCategoryLabel && (
                                        <>
                                            {header.tariffCategoryLabel}
                                            {header.tariffSegmentName && ` (${header.tariffSegmentName})`} ·{' '}
                                        </>
                                    )}
                                    {header.meterBoxNumber && `طبلون ${header.meterBoxNumber} · `}
                                    {header.branchName}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {statement && (
                                <StatementActions
                                    canRecordPayment={statement.canRecordPayment}
                                    canAdjustBalance={statement.canAdjustBalance}
                                    onOpen={setOpenForm}
                                />
                            )}
                            <Link
                                href={`/subscribers/${header.id}/statement`}
                                title="فتح الكشف في صفحة مستقلة"
                                aria-label="فتح الكشف في صفحة مستقلة"
                                className="flex h-10 w-10 items-center justify-center rounded-control border border-gray-200 bg-surface text-gray-600 transition hover:border-gray-300 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                            >
                                <Icon name="external" className="h-[18px] w-[18px]" />
                            </Link>
                            <button
                                type="button"
                                onClick={onClose}
                                className="inline-flex h-10 items-center gap-2 rounded-control border border-gray-200 bg-surface px-3.5 text-sm font-semibold text-gray-900 transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                            >
                                <Icon name="eye-off" className="h-[18px] w-[18px]" />
                                إخفاء
                                <span className="kbd hidden sm:inline-flex" dir="ltr">
                                    Esc
                                </span>
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-5 sm:px-8 sm:py-6" aria-busy={!statement}>
                        {statement ? (
                            <>
                                <SubscriptionSwitcher
                                    subscriberNumber={statement.subscriber.subscriberNumber}
                                    subscriptions={statement.subscriptions}
                                    currentId={statement.subscriber.id}
                                    onSelect={onSwitch}
                                />
                                <AccountStatement
                                    entries={statement.entries}
                                    summary={statement.summary}
                                    paymentMethods={statement.paymentMethods}
                                    transactionTypes={statement.transactionTypes}
                                    onCorrect={(entry) => setOpenForm({ action: 'correct', entry })}
                                    onDelete={(entry) => setOpenForm({ action: 'delete', entry })}
                                    onErase={(entry) => setOpenForm({ action: 'erase', entry })}
                                />
                            </>
                        ) : (
                            <StatementSkeleton />
                        )}
                    </div>
                </div>
            </Modal>

            {statement && <StatementForms statement={statement} openForm={openForm} onClose={() => setOpenForm(null)} />}
        </>
    );
}
