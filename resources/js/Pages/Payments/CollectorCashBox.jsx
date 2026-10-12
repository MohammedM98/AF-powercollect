import { useState } from 'react';
import { useForm } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import TextInput from '@/Components/TextInput';
import { formatMoney } from '@/lib/format';

const currencies = { ILS: 'شيكل', USD: 'دولار', JOD: 'دينار' };
const dateTime = (value) => value ? new Intl.DateTimeFormat('ar-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value)) : '—';

function CountSummary({ box }) {
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

function CashBoxAction({ box, action, onClose }) {
    const form = useForm({ branch_id: box.branchId, counts: { ILS: '', USD: '', JOD: '' }, reason: '' });
    const confirming = action === 'confirm';
    const title = confirming ? 'تأكيد تسليم صندوقي' : action === 'close' ? 'عدّ وإغلاق صندوقي' : 'عدّ صندوقي المغلق';
    const close = () => { if (!form.processing) onClose(); };

    function submit(event) {
        event.preventDefault();
        form.post(box.urls[action], { preserveScroll: true, onSuccess: onClose });
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
                ) : (
                    <>
                        <p className="rounded-control bg-brand-50 p-4 text-sm leading-7 text-gray-700">عدّ النقد الموجود فعليًا بكل عملة، واكتب صفرًا للعملة غير الموجودة. يظهر المبلغ المتوقع بعد حفظ العدّ.{action === 'close' && ' بعد الإغلاق، تُسجّل الدفعات الجديدة في صندوق جديد.'}</p>
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
                )}
                <InputError message={form.errors.action ?? form.errors.branch_id ?? form.errors.counts} />
                <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
                    <SecondaryButton type="button" onClick={close} disabled={form.processing}>إلغاء</SecondaryButton>
                    <PrimaryButton type="submit" disabled={form.processing}>{form.processing ? 'جارٍ الحفظ…' : confirming ? 'تأكيد التسليم' : action === 'close' ? 'حفظ العدّ وإغلاق الصندوق' : 'حفظ العدّ'}</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}

export default function CollectorCashBox({ cashBox, mode = 'current' }) {
    const [selected, setSelected] = useState(null);
    if (!cashBox?.started) return null;

    const open = cashBox.boxes.find((box) => box.status === 'open');
    const previous = cashBox.boxes.filter((box) => box.status !== 'open');

    function boxCard(box) {
        const needsCount = box.status === 'pending' && !box.collectorCounts;
        const needsConfirmation = box.status === 'received' && !box.confirmedAt;
        const label = box.status === 'open' ? 'مفتوح' : needsCount ? 'بانتظار عدّي' : box.status === 'pending' ? 'بانتظار الاستلام' : needsConfirmation ? 'بانتظار تأكيد التسليم' : 'مكتمل';

        return (
            <article key={box.id} className="rounded-panel border border-gray-100 bg-surface p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <b className="text-sm text-gray-900">{box.status === 'open' ? 'صندوقي المفتوح' : 'صندوقي السابق'}</b>
                        <span dir="ltr" className="mt-1 block break-all font-display text-xs text-gray-500">{box.number}</span>
                    </div>
                    <StatusPill tone={box.status === 'open' ? 'blue' : box.confirmedAt ? 'green' : 'amber'} label={label} />
                </div>
                <p className="mt-3 text-xs leading-6 text-gray-500">بدأ {dateTime(box.openedAt)}{box.closedAt && ` · أُغلق ${dateTime(box.closedAt)}`} · {box.paymentCount} دفعات</p>
                <CountSummary box={box} />
                {box.reason && <p className="mt-3 text-xs leading-6 text-gray-500">سبب فرق العدّ: {box.reason}</p>}
                {(box.status === 'open' || needsCount || needsConfirmation) && (
                    <PrimaryButton type="button" disabled={box.status === 'open' && box.paymentCount === 0} onClick={() => setSelected({ box, action: box.status === 'open' ? 'close' : needsCount ? 'collector-count' : 'confirm' })} className="mt-4">
                        <Icon name={needsConfirmation ? 'check' : 'wallet'} className="h-4 w-4" />
                        {box.status === 'open' ? 'عدّ وإغلاق صندوقي' : needsCount ? 'عدّ الصندوق' : 'تأكيد التسليم'}
                    </PrimaryButton>
                )}
            </article>
        );
    }

    return (
        <section aria-labelledby="collector-cash-box" className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-control bg-brand-50 text-brand-600"><Icon name="wallet" className="h-6 w-6" /></span>
                <div>
                    <h3 id="collector-cash-box" className="text-lg font-bold text-gray-900">{mode === 'history' ? 'صناديقي المغلقة' : 'صندوقي'} · {cashBox.branchName}</h3>
                    <p className="mt-1 text-xs leading-6 text-gray-500">{mode === 'history' ? 'راجع عدّ صناديقك وحالة استلامها، وأكّد التسليم بعد الاستلام. الموقع والتطبيق يستخدمان نفس السجل.' : 'أغلق صندوقك بعد عدّ النقد. تُسجّل الدفعات التالية في صندوق جديد، وتتابع التسليم من تبويب صناديقي.'}</p>
                </div>
            </div>
            {mode === 'current' && (open ? boxCard(open) : <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-5 text-sm text-gray-500">لا يوجد صندوق مفتوح حاليًا. يُفتح صندوقك تلقائيًا عند تسجيل أول دفعة.</p>)}
            {mode === 'history' && (
                previous.length > 0 ? <div className="grid gap-4 lg:grid-cols-2">{previous.map(boxCard)}</div> : <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-center text-sm text-gray-500">لا توجد صناديق مغلقة حتى الآن.</p>
            )}
            {selected && <CashBoxAction key={`${selected.box.id}-${selected.action}`} {...selected} onClose={() => setSelected(null)} />}
        </section>
    );
}
