import { Link, useForm } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import InputError from '@/Components/InputError';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import { formatMoney } from '@/lib/format';

export const currencies = { ILS: 'شيكل', USD: 'دولار', JOD: 'دينار' };
export const boxTypes = { cash: 'الصندوق النقدي', bank_transfer: 'صندوق الحوالات البنكية', clearing: 'صندوق المقاصات' };
export const dateTime = (value) => value ? new Intl.DateTimeFormat('ar-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value)) : '—';
const stages = { open: 'مفتوح', awaiting_branch: 'مغلق – بانتظار استلام الفرع', awaiting_confirmation: 'استُلم – أكّد التسليم', completed: 'مكتمل' };

export function BoxStage({ box }) {
    return <div className="flex flex-wrap gap-2"><StatusPill tone={box.stage === 'open' ? 'blue' : box.stage === 'completed' ? 'green' : 'amber'} label={stages[box.stage]} />{box.rejectedCount > 0 && <StatusPill tone="red" label={`حركات مرفوضة: ${box.rejectedCount}`} />}</div>;
}

export function boxAction(box) {
    return box.stage === 'awaiting_confirmation' ? 'confirm' : null;
}

export function actionLabel() {
    return 'تأكيد التسليم';
}

export function BoxTotals({ box }) {
    return <div className="flex flex-wrap gap-4 font-display text-sm text-gray-700">{Object.entries(currencies).filter(([currency]) => box.type === 'cash' || currency === 'ILS').map(([currency, label]) => <span key={currency}>{label}: <b dir="ltr">{formatMoney(box.totals?.[currency] ?? 0)}</b></span>)}</div>;
}

export function CountSummary({ box }) {
    if (!box.collectorCounts) return null;

    return (
        <div className="mt-4 overflow-x-auto rounded-control border border-gray-100">
            <table className="w-full text-start text-xs">
                <thead className="bg-gray-50 text-gray-500">
                    <tr>{['العملة', 'عدّي', 'المتوقع', 'عدّ المستلم'].map((label) => <th key={label} className="whitespace-nowrap p-3 text-start">{label}</th>)}</tr>
                </thead>
                <tbody>
                    {Object.entries(currencies).map(([currency, label]) => (
                        <tr key={currency} className="border-t border-gray-100 text-gray-700">
                            <td className="p-3">{label}</td>
                            <td dir="ltr" className="p-3 font-display">{formatMoney(box.collectorCounts[currency])}</td>
                            <td dir="ltr" className="p-3 font-display">{formatMoney(box.expectedCounts?.[currency])}</td>
                            <td dir="ltr" className="p-3 font-display">{box.receivedCounts ? formatMoney(box.receivedCounts[currency]) : '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * The collector's one action on a box: confirming the handover after the
 * branch counted and received their cash box. Closing, counting and
 * receiving belong to the branch.
 */
export function CashBoxAction({ box, onClose, onSuccess }) {
    const form = useForm({ branch_id: box.branchId });
    const close = () => { if (!form.processing) onClose(); };

    function submit(event) {
        event.preventDefault();
        form.post(box.urls.confirm, { preserveScroll: true, onSuccess: () => { onSuccess?.(); onClose(); } });
    }

    return (
        <Modal show onClose={close} centered maxWidth="lg">
            <form onSubmit={submit} className="space-y-5 p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">تأكيد تسليم صندوقي</h3>
                        <p dir="ltr" className="mt-1 text-start font-display text-xs text-gray-500">{box.number}</p>
                    </div>
                    <button type="button" onClick={close} disabled={form.processing} aria-label="إغلاق" className="rounded-control p-2 text-gray-500 hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button>
                </div>
                <div>
                    <p className="text-sm leading-7 text-gray-600">عدّ الفرع الصندوق واستلمه بتاريخ {dateTime(box.receivedAt)}. راجع العدّ أدناه، ثم أكّد أنك سلّمت الصندوق.</p>
                    <CountSummary box={box} />
                </div>
                <InputError message={form.errors.action ?? form.errors.branch_id} />
                <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
                    <SecondaryButton type="button" onClick={close} disabled={form.processing}>إلغاء</SecondaryButton>
                    <PrimaryButton type="submit" disabled={form.processing}>{form.processing ? 'جارٍ الحفظ…' : 'تأكيد التسليم'}</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}

export function BoxCard({ box, type }) {
    return <article className="flex flex-col gap-4 rounded-panel border border-gray-100 bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-gray-900">{boxTypes[type]}</h3><StatusPill tone={box ? 'blue' : 'gray'} label={box ? 'مفتوح' : 'لا حركات'} /></div>
        <BoxTotals box={box ?? { type, totals: {} }} />
        <p className="text-xs leading-6 text-gray-500">{box ? `${box.paymentCount} حركات · فُتح ${dateTime(box.openedAt)} · يغلقه الفرع عند العدّ أو عند القطع` : 'يُفتح تلقائيًا عند تسجيل أول حركة.'}</p>
        {box && <div className="mt-auto flex flex-wrap gap-2"><Link href={box.urls.show} prefetch className="inline-flex items-center rounded-control border border-gray-200 px-3 py-2 text-sm text-gray-700">عرض الحركات</Link></div>}
    </article>;
}

export default function CollectorCashBox({ cashBox }) {
    if (!cashBox?.started) return null;

    return <section className="mb-6 space-y-4" aria-label="صناديقي المفتوحة">
        <div className="grid gap-4 lg:grid-cols-3">{Object.keys(boxTypes).map((type) => <BoxCard key={type} type={type} box={cashBox.current[type]} />)}</div>
    </section>;
}
