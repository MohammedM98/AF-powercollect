import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import Icon from '@/Components/Icon';
import PageHeader from '@/Components/PageHeader';

/** Only the upcoming reading is presented; branch staff open it directly. */
export default function Index({ distributionBranches = [], canCreate, branch }) {
    return (
        <AuthenticatedLayout header={<PageHeader title="توزيع القراءة القادمة" info="يبقى توزيع الطبلونات على القرّاء كما هو لكل قراءة قادمة، حتى يغيّره مسؤول التوزيع." />}>
            <Head title="توزيع القراءة القادمة" />
            {branch ? (
                <div className="space-y-3 text-gray-700">
                    <h2 className="text-lg font-bold text-gray-900">القراءة القادمة {branch.readingDate}</h2>
                    <p>لم يُجهّز توزيع هذه القراءة بعد. سيظهر هنا بعد تجهيز مسؤول التوزيع له.</p>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {distributionBranches.map((item) => (
                        <section key={item.id} className="flex items-center gap-4 rounded-card border border-gray-100 bg-surface p-5 shadow-card">
                            <Icon name="calendar" className="h-7 w-7 shrink-0 text-brand-600" />
                            <div className="min-w-0 flex-1 space-y-2">
                                <h2 className="font-bold text-gray-900">{item.name}</h2>
                                <p className="text-sm text-gray-600">القراءة القادمة: {item.readingDayName} <span dir="ltr">{item.readingDate}</span></p>
                                {item.cycleId ? (
                                    <Link href={`/reading-cycles/${item.cycleId}`} className="text-sm font-semibold text-brand-600 hover:underline">فتح توزيع القراءة القادمة</Link>
                                ) : canCreate && (
                                    <PrimaryButton onClick={() => router.post('/reading-cycles/prepare', { branch_id: item.id })}>فتح توزيع القراءة القادمة</PrimaryButton>
                                )}
                            </div>
                        </section>
                    ))}
                    {distributionBranches.length === 0 && <p className="text-sm text-gray-500">لا توجد فروع متاحة للتوزيع.</p>}
                </div>
            )}
        </AuthenticatedLayout>
    );
}
