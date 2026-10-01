import { Fragment, useEffect, useId, useRef, useState } from 'react';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import { formatMoney, formatNumber } from '@/lib/format';
import { groupReadingsByMonth, readingHistoryCsv, readingTotals, readingsInPeriod } from '@/lib/readingHistory';
import './ReadingHistoryModal.css';

const PERIODS = [['12', 'آخر 12 أسبوعًا'], ['26', '6 أشهر'], ['52', 'سنة'], ['all', 'الكل']];
const STATUSES = [['all', 'الكل'], ['approved', 'معتمدة'], ['pending', 'قيد المراجعة']];
const MONTH = new Intl.DateTimeFormat('ar-SY-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const money = (value) => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (date) => date ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : '—';

function HistoryIcon({ name }) {
    const paths = {
        print: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></>,
        excel: <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 12l5 5M14 12l-5 5" /></>,
        app: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></>,
        web: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    };

    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Figure({ label, value, unit, children }) {
    return <div className="rh-figure"><small>{label}</small><b>{value}{unit && <em>{unit}</em>}</b><span>{children ?? '—'}</span></div>;
}

function HistoryChart({ readings, average }) {
    const hatchId = useId();
    const plotRef = useRef(null);
    const [width, setWidth] = useState(1000);
    const [activeId, setActiveId] = useState(null);
    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
        observer.observe(plotRef.current);
        return () => observer.disconnect();
    }, []);
    const points = [...readings].reverse();
    const highest = Math.max(1, ...points.map((reading) => Number(reading.consumption)));
    const maximum = highest * 1.1;
    const gap = Math.min(points.length > 30 ? 3 : points.length > 14 ? 6 : 10, width / Math.max(1, points.length) / 3);
    const barWidth = (width - gap * (points.length - 1)) / Math.max(1, points.length);
    const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(width / 58))));
    const y = (value) => 146 - Number(value) / maximum * 124;
    const active = readings.find((reading) => reading.id === activeId);

    return (
        <section className="rh-chart">
            <div className="rh-chart-heading"><h3>الاستهلاك الأسبوعي</h3><span>{formatNumber(points.length)} أسبوعًا، الأقدم على اليمين</span><span className="rh-average"><i />المتوسط</span></div>
            <div className="rh-plot" ref={plotRef} onPointerLeave={() => setActiveId(null)}>
                {points.length > 0 ? <svg viewBox={`0 0 ${width} 170`} preserveAspectRatio="none" role="group" aria-label="الاستهلاك الأسبوعي بالكيلو">
                    <defs><pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" className="rh-hatch-background" /><path d="M0 0V6" className="rh-hatch-line" strokeWidth="2.2" /></pattern></defs>
                    <line x1="0" x2={width} y1="146" y2="146" className="rh-baseline" />
                    {points.map((reading, index) => {
                        const x = width - (index + 1) * barWidth - index * gap;
                        const height = Math.max(2, 146 - y(reading.consumption));
                        const latest = index === points.length - 1;
                        const description = `${reading.weekStart} – ${reading.weekEnd}: ${formatMoney(reading.consumption)} كيلو · ${money(reading.amountDue)} ₪ · ${reading.statusLabel}`;

                        return <g key={reading.id} tabIndex={0} role="img" aria-label={description} onFocus={() => setActiveId(reading.id)} onBlur={() => setActiveId(null)} onPointerEnter={() => setActiveId(reading.id)} className="rh-chart-point">
                            <title>{description}</title>
                            <rect x={x} y={146 - height} width={barWidth} height={height} rx={Math.min(4, barWidth / 3)} className={`rh-bar ${latest ? 'is-latest' : ''}`} style={reading.status === 'pending' ? { fill: `url(#${hatchId})` } : undefined} />
                            {(latest || Number(reading.consumption) === highest) && <text x={x + barWidth / 2} y={140 - height} textAnchor="middle" className="rh-chart-value">{formatMoney(reading.consumption)}</text>}
                            {(points.length - 1 - index) % labelEvery === 0 && <text x={x + barWidth / 2} y="164" textAnchor="middle" className="rh-chart-label">{shortDate(reading.weekEnd)}</text>}
                            <rect x={x - gap / 2} y="0" width={barWidth + gap} height="146" fill="transparent" />
                        </g>;
                    })}
                    <line x1="0" x2={width} y1={y(average)} y2={y(average)} className="rh-average-line" />
                </svg> : <p className="rh-chart-empty">لا توجد قراءات في هذه الفترة.</p>}
                {active && <div className="rh-tooltip" role="tooltip"><b>{formatMoney(active.consumption)} كيلو · {money(active.amountDue)} ₪</b>{shortDate(active.weekStart)} – {shortDate(active.weekEnd)} · {active.statusLabel}</div>}
            </div>
        </section>
    );
}

