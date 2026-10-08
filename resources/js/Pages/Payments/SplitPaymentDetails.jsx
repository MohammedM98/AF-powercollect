import { useEffect, useState } from 'react';
import { useHttp } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import SecondaryButton from '@/Components/SecondaryButton';
import { formatMoney } from '@/lib/format';

/** One line of the transfer's own details. */
function Detail({ label, children, ltr = false }) {
    return (
        <div>
            <dt className="text-[13px] font-semibold text-gray-500">{label}</dt>
            <dd className="mt-0.5 break-words text-[15px] font-semibold text-gray-900" dir={ltr ? 'ltr' : undefined}>
                {children || '—'}
            </dd>
        </div>
    );
}

/**
 * A split bank transfer, in one place: what was transferred and by whom, and
 * the payments on subscriptions it became, with whether together they still
 * make up the transfer (a cancelled or refunded part leaves it incomplete).
 */
export default function SplitPaymentDetails({ id, onClose }) {
    const http = useHttp();
    const [split, setSplit] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let current = true;

        http.get(`/split-payments/${id}`)
            .then((loaded) => current && setSplit(loaded))
            .catch(() => current && setFailed(true));

        return () => {
            current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    return (
        <Modal show onClose={onClose} maxWidth="2xl">
            <div role="dialog" aria-modal="true" aria-label="تفاصيل الدفعة المقسّمة" className="flex max-h-[90vh] flex-col">
                <div className="flex items-center justify-between border-b border-gray-100 px-7 py-5">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
                            <Icon name="layers" />
                        </span>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">دفعة مقسّمة على عدة مشتركين</h3>
                            {split && <p className="text-[13px] text-gray-500">تحويل بنكي واحد وُزّع على {split.partsCount} اشتراكات</p>}
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900">
                        <Icon name="close" />
                    </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
                    {failed && <p className="py-8 text-center text-sm text-brand-600">تعذّر تحميل تفاصيل الدفعة.</p>}
                    {!split && !failed && <p className="py-8 text-center text-sm text-gray-500">جارٍ التحميل…</p>}

                    {split && (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-gray-100 bg-gray-50 px-5 py-4">
                                <div>
                                    <p className="text-[13px] font-semibold text-gray-500">المبلغ المحوَّل</p>
                                    <p className="font-display text-3xl font-bold text-gray-900">{formatMoney(split.total)} ₪</p>
                                </div>
                                {split.isComplete ? (
                                    <p className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                        <Icon name="check" className="h-4 w-4" />
                                        الأجزاء كاملة = {formatMoney(split.standingTotal)} ₪
                                    </p>
                                ) : (
                                    <p className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3.5 py-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
                                        <Icon name="warning" className="h-4 w-4" />
                                        ناقصة: القائم {formatMoney(split.standingTotal)} من {formatMoney(split.total)} ₪
                                    </p>
                                )}
                            </div>

                            <dl className="grid gap-4 sm:grid-cols-2">
                                <Detail label="البنك المستلم">{split.bankName}</Detail>
                                <Detail label="اسم المحوِّل">{split.senderName}</Detail>
                                <Detail label="الرقم المرجعي" ltr>
                                    {split.referenceNumber}
                                </Detail>
                                <Detail label="سجّلها">
                                    {split.recordedByName}
                                    <span className="mx-1.5 font-normal text-gray-400">·</span>
                                    <span dir="ltr" className="font-display font-normal text-gray-600">
                                        {split.date} {split.time}
                                    </span>
                                </Detail>
                            </dl>

                            <div>
                                <p className="mb-2 text-[14.5px] font-semibold text-gray-700">الأجزاء</p>
                                <ul className="divide-y divide-gray-100 overflow-hidden rounded-[18px] border border-gray-100">
                                    {split.parts.map((part, index) => (
                                        <li key={part.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm ${part.isCancelled ? 'bg-gray-50 text-gray-400' : 'bg-surface'}`}>
                                            <span className="w-5 font-display text-xs text-gray-400">{index + 1}</span>
                                            <span className="min-w-0 flex-1 basis-44">
                                                <b className={part.isCancelled ? 'line-through' : 'text-gray-900'}>{part.subscriptionName}</b>
                                                <span dir="ltr" className="mx-2 font-display text-xs">
                                                    {part.accountNumber}
                                                </span>
                                            </span>
                                            {part.isCancelled && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">{part.cancellationLabel ?? 'ملغاة'}</span>}
                                            <b className={`font-display text-base ${part.isCancelled ? 'line-through' : 'text-gray-900'}`}>{formatMoney(part.amount)} ₪</b>
                                            {part.receiptUrl && (
                                                <a
                                                    href={part.receiptUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1.5 rounded-control border border-gray-200 bg-surface px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:text-gray-900"
                                                >
                                                    <Icon name="printer" className="h-3.5 w-3.5" />
                                                    السند
                                                </a>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                {split.hiddenPartsCount > 0 && (
                                    <p className="mt-2 text-[13px] text-gray-500">
                                        و{split.hiddenPartsCount} {split.hiddenPartsCount === 1 ? 'جزء آخر' : 'أجزاء أخرى'} على اشتراكات فروع أخرى بقيمة {formatMoney(split.hiddenPartsAmount)} ₪.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-end border-t border-gray-100 bg-gray-50 px-7 py-4">
                    <SecondaryButton onClick={onClose}>إغلاق</SecondaryButton>
                </div>
            </div>
        </Modal>
    );
}
