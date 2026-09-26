import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import RowMoreMenu from '@/Components/DataTable/RowMoreMenu';
import { isModalOpen } from '@/Components/Modal';
import { describeBalance } from '@/lib/accountStatement';
import { formatAmount, formatCurrency } from '@/lib/currency';
import { formatActivityTime } from '@/lib/dates';
import { initials } from '@/lib/initials';
import { SUBSCRIBER_STATUS_TONES, TONE_DOT_CLASSES } from '@/lib/subscriberStatus';

const TABS = [
    { value: 'activity', label: 'النشاط' },
    { value: 'readings', label: 'القراءات' },
    { value: 'details', label: 'البيانات' },
];

const READING_TONES = {
    pending: 'amber',
    approved: 'green',
};

function StatCard({ label, value, children }) {
    return (
        <div className="min-w-0 rounded-2xl border border-gray-100 bg-gray-50 px-3.5 py-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 truncate font-display text-lg font-bold tabular-nums text-gray-900" dir="ltr">
                {value}
            </p>
            {children}
        </div>
    );
}

function Field({ label, value, dir }) {
    const display = value === null || value === undefined || value === '' ? '—' : value;

    return (
        <div className="min-w-0">
            <dt className="text-xs font-semibold text-gray-500">{label}</dt>
            <dd className="mt-0.5 break-words text-sm text-gray-900" dir={dir}>
                {display}
            </dd>
        </div>
    );
}

