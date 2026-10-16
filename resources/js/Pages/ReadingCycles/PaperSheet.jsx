import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import { formatNumber } from '@/lib/format';

/**
 * A paper reading sheet as printed: its number and cycle, and for each box
 * its subscribers with the reading the week starts from and an empty box for
 * the new one. Each printing is counted on the server first.
 */
export default function PaperSheet({ sheet, cycle, boxes }) {
    function print() {
        router.post(`/paper-sheets/${sheet.id}/printed`, {}, { preserveScroll: true, onSuccess: () => window.print() });
    }

    const total = boxes.reduce((count, box) => count + box.subscriptions.length, 0);

    return (
        <AuthenticatedLayout
            header={
                <>
                    <div className="min-w-0">
                        <p className="text-sm text-gray-500">
                            <Link href="/reading-cycles" className="hover:underline">توزيع القراءات</Link> / <Link href={`/reading-cycles/${cycle.id}`} className="hover:underline">{cycle.readingDate}</Link>
                        </p>
                        <h2 className="text-3xl font-bold text-gray-900">كشف قراءة ورقي <span dir="ltr" className="font-display">{sheet.number}</span></h2>
                        <p className="mt-1 text-sm text-gray-500">{sheet.printCount > 0 ? `طُبع ${formatNumber(sheet.printCount)} مرة، آخرها ${sheet.lastPrintedAt}` : 'لم يُطبع بعد'}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <Link href={`/meter-readings`} className="inline-flex items-center gap-1.5 rounded-control border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                            <Icon name="pencil" className="h-4 w-4" />
                            إدخال القراءات من الكشف
                        </Link>
                        <button type="button" onClick={print} className="tone-print inline-flex items-center gap-1.5 rounded-control border px-4 py-2 text-sm font-semibold">
                            <Icon name="printer" className="h-4 w-4" />
                            طباعة
                        </button>
                    </div>
                </>
            }
        >
            <Head title={`كشف ${sheet.number}`} />

            <article className="paper-sheet rounded-card border border-gray-100 bg-white p-6 text-gray-900 shadow-card print:border-0 print:p-0 print:shadow-none">
                <header className="mb-4 flex flex-wrap justify-between gap-3 border-b border-gray-300 pb-3 text-sm">
                    <div>
                        <p className="text-lg font-bold">كشف قراءة العدادات — {cycle.branchName}</p>
                        <p>رقم الكشف: <b dir="ltr">{sheet.number}</b></p>
                    </div>
                    <div className="text-end">
                        <p>يوم القراءة: <b dir="ltr">{cycle.readingDate}</b></p>
                        <p>أسبوع: <span dir="ltr">{cycle.weekStart} → {cycle.weekEnd}</span></p>
                        <p>{formatNumber(boxes.length)} طبلون · {formatNumber(total)} مشترك</p>
                    </div>
                </header>

                {boxes.map((box) => (
                    <section key={box.id} className="mb-5 break-inside-avoid">
                        <h3 className="mb-1 font-bold">
                            الطبلون {box.label} {box.subAreaName && <span className="font-normal text-gray-600">· {box.subAreaName}</span>}
                            {box.movedOffPaper && <span className="ms-2 text-xs font-semibold text-red-700 print:hidden">(نُقل من الكشوف الورقية بعد إنشاء الكشف)</span>}
                        </h3>
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="border border-gray-300 px-2 py-1 text-start">#</th>
                                    <th className="border border-gray-300 px-2 py-1 text-start">المشترك</th>
                                    <th className="border border-gray-300 px-2 py-1 text-start">رقم الاشتراك</th>
                                    <th className="border border-gray-300 px-2 py-1 text-start">القراءة السابقة</th>
                                    <th className="w-40 border border-gray-300 px-2 py-1 text-start">القراءة الحالية</th>
                                    <th className="w-32 border border-gray-300 px-2 py-1 text-start">ملاحظات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {box.subscriptions.map((subscription, index) => (
                                    <tr key={subscription.id}>
                                        <td className="border border-gray-300 px-2 py-2">{index + 1}</td>
                                        <td className="border border-gray-300 px-2 py-2">{subscription.name}</td>
                                        <td className="border border-gray-300 px-2 py-2" dir="ltr">{subscription.accountNumber}</td>
                                        <td className="border border-gray-300 px-2 py-2 font-display">{subscription.previousReading}</td>
                                        <td className="border border-gray-300 px-2 py-2" />
                                        <td className="border border-gray-300 px-2 py-2" />
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                ))}

                <footer className="mt-6 grid grid-cols-2 gap-6 text-sm">
                    <p>اسم القارئ: ............................................</p>
                    <p>التوقيع: ............................................</p>
                </footer>
            </article>
        </AuthenticatedLayout>
    );
}
