import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import StatusPill from '@/Components/DataTable/StatusPill';
import PrimaryButton from '@/Components/PrimaryButton';
import { formatCurrency } from '@/lib/currency';

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

export default function Show({ subscriber, canUpdate }) {
    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <h2 className="truncate text-xl font-bold text-gray-900">{subscriber.full_name}</h2>
                            <StatusPill tone={STATUS_TONES[subscriber.status]} label={subscriber.statusLabel} />
                        </div>
                        <p className="mt-1 text-sm text-gray-500" dir="ltr">
                            {subscriber.meter_number}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <a href="/subscribers" className="text-sm font-medium text-gray-600 hover:underline">
                            رجوع للمشتركين
                        </a>
                        {canUpdate && (
                            <a href={`/subscribers/${subscriber.id}/edit`}>
                                <PrimaryButton type="button">تعديل</PrimaryButton>
                            </a>
                        )}
                    </div>
                </>
            }
        >
            <Head title={subscriber.full_name} />

            <div className="max-w-6xl space-y-8">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <Section title="بيانات المشترك">
                        <Field label="الاسم" value={subscriber.full_name} />
                        <Field label="الرقم الوطني" value={subscriber.national_id} />
                        <Field label="رقم الجوال" value={subscriber.phone} />
                        <Field label="الحالة" value={subscriber.statusLabel} />
                    </Section>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <Section title="التعرفة والقاطع">
                        <Field label="التعرفة" value={subscriber.tariffCategoryLabel} />
                        <Field label="سعر التعرفة" value={formatCurrency(subscriber.tariffRate)} />
                        <Field label="القاطع" value={subscriber.circuitBreakerAmpere ? `${subscriber.circuitBreakerAmpere}A` : '—'} />
                        <Field label="الحد الادنى" value={formatCurrency(subscriber.minimum_charge)} />
                    </Section>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <Section title="الموقع والعداد">
                        <Field label="الفرع" value={subscriber.branchName} />
                        <Field label="المحافظة" value={subscriber.governorateName} />
                        <Field label="المنطقة" value={subscriber.areaName} />
                        <Field label="منطقة 2" value={subscriber.subAreaName} />
                        <Field label="رقم الطبلون" value={subscriber.meterBoxNumber} />
                        <Field label="رقم العداد" value={subscriber.meter_number} />
                    </Section>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <Section title="معلومات الاشتراك">
                        <Field label="القراءة الابتدائية" value={subscriber.initial_reading} />
                        <Field label="رسوم الاشتراك" value={formatCurrency(subscriber.subscription_fee)} />
                        <Field label="تاريخ الاشتراك" value={subscriber.subscription_date} />
                        <Field label="سجّله" value={subscriber.registeredByName} />
                    </Section>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <Section title="معلومات إضافية">
                        <div className="sm:col-span-2 lg:col-span-3">
                            <Field label="العنوان" value={subscriber.address} />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                            <Field label="معلومات أخرى" value={subscriber.notes} />
                        </div>
                    </Section>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
