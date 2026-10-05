import { Head, Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import Pagination from '@/Components/DataTable/Pagination';
import { weekDayName } from '@/lib/weekDays';
import { closingMoney, shortDate, statusClass } from '@/lib/closing';
import '../Closings/Closing.css';
import './Report.css';

const CLOSING_STATES = {
    approved: { label: 'معتمد', icon: 'check' },
    submitted: { label: 'مرسل للتدقيق', icon: 'send' },
    returned: { label: 'معاد للتصحيح', icon: 'undo' },
    draft: { label: 'مسودة', icon: 'note' },
    open: { label: 'اليوم مفتوح', icon: 'clock' },
    none: { label: 'لم يُفتح كشفه', icon: 'alert' },
};

/** Cents of a money string, so totals add up exactly. */
function cents(amount) {
    return Math.round(Number(amount ?? 0) * 100);
}

function periodLabel(mode, details) {
    if (mode === 'daily') return 'تقرير يومي';
    if (mode === 'weekly') return 'تقرير أسبوعي';
    if (mode === 'monthly') return 'تقرير شهري';
    return details?.isOpen ? 'تقرير جارٍ' : 'تقرير مخصص';
}

/**
 * The reports page: a branch's day (or a stretch of days, or every branch)
 * before it is closed — how what the subscribers owe moved, where the
 * payments came in, the readings, each day's closing, and every line.
 */
export default function Index({ branches, filters, scopeLabel, presets, today, cutoff, kinds, flow, collections, readings, days, check, transactions, period, branchSummary, canExport }) {
    const { errors } = usePage().props;
    const oneDay = filters.from === filters.to;
    const query = new URLSearchParams(
        Object.entries({ branch: filters.branch ?? '', from: filters.from, to: filters.to, kind: filters.kind }).filter(([, value]) => value !== ''),
    ).toString();

    function visit(changes) {
        router.get('/reports', { ...filters, ...changes }, { preserveScroll: true });
    }

    const periodText = oneDay ? `${weekDayName(filters.from)} ${shortDate(filters.from, true)}` : `${shortDate(filters.from, true)} – ${shortDate(filters.to, true)}`;

    return (
        <AuthenticatedLayout>
            <Head title="التقارير" />
            <div className="closing-page report-page" dir="rtl">
                <div className="ph">
                    <div>
                        <h1>التقارير</h1>
                        <p>
                            {scopeLabel} · {periodLabel(period?.mode, period)} · {periodText}
                            {oneDay && filters.from === today && ' · اليوم الجاري'}
                        </p>
                    </div>
                </div>

                <div className="ctl">
                    <label className="cb">
                        <Icon name="pin" />
                        <small>الفرع</small>
                        {branches.length > 1 ? (
                            <select
                                aria-label="الفرع"
                                value={filters.branch ?? ''}
                                onChange={(event) => visit({ branch: event.target.value, page: undefined })}
                                style={{ border: 0, fontWeight: 700 }}
                            >
                                <option value="all">كل الفروع</option>
                                {branches.map((branch) => (
                                    <option key={branch.value} value={branch.value}>
                                        {branch.label}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <b style={{ fontFamily: 'inherit', fontWeight: 700 }}>{scopeLabel}</b>
                        )}
                    </label>
                    <div className="segx report-period-tabs" role="group" aria-label="نوع التقرير">
                        {[
                            ['daily', 'يومي'],
                            ['weekly', 'أسبوعي'],
                            ['monthly', 'شهري'],
                            ['custom', 'مخصص'],
                        ].map(([key, label]) => {
                            const preset = presets.find((item) => item.key === (key === 'daily' ? 'today' : key === 'weekly' ? 'week' : key === 'monthly' ? 'month' : 'today'));

                            return (
                                <button
                                    key={key}
                                    type="button"
                                    aria-pressed={period?.mode === key}
                                    onClick={() => key !== 'custom' && preset && visit({ from: preset.from, to: preset.to, view: key, page: undefined })}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="segx" role="group" aria-label="الفترة">
                        {presets.map((preset) => (
                            <button
                                key={preset.key}
                                type="button"
                                aria-pressed={preset.from === filters.from && preset.to === filters.to}
                                onClick={() => visit({ from: preset.from, to: preset.to, page: undefined })}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                    <label className="cb">
                        <Icon name="calendar" />
                        <small>من</small>
                        <input
                            type="date"
                            value={filters.from}
                            max={filters.to}
                            onChange={(event) => event.target.value && visit({ from: event.target.value, page: undefined })}
                            style={{ border: 0, fontWeight: 600 }}
                        />
                    </label>
                    <label className="cb">
                        <small>إلى</small>
                        <input
                            type="date"
                            value={filters.to}
                            min={filters.from}
                            max={today}
                            onChange={(event) => event.target.value && visit({ to: event.target.value, page: undefined })}
                            style={{ border: 0, fontWeight: 600 }}
                        />
                    </label>
                    <span className="sp" />
                    {canExport && <a className="btn" href={`/reports/lines.csv?${query}`}>
                        <Icon name="arrow-down-tray" />
                        تنزيل Excel (CSV)
                    </a>}
                    <button type="button" className="btn" onClick={() => window.print()}>
                        <Icon name="printer" />
                        طباعة
                    </button>
                </div>

                <div className="report-period-bar" aria-label="التنقل بين الفترات">
                    <button type="button" className="btn ghost" onClick={() => visit(period?.previous ?? {})}>
                        <Icon name="chevron-right" /> الفترة السابقة
                    </button>
                    <span><b>{periodLabel(period?.mode, period)}</b><small>{periodText}</small></span>
                    <button type="button" className="btn ghost" disabled={!period?.next} onClick={() => period?.next && visit(period.next)}>
                        الفترة التالية <Icon name="chevron-left" />
                    </button>
                </div>

                {errors.from && (
                    <div className="ban bad" role="alert">
                        <Icon name="alert" />
                        <div>{errors.from}</div>
                    </div>
                )}

                {branches.length === 0 && (
                    <div className="pn empty" style={{ marginTop: 16 }}>
                        <b>لا توجد فروع</b>
                        <p>أضف فرعًا أولًا لعرض تقاريره.</p>
                    </div>
                )}

                {check && <DayCheck check={check} cutoff={cutoff} />}

                {flow && collections && (
                    <div className="kp">
                        <div>
                            <small>صافي رصيد المشتركين أول الفترة</small>
                            <b>{closingMoney(flow.opening)} ₪</b>
                            <span>على المشتركين</span>
                        </div>
                        <div>
                            <small>التحميلات</small>
                            <b>{closingMoney(flow.chargesTotal)} ₪</b>
                            <span>قراءات ورسوم وغرامات</span>
                        </div>
                        <div>
                            <small>التحصيل</small>
                            <b>{closingMoney(collections.total)} ₪</b>
                            <span>{collections.count} دفعة</span>
                        </div>
                        <div>
                            <small>منها نقدًا</small>
                            <b>{closingMoney(collections.cash)} ₪</b>
                            <span>غير نقدي {closingMoney(collections.nonCash)} ₪</span>
                        </div>
                        <div className={cents(flow.change) > 0 ? 'w' : ''}>
                            <small>صافي رصيد المشتركين آخر الفترة</small>
                            <b>{closingMoney(flow.closing)} ₪</b>
                            <span>
                                {cents(flow.change) > 0 ? 'زاد' : cents(flow.change) < 0 ? 'نقص' : 'لم يتغير'}{' '}
                                {cents(flow.change) !== 0 && `${closingMoney(Math.abs(Number(flow.change)))} ₪`}
                            </span>
                        </div>
                    </div>
                )}

                {flow && collections && (
                    <div className="g2">
                        <div>
                            <FlowStatement flow={flow} />
                            {days.length > 1 && <DaysTable days={days} oneBranch={filters.branch !== 'all'} onOpenDay={(day) => visit({ from: day, to: day, page: undefined })} />}
                        </div>
                        <div>
                            <Collections collections={collections} />
                            {readings && <Readings readings={readings} />}
                            {readings && <FollowUp readings={readings} />}
                        </div>
                    </div>
                )}

                {branchSummary?.length > 0 && <BranchComparison rows={branchSummary} filters={filters} />}

                {branches.length > 0 && (
                    <Transactions transactions={transactions} kinds={kinds} filters={filters} showDay={!oneDay} showBranch={filters.branch === 'all'} onKind={(kind) => visit({ kind, page: undefined })} />
                )}
            </div>
        </AuthenticatedLayout>
    );
}

function BranchComparison({ rows, filters }) {
    return (
        <section className="pn report-branch-comparison">
            <h3>
                <span className="ix"><Icon name="layers" /></span>
                مقارنة الفروع
                <span className="r">نفس الفترة · اضغط اسم الفرع للتفصيل</span>
            </h3>
            <div style={{ overflowX: 'auto' }}>
                <table className="mx">
                    <thead><tr><th>الفرع</th><th>صافي الرصيد آخر الفترة</th><th>التحصيل</th><th>نقدًا</th><th>الحركات</th></tr></thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id}>
                                <td><Link href={`/reports?${new URLSearchParams({ ...filters, branch: row.id }).toString()}`}><b>{row.name}</b></Link></td>
                                <td className="tv">{closingMoney(row.flow.closing)} ₪</td>
                                <td className="tv">{closingMoney(row.collections.total)} ₪</td>
                                <td className="tv">{closingMoney(row.collections.cash)} ₪</td>
                                <td>{row.collections.count}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

/** Where one branch's day stands before it is closed. */
function DayCheck({ check, cutoff }) {
    const closingLink = check.branchId && (
        <Link href={`/closings?tab=daily&branch=${check.branchId}&date=${check.day}`} className="btn" style={{ marginInlineStart: 'auto' }}>
            <Icon name="scale" />
            {check.state === 'none' ? 'افتح كشف هذا اليوم' : `فتح الكشف ${check.number}`}
        </Link>
    );

    if (check.state === 'open') {
        return (
            <div className="ban inf">
                <Icon name="clock" />
                <div>
                    <b>اليوم ما زال مفتوحًا حتى {check.closesAt}</b>
                    النقد المحصَّل حتى الآن {closingMoney(check.reportCash)} ₪. يُفتح كشف الإغلاق بعد وقت القطع ({cutoff === '00:00' ? 'منتصف الليل' : cutoff})، وكل دفعة قبله تُحسب على هذا اليوم.
                </div>
            </div>
        );
    }

    if (check.state === 'none') {
        return (
            <div className="ban warn">
                <Icon name="alert" />
                <div>
                    <b>انتهى اليوم ولم يُفتح كشف إغلاقه بعد</b>
                    النقد المحصَّل في هذا اليوم {closingMoney(check.reportCash)} ₪.
                </div>
                {closingLink}
            </div>
        );
    }

    const tone = !check.matches ? 'warn' : check.state === 'approved' ? 'ok' : 'inf';

    return (
        <div className={`ban ${tone}`}>
            <Icon name={check.matches ? 'check' : 'alert'} />
            <div>
                <b>
                    الكشف {check.number} · {check.statusLabel}
                </b>
                {check.matches
                    ? `النقد في الكشف يطابق دفعات اليوم النقدية (${closingMoney(check.closingCash)} ₪).`
                    : `في الكشف ${closingMoney(check.closingCash)} ₪ نقدًا، ودفعات اليوم النقدية ${closingMoney(check.reportCash)} ₪ — افتح الكشف لمراجعة دفعاته قبل إرساله.`}
                {check.counted !== null && (
                    <>
                        {' '}
                        المتوقع في الصندوق {closingMoney(check.expected)} ₪، والمعدود {closingMoney(check.counted)} ₪
                        {cents(check.difference) !== 0 ? ` (فرق ${closingMoney(check.difference)} ₪).` : ' (مطابق).'}
                    </>
                )}
            </div>
            {closingLink}
        </div>
    );
}

/** What was owed at the start, each charge and credit, the corrections, and what is owed at the end. */
function FlowStatement({ flow }) {
    return (
        <section className="pn">
            <h3>
                <span className="ix">
                    <Icon name="ledger" />
                </span>
                حركة الأرصدة
                <span className="r">ما على المشتركين من أول الفترة إلى آخرها</span>
            </h3>
            <table className="rp-flow">
                <tbody>
                    <tr className="sum">
                        <th>المستحق أول الفترة</th>
                        <td />
                        <td className="tv">{closingMoney(flow.opening)}</td>
                    </tr>
                    {flow.charges.map((line) => (
                        <tr key={line.type}>
                            <th>+ {line.label}</th>
                            <td className="muted">{line.count}</td>
                            <td className="tv">{closingMoney(line.total)}</td>
                        </tr>
                    ))}
                    <tr className="sub">
                        <th>مجموع التحميلات (عليه)</th>
                        <td />
                        <td className="tv">{closingMoney(flow.chargesTotal)}</td>
                    </tr>
                    {flow.credits.map((line) => (
                        <tr key={line.type}>
                            <th>− {line.label}</th>
                            <td className="muted">{line.count}</td>
                            <td className="tv">{closingMoney(line.total)}</td>
                        </tr>
                    ))}
                    <tr className="sub">
                        <th>مجموع الدفعات والخصومات (له)</th>
                        <td />
                        <td className="tv">{closingMoney(flow.creditsTotal)}</td>
                    </tr>
                    <tr>
                        <th>± الإلغاءات والقيود العكسية</th>
                        <td className="muted">{flow.corrections.count}</td>
                        <td className={`tv ${cents(flow.corrections.total) !== 0 ? 'w' : ''}`}>{closingMoney(flow.corrections.total)}</td>
                    </tr>
                    <tr className="sum">
                        <th>المستحق آخر الفترة</th>
                        <td />
                        <td className="tv">{closingMoney(flow.closing)}</td>
                    </tr>
                </tbody>
            </table>
            <p className="s">
                الإلغاء يظهر في يومه؛ والسطر الملغى في نفس يوم تسجيله يُحسب مع الإلغاءات لا مع نوعه، فتبقى أرقام الأيام السابقة ثابتة.
            </p>
        </section>
    );
}

/** One row per day: what moved, what was owed at its end, and its closing. */
function DaysTable({ days, oneBranch, onOpenDay }) {
    const total = (key) => closingMoney(days.reduce((sum, day) => sum + cents(day[key]), 0) / 100);

    return (
        <section className="pn">
            <h3>
                <span className="ix">
                    <Icon name="calendar" />
                </span>
                يومًا بيوم
                <span className="r">اضغط يومًا لفتح تقريره</span>
            </h3>
            <div style={{ overflowX: 'auto' }}>
                <table className="mx">
                    <thead>
                        <tr>
                            <th>اليوم</th>
                            <th>التحميلات</th>
                            <th>الدفعات</th>
                            <th>الخصومات</th>
                            <th>الإلغاءات</th>
                            <th>المستحق آخره</th>
                            <th>الإغلاق</th>
                        </tr>
                    </thead>
                    <tbody>
                        {days.map((day) => (
                            <tr key={day.day} style={{ cursor: 'pointer' }} onClick={() => onOpenDay(day.day)}>
                                <td>
                                    {weekDayName(day.day)} <span className="num">{shortDate(day.day)}</span>
                                </td>
                                <td>
                                    <span className="tv">{closingMoney(day.charges)}</span>
                                </td>
                                <td>
                                    <span className="tv">{closingMoney(day.payments)}</span>
                                </td>
                                <td>
                                    <span className="tv">{closingMoney(day.discounts)}</span>
                                </td>
                                <td>
                                    <span className={`tv ${cents(day.corrections) !== 0 ? 'w' : ''}`}>{closingMoney(day.corrections)}</span>
                                </td>
                                <td>
                                    <span className="tv">{closingMoney(day.balance)}</span>
                                </td>
                                <td>
                                    <ClosingState closing={day.closing} oneBranch={oneBranch} hasLines={day.lines > 0} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td>المجموع</td>
                            <td>{total('charges')}</td>
                            <td>{total('payments')}</td>
                            <td>{total('discounts')}</td>
                            <td>{total('corrections')}</td>
                            <td>{closingMoney(days[days.length - 1].balance)}</td>
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>
        </section>
    );
}

function ClosingState({ closing, oneBranch, hasLines }) {
    if (!oneBranch && !['open', 'future'].includes(closing.state)) {
        return closing.opened === 0 ? (
            <span className="muted">—</span>
        ) : (
            <span className="num">
                {closing.approved}/{closing.opened} معتمد
            </span>
        );
    }

    const state = closing.state === 'none' && !hasLines ? null : CLOSING_STATES[closing.state];

    if (!state) {
        return <span className="muted">—</span>;
    }

    return (
        <span className={`rp-state ${statusClass(closing.state)}`}>
            <Icon name={state.icon} />
            {state.label}
            {closing.number && <span className="num"> {closing.number}</span>}
        </span>
    );
}

/** Where the payments came in: by account, currency and collector. */
function Collections({ collections }) {
    const largest = Math.max(1, ...collections.accounts.map((account) => cents(account.total)));

    return (
        <section className="pn">
            <h3>
                <span className="ix">
                    <Icon name="wallet" />
                </span>
                التحصيل
                <span className="r">
                    {collections.count} دفعة · {closingMoney(collections.total)} ₪
                </span>
            </h3>
            {collections.count === 0 ? (
                <p className="s muted">لا دفعات في هذه الفترة.</p>
            ) : (
                <>
                    <h4 className="rp-h">حسب الحساب</h4>
                    <ul className="rp-bars">
                        {collections.accounts.map((account) => (
                            <li key={account.key}>
                                <span>
                                    <Icon name={account.key === 'cash' ? 'wallet' : 'bank'} />
                                    {account.label}
                                    <small className="muted"> · {account.count}</small>
                                </span>
                                <b className="tv">{closingMoney(account.total)}</b>
                                <i style={{ inlineSize: `${(cents(account.total) / largest) * 100}%` }} />
                            </li>
                        ))}
                    </ul>

                    {collections.currencies.length > 1 || collections.currencies[0]?.currency !== 'ILS' ? (
                        <>
                            <h4 className="rp-h">حسب العملة</h4>
                            <table className="rp-flow">
                                <tbody>
                                    {collections.currencies.map((currency) => (
                                        <tr key={currency.currency}>
                                            <th>
                                                {currency.label} <small className="muted">· {currency.count}</small>
                                            </th>
                                            <td className="tv">
                                                {closingMoney(currency.amount)} {currency.currency}
                                            </td>
                                            <td className="tv">{closingMoney(currency.total)} ₪</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    ) : null}

                    <h4 className="rp-h">حسب المحصِّل</h4>
                    <table className="rp-flow">
                        <thead>
                            <tr>
                                <th>الموظف</th>
                                <th>دفعات</th>
                                <th>نقدًا</th>
                                <th>المجموع</th>
                            </tr>
                        </thead>
                        <tbody>
                            {collections.collectors.map((collector) => (
                                <tr key={collector.name}>
                                    <th>{collector.name}</th>
                                    <td className="muted">{collector.count}</td>
                                    <td className="tv">{closingMoney(collector.cash)}</td>
                                    <td className="tv">{closingMoney(collector.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </section>
    );
}

function Readings({ readings }) {
    return (
        <section className="pn">
            <h3>
                <span className="ix">
                    <Icon name="gauge" />
                </span>
                القراءات
            </h3>
            <table className="rp-flow">
                <tbody>
                    <tr>
                        <th>قراءات أُدخلت</th>
                        <td className="muted">{readings.consumption.toLocaleString('en-US')} كيلو</td>
                        <td className="tv">{readings.entered}</td>
                    </tr>
                    <tr>
                        <th>قراءات اعتُمدت وحُمِّلت</th>
                        <td className="muted">{closingMoney(readings.billed)} ₪</td>
                        <td className="tv">{readings.approved}</td>
                    </tr>
                    <tr>
                        <th>بانتظار الاعتماد الآن</th>
                        <td />
                        <td className={`tv ${readings.pending > 0 ? 'w' : ''}`}>{readings.pending}</td>
                    </tr>
                </tbody>
            </table>
        </section>
    );
}

function FollowUp({ readings }) {
    if (readings.pending === 0) {
        return (
            <div className="report-followup ok">
                <Icon name="check" />
                <span><b>لا توجد متابعة معلّقة</b><small>القراءات الحالية المعروضة هنا معتمدة أو مكتملة.</small></span>
            </div>
        );
    }

    return (
        <div className="report-followup warn">
            <Icon name="alert" />
            <span><b>يحتاج متابعة الآن</b><small>{readings.pending} قراءة بانتظار الاعتماد. هذه حالة العمل الحالية وليست تغييرًا في أرقام الفترة المختارة.</small></span>
            <Link className="btn ghost" href="/meter-readings">فتح القراءات</Link>
        </div>
    );
}

/** Every line of the period, newest first, narrowed to one kind. */
function Transactions({ transactions, kinds, filters, showDay, showBranch, onKind }) {
    return (
        <section className="pn" style={{ marginTop: 16 }}>
            <h3>
                <span className="ix">
                    <Icon name="list" />
                </span>
                الحركات
                <span className="r">{transactions.total} حركة</span>
            </h3>
            <div className="segx" role="group" aria-label="نوع الحركات" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                {kinds.map((kind) => (
                    <button key={kind.value} type="button" aria-pressed={filters.kind === kind.value} onClick={() => onKind(kind.value)}>
                        {kind.label}
                    </button>
                ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table className="mx rp-lines">
                    <thead>
                        <tr>
                            <th>الوقت</th>
                            <th>السند</th>
                            <th>المشترك</th>
                            {showBranch && <th>الفرع</th>}
                            <th>البيان</th>
                            <th>الحساب</th>
                            <th>عليه</th>
                            <th>له</th>
                            <th>سجّله</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.data.length === 0 && (
                            <tr>
                                <td colSpan={showBranch ? 9 : 8} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                                    لا حركات في هذه الفترة.
                                </td>
                            </tr>
                        )}
                        {transactions.data.map((line) => (
                            <tr key={line.id} className={line.isCancelled ? 'off' : ''}>
                                <td>
                                    {showDay && <span className="num">{shortDate(line.day)} </span>}
                                    <span className="num">{line.time}</span>
                                </td>
                                <td>
                                    <span className="num">{line.voucherNumber ?? '—'}</span>
                                </td>
                                <td>
                                    <b>{line.subscriberName}</b>
                                    <small className="muted num" style={{ display: 'block' }}>
                                        {line.accountNumber}
                                        {line.meterBoxNumber && ` · ${line.meterBoxNumber}`}
                                    </small>
                                </td>
                                {showBranch && <td>{line.branchName}</td>}
                                <td className="rp-desc">
                                    <b>{line.typeLabel}</b>
                                    <small className="muted" style={{ display: 'block' }}>
                                        {line.description}
                                    </small>
                                </td>
                                <td>
                                    {line.account ?? '—'}
                                    {line.currency && line.currency !== 'ILS' && (
                                        <small className="muted num" style={{ display: 'block' }}>
                                            {line.currencyAmount} {line.currency}
                                        </small>
                                    )}
                                </td>
                                <td>
                                    <span className="tv">{line.isCredit ? '' : closingMoney(line.amount)}</span>
                                </td>
                                <td>
                                    <span className="tv">{line.isCredit ? closingMoney(line.amount) : ''}</span>
                                </td>
                                <td>{line.recordedBy ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ marginTop: 12 }}>
                <Pagination meta={transactions} filters={filters} baseUrl="/reports" />
            </div>
        </section>
    );
}
