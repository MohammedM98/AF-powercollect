import { useId, useState } from 'react';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import { formatCurrency } from '@/lib/currency';
import { buildSubscriberStatement, filterSubscriberStatement } from '@/lib/subscriberTransactions';
import MeterReadingModal from '@/Pages/MeterReadings/MeterReadingModal';

const STATUS_TONES = {
    active: 'green',
    suspended: 'amber',
    disconnected: 'gray',
};

function Field({ label, value }) {
    const display = value === null || value === undefined || value === '' ? '—' : value;

    return (
        <div>
            <div className="text-xs font-semibold text-gray-500">{label}</div>
            <div className="mt-1 text-sm text-gray-900">{display}</div>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <div>
            <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
            <div className="mt-2 border-b border-gray-100" />
            <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        </div>
    );
}

export default function SubscriberDetailsModal({ subscriber, onClose, onEdit, canUpdate, readingWeekOptions = [] }) {
    const [activeTab, setActiveTab] = useState('transactions');
    const [expanded, setExpanded] = useState(false);
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [enteringReading, setEnteringReading] = useState(false);
    const [editingReading, setEditingReading] = useState(null);
    const tabsId = useId();
    const statementRows = subscriber ? buildSubscriberStatement(subscriber) : [];
    const invalidDates = Boolean(dateFrom && dateTo && dateFrom > dateTo);
    const visibleRows = filterSubscriberStatement(statementRows, { search, dateFrom, dateTo });
    const lastReading = subscriber?.meterReadings?.[0];
    const currentWeekRecorded = Boolean(lastReading && lastReading.weekStart === readingWeekOptions[0]?.value);
    const readingSubscriberOption = subscriber
        ? {
              value: String(subscriber.id),
              label: `${subscriber.account_number} — ${subscriber.full_name}`,
              lastReading: subscriber.lastReading,
              lastWeekStart: subscriber.lastReadingWeekStart,
          }
        : null;

    function resetFilters() {
        setSearch('');
        setDateFrom('');
        setDateTo('');
    }

    return (
        <>
            <Modal show={Boolean(subscriber)} onClose={onClose} maxWidth={expanded ? 'full' : '7xl'}>
                {subscriber && (
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={`${tabsId}-title`}
                        className="flex h-[calc(100dvh-8rem)] max-h-[960px] min-h-0 flex-col"
                    >
                        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-5 sm:px-8">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="1.5"
                                            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                                        />
                                    </svg>
                                </span>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 id={`${tabsId}-title`} className="truncate text-lg font-bold text-gray-900">
                                            {subscriber.full_name}
                                        </h3>
                                        <StatusPill tone={STATUS_TONES[subscriber.status]} label={subscriber.statusLabel} />
                                    </div>
                                    <p className="mt-1 text-sm text-gray-500">
                                        ملف المشترك · <span dir="ltr">{subscriber.account_number}</span> · {subscriber.branchName}
                                    </p>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setExpanded(!expanded)}
                                    aria-label={expanded ? 'تصغير النافذة' : 'توسيع النافذة'}
                                    aria-pressed={expanded}
                                    className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 sm:block"
                                >
                                    <svg
                                        className="h-5 w-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        aria-hidden="true"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d={expanded ? 'M9 3v6H3m18 0h-6V3M3 15h6v6m6 0v-6h6' : 'M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6'}
                                        />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    aria-label="إغلاق"
                                    onClick={onClose}
                                    className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                                >
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div role="tablist" aria-label="أقسام ملف المشترك" className="mx-4 flex shrink-0 gap-6 border-b border-gray-200 sm:mx-8">
                            {[
                                ['details', 'بيانات المشترك'],
                                ['transactions', 'سجل المعاملات'],
                            ].map(([tab, label]) => (
                                <button
                                    key={tab}
                                    id={`${tabsId}-${tab}`}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === tab}
                                    aria-controls={`${tabsId}-${tab}-panel`}
                                    tabIndex={activeTab === tab ? 0 : -1}
                                    onClick={() => setActiveTab(tab)}
                                    onKeyDown={(event) => {
                                        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                                            event.preventDefault();
                                            const nextTab =
                                                event.key === 'Home'
                                                    ? 'details'
                                                    : event.key === 'End'
                                                      ? 'transactions'
                                                      : activeTab === 'details'
                                                        ? 'transactions'
                                                        : 'details';
                                            setActiveTab(nextTab);
                                            document.getElementById(`${tabsId}-${nextTab}`)?.focus();
                                        }
                                    }}
                                    className={`border-b-2 px-1 py-4 text-sm font-semibold transition ${activeTab === tab ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
                            <div
                                id={`${tabsId}-details-panel`}
                                role="tabpanel"
                                aria-labelledby={`${tabsId}-details`}
                                hidden={activeTab !== 'details'}
                                className="space-y-8"
                            >
                                <Section title="بيانات المشترك">
                                    <Field label="رقم المشترك" value={subscriber.account_number} />
                                    <Field label="الاسم" value={subscriber.full_name} />
                                    <Field label="رقم الهوية" value={subscriber.national_id} />
                                    <Field label="رقم الجوال" value={subscriber.phone} />
                                    <Field label="الحالة" value={subscriber.statusLabel} />
                                </Section>

                                <Section title="نوع الاشتراك والقاطع">
                                    <Field label="نوع الاشتراك" value={subscriber.tariffCategoryLabel} />
                                    <Field label="التصنيف" value={subscriber.tariffSegmentName ?? 'بدون تصنيف'} />
                                    <Field label="سعر الكيلو" value={formatCurrency(subscriber.tariffRate)} />
                                    <Field
                                        label="القاطع"
                                        value={subscriber.circuitBreakerAmpere ? `${subscriber.circuitBreakerAmpere} أمبير` : '—'}
                                    />
                                    <Field label="الحد الادنى" value={formatCurrency(subscriber.minimum_charge)} />
                                </Section>

                                <Section title="الموقع والعداد">
                                    <Field label="الفرع" value={subscriber.branchName} />
                                    <Field label="المحافظة" value={subscriber.governorateName} />
                                    <Field label="المنطقة" value={subscriber.areaName} />
                                    <Field label="منطقة 2" value={subscriber.subAreaName} />
                                    <Field label="رقم الطبلون" value={subscriber.meterBoxNumber} />
                                </Section>

                                <Section title="معلومات الاشتراك">
                                    <Field label="القراءة السابقة (كيلوواط ساعة)" value={subscriber.initial_reading} />
                                    <Field label="رسوم الاشتراك" value={formatCurrency(subscriber.subscription_fee)} />
                                    <Field label="تاريخ الاشتراك" value={subscriber.subscription_date} />
                                    <Field label="سجّله" value={subscriber.registeredByName} />
                                </Section>

                                <Section title="معلومات إضافية">
                                    <div className="sm:col-span-2 lg:col-span-3">
                                        <Field label="العنوان" value={subscriber.address} />
                                    </div>
                                    <div className="sm:col-span-2 lg:col-span-3">
                                        <Field label="معلومات أخرى" value={subscriber.notes} />
                                    </div>
                                </Section>
                            </div>
                            <div
                                id={`${tabsId}-transactions-panel`}
                                role="tabpanel"
                                aria-labelledby={`${tabsId}-transactions`}
                                hidden={activeTab !== 'transactions'}
                                className="space-y-6"
                            >
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <div className="rounded-xl border border-brand-100 bg-brand-50 p-5">
                                        <p className="text-sm font-medium text-brand-700">المبلغ المستحق</p>
                                        <p className="mt-2 text-2xl font-bold tabular-nums text-brand-700">
                                            {formatCurrency(subscriber.outstandingBalance)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 p-5">
                                        <p className="text-sm text-gray-500">آخر قراءة للعداد</p>
                                        <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{subscriber.lastReading}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 p-5">
                                        <p className="text-sm text-gray-500">آخر أسبوع مسجل</p>
                                        <p className="mt-3 text-base font-semibold text-gray-900">
                                            {lastReading ? `${lastReading.weekStart} ← ${lastReading.weekEnd}` : 'لا توجد قراءات بعد'}
                                        </p>
                                    </div>
                                </div>
                                {subscriber.canRecordReading && (
                                    <div className="flex items-center justify-end gap-3">
                                        {currentWeekRecorded ? (
                                            <p className="text-sm text-gray-500">تم إدخال قراءة هذا الأسبوع.</p>
                                        ) : (
                                            <PrimaryButton type="button" onClick={() => setEnteringReading(true)}>
                                                + إدخال قراءة
                                            </PrimaryButton>
                                        )}
                                    </div>
                                )}
                                <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <label className="block text-sm text-gray-600 lg:col-span-2">
                                        بحث في المعاملات
                                        <input
                                            type="search"
                                            value={search}
                                            onChange={(event) => setSearch(event.target.value)}
                                            placeholder="الوصف، المبلغ أو اسم الموظف..."
                                            className="mt-1 block w-full rounded-lg text-sm"
                                        />
                                    </label>
                                    <label className="block text-sm text-gray-600">
                                        من تاريخ
                                        <input
                                            type="date"
                                            value={dateFrom}
                                            max={dateTo || undefined}
                                            onChange={(event) => setDateFrom(event.target.value)}
                                            className="mt-1 block w-full min-w-0 rounded-lg text-sm"
                                        />
                                    </label>
                                    <label className="block text-sm text-gray-600">
                                        إلى تاريخ
                                        <input
                                            type="date"
                                            value={dateTo}
                                            min={dateFrom || undefined}
                                            onChange={(event) => setDateTo(event.target.value)}
                                            className="mt-1 block w-full min-w-0 rounded-lg text-sm"
                                        />
                                    </label>
                                </div>
                                {invalidDates && (
                                    <p role="alert" className="text-sm text-red-600">
                                        تاريخ البداية يجب أن يسبق تاريخ النهاية.
                                    </p>
                                )}
                                <div className="overflow-x-auto rounded-xl border border-gray-200">
                                    <table className="w-full min-w-[900px] text-start text-sm">
                                        <thead className="bg-gray-50 text-gray-500">
                                            <tr>
                                                {[
                                                    'التاريخ',
                                                    'البيان',
                                                    'القراءة السابقة',
                                                    'القراءة الحالية',
                                                    'الاستهلاك',
                                                    'المبلغ',
                                                    'الحالة',
                                                    'سجّله',
                                                    '',
                                                ].map((label, index) => (
                                                    <th key={index} className="px-4 py-4 text-start font-medium">
                                                        {label}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {visibleRows.map((row) => (
                                                <tr key={row.key} className="hover:bg-gray-50">
                                                    <td className="whitespace-nowrap px-4 py-4 text-end text-gray-600" dir="ltr">
                                                        {row.date}
                                                    </td>
                                                    <td className="px-4 py-4 font-medium text-gray-900">{row.description}</td>
                                                    <td className="px-4 py-4 tabular-nums text-gray-600">{row.previousReading ?? '—'}</td>
                                                    <td className="px-4 py-4 font-semibold tabular-nums text-gray-900">
                                                        {row.currentReading ?? '—'}
                                                    </td>
                                                    <td className="px-4 py-4 tabular-nums text-brand-700">{row.consumption ?? '—'}</td>
                                                    <td className="whitespace-nowrap px-4 py-4 font-semibold tabular-nums text-gray-900">
                                                        {row.amount !== undefined ? formatCurrency(row.amount) : '—'}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <StatusPill tone={row.statusTone} label={row.statusLabel} />
                                                    </td>
                                                    <td className="px-4 py-4 text-gray-600">{row.recordedByName ?? '—'}</td>
                                                    <td className="px-4 py-4 text-end">
                                                        {row.reading?.canUpdate && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingReading(row.reading)}
                                                                className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                                                            >
                                                                تعديل
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {!visibleRows.length && (
                                                <tr>
                                                    <td colSpan={9} className="px-5 py-12 text-center text-gray-500">
                                                        {statementRows.length ? 'لا توجد معاملات تطابق البحث.' : 'لا توجد معاملات مسجلة بعد.'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm text-gray-500">
                                    <p aria-live="polite">
                                        عرض {visibleRows.length} من {statementRows.length} معاملات
                                    </p>
                                    {(search || dateFrom || dateTo) && (
                                        <button type="button" onClick={resetFilters} className="font-medium text-brand-600 hover:underline">
                                            مسح عوامل التصفية
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                            <SecondaryButton onClick={onClose}>إغلاق</SecondaryButton>
                            {canUpdate && <PrimaryButton onClick={onEdit}>تعديل</PrimaryButton>}
                        </div>
                    </div>
                )}
            </Modal>

            {enteringReading && readingSubscriberOption && (
                <MeterReadingModal
                    show
                    onClose={() => setEnteringReading(false)}
                    reading={null}
                    fixedSubscriber={readingSubscriberOption}
                    weekOptions={readingWeekOptions}
                />
            )}

            {editingReading && (
                <MeterReadingModal
                    key={editingReading.id}
                    show
                    onClose={() => setEditingReading(null)}
                    reading={{ ...editingReading, subscriberName: subscriber?.full_name, accountNumber: subscriber?.account_number }}
                    weekOptions={readingWeekOptions}
                />
            )}
        </>
    );
}
