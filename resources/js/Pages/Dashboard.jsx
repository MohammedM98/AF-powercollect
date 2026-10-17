import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import AddButton from '@/Components/AddButton';
import BranchModal from '@/Pages/Branches/BranchModal';
import UserModal from '@/Pages/Users/UserModal';
import StatRing from '@/Components/StatRing';
import CountUp from '@/Components/CountUp';
import Icon from '@/Components/Icon';
import KpiTile from '@/Components/KpiTile';
import BarChart from '@/Components/Charts/BarChart';
import MeterBar from '@/Components/Charts/MeterBar';
import SegmentedTabs from '@/Components/SegmentedTabs';
import SearchableSelect from '@/Components/SearchableSelect';
import { formatMoney, formatNumber, initials, percentOf } from '@/lib/format';

const ICONS = {
    branches: (
        <>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
            />
        </>
    ),
    users: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
        />
    ),
    subscriptions: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
        />
    ),
    meterBoxes: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.75 3.75v16.5h16.5V3.75H3.75zM3.75 9h16.5M9 3.75v16.5" />,
    circuitBreakers: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    ),
    tariffs: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
    ),
};

const RING_COLORS = ['text-brand-500', 'text-gray-400', 'text-amber-500', 'text-emerald-500', 'text-sky-500'];

const SECTION_LABELS = {
    branches: { title: 'الفروع', statLabel: 'الفروع النشطة', viewAll: '/branches' },
    users: { title: 'أحدث المستخدمين', statLabel: 'المستخدمون النشطون', viewAll: '/users' },
    subscriptions: { title: 'أحدث المشتركين', statLabel: 'المشتركون النشطون', viewAll: '/subscriptions' },
    meterBoxes: { title: 'أحدث الطبلونات', statLabel: 'الطبلونات', viewAll: '/meter-boxes' },
    tariffs: { title: 'التعرفات', statLabel: 'التعرفات', viewAll: '/tariffs' },
    circuitBreakers: { title: 'القواطع', statLabel: 'أنواع القواطع', viewAll: '/circuit-breakers' },
};

/** The sections that get a figure card, in the order they show. */
const CARD_KEYS = ['branches', 'users', 'subscriptions', 'meterBoxes', 'tariffs', 'circuitBreakers'];

/** The spans the collection chart can show, both ending today. */
const CHART_SPANS = [
    { value: '7', label: '7 أيام', caption: 'آخر 7 أيام' },
    { value: '30', label: '30 يوم', caption: 'آخر 30 يوم' },
];

const SHEKEL = 'شيكل';

function buildSubtitle(sections, scopedToBranch, branchName) {
    const scopeSuffix = branchName ? `في ${branchName}` : scopedToBranch ? 'في فرعك' : 'عبر النظام';

    if (sections.users) {
        return sections.branches && !scopedToBranch && !branchName
            ? `${sections.branches.total} فرع — ${sections.users.active} مستخدم نشط ${scopeSuffix}`
            : `${sections.users.active} مستخدم نشط ${scopeSuffix}`;
    }
    if (sections.subscriptions) {
        return `${sections.subscriptions.active} مشترك نشط ${scopeSuffix}`;
    }
    if (sections.meterBoxes) {
        return `${sections.meterBoxes.total} طبلون ${scopeSuffix}`;
    }
    if (sections.branches) {
        return `${sections.branches.active} من ${sections.branches.total} فرع نشط حاليًا`;
    }
    if (sections.tariffs) {
        return `${sections.tariffs.total} تعرفة معرّفة في النظام`;
    }
    return null;
}

/** A money figure with its unit, for the lines of a card. */
function Shekels({ amount, className = 'text-gray-900' }) {
    return (
        <span className={`whitespace-nowrap font-display font-bold tabular-nums ${className}`}>
            {formatMoney(amount)} <span className="text-xs font-normal text-gray-500">{SHEKEL}</span>
        </span>
    );
}

/**
 * How a figure moved against the one before it, as an arrow and a
 * percentage in words and color; nothing when there is no earlier figure
 * to compare with.
 */
