import { Head, Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import { weekDayName } from '@/lib/weekDays';
import { addDays, shortDate } from '@/lib/closing';
import DailyClosing from './DailyClosing';
import CashHandover from './CashHandover';
import PeriodClosings from './PeriodClosings';
import BranchPicker from './BranchPicker';
import ClosingRegister from './ClosingRegister';
import './Closing.css';

const TABS = [
    { key: 'daily', label: 'إقفال الصندوق اليومي', icon: 'list' },
    { key: 'handover', label: 'تسليم النقد', icon: 'truck' },
    { key: 'period', label: 'الأسبوعي والشهري', icon: 'layers' },
    { key: 'register', label: 'سجل الكشوف', icon: 'table' },
];

/**
 * The closing page: reconcile and review a branch's collections day by
 * day, hand its cash over to the company, then close the week and the
 * month from the same payments.
 */
export default function Index({
    tab,
    branches,
    branchId,
    date,
    latestDay,
    period,
    daily,
    handover,
    periodView,
    register,
    differenceReasons,
    cashNotes,
    cashCoins,
    userId,
    cutoff,
    canExport,
    canSendPeriodAudit,
}) {
    function visit(changes) {
        router.get('/closings', { tab, branch: branchId, date, period, ...changes }, { preserveScroll: true });
    }

    const waitingForReview = daily?.status === 'submitted' && daily?.can.approveBranch;
    const { can } = usePage().props;

    return (
        <AuthenticatedLayout>
            <Head title="الصندوق المالي" />
            <div className="closing-page" dir="rtl">
                <div className="ph">
                    <div>
                        <h1>الصندوق المالي</h1>
                        <p>عدّ الصندوق ومطابقة التحصيل، ثم اعتماد إقفال الفرع وإرسال كشفه إلى التدقيق المالي.</p>
                    </div>
                    {can?.viewFinancialAudit && <Link href="/financial-audit" className="btn"><Icon name="shield" />التدقيق المالي</Link>}
                    {can?.followBranchAudit && <Link href="/closings/audit-statements" className="btn"><Icon name="history" />متابعة كشوف الفرع</Link>}
                    {branchId && (
                        <Link
                            className="btn"
                            href={`/reports?branch=${branchId}&from=${date}&to=${date}`}
                            style={{ marginInlineStart: 'auto' }}
                        >
                            <Icon name="receipt" />
                            تقرير اليوم
                        </Link>
                    )}
                </div>

                <div className="tabs" role="group" aria-label="أقسام الصندوق المالي">
                    {TABS.map((item) => (
                        <button key={item.key} type="button" aria-pressed={tab === item.key} onClick={() => visit({ tab: item.key })}>
                            <Icon name={item.icon} />
                            {item.label}
                            {item.key === 'daily' && waitingForReview && <span className="n">1</span>}
                        </button>
                    ))}
                </div>

                {['daily', 'handover'].includes(tab) && (
                    <div className="ctl">
                        <BranchPicker branches={branches} branchId={branchId} onChange={(branch) => visit({ branch })} />
                        <span className="cb nav">
                            <button type="button" aria-label="اليوم السابق" onClick={() => visit({ date: addDays(date, -1) })}>
                                <Icon name="chevron-right" />
                            </button>
                            <span>
                                {weekDayName(date)} <b>{shortDate(date, true)}</b>
                            </span>
                            <button
                                type="button"
                                aria-label="اليوم التالي"
                                disabled={date >= latestDay}
                                onClick={() => visit({ date: addDays(date, 1) })}
                            >
                                <Icon name="chevron-left" />
                            </button>
                        </span>
                        <span className="cb">
                            <Icon name="clock" />
                            <small>وقت القطع</small>
                            <b>{cutoff === '00:00' ? 'منتصف الليل' : cutoff}</b>
                        </span>
                    </div>
                )}

                {branches.length === 0 && (
                    <div className="pn empty" style={{ marginTop: 16 }}>
                        <b>لا توجد فروع</b>
                        <p>أضف فرعًا أولًا لبدء الإغلاقات.</p>
                    </div>
                )}

                {tab === 'daily' && daily && (
                    <DailyClosing
                        key={daily.id}
                        closing={daily}
                        differenceReasons={differenceReasons}
                        cashNotes={cashNotes}
                        cashCoins={cashCoins}
                        userId={userId}
                        onHandOver={() => visit({ tab: 'handover' })}
                    />
                )}
                {tab === 'handover' && handover && <CashHandover key={handover.id} closing={handover} onOpenDaily={() => visit({ tab: 'daily' })} />}
                {tab === 'register' && register && (
                    <ClosingRegister
                        canExport={canExport}
                        register={register}
                        branches={branches}
                        onChange={(filters) => router.get('/closings', { tab: 'register', ...filters }, { preserveScroll: true })}
                        onOpenDay={(branch, day) => visit({ tab: 'daily', branch, date: day })}
                    />
                )}
                {tab === 'period' && periodView && (
                    <PeriodClosings
                        view={periodView}
                        branches={branches}
                        branchId={branchId}
                        date={date}
                        canSendToAudit={canSendPeriodAudit}
                        onChange={visit}
                        onOpenDay={(branch, day) => visit({ tab: 'daily', branch, date: day })}
                    />
                )}
            </div>
        </AuthenticatedLayout>
    );
}
