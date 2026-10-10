import { useForm, router } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { closingMoney } from '@/lib/closing';

/** Now, business time, as a datetime-local value. */
function nowForInput() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

    return now.toISOString().slice(0, 16);
}

/**
 * Handing the counted cash of an approved daily closing over to the
 * company: from the branch drawer, in transit, then received in the
 * company treasury. Transfers to the company's banks and wallets are
 * already there, so only the cash is handed over.
 */
export default function CashHandover({ closing, onOpenDaily }) {
    const form = useForm({
        amount: closing.remaining === '0.00' ? '' : closing.remaining,
        method: 'hand_delivery',
        recipient_id: closing.recipients[0]?.value ?? '',
        sent_at: nowForInput(),
        proof: null,
        notes: '',
    });

    if (closing.status !== 'approved' || closing.countedCash === null) {
        return (
            <section className="pn empty" style={{ marginTop: 16 }}>
                <div className="e">
                    <Icon name="receipt" />
                </div>
                <b>{closing.countedCash === null ? 'عُدّ النقد أولًا' : 'اعتمد الكشف أولًا'}</b>
                <p>يُسجَّل التسليم بالمبلغ المعدود بعد اعتماد كشف الإغلاق اليومي {closing.number}.</p>
                <button type="button" className="btn pr" onClick={onOpenDaily}>
                    <Icon name="list" />
                    الذهاب للإغلاق اليومي
                </button>
            </section>
        );
    }

    function submit(event) {
        event.preventDefault();
        form.post(`/closings/${closing.id}/transfers`, { preserveScroll: true, forceFormData: true, onSuccess: () => form.reset('proof', 'notes') });
    }

    const nonCash = closing.nonCashAccounts.map((account) => `${account.label} (${closingMoney(account.total)} ₪)`).join(' و');

    return (
        <>
            <div className="flow">
                <div className={`node ${Number(closing.branchCash) > 0 ? 'hot' : ''}`}>
                    <small>صندوق {closing.branchName}</small>
                    <b>{closingMoney(closing.branchCash)} ₪</b>
                    <span>{Number(closing.branchCash) > 0 ? 'جاهز للتسليم' : 'سُلّم كله'}</span>
                </div>
                <span className="arr">
                    <Icon name="arrow-left" />
                </span>
                <div className={`node ${Number(closing.inTransit) > 0 ? 'hot' : ''}`}>
                    <small>أموال قيد النقل</small>
                    <b>{closingMoney(closing.inTransit)} ₪</b>
                    <span>{Number(closing.inTransit) > 0 ? 'بانتظار تأكيد الاستلام' : '—'}</span>
                </div>
                <span className="arr">
                    <Icon name="arrow-left" />
                </span>
                <div className={`node ${Number(closing.received) > 0 ? 'got' : ''}`}>
                    <small>خزينة الشركة</small>
                    <b>{closingMoney(closing.received)} ₪</b>
                    <span>{Number(closing.received) > 0 ? 'تم الاستلام' : '—'}</span>
                </div>
            </div>

            <div className="ban inf">
                <Icon name="info" />
                <div>
                    <b>تحويل داخلي، وليس تحصيلًا جديدًا</b>
                    تحصيل المشتركين في الكشف {closing.number} يبقى {closingMoney(closing.total)} ₪.
                    {nonCash && ` ${nonCash} وردت لحسابات الشركة مباشرة وتُنسب للفرع دون قبض جديد،`} فالذي يُسلَّم هو النقد فقط.
                </div>
            </div>

            {closing.can.handOver && Number(closing.remaining) > 0 && (
                <form className="pn" style={{ marginTop: 14 }} onSubmit={submit}>
                    <h3>
                        <span className="ix">
                            <Icon name="truck" />
                        </span>
                        تسجيل تسليم نقد
                        <span className="r">مرتبط بالكشف {closing.number}</span>
                    </h3>
                    <div className="fgrid">
                        <div className="fld">
                            <label className="l" htmlFor="handover-amount">
                                المبلغ المسلَّم<small>المعدود {closingMoney(closing.countedCash)} ₪</small>
                            </label>
                            <div className="inp">
                                <input
                                    id="handover-amount"
                                    className="ltr"
                                    inputMode="decimal"
                                    value={form.data.amount}
                                    onChange={(event) => form.setData('amount', event.target.value)}
                                />
                                <span className="suf">₪</span>
                            </div>
                            {form.errors.amount && <div className="err">{form.errors.amount}</div>}
                        </div>
                        <div className="fld">
                            <label className="l" htmlFor="handover-time">
                                التاريخ والوقت
                            </label>
                            <input
                                id="handover-time"
                                type="datetime-local"
                                className="ltr"
                                value={form.data.sent_at}
                                onChange={(event) => form.setData('sent_at', event.target.value)}
                            />
                            {form.errors.sent_at && <div className="err">{form.errors.sent_at}</div>}
                        </div>
                        <div className="fld">
                            <label className="l">
                                من
                                <small>
                                    <Icon name="lock" />
                                </small>
                            </label>
                            <input disabled value={`صندوق ${closing.branchName}${closing.preparedBy ? ` · ${closing.preparedBy}` : ''}`} />
                        </div>
                        <div className="fld">
                            <label className="l" htmlFor="handover-recipient">
                                المستلم
                            </label>
                            <select
                                id="handover-recipient"
                                value={form.data.recipient_id}
                                onChange={(event) => form.setData('recipient_id', event.target.value)}
                            >
                                {closing.recipients.map((recipient) => (
                                    <option key={recipient.value} value={recipient.value}>
                                        {recipient.label}
                                    </option>
                                ))}
                            </select>
                            {form.errors.recipient_id && <div className="err">{form.errors.recipient_id}</div>}
                        </div>
                        <div className="fld full">
                            <label className="l">طريقة التسليم</label>
                            <div className="seg2">
                                {closing.methods.map((method) => (
                                    <button
                                        key={method.value}
                                        type="button"
                                        aria-pressed={form.data.method === method.value}
                                        onClick={() => form.setData('method', method.value)}
                                    >
                                        {method.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="fld full">
                            <label className="l" htmlFor="handover-proof">
                                إثبات التسليم<small>{form.data.method === 'bank_deposit' ? 'إشعار الإيداع' : 'سند استلام موقّع'}</small>
                            </label>
                            <label className={`proof ${form.data.proof ? 'has' : ''}`}>
                                <Icon name="camera" />
                                {form.data.proof ? `أُرفقت صورة الإثبات · ${form.data.proof.name} · اضغط للتغيير` : 'تصوير أو إرفاق صورة الإثبات'}
                                <input
                                    id="handover-proof"
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="sr-only"
                                    onChange={(event) => form.setData('proof', event.target.files[0] ?? null)}
                                />
                            </label>
                            {form.errors.proof && <div className="err">{form.errors.proof}</div>}
                        </div>
                        <div className="fld full">
                            <label className="l" htmlFor="handover-notes">
                                ملاحظات<small>اختياري</small>
                            </label>
                            <textarea
                                id="handover-notes"
                                placeholder="مثل: سُلّم المبلغ ناقصًا حسب فرق الكشف"
                                value={form.data.notes}
                                onChange={(event) => form.setData('notes', event.target.value)}
                            />
                        </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                        <button type="submit" className="btn pr" disabled={form.processing || !form.data.proof}>
                            <Icon name="truck" />
                            تسجيل التسليم
                        </button>
                        {!form.data.proof && (
                            <div className="note2">
                                <Icon name="info" />
                                <span>أرفق إثبات التسليم لتفعيل الحفظ.</span>
                            </div>
                        )}
                    </div>
                </form>
            )}

            {closing.transfers.map((transfer) => (
                <section key={transfer.id} className="pn" style={{ marginTop: 14 }}>
                    <h3>
                        <span className="ix">
                            <Icon name="truck" />
                        </span>
                        حركة تسليم #{transfer.id}
                        <span className="r">
                            <span
                                className={`st ${transfer.status === 'received' ? 'approved' : 'sent'}`}
                                style={{ color: transfer.status === 'received' ? 'var(--cl-success)' : 'var(--cl-warn)' }}
                            >
                                <i />
                                {transfer.statusLabel}
                            </span>
                        </span>
                    </h3>
                    <div className="rec">
                        <div>
                            <small>المبلغ</small>
                            <b className="num">{closingMoney(transfer.amount)} ₪</b>
                        </div>
                        <div>
                            <small>من</small>
                            <b>
                                صندوق {closing.branchName} · {transfer.senderName}
                            </b>
                        </div>
                        <div>
                            <small>إلى</small>
                            <b>خزينة الشركة · {transfer.recipientName}</b>
                        </div>
                        <div>
                            <small>مرتبط بالكشف</small>
                            <b className="num">{closing.number}</b>
                        </div>
                        <div>
                            <small>التاريخ</small>
                            <b className="num">{transfer.sentAt}</b>
                        </div>
                        <div>
                            <small>الطريقة</small>
                            <b>{transfer.methodLabel}</b>
                        </div>
                        <div>
                            <small>الإثبات</small>
                            <b>
                                <a
                                    href={`/cash-transfers/${transfer.id}/proof`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: 'var(--cl-success)' }}
                                >
                                    ✓ عرض الصورة
                                </a>
                            </b>
                        </div>
                        <div>
                            <small>الاستلام</small>
                            <b>{transfer.status === 'received' ? `أكّده ${transfer.receivedBy} · ${transfer.receivedAt}` : 'بانتظار التأكيد'}</b>
                        </div>
                    </div>
                    {transfer.notes && <div className="note2">{transfer.notes}</div>}
                    {transfer.canConfirm && (
                        <div style={{ marginTop: 12 }}>
                            <button
                                type="button"
                                className="btn ok2"
                                onClick={() => router.post(`/cash-transfers/${transfer.id}/receive`, {}, { preserveScroll: true })}
                            >
                                <Icon name="check" />
                                تأكيد الاستلام
                            </button>
                        </div>
                    )}
                </section>
            ))}
        </>
    );
}
