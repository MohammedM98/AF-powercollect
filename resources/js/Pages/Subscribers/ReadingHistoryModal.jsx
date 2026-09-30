import { useId } from 'react';
import BarChart from '@/Components/Charts/BarChart';
import MeterBar from '@/Components/Charts/MeterBar';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import { formatMoney, formatNumber } from '@/lib/format';

/** How many of the latest weeks the consumption chart shows. */
const CHART_WEEKS = 12;

const READING_TONES = { approved: 'green', pending: 'amber' };

/** One figure above the history. */
function Figure({ label, value, hint }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-surface p-4">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-gray-900">{value}</p>
            {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
        </div>
    );
}

/**
 * A subscriber's past weekly readings, newest first: how many, their
 * average and highest weekly consumption, the meter's latest reading, the
 * consumption of the latest weeks as a chart, and every reading with what
 * it was billed and whether it is approved. `subscriber` is a row of the
 * subscribers list, which carries its readings.
 */
export default function ReadingHistoryModal({ subscriber, onClose }) {
    const titleId = useId();
    const readings = subscriber?.meterReadings ?? [];
    const consumptions = readings.map((reading) => Number(reading.consumption));
    const busiest = Math.max(0, ...consumptions);
    const busiestWeek = readings.find((reading) => Number(reading.consumption) === busiest);
    const average = readings.length ? consumptions.reduce((total, kilos) => total + kilos, 0) / readings.length : 0;
    const hasDiscounts = readings.some((reading) => Number(reading.discountAmount) > 0);
    const chart = readings
        .slice(0, CHART_WEEKS)
        .reverse()
        .map((reading) => ({ date: reading.weekStart, value: Number(reading.consumption) }));

    return (
        <Modal show={Boolean(subscriber)} onClose={onClose} maxWidth="6xl">
            {subscriber && (
                <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[calc(100dvh-6rem)] min-h-0 flex-col">
                    <div className="flex shrink-0 items-center gap-3.5 border-b border-gray-100 px-4 py-4 sm:px-8 sm:py-5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                            <Icon name="gauge" className="h-[22px] w-[22px]" />
                        </span>
                        <div className="min-w-0">
                            <h3 id={titleId} className="text-xl font-bold text-gray-900">
                                سجل قراءات {subscriber.display_name}
                            </h3>
                            <p className="mt-0.5 text-sm text-gray-500">
                                حساب <span dir="ltr">{subscriber.account_number}</span>
                                {subscriber.meterBoxNumber && ` · طبلون ${subscriber.meterBoxNumber}`} · {subscriber.branchName}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="إغلاق"
                            className="ms-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-100 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"
                        >
                            <Icon name="close" className="h-[18px] w-[18px]" strokeWidth={2} />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-5 sm:px-8 sm:py-6">
                        {readings.length === 0 ? (
                            <div className="rounded-card border border-dashed border-gray-200 bg-surface px-6 py-14 text-center">
                                <Icon name="gauge" className="mx-auto h-10 w-10 text-gray-300" />
                                <p className="mt-3 font-semibold text-gray-700">لا توجد قراءات لهذا المشترك بعد.</p>
                                <p className="mt-1 text-sm text-gray-500">
                                    قراءة العداد عند الاشتراك: <span className="font-display">{formatNumber(subscriber.lastReading)}</span>
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <Figure
                                        label="عدد القراءات"
                                        value={formatNumber(readings.length)}
                                        hint={`منذ أسبوع ${readings.at(-1).weekStart}`}
                                    />
                                    <Figure label="متوسط الاستهلاك الأسبوعي" value={`${formatMoney(average)} كيلو`} />
                                    <Figure
                                        label="أعلى استهلاك"
                                        value={`${formatNumber(busiest)} كيلو`}
                                        hint={busiestWeek && `أسبوع ${busiestWeek.weekStart}`}
                                    />
                                    <Figure
                                        label="آخر قراءة للعداد"
                                        value={formatNumber(subscriber.lastReading)}
                                        hint={`أسبوع ${readings[0].weekStart}`}
                                    />
                                </div>

                                {chart.length > 1 && (
                                    <section className="mt-4 rounded-card border border-gray-100 bg-surface p-5 shadow-card">
                                        <h4 className="font-semibold text-gray-900">الاستهلاك الأسبوعي (كيلو)</h4>
                                        <p className="mb-4 text-sm text-gray-500">آخر {formatNumber(chart.length)} أسابيع، الأقدم أولًا</p>
                                        <BarChart
                                            data={chart}
                                            label="الاستهلاك الأسبوعي بالكيلو"
                                            formatValue={(kilos) => `${formatNumber(kilos)} كيلو`}
                                        />
                                    </section>
                                )}

                                <div className="data-table-container mt-4">
                                    <table className="data-table w-full text-start text-sm">
                                        <thead>
                                            <tr>
                                                <th>الأسبوع</th>
                                                <th>القراءة السابقة</th>
                                                <th>القراءة الحالية</th>
                                                <th>الاستهلاك</th>
                                                {hasDiscounts && <th>الخصم</th>}
                                                <th>المبلغ المستحق</th>
                                                <th>الحالة</th>
                                                <th>سجّلها</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {readings.map((reading) => (
                                                <tr key={reading.id}>
                                                    <td data-label="الأسبوع" className="tabular-nums text-gray-700">
                                                        <span dir="ltr">
                                                            {reading.weekStart} → {reading.weekEnd}
                                                        </span>
                                                        {reading.notes && (
                                                            <p className="mt-1 max-w-xs whitespace-normal text-xs text-gray-500">{reading.notes}</p>
                                                        )}
                                                    </td>
                                                    <td data-label="القراءة السابقة" className="font-display tabular-nums text-gray-600">
                                                        {formatNumber(reading.previous_reading)}
                                                    </td>
                                                    <td
                                                        data-label="القراءة الحالية"
                                                        className="font-display font-semibold tabular-nums text-gray-900"
                                                    >
                                                        {formatNumber(reading.current_reading)}
                                                    </td>
                                                    <td data-label="الاستهلاك">
                                                        <b className="font-display tabular-nums text-gray-900">{formatNumber(reading.consumption)}</b>{' '}
                                                        <span className="text-xs text-gray-500">كيلو</span>
                                                        <MeterBar value={Number(reading.consumption)} max={busiest} className="mt-1.5 w-24" />
                                                    </td>
                                                    {hasDiscounts && (
                                                        <td
                                                            data-label="الخصم"
                                                            className="font-display tabular-nums text-emerald-700 dark:text-emerald-400"
                                                        >
                                                            {Number(reading.discountAmount) > 0 ? `${formatMoney(reading.discountAmount)} ₪` : '—'}
                                                        </td>
                                                    )}
                                                    <td data-label="المبلغ المستحق" className="font-display font-semibold tabular-nums text-gray-900">
                                                        {formatMoney(reading.amountDue)} ₪
                                                    </td>
                                                    <td data-label="الحالة">
                                                        <StatusPill tone={READING_TONES[reading.status] ?? 'gray'} label={reading.statusLabel} />
                                                    </td>
                                                    <td data-label="سجّلها" className="text-gray-700">
                                                        {reading.recordedByName ?? '—'}
                                                        <span className="block text-xs text-gray-500" dir="ltr">
                                                            {reading.recordedAt}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
}