function Change({ current, previous }) {
    if (!(previous > 0)) {
        return null;
    }

    const change = Math.round(((current - previous) / previous) * 100);

    if (change === 0) {
        return <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">مثل الأسبوع الذي قبله</span>;
    }

    const up = change > 0;

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                up ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400'
            }`}
        >
            <Icon name={up ? 'trend-up' : 'trend-down'} className="h-3.5 w-3.5" />
            <span dir="ltr">{`${up ? '+' : '−'}${Math.abs(change)}%`}</span>
            <span>عن الأسبوع الذي قبله</span>
        </span>
    );
}

/** A card with a title, an optional quiet line under it, and a link or control at its end. */
function Panel({ title, caption, action, className = '', children }) {
    return (
        <section className={`rise-in min-w-0 rounded-panel border border-gray-100 bg-surface p-6 shadow-card ${className}`}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="font-bold text-gray-900">{title}</h3>
                    {caption && <p className="mt-1 text-sm text-gray-500">{caption}</p>}
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

/** The collection figures that lead the page: today, the last seven days, and this month. */
function CollectionTiles({ collections }) {
    const { today, yesterday, week, previousWeek, month, lastMonth } = collections;

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile
                hero
                className="sm:col-span-2"
                label="تحصيل اليوم"
                value={formatMoney(today.total)}
                unit={SHEKEL}
                hint={`${formatNumber(today.payments)} دفعة حتى الآن · أمس ${formatMoney(yesterday.total)} ${SHEKEL}`}
            />
            <KpiTile
                icon="trend"
                label="آخر 7 أيام"
                value={formatMoney(week.total)}
                unit={SHEKEL}
                hint={`${formatNumber(week.payments)} دفعة · الأسبوع الذي قبله ${formatMoney(previousWeek.total)} ${SHEKEL}`}
                style={{ '--rise-delay': '80ms' }}
            >
                {previousWeek.total > 0 && (
                    <div className="mt-3">
                        <Change current={week.total} previous={previousWeek.total} />
                    </div>
                )}
            </KpiTile>
            <KpiTile
                icon="wallet"
                label="هذا الشهر"
                value={formatMoney(month.total)}
                unit={SHEKEL}
                hint={`${formatNumber(month.payments)} دفعة · الشهر الماضي كاملًا ${formatMoney(lastMonth.total)} ${SHEKEL}`}
                style={{ '--rise-delay': '150ms' }}
            />
        </div>
    );
}

/** What was collected each day, over the last 7 or 30 days. */
function CollectionChart({ daily, className }) {
    const [span, setSpan] = useState('30');
    const days = daily.slice(-Number(span));
    const caption = CHART_SPANS.find((option) => option.value === span).caption;
    const total = days.reduce((sum, day) => sum + day.value, 0);

    return (
        <Panel
            className={className}
            title="التحصيل اليومي"
            caption={`${caption} · ${formatMoney(total)} ${SHEKEL}`}
            action={<SegmentedTabs options={CHART_SPANS} value={span} onChange={setSpan} label="مدة الرسم" />}
        >
            {/* On a phone the 30 days scroll sideways (newest in view first) so their dates stay readable; the top padding leaves the tooltip room. */}
            <div className="-mt-14 overflow-x-auto pt-14 sm:overflow-visible">
                <div className="min-w-[36rem] px-10 sm:min-w-0 sm:px-0">
                    <BarChart
                        data={days}
                        label={`التحصيل اليومي بالشيكل، ${caption}`}
                        formatValue={(value) => `${formatMoney(value)} ${SHEKEL}`}
                        countLabel="دفعة"
                        height={290}
                    />
                </div>
            </div>
        </Panel>
    );
}

/** How the last 30 days were paid: cash against transfers. */
function PaymentMethods({ methods }) {
    const total = methods.cash + methods.transfers;
    const rows = [
        { key: 'cash', label: 'نقدًا', icon: 'dollar', value: methods.cash },
        { key: 'transfers', label: 'تحويل بنكي أو محفظة', icon: 'bank', value: methods.transfers },
    ];

    return (
        <Panel title="طريقة الدفع" caption="آخر 30 يوم">
            {total === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">لا توجد دفعات في آخر 30 يوم.</p>
            ) : (
                <ul className="space-y-4">
                    {rows.map((row) => (
                        <li key={row.key}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="flex items-center gap-2 font-medium text-gray-700">
                                    <Icon name={row.icon} className="h-4 w-4 text-gray-400" />
                                    {row.label}
                                </span>
                                <span className="flex items-baseline gap-2">
                                    <Shekels amount={row.value} />
                                    <span className="text-xs font-semibold text-gray-500">{percentOf(row.value, total)}%</span>
                                </span>
                            </div>
                            <MeterBar value={row.value} max={total} className="mt-2" />
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}

/** Who collected the most over the last 30 days. */
function TopCollectors({ collectors, showBranch }) {
    const max = collectors[0]?.total ?? 0;

    return (
        <Panel title="أكثر المحصّلين" caption="آخر 30 يوم">
            {collectors.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">لا توجد دفعات في آخر 30 يوم.</p>
            ) : (
                <ol className="space-y-4">
                    {collectors.map((collector) => (
                        <li key={collector.id} className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-graphite-gradient font-display text-sm font-bold text-white dark:ring-1 dark:ring-white/10">
                                {initials(collector.name)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="truncate text-sm font-semibold text-gray-900">{collector.name}</span>
                                    <Shekels amount={collector.total} className="text-sm text-gray-900" />
                                </div>
                                <div className="mt-0.5 truncate text-xs text-gray-500">
                                    {formatNumber(collector.payments)} دفعة
                                    {showBranch && collector.branch ? ` · ${collector.branch}` : ''}
                                </div>
                                <MeterBar value={collector.total} max={max} className="mt-2" />
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </Panel>
    );
}

/** The branches by what they collected over the last 30 days, for the Super Admin. */
function BranchRanking({ branches, canOpen }) {
    const max = branches[0]?.total ?? 0;

    return (
        <Panel
            title="الفروع حسب التحصيل"
            caption="آخر 30 يوم"
            action={
                canOpen && (
                    <Link
                        href="/branch-performance"
                        prefetch
                        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 transition hover:text-gray-900"
                    >
                        أداء الفروع
                        <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2} />
                    </Link>
                )
            }
        >
            <ol className="space-y-4">
                {branches.map((branch, index) => {
                    const name = <span className="truncate text-sm font-semibold text-gray-900">{branch.name}</span>;

                    return (
                        <li key={branch.id} className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50 font-display text-sm font-bold text-gray-500">
                                {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-3">
                                    {canOpen ? (
                                        <Link href={`/branch-performance/${branch.id}`} prefetch className="min-w-0 truncate hover:underline">
                                            {name}
                                        </Link>
                                    ) : (
                                        name
                                    )}
                                    <Shekels amount={branch.total} className="text-sm text-gray-900" />
                                </div>
                                <div className="mt-0.5 text-xs text-gray-500">
                                    {formatNumber(branch.payments)} دفعة{branch.active ? '' : ' · متوقف'}
                                </div>
                                <MeterBar value={branch.total} max={max} className="mt-2" />
                            </div>
                        </li>
                    );
                })}
            </ol>
        </Panel>
    );
}

/** The breaker sizes the active subscriptions use most. */
function BreakerUsage({ usage, total }) {
    const max = usage[0]?.subscriptions ?? 0;

    return (
        <Panel
            title="القواطع الأكثر استخدامًا"
            caption={`المشتركون النشطون · ${formatNumber(total)} نوع قاطع معرّف`}
            action={
                <Link
                    href="/circuit-breakers"
                    prefetch
                    className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 transition hover:text-gray-900"
                >
                    عرض الكل
                    <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2} />
                </Link>
            }
        >
            <ul className="space-y-4">
                {usage.map((breaker) => (
                    <li key={breaker.ampere}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="font-semibold text-gray-900">
                                <span className="font-display tabular-nums">{breaker.ampere}</span> أمبير
                            </span>
                            <span className="text-gray-500">
                                <b className="font-display tabular-nums text-gray-900">{formatNumber(breaker.subscriptions)}</b> مشترك
                            </span>
                        </div>
                        <MeterBar value={breaker.subscriptions} max={max} className="mt-2" />
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

/** Shortcuts to the day's usual work, each shown only to someone allowed to do it. */
function QuickActions({ actions }) {
    return (
        <nav aria-label="اختصارات" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {actions.map((action, index) => (
                <Link
                    key={action.href}
                    href={action.href}
                    prefetch
                    className="rise-in group flex items-center gap-3 rounded-card border border-gray-100 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    style={{ '--rise-delay': `${60 + index * 50}ms` }}
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white">
                        <Icon name={action.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 text-sm font-semibold text-gray-900">{action.label}</span>
                </Link>
            ))}
        </nav>
    );
}

/** The Super Admin's branch picker: every figure that belongs to a branch follows it. */
function BranchFilter({ filter, onChoose }) {
    const chosen = filter.options.find((option) => option.value === filter.selected);

    return (
        <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="dashboard-branch" className="text-sm font-semibold text-gray-700">
                الفرع
            </label>
            <div className="w-full max-w-xs">
                <SearchableSelect
                    id="dashboard-branch"
                    value={filter.selected === null ? '' : String(filter.selected)}
                    onChange={(value) => onChoose(value || null)}
                    options={filter.options.map((option) => ({ value: String(option.value), label: option.label }))}
                    placeholder="كل الفروع"
                    active={chosen !== undefined}
                />
            </div>
            {chosen && (
                <button
                    type="button"
                    onClick={() => onChoose(null)}
                    className="text-sm font-semibold text-brand-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"
                >
                    عرض كل الفروع
                </button>
            )}
        </div>
    );
}

export default function Dashboard({
    greeting,
    sections,
    fieldApp,
    scopedToBranch,
    auth,
    canCreateBranch,
    canCreateUser,
    canCreateSubscription,
    branchFilter,
    branchForm,
    userForm,
    can,
}) {
    const [creating, setCreating] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const hasAnyData = Object.keys(sections).length > 0;
    const cardKeys = CARD_KEYS.filter((key) => sections[key]);
    const { collections, circuitBreakers } = sections;
    const heroKey = ['branches', 'users', 'subscriptions'].find((key) => sections[key]);
    const hero = !collections && heroKey ? sections[heroKey] : null;
    const chosenBranch = branchFilter?.options.find((option) => option.value === branchFilter.selected)?.label ?? null;
    const subtitle = buildSubtitle(sections, scopedToBranch, chosenBranch);
    const actions = [
        canCreateSubscription && { href: '/subscriptions/create', label: 'مشترك جديد', icon: 'user' },
        can?.recordPayments && { href: '/payments', label: 'تسجيل دفعة', icon: 'wallet' },
        can?.viewMeterBoxes && { href: '/meter-boxes', label: 'الطبلونات', icon: 'grid' },
        can?.viewBranchPerformance && { href: '/branch-performance', label: scopedToBranch ? 'تقرير الفرع' : 'أداء الفروع', icon: 'chart' },
    ].filter(Boolean);
    const sideBySide = (collections?.branches?.length ?? 0) > 0 && (circuitBreakers?.usage?.length ?? 0) > 0;

    /** Shows the figures for one branch, or for every branch with null, keeping the page as it is while they load. */
    function chooseBranch(branchId) {
        router.get('/dashboard', branchId ? { branch: branchId } : {}, {
            only: ['sections', 'branchFilter'],
            preserveState: true,
            preserveScroll: true,
            replace: true,
            onStart: () => setRefreshing(true),
            onFinish: () => setRefreshing(false),
        });
    }

    /**
     * Opens the "new branch" or "new user" pop-up — the same one as on its
     * own page — fetching its dropdown options the first time.
     */
    function openCreateForm(kind) {
        const optionsProp = kind === 'branch' ? 'branchForm' : 'userForm';

        if ({ branchForm, userForm }[optionsProp]) {
            setCreating(kind);
            return;
        }

        router.reload({ only: [optionsProp], onSuccess: () => setCreating(kind) });
    }

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold text-gray-900">
                            {greeting}، <span className="text-brand-600">{auth.user.name}</span>
                        </h2>
                        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        {can?.viewUserTypes && (
                            <Link href="/users?tab=types" className="text-sm font-semibold text-brand-600 hover:underline">
                                أنواع المستخدمين
                            </Link>
                        )}
                        {canCreateBranch ? (
                            <AddButton onClick={() => openCreateForm('branch')}>فرع جديد</AddButton>
                        ) : canCreateUser ? (
                            <AddButton onClick={() => openCreateForm('user')}>مستخدم جديد</AddButton>
                        ) : null}
                    </div>
                </>
            }
        >
            <Head title="لوحة التحكم" />

            {!hasAnyData ? (
                <div className="rounded-card border border-dashed border-gray-200 bg-surface px-6 py-16 text-center">
                    {fieldApp ? (
                        <>
                            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10 text-brand-600">
                                <Icon name="phone" className="h-7 w-7" />
                            </span>
                            <h3 className="mt-4 text-lg font-bold text-gray-900">حسابك للعمل الميداني</h3>
                            <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-gray-600">
                                تُسجَّل الدفعات والقراءات من تطبيق التحصيل على الهاتف، وتدخل إليه بنفس اسم المستخدم وكلمة المرور. لا تظهر لك بيانات في
                                الموقع.
                            </p>
                            {fieldApp.url && (
                                <a
                                    href={fieldApp.url}
                                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-control bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
                                >
                                    <Icon name="arrow-down-tray" className="h-4 w-4" />
                                    تحميل تطبيق التحصيل
                                </a>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-gray-500">لا توجد بيانات لعرضها حاليًا — لم يتم منحك صلاحية عرض أي جدول بعد.</p>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {branchFilter && <BranchFilter filter={branchFilter} onChoose={chooseBranch} />}

                    <div aria-busy={refreshing} className={`space-y-6 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
                        {collections && <CollectionTiles collections={collections} />}

                        {hero && (
                            <div className="rise-in relative overflow-hidden rounded-hero bg-graphite-gradient px-8 py-9 text-white shadow-lift">
                                <div
                                    className="pointer-events-none absolute -bottom-24 -start-10 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl"
                                    aria-hidden="true"
                                />
                                <div className="relative flex flex-wrap items-center justify-between gap-8">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-300">{SECTION_LABELS[heroKey].statLabel}</p>
                                        <div className="mt-2 bg-gradient-to-b from-white to-[#9aa3ae] bg-clip-text font-display text-6xl font-bold leading-none text-transparent sm:text-7xl">
                                            <CountUp value={hero.active} />
                                        </div>
                                        <p className="mt-3 text-sm text-[#9aa3ae]">
                                            من {hero.total} · {hero.total - hero.active} غير نشط
                                        </p>
                                    </div>
                                    <StatRing
                                        percent={hero.activePct}
                                        size={104}
                                        color="text-brand-400"
                                        trackClass="text-white/10"
                                        labelClass="text-base text-white"
                                    />
                                </div>
                                <div className="brand-spectrum relative mt-7 w-40" />
                                <p className="relative mt-3 text-xs text-[#9aa3ae]">
                                    وصول قائم على الأدوار · بيانات مقسّمة حسب الفرع · بلا جداول بيانات
                                </p>
                            </div>
                        )}

                        {actions.length > 0 && <QuickActions actions={actions} />}

                        {collections && (
                            <div className="grid gap-6 lg:grid-cols-3">
                                <CollectionChart daily={collections.daily} className="lg:col-span-2" />
                                <div className="grid min-w-0 content-start gap-6">
                                    <PaymentMethods methods={collections.methods} />
                                    <TopCollectors collectors={collections.collectors} showBranch={!scopedToBranch && !chosenBranch} />
                                </div>
                            </div>
                        )}

                        {/* Stat cards */}
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
                            {cardKeys.map((key, index) => {
                                const section = sections[key];
                                const hasPct = typeof section.activePct === 'number';

                                return (
                                    <div
                                        key={key}
                                        className="rise-in flex items-center gap-4 rounded-card border border-gray-100 bg-surface p-5 shadow-card transition hover:shadow-lift"
                                        style={{ '--rise-delay': `${80 + index * 70}ms` }}
                                    >
                                        {hasPct ? (
                                            <StatRing percent={section.activePct} color={RING_COLORS[index % RING_COLORS.length]} />
                                        ) : (
                                            <span
                                                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-gray-100 bg-gray-50 ${RING_COLORS[index % RING_COLORS.length]}`}
                                            >
                                                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    {ICONS[key]}
                                                </svg>
                                            </span>
                                        )}
                                        <div>
                                            <div className="font-display text-3xl font-bold text-gray-900">
                                                <CountUp value={hasPct ? section.active : section.total} />
                                            </div>
                                            <div className="text-sm text-gray-500">{SECTION_LABELS[key].statLabel}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {((collections?.branches?.length ?? 0) > 0 || (circuitBreakers?.usage?.length ?? 0) > 0) && (
                            <div className={`grid gap-6 ${sideBySide ? 'lg:grid-cols-2' : ''}`}>
                                {collections?.branches?.length > 0 && (
                                    <BranchRanking branches={collections.branches} canOpen={Boolean(can?.viewBranchPerformance)} />
                                )}
                                {circuitBreakers?.usage?.length > 0 && <BreakerUsage usage={circuitBreakers.usage} total={circuitBreakers.total} />}
                            </div>
                        )}

                        {/* Recent lists */}
                        {['branches', 'users', 'subscriptions', 'meterBoxes']
                            .filter((key) => sections[key]?.recent)
                            .map((key) => {
                                const section = sections[key];
                                const { title, viewAll } = SECTION_LABELS[key];

                                return (
                                    <div key={key} className="rise-in rounded-card border border-gray-100 bg-surface p-6 shadow-card">
                                        <div className="mb-4 flex items-center justify-between">
                                            <h3 className="font-bold text-gray-900">{title}</h3>
                                            <Link
                                                href={viewAll}
                                                prefetch
                                                className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 transition hover:text-gray-900"
                                            >
                                                عرض الكل
                                                <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2} />
                                            </Link>
                                        </div>

                                        {section.recent.length === 0 ? (
                                            <p className="py-6 text-center text-sm text-gray-500">لا توجد بيانات بعد.</p>
                                        ) : key === 'users' ? (
                                            <div className="flex flex-wrap gap-6">
                                                {section.recent.map((item) => (
                                                    <div key={item.id} className="flex w-24 flex-col items-center text-center">
                                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-graphite-gradient font-display text-lg font-bold text-white dark:ring-1 dark:ring-white/10">
                                                            {item.name.substring(0, 1)}
                                                        </div>
                                                        <div className="mt-2 w-full truncate text-sm font-medium text-gray-900">{item.name}</div>
                                                        <div className="w-full truncate text-xs text-gray-500">{item.subtitle}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            section.recent.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center justify-between gap-4 border-t border-gray-100 py-3 first:border-t-0"
                                                >
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500">
                                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                {ICONS[key]}
                                                            </svg>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="truncate font-medium text-gray-900">{item.name}</div>
                                                            <div className="truncate text-sm text-gray-500" dir="auto">
                                                                {item.subtitle ?? '—'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {key === 'branches' && (
                                                        <div className="flex shrink-0 items-center gap-3">
                                                            {item.active ? (
                                                                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                                                    نشط
                                                                </span>
                                                            ) : (
                                                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                                                                    متوقف
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {branchForm && (
                <BranchModal
                    show={creating === 'branch'}
                    onClose={() => setCreating(null)}
                    branch={null}
                    governorates={branchForm.governorates}
                    areas={branchForm.areas}
                />
            )}
            {userForm && (
                <UserModal
                    show={creating === 'user'}
                    onClose={() => setCreating(null)}
                    user={null}
                    branches={userForm.branches}
                    canChooseBranch={userForm.canChooseBranch}
                    roleOptions={userForm.roleOptions}
                    userTypeOptions={userForm.userTypeOptions}
                />
            )}
        </AuthenticatedLayout>
    );
}
