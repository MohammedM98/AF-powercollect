import { router, usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { weekDayName } from '@/lib/weekDays';
import { addDays, closingMoney, monthName, shortDate, statusClass } from '@/lib/closing';
import BranchPicker from './BranchPicker';
import { useState } from 'react';
import ConfirmDialog from '@/Components/ConfirmDialog';
import WeeklyFinancialReport from './WeeklyFinancialReport';
import { SendAuditButton } from '@/Pages/FinancialAudit/Shared';

const CELL_ICONS = { approved: 'check', submitted: 'send', returned: 'undo', draft: 'note', missing: 'alert' };
const CELL_LABELS = {
    approved: 'معتمد',
    submitted: 'بانتظار اعتماد الفرع',
    returned: 'معاد للتصحيح',
    draft: 'مسودة',
    missing: 'فيه دفعات ولم يُفتح كشفه',
    open: 'اليوم مفتوح',
    future: 'لم يبدأ',
    empty: 'لا دفعات',
};

/**
 * The company's week or month: every branch's daily closings and what each
 * collected by payment date, what still stands in the way, and the
 * approval. The same payments appear at each level; the totals are never
 * added on top of each other.
 */
export default function PeriodClosings({ view, branches, branchId, date, onChange, onOpenDay, canSendToAudit }) {
    const { errors } = usePage().props;
    const weekly = view.period === 'weekly';
    const [confirmingClose, setConfirmingClose] = useState(false);
    const [closing, setClosing] = useState(false);

    function approve() {
        setConfirmingClose(true);
    }

    function closePeriod() {
        setConfirmingClose(false);
        router.post('/period-closings', { period: view.period, date: view.first }, { preserveScroll: true, onStart: () => setClosing(true), onFinish: () => setClosing(false) });
    }

    return (
        <>
            <div className="ctl">
                <div className="segx" role="group" aria-label="الفترة">
                    <button type="button" aria-pressed={weekly} onClick={() => onChange({ period: 'weekly' })}>
                        أسبوعي
                    </button>
                    <button type="button" aria-pressed={!weekly} onClick={() => onChange({ period: 'monthly' })}>
                        شهري
                    </button>
                </div>
                <span className="cb nav">
                    <button type="button" aria-label="الفترة السابقة" onClick={() => onChange({ date: addDays(view.first, -1) })}>
                        <Icon name="chevron-right" />
                    </button>
                    <Icon name="calendar" />
                    {weekly ? (
                        <>
                            <small>الأسبوع</small>
                            <b>
                                {shortDate(view.first)} – {shortDate(view.last, true)}
                            </b>
                        </>
                    ) : (
                        <>
                            <small>الشهر</small>
                            <b>{monthName(view.first)}</b>
                        </>
                    )}
                    <button type="button" aria-label="الفترة التالية" onClick={() => onChange({ date: addDays(view.last, 1) })}>
                        <Icon name="chevron-left" />
                    </button>
                </span>
                <span className="cb">
                    <small>الرقم</small>
                    <b>{view.number}</b>
                </span>
                <span className="cb">
                    <span
                        className={`st ${statusClass(view.status)}`}
                        style={{ color: view.status === 'approved' ? 'var(--cl-success)' : 'var(--cl-muted)' }}
                    >
                        <i />
                        {view.statusLabel}
                    </span>
                </span>
                <span className="sp" />
                <BranchPicker branches={branches} branchId={branchId} onChange={(branch) => onChange({ branch })} />
            </div>

            {canSendToAudit && <section className="pn">
                <h3>كشف الفرع للتدقيق المالي</h3>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-5">
                    <p className="text-base text-gray-700">الفرع المختار: <strong>{branches.find((branch) => branch.value === branchId)?.label ?? '—'}</strong></p>
                    <SendAuditButton key={`${branchId}-${view.period}-${date}`} branchId={branchId} type={view.period} date={date} label="إرسال كشف الفرع لهذه الفترة" />
                </div>
                <p className="s">يُرسل كشف مستقل للفرع المختار بعد اعتماد إقفالات أيامه. الكشف الأسبوعي يستخدم لقطة الفترة الأسبوعية المقفلة.</p>
            </section>}

            {weekly && view.financialReport && <WeeklyFinancialReport key={`${view.closingPeriodId}-overview`} view={view} section="overview" />}
            {!weekly && <div className="kp">
                <div>
                    <small>{view.ended ? 'التحصيل' : 'التحصيل حتى الآن'}</small>
                    <b>{closingMoney(view.collected)} ₪</b>
                    <span>
                        {shortDate(view.first)} – {shortDate(view.last)} · كل الفروع
                    </span>
                </div>
                <div className={view.unapproved > 0 ? 'w' : ''}>
                    <small>إغلاقات يومية غير معتمدة</small>
                    <b>{view.unapproved}</b>
                    <span>من {view.needed}</span>
                </div>
                <div className={Number(view.differenceTotal) !== 0 ? 'r' : ''}>
                    <small>الفروق الموثّقة</small>
                    <b>{closingMoney(view.differenceTotal)} ₪</b>
                    <span>{view.differences.length === 0 ? 'لا فروق' : `${view.differences.length} فرع`}</span>
                </div>
                <div className={Number(view.pending) > 0 ? 'w' : ''}>
                    <small>إيصالات معلّقة</small>
                    <b>{closingMoney(view.pending)} ₪</b>
                    <span>{view.pendingCount} إيصال</span>
                </div>
                <div>
                    <small>أموال قيد النقل</small>
                    <b>{closingMoney(view.inTransit)} ₪</b>
                    <span>{view.inTransitCount === 0 ? 'لا يوجد' : `${view.inTransitCount} تسليم`}</span>
                </div>
            </div>}

            <div className="g2">
                <div>
                    <section className="pn">
                        <h3>
                            <span className="ix">
                                <Icon name="calendar" />
                            </span>
                            {weekly ? 'الإغلاقات اليومية للأسبوع' : `تجميع الشركة لشهر ${monthName(view.first)}`}
                            <span className="r">{weekly ? 'اضغط خانة يوم لفتح كشفه' : 'بالشيكل · حسب تاريخ الدفعات'}</span>
                        </h3>
                        <div className="mxw" style={{ overflowX: 'auto' }}>
                            {weekly ? <WeekMatrix view={view} onOpenDay={onOpenDay} /> : <MonthTable view={view} />}
                        </div>
                        {weekly && (
                            <div className="lgd">
                                {['approved', 'submitted', 'returned', 'draft', 'missing', 'open'].map((state) => (
                                    <span key={state}>
                                        <span className={`cell ${statusClass(state)}`}>
                                            {CELL_ICONS[state] ? <Icon name={CELL_ICONS[state]} /> : '•'}
                                        </span>
                                        {CELL_LABELS[state]}
                                    </span>
                                ))}
                            </div>
                        )}
                    </section>

                    {!weekly && <section className="pn">
                        <h3>
                            <span className="ix">
                                <Icon name="layers" />
                            </span>
                            نفس المال على أكثر من مستوى
                            <span className="r">{view.levels.branchName}</span>
                        </h3>
                        <p className="s">
                            الإغلاقات تراجع نفس الدفعات ولا تُنشئ تحصيلًا جديدًا. إجماليات اليوم والأسبوع أجزاء من الشهر، فلا تُضاف إليه مرة أخرى.
                        </p>
                        <div className="nest">
                            <div className="h">
                                <b>شهري · {monthName(view.levels.month.first)}</b> يشمل دفعات الأسبوع داخل الشهر
                                <em>{closingMoney(view.levels.month.total)} ₪</em>
                            </div>
                            <div className="in">
                                <div className="h">
                                    <b>
                                        أسبوعي · {shortDate(view.levels.week.first)}–{shortDate(view.levels.week.last)}
                                    </b>
                                    يشمل دفعات اليوم
                                    <em>{closingMoney(view.levels.week.total)} ₪</em>
                                </div>
                                <div className="in">
                                    <div className="h">
                                        <b>
                                            يومي · {shortDate(view.levels.day.date)}
                                            {view.levels.day.number && ` · الكشف ${view.levels.day.number}`}
                                        </b>
                                        {view.levels.day.count} دفعات
                                        <em>{closingMoney(view.levels.day.total)} ₪</em>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="note2">
                            <Icon name="info" />
                            <span>الأسبوع الممتد بين شهرين لا يُضاف كاملًا: يأخذ إغلاق كل شهر الحركات الواقعة داخله فقط.</span>
                        </div>
                    </section>}
                </div>

                <div>
                    <section className="pn">
                        <h3>
                            <span className="ix">
                                <Icon name="shield" />
                            </span>
                            قبل اعتماد {weekly ? 'الأسبوع' : 'الشهر'}
                        </h3>
                        <p className="s">يُحفظ الكشف {weekly ? 'الأسبوعي' : 'الشهري'} برقم وحالة واسم المدقق وتوقيت الاعتماد.</p>
                        <ul className="chl">
                            <Check
                                ok={view.ended}
                                title={view.ended ? 'انتهت الفترة' : 'الفترة لم تنتهِ بعد'}
                                hint={`تنتهي يوم ${weekDayName(view.last)} ${shortDate(view.last)} عند وقت القطع.`}
                            />
                            <Check
                                ok={view.unapproved === 0}
                                title={view.unapproved === 0 ? 'كل الإغلاقات اليومية معتمدة' : `${view.unapproved} إغلاقات يومية غير معتمدة`}
                                hint="كل يوم فيه دفعات في كل فرع يجب أن يُعتمد قبل إغلاق الفترة."
                            />
                            <Check
                                ok={view.differences.length === 0}
                                title={
                                    view.differences.length === 0 ? 'لا فروق في عدّ النقد' : `فروق موثّقة (${closingMoney(view.differenceTotal)} ₪)`
                                }
                                hint={
                                    view.differences
                                        .map(
                                            (difference) =>
                                                `${difference.branch}: ${closingMoney(difference.difference)} ₪${difference.days > 1 ? ` (${difference.days} أيام)` : ''}`,
                                        )
                                        .join('، ') || 'كل الصناديق مطابقة.'
                                }
                            />
                            <Check
                                ok={view.pendingCount === 0}
                                title="الإيصالات المعلّقة"
                                hint={
                                    view.pendingCount === 0
                                        ? 'لا إيصالات معلّقة.'
                                        : `${view.pendingCount} إيصالات بقيمة ${closingMoney(view.pending)} ₪ تحتاج تأكيدًا أو استبعادًا.`
                                }
                            />
                            <Check
                                ok={view.inTransitCount === 0}
                                title="الأموال قيد النقل"
                                hint={view.inTransitCount === 0 ? 'لا أموال قيد النقل.' : `${closingMoney(view.inTransit)} ₪ لم يُؤكَّد استلامها.`}
                            />
                        </ul>
                        {view.status === 'approved' ? (
                            <div className="ban ok">
                                <Icon name="lock" />
                                <div>
                                    <b>{weekly ? 'الأسبوع معتمد' : 'الشهر معتمد'}</b>
                                    اعتمده {view.approvedBy} في <span className="num">{view.approvedAt}</span>.
                                </div>
                            </div>
                        ) : (
                            <div style={{ marginTop: 14 }}>
                                <button type="button" className="btn ok2" disabled={!view.canApprove || closing} onClick={approve}>
                                    <Icon name="check" />
                                    {weekly ? 'اعتماد الإغلاق الأسبوعي' : 'اعتماد الإغلاق الشهري'}
                                </button>
                                {errors.period && (
                                    <div className="err" role="alert">
                                        {errors.period}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </div>
            {weekly && view.financialReport && <WeeklyFinancialReport key={`${view.closingPeriodId}-details`} view={view} section="details" />}
            <ConfirmDialog show={confirmingClose} onCancel={() => setConfirmingClose(false)} onConfirm={closePeriod} title={weekly ? 'إغلاق الأسبوع نهائيًا؟' : 'اعتماد الشهر؟'}
                message={weekly ? `التحصيل الفعلي ${closingMoney(view.collected)} ₪ · ${view.financialReport?.paymentCount ?? 0} دفعات. سيُحفظ كشف مالي ثابت. الأخطاء اللاحقة تُصحّح بحركات جديدة في أسبوع مفتوح دون تغيير هذا الكشف.` : `اعتماد الفترة ${view.number} بإجمالي ${closingMoney(view.collected)} ₪.`}
                confirmLabel="اعتماد الإغلاق" cancelLabel="مراجعة الكشف" icon="lock" />
        </>
    );
}

function Check({ ok, title, hint }) {
    return (
        <li className={ok ? 'ok' : 'no'}>
            <span className="d">{ok ? <Icon name="check" /> : <Icon name="clock" />}</span>
            <div>
                <b>{title}</b>
                <small>{hint}</small>
            </div>
        </li>
    );
}

function WeekMatrix({ view, onOpenDay }) {
    return (
        <table className="mx">
            <thead>
                <tr>
                    <th>الفرع</th>
                    {view.days.map((day) => (
                        <th key={day.date} className={day.isToday ? 'today' : ''}>
                            {weekDayName(day.date)}
                            <small>{shortDate(day.date)}</small>
                        </th>
                    ))}
                    <th>التحصيل ₪</th>
                    <th>المعتمد</th>
                </tr>
            </thead>
            <tbody>
                {view.rows.map((row) => (
                    <tr key={row.branchId}>
                        <td>{row.branchName}</td>
                        {row.cells.map((cell) => (
                            <td key={cell.day}>
                                {['approved', 'submitted', 'returned', 'draft', 'missing'].includes(cell.state) ? (
                                    <button
                                        type="button"
                                        className={`cell ${statusClass(cell.state)}`}
                                        title={`${CELL_LABELS[cell.state]}${cell.number ? ` · الكشف ${cell.number}` : ''} · ${closingMoney(cell.total)} ₪`}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => onOpenDay(row.branchId, cell.day)}
                                    >
                                        <Icon name={CELL_ICONS[cell.state]} />
                                    </button>
                                ) : (
                                    <span className={`cell ${cell.state}`} title={CELL_LABELS[cell.state]}>
                                        {cell.state === 'open' ? '•' : '–'}
                                    </span>
                                )}
                            </td>
                        ))}
                        <td>
                            <span className="tv">{closingMoney(row.total)}</span>
                        </td>
                        <td>
                            <span className={`tv ${row.approved < row.needed ? 'w' : ''}`}>
                                {row.approved}/{row.needed}
                            </span>
                        </td>
                    </tr>
                ))}
            </tbody>
            <tfoot>
                <tr>
                    <td>المجموع</td>
                    {view.dayTotals.map((total, index) => (
                        <td key={view.days[index].date}>{Number(total) === 0 ? '—' : closingMoney(total)}</td>
                    ))}
                    <td>{closingMoney(view.collected)}</td>
                    <td />
                </tr>
            </tfoot>
        </table>
    );
}

function MonthTable({ view }) {
    return (
        <table className="mx">
            <thead>
                <tr>
                    <th>الفرع</th>
                    <th>التحصيل</th>
                    <th>نقد</th>
                    <th>بنوك ومحافظ</th>
                    <th>قيد النقل</th>
                    <th>معلّق</th>
                    <th>الأيام المعتمدة</th>
                </tr>
            </thead>
            <tbody>
                {view.rows.map((row) => (
                    <tr key={row.branchId}>
                        <td>{row.branchName}</td>
                        <td>
                            <span className="tv">{closingMoney(row.total)}</span>
                        </td>
                        <td>
                            <span className="tv">{closingMoney(row.cash)}</span>
                        </td>
                        <td>
                            <span className="tv">{closingMoney(row.nonCash)}</span>
                        </td>
                        <td>
                            <span className="tv">{closingMoney(row.inTransit)}</span>
                        </td>
                        <td>
                            <span className={`tv ${Number(row.pending) > 0 ? 'w' : ''}`}>{closingMoney(row.pending)}</span>
                        </td>
                        <td>
                            <span className={`tv ${row.approved < row.needed ? 'w' : ''}`}>
                                {row.approved}/{row.needed}
                            </span>
                        </td>
                    </tr>
                ))}
            </tbody>
            <tfoot>
                <tr>
                    <td>المجموع</td>
                    <td>{closingMoney(view.collected)}</td>
                    <td colSpan={5} />
                </tr>
            </tfoot>
        </table>
    );
}
