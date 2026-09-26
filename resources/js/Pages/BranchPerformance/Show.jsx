import { Head, Link } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import MetricCard from '@/Components/MetricCard';
import BarChart from '@/Components/Charts/BarChart';
import StatusPill from '@/Components/DataTable/StatusPill';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import { formatAmount } from '@/lib/currency';
import { formatDayLabel, localDay, timeAgo } from '@/lib/dates';

const STATUSES = [
    { key: 'active', label: 'نشط', bar: 'bg-emerald-500' },
    { key: 'suspended', label: 'مفصول', bar: 'bg-amber-500' },
    { key: 'disconnected', label: 'مقطوع', bar: 'bg-red-500' },
];

const STATUS_DOTS = { active: 'bg-emerald-500', suspended: 'bg-amber-500', disconnected: 'bg-red-500' };

function Panel({ title, subtitle, className = '', children }) {
    return (
        <section className={`rise-in overflow-hidden rounded-panel border border-gray-100 bg-surface shadow-card ${className}`}>
            <div className="relative px-6 pb-4 pt-6">
                <span
                    className="absolute inset-x-6 top-0 h-[2px] rounded-full bg-gradient-to-l from-brand-500/60 to-transparent"
                    aria-hidden="true"
                />
                <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
            </div>
            {children}
        </section>
    );
}