function ActivityTab({ subscriber }) {
    const activity = subscriber.recentActivity ?? [];

    return (
        <div className="space-y-4">
            {activity.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">لا توجد حركات على الحساب بعد.</p>
            ) : (
                <ol className="space-y-3.5">
                    {activity.map((entry) => (
                        <li key={entry.id} className="flex items-start gap-3">
                            <span
                                className={`mt-2 h-2 w-2 shrink-0 rounded-full ${entry.isPayment ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                aria-hidden="true"
                            />
                            <span className="min-w-0 text-sm">
                                <span className="font-bold text-gray-900">{entry.description}</span>{' '}
                                <b className="font-display tabular-nums text-gray-900">{entry.amount}</b>
                                <span className="text-gray-500"> · {formatActivityTime(entry.date)}</span>
                                <span className="sr-only">{entry.isPayment ? ' (له)' : ' (عليه)'}</span>
                            </span>
                        </li>
                    ))}
                </ol>
            )}
            <Link
                href={`/subscribers/${subscriber.id}/statement`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-surface px-4 py-3 text-sm transition hover:border-gray-200 hover:shadow-card"
            >
                <span className="flex items-center gap-2.5 font-semibold text-gray-900">
                    <Icon name="ledger" className="h-5 w-5 text-gray-500" />
                    كشف الحساب الكامل
                </span>
                <Icon name="chevron-left" className="h-4 w-4 text-gray-400" />
            </Link>
        </div>
    );
}

function ReadingsTab({ subscriber }) {
    const readings = subscriber.meterReadings ?? [];

    if (readings.length === 0) {
        return <p className="py-6 text-center text-sm text-gray-500">لا توجد قراءات بعد. آخر قراءة للعداد: {formatAmount(subscriber.lastReading)}</p>;
    }

    return (
        <ul className="divide-y divide-gray-100">
            {readings.map((reading) => (
                <li key={reading.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900">
                            <bdi dir="ltr">{reading.weekStart}</bdi> ← <bdi dir="ltr">{reading.weekEnd}</bdi>
                        </span>
                        <span className="block text-xs text-gray-500">
                            {formatAmount(reading.current_reading)} · استهلاك {formatAmount(reading.consumption)} كيلو ·{' '}
                            {formatCurrency(reading.amountDue)}
                        </span>
                    </span>
                    <StatusPill tone={READING_TONES[reading.status] ?? 'gray'} label={reading.statusLabel} />
                </li>
            ))}
        </ul>
    );
}

function DetailsTab({ subscriber }) {
    return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <Field label="رقم المشترك" value={subscriber.account_number} dir="ltr" />
            <Field label="رقم الهوية" value={subscriber.national_id} dir="ltr" />
            <Field label="نوع الاشتراك" value={subscriber.tariffCategoryLabel} />
            <Field label="تصنيف الزبائن" value={subscriber.tariffSegmentName ?? 'بدون تصنيف'} />
            <Field label="سعر الكيلو" value={formatCurrency(subscriber.tariffRate)} />
            <Field label="القاطع" value={subscriber.circuitBreakerAmpere ? `${subscriber.circuitBreakerAmpere} أمبير` : null} />
            <Field label="الحد الأدنى" value={formatCurrency(subscriber.minimum_charge)} />
            <Field label="الفرع" value={subscriber.branchName} />
            <Field label="المنطقة" value={[subscriber.governorateName, subscriber.areaName, subscriber.subAreaName].filter(Boolean).join(' · ')} />
            <Field label="رقم الطبلون" value={subscriber.meterBoxNumber} />
            <Field label="القراءة الأولى" value={subscriber.initial_reading} />
            <Field label="رسوم الاشتراك" value={formatCurrency(subscriber.subscription_fee)} />
            <Field label="تاريخ الاشتراك" value={subscriber.subscription_date} />
            <Field label="سجّله" value={subscriber.registeredByName} />
            <div className="col-span-2">
                <Field label="العنوان" value={subscriber.address} />
            </div>
            <div className="col-span-2">
                <Field label="معلومات أخرى" value={subscriber.notes} />
            </div>
        </dl>
    );
}

/**
 * The quick preview: clicking a subscriber (or "عرض") opens this panel
 * beside the table, which stays in view. It shows what matters at a
 * glance (balance, last reading, last payment) with the account's latest
 * movements, readings and details; the arrows move to the subscriber
 * above or below without closing it. The name opens the full statement.
 */
export default function SubscriberPreviewPanel({ subscriber, tab = 'activity', onClose, onPrevious, onNext, onEdit, menu }) {
    const id = useId();
    const panelRef = useRef(null);
    const [activeTab, setActiveTab] = useState(tab);
    const [menuAnchor, setMenuAnchor] = useState(null);
    const menuAnchorRef = useRef(null);
    const balance = describeBalance(subscriber.outstandingBalance ?? 0);
    const tone = SUBSCRIBER_STATUS_TONES[subscriber.status];

    useEffect(() => {
        setActiveTab(tab);
    }, [subscriber.id, tab]);

    useEffect(() => {
        panelRef.current?.focus({ preventScroll: true });
    }, []);

    // Escape closes the panel, unless a dialog opened over it takes the key.
    useEffect(() => {
        function onKeyDown(event) {
            if (event.key === 'Escape' && !event.defaultPrevented && !isModalOpen() && !menuAnchorRef.current) {
                onClose();
            }
        }

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    function onPanelKeyDown(event) {
        const typing = event.target.closest('input, textarea, select, [role="tab"]');

        if (typing || event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }

        if (event.key === 'ArrowUp' && onPrevious) {
            event.preventDefault();
            onPrevious();
        } else if (event.key === 'ArrowDown' && onNext) {
            event.preventDefault();
            onNext();
        }
    }

    function onTabKeyDown(event, index) {
        const step = { ArrowLeft: 1, ArrowRight: -1 }[event.key];

        if (step) {
            event.preventDefault();
            const next = TABS[(index + step + TABS.length) % TABS.length];
            setActiveTab(next.value);
            document.getElementById(`${id}-tab-${next.value}`)?.focus();
        }
    }

    function toggleMenu(event) {
        const next = menuAnchorRef.current ? null : event.currentTarget;
        menuAnchorRef.current = next;
        setMenuAnchor(next);
    }

    function closeMenu(restoreFocus) {
        if (restoreFocus) {
            menuAnchorRef.current?.focus();
        }

        menuAnchorRef.current = null;
        setMenuAnchor(null);
    }

    const navButton =
        'flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-surface text-gray-600 transition hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40';

    return (
        <aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-labelledby={`${id}-name`}
            onKeyDown={onPanelKeyDown}
            data-row-click-ignore
            className="animate-panel-in fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface shadow-2xl outline-none ring-1 ring-black/5 sm:inset-auto sm:bottom-4 sm:end-4 sm:top-[88px] sm:w-[440px] sm:rounded-panel print:hidden"
        >
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-16 top-0 h-[2px] rounded-full bg-spectrum opacity-80" />

            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-graphite-gradient font-display text-base font-bold text-white dark:ring-1 dark:ring-white/10">
                        {initials(subscriber.full_name)}
                        <span
                            className={`absolute -bottom-0.5 -start-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-surface ${TONE_DOT_CLASSES[tone]}`}
                        />
                    </span>
                    <div className="min-w-0">
                        <Link
                            id={`${id}-name`}
                            href={`/subscribers/${subscriber.id}/statement`}
                            title="فتح كشف الحساب الكامل"
                            className="block truncate text-lg font-bold leading-tight text-gray-900 hover:underline"
                        >
                            {subscriber.full_name}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span dir="ltr">{subscriber.phone}</span>
                            <StatusPill tone={tone} label={subscriber.statusLabel} />
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onPrevious}
                        disabled={!onPrevious}
                        aria-label="المشترك السابق"
                        title="المشترك السابق (↑)"
                        className={navButton}
                    >
                        <Icon name="chevron-up" className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={onNext}
                        disabled={!onNext}
                        aria-label="المشترك التالي"
                        title="المشترك التالي (↓)"
                        className={navButton}
                    >
                        <Icon name="chevron-down" className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button type="button" onClick={onClose} aria-label="إغلاق المعاينة" title="إغلاق (Esc)" className={navButton}>
                        <Icon name="close" className="h-4 w-4" strokeWidth={2} />
                    </button>
                </div>
            </div>

            <div className="grid shrink-0 grid-cols-3 gap-2.5 px-5 pt-4">
                <StatCard label="الرصيد" value={balance.amount}>
                    <span className="mt-1 block">
                        <StatusPill tone={{ owes: 'red', credit: 'green', settled: 'gray' }[balance.tone]} label={balance.label} />
                    </span>
                </StatCard>
                <StatCard label="آخر قراءة" value={formatAmount(subscriber.lastReading)} />
                <StatCard
                    label="آخر دفعة"
                    value={subscriber.lastPaymentAt ? subscriber.lastPaymentAt.slice(5).split('-').reverse().join('/') : '—'}
                />
            </div>

            <div role="tablist" aria-label="أقسام المعاينة" className="mx-5 mt-4 flex shrink-0 gap-5 border-b border-gray-100">
                {TABS.map((option, index) => (
                    <button
                        key={option.value}
                        id={`${id}-tab-${option.value}`}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === option.value}
                        aria-controls={`${id}-panel`}
                        tabIndex={activeTab === option.value ? 0 : -1}
                        onClick={() => setActiveTab(option.value)}
                        onKeyDown={(event) => onTabKeyDown(event, index)}
                        className={`-mb-px border-b-2 px-0.5 pb-2.5 text-sm font-semibold transition ${
                            activeTab === option.value ? 'border-brand-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${activeTab}`} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {activeTab === 'activity' && <ActivityTab subscriber={subscriber} />}
                {activeTab === 'readings' && <ReadingsTab subscriber={subscriber} />}
                {activeTab === 'details' && <DetailsTab subscriber={subscriber} />}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3.5">
                {onEdit && (
                    <button type="button" onClick={onEdit} className="btn-info">
                        <Icon name="pencil" className="h-4 w-4" />
                        تعديل
                    </button>
                )}
                <Link
                    href={`/subscribers/${subscriber.id}/statement?print=1`}
                    className="inline-flex items-center justify-center gap-2 rounded-control border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                    <Icon name="printer" className="h-4 w-4" />
                    طباعة
                </Link>
                <SecondaryButton
                    onClick={toggleMenu}
                    aria-label="إجراءات أخرى"
                    aria-haspopup="dialog"
                    aria-expanded={menuAnchor !== null}
                    className="ms-auto !px-3"
                >
                    <Icon name="dots" className="h-5 w-5" strokeWidth={2.5} />
                </SecondaryButton>
            </div>

            <RowMoreMenu
                anchor={menuAnchor}
                onClose={closeMenu}
                groups={menu}
                header={{ name: subscriber.full_name, subtitle: subscriber.phone }}
                menuKey="subscribers"
            />
        </aside>
    );
}
