import { useState } from 'react';
import { Link, useForm } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import TextInput from '@/Components/TextInput';
import { formatMoney } from '@/lib/format';

export const currencies = { ILS: 'شيكل', USD: 'دولار', JOD: 'دينار' };
export const boxTypes = { cash: 'الصندوق النقدي', bank_transfer: 'صندوق الحوالات البنكية', clearing: 'صندوق المقاصات' };
export const dateTime = (value) => value ? new Intl.DateTimeFormat('ar-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value)) : '—';
const stages = { open: 'مفتوح', awaiting_collector: 'أُغلق تلقائيًا – بانتظار عدّك/مراجعتك', sent: 'مُرسل – بانتظار الاستلام', awaiting_confirmation: 'استُلم – أكّد التسليم', completed: 'مكتمل' };

export function BoxStage({ box }) {
    return <div className="flex flex-wrap gap-2"><StatusPill tone={box.stage === 'open' ? 'blue' : box.stage === 'completed' ? 'green' : 'amber'} label={stages[box.stage]} />{box.rejectedCount > 0 && <StatusPill tone="red" label={`حركات مرفوضة: ${box.rejectedCount}`} />}</div>;
}

export function boxAction(box) {
    return box.stage === 'open' ? 'close' : box.stage === 'awaiting_collector' ? 'collector-count' : box.stage === 'awaiting_confirmation' ? 'confirm' : null;
}

export function actionLabel(box) {
    return box.stage === 'awaiting_confirmation' ? 'تأكيد التسليم' : box.type === 'cash' ? 'عدّ وإغلاق وإرسال' : 'مراجعة وإغلاق وإرسال';
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

export function CashBoxAction({ box, action, onClose, onSuccess }) {
    const form = useForm({ branch_id: box.branchId, counts: { ILS: '', USD: '', JOD: '' }, reason: '', reviewed: false });
    const confirming = action === 'confirm';
    const counted = box.type === 'cash';
    const title = confirming ? 'تأكيد تسليم صندوقي' : counted ? 'عدّ وإغلاق وإرسال الصندوق النقدي' : `مراجعة وإغلاق وإرسال ${boxTypes[box.type]}`;
    const close = () => { if (!form.processing) onClose(); };

    function submit(event) {
        event.preventDefault();
        form.transform((data) => confirming ? { branch_id: data.branch_id } : counted ? { branch_id: data.branch_id, counts: data.counts, reason: data.reason } : { branch_id: data.branch_id, reviewed: data.reviewed });
        form.post(box.urls[action], { preserveScroll: true, onSuccess: () => { onSuccess?.(); onClose(); } });
    }

    return (
        <Modal show onClose={close} centered maxWidth="lg">
            <form onSubmit={submit} className="space-y-5 p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
                        <p dir="ltr" className="mt-1 text-start font-display text-xs text-gray-500">{box.number}</p>
                    </div>
                    <button type="button" onClick={close} disabled={form.processing} aria-label="إغلاق" className="rounded-control p-2 text-gray-500 hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button>
                </div>

                {confirming ? (
                    <div>
                        <p className="text-sm leading-7 text-gray-600">استُلم الصندوق بتاريخ {dateTime(box.receivedAt)}. راجع العدّ أدناه، ثم أكّد أنك سلّمت الصندوق.</p>
                        <CountSummary box={box} />
                    </div>
                ) : counted ? (
                    <>
                        <p className="rounded-control bg-brand-50 p-4 text-sm leading-7 text-gray-700">عدّ النقد الموجود فعليًا بكل عملة، واكتب صفرًا للعملة غير الموجودة.{action === 'close' && ' بعد الإغلاق، تُسجّل الدفعات الجديدة في صندوق جديد.'}</p>
                        <BoxTotals box={box} />
                        <div className="grid gap-4 sm:grid-cols-3">
                            {Object.entries(currencies).map(([currency, label], index) => (
                                <div key={currency} className="space-y-2">
                                    <InputLabel htmlFor={`cash-box-${currency}`} value={label} />
                                    <TextInput id={`cash-box-${currency}`} type="number" dir="ltr" min="0" max="9999999999" step="0.01" inputMode="decimal" required autoFocus={index === 0} value={form.data.counts[currency]} onChange={(event) => form.setData('counts', { ...form.data.counts, [currency]: event.target.value })} className="w-full" />
                                    <InputError message={form.errors[`counts.${currency}`]} />
                                </div>
                            ))}
                        </div>
                        <div className="space-y-2">
                            <InputLabel htmlFor="cash-box-reason" value="سبب فرق العدّ (إن وجد)" />
                            <textarea id="cash-box-reason" maxLength={3000} rows={3} value={form.data.reason} onChange={(event) => form.setData('reason', event.target.value)} className="w-full" />
                            <InputError message={form.errors.reason} />
                        </div>
                    </>
                ) : <div className="space-y-4"><p className="text-sm text-gray-600">{box.paymentCount} حركات · راجع القائمة قبل إرسالها إلى الفرع.</p><BoxTotals box={box} /><Link href={box.urls.show} prefetch className="block text-sm font-semibold text-brand-600">عرض الحركات</Link><label className="flex items-center gap-2 text-sm text-gray-700"><input required type="checkbox" checked={form.data.reviewed} onChange={(event) => form.setData('reviewed', event.target.checked)} />راجعت قائمة الحركات وهي مطابقة</label><InputError message={form.errors.reviewed} /></div>}
                <InputError message={form.errors.action ?? form.errors.branch_id ?? form.errors.counts} />
                <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
                    <SecondaryButton type="button" onClick={close} disabled={form.processing}>إلغاء</SecondaryButton>
                    <PrimaryButton type="submit" disabled={form.processing || (!confirming && !counted && !form.data.reviewed)}>{form.processing ? 'جارٍ الحفظ…' : confirming ? 'تأكيد التسليم' : 'إرسال الصندوق إلى الفرع'}</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}

export function BoxCard({ box, type, onAction }) {
    return <article className="flex flex-col gap-4 rounded-panel border border-gray-100 bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-gray-900">{boxTypes[type]}</h3><StatusPill tone={box ? 'blue' : 'gray'} label={box ? 'مفتوح' : 'لا حركات'} /></div>
        <BoxTotals box={box ?? { type, totals: {} }} />
        <p className="text-xs leading-6 text-gray-500">{box ? `${box.paymentCount} حركات · فُتح ${dateTime(box.openedAt)}` : 'يُفتح تلقائيًا عند تسجيل أول حركة.'}</p>
        {box && <div className="mt-auto flex flex-wrap gap-2"><Link href={box.urls.show} prefetch className="inline-flex items-center rounded-control border border-gray-200 px-3 py-2 text-sm text-gray-700">عرض الحركات</Link><PrimaryButton disabled={box.paymentCount === 0} onClick={() => onAction({ box, action: 'close' })}>{actionLabel(box)}</PrimaryButton></div>}
    </article>;
}

export default function CollectorCashBox({ cashBox }) {
    const [selected, setSelected] = useState(null);
    const [sent, setSent] = useState(false);
    if (!cashBox?.started) return null;

    return <section className="mb-6 space-y-4" aria-label="صناديقي المفتوحة">
        {sent && <p role="status" className="rounded-control bg-emerald-500/10 p-4 text-sm text-emerald-700">تم إرسال الصندوق إلى الفرع.</p>}
        <div className="grid gap-4 lg:grid-cols-3">{Object.keys(boxTypes).map((type) => <BoxCard key={type} type={type} box={cashBox.current[type]} onAction={(selection) => { setSent(false); setSelected(selection); }} />)}</div>
        {selected && <CashBoxAction key={`${selected.box.id}-${selected.action}`} {...selected} onClose={() => setSelected(null)} onSuccess={() => setSent(true)} />}
    </section>;
}
