import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
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

export default function SubscriberDetailsModal({ subscriber, onClose, onEdit, canUpdate }) {
    return (
        <Modal show={Boolean(subscriber)} onClose={onClose} maxWidth="5xl">
            {subscriber && (
                <div className="flex max-h-[90vh] flex-col">
                    <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                        <div className="flex items-center gap-3">
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
                                    <h3 className="truncate text-lg font-bold text-gray-900">{subscriber.full_name}</h3>
                                    <StatusPill tone={STATUS_TONES[subscriber.status]} label={subscriber.statusLabel} />
                                </div>
                                <p className="text-xs text-gray-500" dir="ltr">
                                    {subscriber.meter_number}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex-1 space-y-8 overflow-y-auto px-6 py-5">
                        <Section title="بيانات المشترك">
                            <Field label="الاسم" value={subscriber.full_name} />
                            <Field label="الرقم الوطني" value={subscriber.national_id} />
                            <Field label="رقم الجوال" value={subscriber.phone} />
                            <Field label="الحالة" value={subscriber.statusLabel} />
                        </Section>

                        <Section title="التعرفة والقاطع">
                            <Field label="التعرفة" value={subscriber.tariffCategoryLabel} />
                            <Field label="سعر التعرفة" value={formatCurrency(subscriber.tariffRate)} />
                            <Field label="القاطع" value={subscriber.circuitBreakerAmpere ? `${subscriber.circuitBreakerAmpere}A` : '—'} />
                            <Field label="الحد الادنى" value={formatCurrency(subscriber.minimum_charge)} />
                        </Section>

                        <Section title="الموقع والعداد">
                            <Field label="الفرع" value={subscriber.branchName} />
                            <Field label="المحافظة" value={subscriber.governorateName} />
                            <Field label="المنطقة" value={subscriber.areaName} />
                            <Field label="منطقة 2" value={subscriber.subAreaName} />
                            <Field label="رقم الطبلون" value={subscriber.meterBoxNumber} />
                            <Field label="رقم العداد" value={subscriber.meter_number} />
                        </Section>

                        <Section title="معلومات الاشتراك">
                            <Field label="القراءة الابتدائية" value={subscriber.initial_reading} />
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

                    <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                        <SecondaryButton onClick={onClose}>إغلاق</SecondaryButton>
                        {canUpdate && <PrimaryButton onClick={onEdit}>تعديل</PrimaryButton>}
                    </div>
                </div>
            )}
        </Modal>
    );
}