/** The selected subscriber's recorded history, presented using the supplied design. */
export default function ReadingHistoryModal({ subscriber, onClose }) {
    const titleId = useId();
    const [period, setPeriod] = useState('12');
    const [status, setStatus] = useState('all');
    const allReadings = readingsInPeriod(subscriber?.meterReadings ?? [], 'all');
    const periodReadings = readingsInPeriod(allReadings, period);
    const visibleReadings = periodReadings.filter((reading) => status === 'all' || reading.status === status);
    const totals = readingTotals(visibleReadings);
    const average = periodReadings.length ? readingTotals(periodReadings).consumption / periodReadings.length : 0;
    const busiest = periodReadings.reduce((highest, reading) => !highest || Number(reading.consumption) > Number(highest.consumption) ? reading : highest, null);
    const latest = allReadings[0];
    const previousWeeks = allReadings.slice(1, 5);
    const previousAverage = previousWeeks.length ? readingTotals(previousWeeks).consumption / previousWeeks.length : 0;
    const change = previousAverage > 0 ? Math.round((Number(latest.consumption) - previousAverage) / previousAverage * 100) : null;
    const maximum = Math.max(1, ...visibleReadings.map((reading) => Number(reading.consumption)));

    function exportReadings() {
        const url = URL.createObjectURL(new Blob([readingHistoryCsv(visibleReadings)], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `readings-${subscriber.account_number}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return (
        <Modal show={Boolean(subscriber)} onClose={onClose} maxWidth="full" panelClassName="!my-0">
            {subscriber && <div className="reading-history" role="dialog" aria-modal="true" aria-labelledby={titleId} dir="rtl">
                <header className="rh-header">
                    <img className="rh-print-logo" src="/images/logo-af.webp" alt="AF PowerCollect" />
                    <span className="rh-gauge"><Icon name="gauge" className="h-[23px] w-[23px]" /></span>
                    <div className="rh-identity">
                        <h2 id={titleId}>سجل قراءات {subscriber.display_name}</h2>
                        <div className="rh-meta">
                            <span>حساب <b dir="ltr">{subscriber.account_number}</b></span>
                            {subscriber.meterBoxNumber && <><span>·</span><span>الطبلون <b>{subscriber.meterBoxNumber}</b>{subscriber.subAreaName && ` · ${subscriber.subAreaName}`}</span></>}
                            <span>·</span><span>{subscriber.branchName}</span><span>·</span><span>{subscriber.tariffCategoryLabel} · {money(subscriber.tariffRate)} ₪ للكيلو</span>
                            <span className={`rh-pill ${subscriber.status === 'active' ? 'is-approved' : 'is-pending'}`}><i />{subscriber.statusLabel}</span>
                        </div>
                    </div>
                    <div className="rh-actions">
                        <button type="button" onClick={exportReadings} disabled={!visibleReadings.length} title="تصدير القراءات المعروضة بصيغة CSV المتوافقة مع Excel"><HistoryIcon name="excel" />تصدير Excel</button>
                        <button type="button" onClick={() => window.print()} disabled={!visibleReadings.length}><HistoryIcon name="print" />طباعة</button>
                        <button type="button" className="rh-close" onClick={onClose} aria-label="إغلاق"><Icon name="close" /></button>
                    </div>
                </header>
                <div className="rh-body">
                    <div className="rh-figures">
                        <Figure label="عدد القراءات" value={formatNumber(periodReadings.length)}>{periodReadings.length ? `من أسبوع ${shortDate(periodReadings.at(-1).weekStart)}` : 'لا توجد قراءات بعد'}</Figure>
                        <Figure label="متوسط الاستهلاك الأسبوعي" value={formatMoney(average)} unit="كيلو">{periodReadings.length ? `≈ ${money(average * Number(subscriber.tariffRate))} ₪ في الأسبوع` : '—'}</Figure>
                        <Figure label="أعلى استهلاك" value={formatMoney(busiest?.consumption ?? 0)} unit="كيلو">{busiest && `أسبوع ${shortDate(busiest.weekStart)} – ${shortDate(busiest.weekEnd)}`}</Figure>
                        <Figure label="آخر قراءة للعداد" value={formatMoney(subscriber.lastReading)}>{latest ? <>أسبوع {shortDate(latest.weekEnd)}{change !== null && <> · <span className={change > 0 ? 'rh-up' : 'rh-down'}>{change > 0 ? '▲' : change < 0 ? '▼' : '≈'} {Math.abs(change)}٪</span> عن متوسط {formatNumber(previousWeeks.length)} أسابيع</>}</> : 'قراءة العداد عند الاشتراك'}</Figure>
                    </div>
                    <HistoryChart readings={periodReadings} average={average} />
                    <div className="rh-toolbar">
                        <div className="rh-segments" role="group" aria-label="الفترة">{PERIODS.map(([value, label]) => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div>
                        <div className="rh-segments" role="group" aria-label="الحالة">{STATUSES.map(([value, label]) => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}<span>{formatNumber(value === 'all' ? periodReadings.length : periodReadings.filter((reading) => reading.status === value).length)}</span></button>)}</div>
                        <span className="rh-count" aria-live="polite">{formatNumber(visibleReadings.length)} قراءة معروضة</span>
                    </div>
                    <p className="rh-print-context">
                        الفترة: {PERIODS.find(([value]) => value === period)[1]} · الحالة: {STATUSES.find(([value]) => value === status)[1]}
                        {visibleReadings.length > 0 && <> · {visibleReadings.at(-1).weekStart} – {visibleReadings[0].weekEnd}</>}
                    </p>
                    <div className="rh-table-wrap">
                        <table className="rh-table">
                            <thead><tr><th scope="col">الأسبوع</th><th scope="col" className="rh-previous">السابقة</th><th scope="col" className="rh-current">الحالية</th><th scope="col">الاستهلاك</th><th scope="col" className="rh-discount">الخصم</th><th scope="col">المستحق</th><th scope="col">الحالة</th><th scope="col" className="rh-recorder">سجّلها</th></tr></thead>
                            <tbody>{groupReadingsByMonth(visibleReadings).map((group) => <Fragment key={group.month}>
                                <tr className="rh-month"><th scope="rowgroup" colSpan={8}><b>{MONTH.format(new Date(`${group.month}-01T00:00:00Z`))}</b>{formatNumber(group.readings.length)} قراءة · <span>{formatMoney(group.totals.consumption)}</span> كيلو · <span>{money(group.totals.due)}</span> ₪</th></tr>
                                {group.readings.map((reading) => {
                                    const difference = average > 0 ? Math.round((Number(reading.consumption) - average) / average * 100) : 0;
                                    return <tr key={reading.id}>
                                        <td className="rh-week"><b dir="ltr" title={`${reading.weekStart} – ${reading.weekEnd}`}>{shortDate(reading.weekStart)} ← {shortDate(reading.weekEnd)}</b>{reading.notes && <span className="rh-note">{reading.notes}</span>}</td>
                                        <td className="rh-previous rh-number">{formatMoney(reading.previous_reading)}</td><td className="rh-current rh-number">{formatMoney(reading.current_reading)}</td>
                                        <td className="rh-consumption"><div><b>{formatMoney(reading.consumption)}</b><span className="rh-meter"><i style={{ width: `${Number(reading.consumption) / maximum * 100}%` }} /></span><span className={`rh-delta ${Math.abs(difference) < 10 ? '' : difference > 0 ? 'rh-up' : 'rh-down'}`} dir="ltr" title="الفرق عن متوسط الفترة">{Math.abs(difference) < 10 ? '≈' : `${difference > 0 ? '+' : ''}${difference}٪`}</span></div></td>
                                        <td className="rh-discount">{Number(reading.discountAmount) > 0 ? <span className="rh-discount-value" dir="ltr">−{money(reading.discountAmount)}</span> : <span className="rh-muted">—</span>}</td>
                                        <td className="rh-due"><b dir="ltr">{money(reading.amountDue)} <em>₪</em></b>{reading.minimumApplied && <small>الحد الأدنى</small>}</td>
                                        <td className="rh-status"><span className={`rh-pill ${reading.status === 'approved' ? 'is-approved' : 'is-pending'}`}><i />{reading.status === 'pending' ? 'قيد المراجعة' : reading.statusLabel}</span></td>
                                        <td className="rh-recorder">{reading.recordedByName ?? '—'}<small><HistoryIcon name={reading.recordedSource === 'app' ? 'app' : 'web'} /><span>{reading.recordedSource === 'app' ? 'التطبيق' : 'الموقع'}</span> · <span dir="ltr">{reading.recordedAt}</span></small></td>
                                    </tr>;
                                })}
                            </Fragment>)}</tbody>
                            {visibleReadings.length > 0 && <tfoot><tr><td>مجموع الفترة</td><td className="rh-previous rh-hide-mobile" /><td className="rh-current rh-hide-mobile" /><td><b className="rh-number">{formatMoney(totals.consumption)}</b> كيلو</td><td className="rh-discount"><span className="rh-discount-value" dir="ltr">{totals.discount > 0 ? `−${money(totals.discount)}` : '—'}</span></td><td className="rh-due"><b dir="ltr">{money(totals.due)} <em>₪</em></b></td><td className="rh-hide-mobile" /><td className="rh-recorder rh-hide-mobile" /></tr></tfoot>}
                        </table>
                        {!visibleReadings.length && <div className="rh-empty"><b>لا توجد قراءات</b>{allReadings.length ? 'لا توجد قراءات بهذه الحالة في الفترة المختارة.' : 'لا توجد قراءات لهذا المشترك بعد.'}</div>}
                    </div>
                </div>
            </div>}
        </Modal>
    );
}
