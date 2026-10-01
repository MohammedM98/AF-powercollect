import { Head, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import { weekDayName } from '@/lib/weekDays';
import { addDays, shortDate } from '@/lib/closing';
import DailyClosing from './DailyClosing';
import CashHandover from './CashHandover';
import PeriodClosings from './PeriodClosings';
import BranchPicker from './BranchPicker';
import './Closing.css';

const TABS = [
    { key: 'daily', label: 'الإغلاق اليومي', icon: 'list' },
    { key: 'handover', label: 'تسليم النقد', icon: 'truck' },
    { key: 'period', label: 'الأسبوعي والشهري', icon: 'layers' },
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
    differenceReasons,
    cashNotes,
    cashCoins,
    userId,
}) {
    function visit(changes) {
        router.get('/closings', { tab, branch: branchId, date, period, ...changes }, { preserveScroll: true });
    }

    const waitingForReview = daily?.status === 'submitted' && daily?.can.audit;

    return (
        <AuthenticatedLayout>
            <Head title="الإغلاق" />
            <div className="closing-page" dir="rtl">
                <div className="ph">
                    <div>
                        <h1>الإغلاق</h1>
                        <p>مطابقة تحصيل الفرع وتدقيقه، ثم تسليم النقد للشركة، ثم إغلاقات الأسبوع والشهر من نفس الدفعات.</p>
                    </div>
                </div>

                <div className="tabs" role="group" aria-label="أقسام الإغلاق">
                    {TABS.map((item) => (
                        <button key={item.key} type="button" aria-pressed={tab === item.key} onClick={() => visit({ tab: item.key })}>
                            <Icon name={item.icon} />
                            {item.label}
                            {item.key === 'daily' && waitingForReview && <span className="n">1</span>}
                        </button>
                    ))}
                </div>

                {tab !== 'period' && (
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
                            <b>23:59</b>
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
                {tab === 'period' && periodView && (
                    <PeriodClosings
                        view={periodView}
                        branches={branches}
                        branchId={branchId}
                        date={date}
                        onChange={visit}
                        onOpenDay={(branch, day) => visit({ tab: 'daily', branch, date: day })}
                    />
                )}
            </div>
        </AuthenticatedLayout>
    );
}
