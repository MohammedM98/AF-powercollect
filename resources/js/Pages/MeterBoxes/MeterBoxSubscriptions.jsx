import { useEffect, useRef, useState } from 'react';
import { Link, useHttp } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import StatusPill from '@/Components/DataTable/StatusPill';
import FinancialBalance from '@/Components/FinancialBalance';
import SecondaryButton from '@/Components/SecondaryButton';
import { formatNumber } from '@/lib/format';

const STATUS_TONES = { active: 'green', suspended: 'amber', disconnected: 'red' };

export function SubscriptionRows({ subscriptions, boxNumber }) {
    return (
        <div role="table" tabIndex={0} aria-label={`مشتركو ${boxNumber}`} className="max-h-[480px] overflow-y-auto rounded-control border border-gray-100 bg-surface text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900">
            <div role="row" className="meter-box-subscription-columns sticky top-0 z-10 hidden border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500">
                {['المشترك / رقم الاشتراك', 'آخر قراءة', 'القاطع', 'الحالة', 'الرصيد', 'الكشف'].map((label) => <span role="columnheader" key={label}>{label}</span>)}
            </div>
            <div role="rowgroup" className="divide-y divide-gray-100">
                {subscriptions.map((subscription) => {
                    const balance = Number(subscription.outstandingBalance);

                    return (
                        <div role="row" key={subscription.id} className="meter-box-subscription-columns grid items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-gray-50/60">
                            <div role="cell" className="meter-box-subscription-name min-w-0">
                                <Link href={subscription.statementUrl} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900">
                                    <RowIdentity name={subscription.display_name} subtitle={subscription.account_number} subtitleDir="ltr" />
                                </Link>
                            </div>
                            <div role="cell" className="meter-box-subscription-reading text-sm text-gray-600">
                                <span className="meter-box-subscription-label text-xs text-gray-500">القراءة: </span>
                                <b className="font-display font-semibold">{subscription.lastReading == null ? '—' : formatNumber(subscription.lastReading)}</b>
                            </div>
                            <div role="cell" className="meter-box-subscription-breaker text-sm text-gray-600">
                                {subscription.circuitBreakerAmpere == null ? '—' : <><b className="font-display font-semibold">{subscription.circuitBreakerAmpere}</b> <span className="text-xs">أمبير</span></>}
                            </div>
                            <div role="cell" className="meter-box-subscription-status"><StatusPill tone={STATUS_TONES[subscription.status]} label={subscription.statusLabel} /></div>
                            <div role="cell" className="meter-box-subscription-balance">
                                <FinancialBalance value={balance} />
                            </div>
                            <div role="cell" className="meter-box-subscription-action text-end">
                                <Link href={subscription.statementUrl} className="row-action row-action-quiet" aria-label={`كشف حساب ${subscription.display_name}`} title="كشف الحساب">
                                    <Icon name="chevron-left" className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function MeterBoxSubscriptions({ meterBox, canRecordReadings, canSendMessages }) {
    const http = useHttp();
    const [failed, setFailed] = useState(false);
    const requestNumber = useRef(0);

    function load(page = 1) {
        setFailed(false);
        const request = ++requestNumber.current;
        http.get(`/meter-boxes/${meterBox.id}/subscriptions?page=${page}`).catch(() => {
            if (request === requestNumber.current) {
                setFailed(true);
            }
        });
    }

    useEffect(() => {
        load();
        return () => {
            requestNumber.current++;
            http.cancel();
        };
    }, []);

    const rows = http.response;

    return (
        <section id={`meter-box-subscriptions-${meterBox.id}`} aria-label={`مشتركو ${meterBox.box_number}`} aria-busy={http.processing} className="text-start">
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <Icon name="users" className="h-5 w-5 text-gray-500" />
                <h4 className="text-sm font-bold text-gray-900">مشتركو <span dir="ltr" className="font-display">{meterBox.box_number}</span></h4>
                <span className="text-xs text-gray-500">{meterBox.display_name}</span>
                <div className="flex w-full flex-wrap gap-2 sm:ms-auto sm:w-auto">
                    {canSendMessages && meterBox.subscriptionsCount > 0 && <Link href={`/messages/create?kind=custom&channel=sms&status=&meter_box_id=${meterBox.id}`} className="inline-flex items-center gap-2 rounded-control border border-gray-200 bg-surface px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"><Icon name="messages" className="h-4 w-4" />رسالة للمشتركين</Link>}
                    {canRecordReadings && meterBox.activeSubscriptionsCount > 0 && <Link href={`/meter-readings?filter[meter_box_id]=${meterBox.id}`} className="inline-flex items-center gap-2 rounded-control border border-gray-200 bg-surface px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"><Icon name="gauge" className="h-4 w-4" />تسجيل قراءات</Link>}
                </div>
            </div>
            {failed ? (
                <div role="alert" className="rounded-control border border-gray-100 bg-surface p-5 text-center text-sm text-gray-600">
                    <p>تعذّر تحميل المشتركين. حاول مرة أخرى.</p>
                    <SecondaryButton className="mt-3" onClick={() => load(rows?.current_page ?? 1)}>إعادة المحاولة</SecondaryButton>
                </div>
            ) : !rows ? (
                <div role="status" className="rounded-control border border-gray-100 bg-surface p-4">
                    <p className="mb-3 text-sm text-gray-500">جارٍ تحميل المشتركين…</p>
                    <div className="grid gap-3 motion-safe:animate-pulse" aria-hidden="true">{[1, 2, 3].map((id) => <div key={id} className="h-10 rounded-lg bg-gray-100" />)}</div>
                </div>
            ) : rows.data.length === 0 ? (
                <div className="rounded-control border border-dashed border-gray-200 bg-surface px-4 py-8 text-center text-sm text-gray-500">لا يوجد مشتركون على هذا الطبلون.</div>
            ) : (
                <>
                    <SubscriptionRows subscriptions={rows.data} boxNumber={meterBox.box_number} />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                        <span>عرض <b className="font-display">{rows.from}–{rows.to}</b> من <b className="font-display">{rows.total}</b> مشترك</span>
                        {rows.last_page > 1 && <div className="flex items-center gap-2">
                            <SecondaryButton className="!px-3 !py-1.5 !text-xs" disabled={http.processing || rows.current_page === 1} onClick={() => load(rows.current_page - 1)}>السابق</SecondaryButton>
                            <span className="font-display">{rows.current_page} / {rows.last_page}</span>
                            <SecondaryButton className="!px-3 !py-1.5 !text-xs" disabled={http.processing || rows.current_page === rows.last_page} onClick={() => load(rows.current_page + 1)}>التالي</SecondaryButton>
                        </div>}
                    </div>
                </>
            )}
        </section>
    );
}