/** The graphite headline card: how many subscribers, split by status. */
function SubscribersCard({ total, statusCounts }) {
    return (
        <div className="rise-in relative overflow-hidden rounded-panel bg-graphite-gradient p-6 text-white shadow-lift">
            <div className="pointer-events-none absolute -end-10 -top-16 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" aria-hidden="true" />
            <p className="relative text-sm font-semibold text-[#c9ced6]">المشتركون</p>
            <p className="relative mt-2 font-display text-5xl font-bold">{total}</p>
            <div className="relative mt-5 flex h-2 gap-[2px] overflow-hidden rounded-full bg-white/10">
                {STATUSES.map((status) => {
                    const count = statusCounts[status.key] ?? 0;

                    return count > 0 ? <span key={status.key} className={status.bar} style={{ width: `${(count / total) * 100}%` }} /> : null;
                })}
            </div>
            <ul className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#c9ced6]">
                {STATUSES.map((status) => (
                    <li key={status.key} className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${status.bar}`} aria-hidden="true" />
                        <b className="font-display text-white">{statusCounts[status.key] ?? 0}</b> {status.label}
                    </li>
                ))}
            </ul>
            <div className="brand-spectrum absolute inset-x-6 bottom-0" aria-hidden="true" />
        </div>
    );
}

export default function Show({ branch, dailyEntries, dailyLedger, team, latestEntries, workLog }) {
    const today = localDay();
    const location = [branch.governorateName, branch.areaName, branch.phone].filter(Boolean);
    const maxEntries = Math.max(1, ...team.map((member) => member.entries));
    // Everyone but the Super Admin only ever sees their own branch in the log, so the filter changes nothing for them.
    const ledgerHref = `/financial-log?filter[branch_id]=${branch.id}`;

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <Link
                            href="/branch-performance"
                            prefetch
                            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-900"
                        >
                            <Icon name="chevron-right" className="h-4 w-4" strokeWidth={2} />
                            أداء الفروع
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                            <h2 className="text-3xl font-bold text-gray-900">{branch.name}</h2>
                            <StatusPill tone={branch.isActive ? 'green' : 'gray'} label={branch.isActive ? 'فرع نشط' : 'فرع متوقف'} />
                        </div>
                        {location.length > 0 && (
                            <p className="mt-2 text-sm text-gray-500">
                                {location.map((part, index) => (
                                    <span key={part}>
                                        {index > 0 && ' · '}
                                        <span dir="auto">{part}</span>
                                    </span>
                                ))}
                            </p>
                        )}
                    </div>
                    <Link
                        href={ledgerHref}
                        prefetch
                        className="inline-flex shrink-0 items-center gap-2 rounded-control bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
                    >
                        <Icon name="ledger" className="h-4 w-4" />
                        السجل المالي للفرع
                    </Link>
                </>
            }
        >
            <Head title={`أداء ${branch.name}`} />

            <div className="grid gap-5 md:grid-cols-3">
                <SubscribersCard total={branch.subscribers} statusCounts={branch.statusCounts} />
                <MetricCard icon="ledger" label="قيود آخر 30 يوم" hint={`الإجمالي ${formatAmount(branch.ledgerTotal)} شيكل`}>
                    {formatAmount(branch.monthLedgerTotal)} <span className="font-sans text-sm font-normal text-gray-500">شيكل</span>
                </MetricCard>
                <MetricCard icon="arrow-trend" label="إدخالات اليوم" hint={`${branch.weekEntries} آخر 7 أيام · ${branch.monthEntries} آخر 30`}>
                    {branch.todayEntries}
                </MetricCard>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <Panel title="المشتركون الجدد يوميًا" subtitle="آخر 30 يوم">
                    <div className="px-6 pb-6">
                        <BarChart data={dailyEntries} label="المشتركون الجدد يوميًا" />
                    </div>
                </Panel>
                <Panel title="القيود اليومية" subtitle="بالشيكل · آخر 30 يوم">
                    <div className="px-6 pb-6">
                        <BarChart data={dailyLedger} label="القيود اليومية بالشيكل" formatValue={(value) => `${formatAmount(value)} شيكل`} />
                    </div>
                </Panel>
            </div>

            <Panel title="فريق الفرع" subtitle={`${team.length} موظف · مرتبون حسب عدد الإدخالات`} className="mt-5">
                <div className="data-table-container rounded-none border-x-0 border-b-0">
                    <table className="data-table w-full text-start text-sm">
                        <thead>
                            <tr>
                                <th>الموظف</th>
                                <th>اسم المستخدم</th>
                                <th>الإدخالات</th>
                                <th>آخر 7 أيام</th>
                                <th>القيود المسجلة</th>
                                <th>آخر نشاط</th>
                            </tr>
                        </thead>
                        <tbody>
                            {team.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>لا يوجد موظفون في هذا الفرع.</td>
                                </tr>
                            ) : (
                                team.map((member) => (
                                    <tr key={member.id}>
                                        <td>
                                            <RowIdentity name={member.name} subtitle={member.roleLabel} status={member.isActive ? 'green' : 'gray'} />
                                        </td>
                                        <td className="text-gray-600" dir="ltr">
                                            {member.username}
                                        </td>
                                        <td>
                                            <span className="flex items-center gap-3">
                                                <b className="w-8 font-display text-gray-900">{member.entries}</b>
                                                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                                                    <span
                                                        className="block h-full rounded-full bg-brand-gradient"
                                                        style={{ width: `${(member.entries / maxEntries) * 100}%` }}
                                                    />
                                                </span>
                                            </span>
                                        </td>
                                        <td className="font-display text-gray-900">{member.weekEntries}</td>
                                        <td className="whitespace-nowrap">
                                            <b className="font-display text-gray-900">{formatAmount(member.recordedTotal)}</b>{' '}
                                            <span className="text-xs text-gray-500">شيكل</span>
                                        </td>
                                        <td className="whitespace-nowrap text-gray-500">{timeAgo(member.lastActivityAt)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
                <Panel title="سجل العمل اليومي" subtitle={`آخر ${workLog.length} يوم`} className="lg:col-span-2">
                    <div className="data-table-container rounded-none border-x-0 border-b-0">
                        <table className="data-table w-full text-start text-sm">
                            <thead>
                                <tr>
                                    <th>اليوم</th>
                                    <th>مشتركون جدد</th>
                                    <th>القيود</th>
                                    <th>الأكثر إدخالًا</th>
                                </tr>
                            </thead>
                            <tbody>
                                {workLog.map((day) => (
                                    <tr key={day.date}>
                                        <td className="whitespace-nowrap font-semibold text-gray-900">
                                            <span className="inline-flex items-center gap-2">
                                                {formatDayLabel(day.date)}
                                                {day.date === today && (
                                                    <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[12px] font-bold text-white">
                                                        اليوم
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="font-display font-bold text-gray-900">{day.entries}</td>
                                        <td className="whitespace-nowrap text-gray-500">
                                            <b className="font-display text-gray-900">{formatAmount(day.ledgerTotal)}</b> شيكل · {day.ledgerCount} قيد
                                        </td>
                                        <td className="text-gray-600">{day.topRegistrar ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>

                <Panel title="آخر الإدخالات" subtitle="أحدث المشتركين المسجلين">
                    {latestEntries.length === 0 ? (
                        <p className="px-6 pb-10 pt-4 text-center text-sm text-gray-400">لا توجد إدخالات بعد.</p>
                    ) : (
                        <ul className="space-y-4 px-6 pb-6">
                            {latestEntries.map((entry) => (
                                <li key={entry.id} className="flex items-start gap-3">
                                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOTS[entry.status]}`} aria-hidden="true" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-gray-900">{entry.name}</p>
                                        <p className="text-xs text-gray-500">
                                            بواسطة {entry.registeredByName ?? '—'} ·{' '}
                                            <span dir="ltr" className="whitespace-nowrap">
                                                {entry.phone ?? '—'}
                                            </span>
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-xs text-gray-400">{timeAgo(entry.createdAt)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </AuthenticatedLayout>
    );
}
