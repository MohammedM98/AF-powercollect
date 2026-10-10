import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import { weekDayName } from '@/lib/weekDays';
import SplitPaymentBadge from '@/Pages/Payments/SplitPaymentBadge';
import { cashCheck, closingMoney, closingSteps, countedCash, hasCount, paymentsCount, shortDate, statusClass } from '@/lib/closing';

/** Each bank or e-wallet's logo; one not listed gets the bank icon. */
export const BANK_LOGOS = {
    'بنك فلسطين': '/images/banks/bank-of-palestine.webp',
    'جوال باي': '/images/banks/jawwal-pay.webp',
    'محفظة بالباي': '/images/banks/palpay.webp',
};

const EVENT_TONES = { approved: 'g', submitted: 'b', counted: 'b', returned: 'r', unconfirmed: 'w', received: 'g', handed_over: 'w' };

function AccountLogo({ account }) {
    if (account === 'cash') {
        return <Icon name="banknotes" />;
    }

    return BANK_LOGOS[account] ? <img src={BANK_LOGOS[account]} alt="" /> : <Icon name="bank" />;
}

/**
 * One branch's day: its payments, each account's subtotal, the cash count
 * and the transfers' check against their accounts, then the review —
 * sent by whoever prepares it, returned or approved by a reviewer.
 */
export default function DailyClosing({ closing, differenceReasons, cashNotes, cashCoins, userId, onHandOver }) {
    const { errors } = usePage().props;
    const editable = ['draft', 'returned'].includes(closing.status) && closing.can.prepare;
    const [denominations, setDenominations] = useState(() => ({ ...closing.denominations }));
    const [reason, setReason] = useState(closing.differenceReason ?? '');
    const [notes, setNotes] = useState(closing.differenceNotes ?? '');
    const [busy, setBusy] = useState(false);
    const [returning, setReturning] = useState(false);
    const [returnReason, setReturnReason] = useState('');
    const counted = hasCount(denominations) || closing.cash.counted !== null ? countedCash(denominations) : null;
    const check = counted === null ? null : cashCheck(counted, closing.cash.expected);
    const pendingTransfers = closing.lines.filter((line) => line.matchStatus === 'pending').length;
    const steps = closingSteps(closing.status);
    const checks = [
        { label: 'عدّ النقد', done: counted !== null },
        { label: 'توثيق الفروق', done: check !== null && (check.difference === 0 || (reason !== '' && notes.trim() !== '')) },
        { label: 'مطابقة البنوك والمحافظ', done: pendingTransfers === 0 },
    ];
    const countChanged =
        JSON.stringify(cleanCount(denominations)) !== JSON.stringify(cleanCount(closing.denominations)) ||
        reason !== (closing.differenceReason ?? '') ||
        notes !== (closing.differenceNotes ?? '');
    const options = { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false) };

    function saveCount(then) {
        router.put(
            `/closings/${closing.id}/count`,
            {
                denominations: cleanCount(denominations),
                difference_reason: check?.difference === 0 ? null : reason || null,
                difference_notes: check?.difference === 0 ? null : notes || null,
            },
            { ...options, onSuccess: () => then?.() },
        );
    }

    function submit() {
        const send = () => router.post(`/closings/${closing.id}/submit`, {}, options);

        countChanged ? saveCount(send) : send();
    }

    function match(line, status) {
        router.put(`/closings/${closing.id}/lines/${line.id}`, { status }, options);
    }

    function sendBack(event) {
        event.preventDefault();
        router.post(`/closings/${closing.id}/return`, { reason: returnReason }, { ...options, onSuccess: () => setReturning(false) });
    }

    return (
        <>
            <section className="hero">
                <div>
                    <small className="k">كشف إغلاق يومي</small>
                    <h2>
                        رقم <span className="no">{closing.number}</span>
                    </h2>
                    <div className="meta">
                        {closing.branchName} · {weekDayName(closing.day)} <b>{shortDate(closing.day, true)}</b>
                        {closing.preparedBy && ` · أعدّه ${closing.preparedBy}`}
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <span className={`st ${statusClass(closing.status)}`}>
                            <i />
                            {closing.statusLabel}
                        </span>
                    </div>
                </div>
                <div className="steps" aria-label="مراحل الكشف">
                    {steps.map((step, index) => (
                        <div key={step.label} className={`stp ${step.state}`}>
                            <span className="c">
                                {step.state === 'done' ? <Icon name="check" /> : step.state === 'bad' ? <Icon name="undo" /> : index + 1}
                            </span>
                            <span>{step.label}</span>
                        </div>
                    ))}
                </div>
                <div className="tot">
                    <span>إجمالي التحصيل المؤكد</span>
                    <b>{closingMoney(closing.total)} ₪</b>
                    <span>{paymentsCount(closing.lines.length)} مؤكدة · تفاصيل كل دفعة أدناه</span>
                    {closing.unconfirmed.length > 0 && (
                        <span className="pend">
                            {closing.unconfirmed.length} إيصال معلّق ({closing.unconfirmedTotal} ₪) خارج الإجمالي
                        </span>
                    )}
                </div>
            </section>

            <StatusBanner closing={closing} userId={userId} />

            <div className="accs">
                {closing.accounts.map((account) => (
                    <div key={account.key} className="ac">
                        <div className="hd">
                            <span className="lg">
                                <AccountLogo account={account.key} />
                            </span>
                            <div>
                                <b>{account.label}</b>
                                <small>{paymentsCount(account.count)}</small>
                            </div>
                        </div>
                        <div className="am">
                            {closingMoney(account.total)}
                            <em>₪</em>
                        </div>
                        <AccountState account={account} check={check} />
                    </div>
                ))}
                {closing.unconfirmed.length > 0 && (
                    <div className="ac pend">
                        <div className="hd">
                            <span className="lg">
                                <Icon name="clock" />
                            </span>
                            <div>
                                <b>معلّق</b>
                                <small>غير مؤكد، خارج الإجمالي</small>
                            </div>
                        </div>
                        <div className="am" style={{ color: 'var(--cl-warn)' }}>
                            {closingMoney(closing.unconfirmedTotal)}
                            <em>₪</em>
                        </div>
                        <span className="ms n">{closing.unconfirmed.length} إيصال</span>
                    </div>
                )}
            </div>

            <div className="g2">
                <div>
                    <section className="pn">
                        <h3>
                            <span className="ix">
                                <Icon name="list" />
                            </span>
                            دفعات الكشف
                            <span className="r">كل دفعة تبقى بهويتها ومشتركها وسندها</span>
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="pt">
                                <thead>
                                    <tr>
                                        <th>الدفعة</th>
                                        <th>المشترك</th>
                                        <th>الحساب المستلم</th>
                                        <th>الموظف</th>
                                        <th>المرجع</th>
                                        <th>المبلغ</th>
                                        <th>المطابقة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {closing.lines.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                                                لا دفعات في هذا اليوم.
                                            </td>
                                        </tr>
                                    )}
                                    {closing.lines.map((line) => (
                                        <tr key={line.id}>
                                            <td className="c-id">
                                                <span className="pid">
                                                    <b>#{line.paymentId}</b>
                                                    {line.voucherNumber && <small>سند {line.voucherNumber}</small>}
                                                </span>
                                            </td>
                                            <td className="c-sub">
                                                <span className="psub">
                                                    <b>{line.subscriptionName}</b>
                                                    {line.meterBoxNumber && <small>الطبلون {line.meterBoxNumber}</small>}
                                                </span>
                                            </td>
                                            <td className="c-acc">
                                                <span className="pacc">
                                                    {line.account === 'cash' ? (
                                                        <span className="ci">
                                                            <Icon name="banknotes" />
                                                        </span>
                                                    ) : BANK_LOGOS[line.account] ? (
                                                        <img src={BANK_LOGOS[line.account]} alt="" />
                                                    ) : (
                                                        <span className="ci">
                                                            <Icon name="bank" />
                                                        </span>
                                                    )}
                                                    {line.accountLabel}
                                                </span>
                                            </td>
                                            <td className="c-by">
                                                <span className="psub">
                                                    <b style={{ fontWeight: 500 }}>{line.recordedBy ?? '—'}</b>
                                                    <small className="num">{line.time}</small>
                                                </span>
                                            </td>
                                            <td className="c-ref">
                                                {line.reference ? <span className="pref">{line.reference}</span> : <span className="muted">—</span>}
                                                {line.splitPayment && <div><SplitPaymentBadge split={line.splitPayment} /></div>}
                                            </td>
                                            <td className="c-am">
                                                <span className="pam">{closingMoney(line.amount)} ₪</span>
                                            </td>
                                            <td className="c-mt">
                                                {line.matchStatus === null ? (
                                                    <button type="button" className="mt cash" disabled>
                                                        <Icon name="banknotes" />
                                                        يُطابق بالعدّ
                                                    </button>
                                                ) : (
                                                    <div style={{ display: 'grid', justifyItems: 'start', gap: 2 }}>
                                                        <button
                                                            type="button"
                                                            className="mt"
                                                            aria-pressed={line.matchStatus === 'matched'}
                                                            disabled={!editable || busy}
                                                            onClick={() => match(line, line.matchStatus === 'matched' ? 'pending' : 'matched')}
                                                        >
                                                            <Icon name="check" />
                                                            {line.matchStatus === 'matched' ? 'مطابق' : 'طابِق'}
                                                        </button>
                                                        {editable && line.matchStatus !== 'matched' && (
                                                            <button
                                                                type="button"
                                                                className="mv"
                                                                disabled={busy}
                                                                onClick={() => match(line, 'unconfirmed')}
                                                            >
                                                                غير موجود في الحساب؟
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td className="x" />
                                        <td>الإجمالي</td>
                                        <td className="x" />
                                        <td className="x" />
                                        <td className="x" />
                                        <td>
                                            <span className="pam">{closingMoney(closing.total)} ₪</span>
                                        </td>
                                        <td className="x" />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {closing.unconfirmed.length > 0 && (
                            <div className="pendl">
                                <h4>
                                    <Icon name="clock" />
                                    إيصالات معلّقة
                                    <span>منفصلة عن التحصيل المؤكد</span>
                                </h4>
                                {closing.unconfirmed.map((line) => (
                                    <div key={line.id} className="it">
                                        <span className="pacc">
                                            {BANK_LOGOS[line.account] ? <img src={BANK_LOGOS[line.account]} alt="" /> : <Icon name="bank" />}
                                        </span>
                                        <div>
                                            <b>
                                                #{line.paymentId} · {line.subscriptionName}
                                            </b>
                                            <span className="why">إيصال غير مؤكد: لم يظهر في حركة {line.accountLabel} بعد</span>
                                        </div>
                                        <span className="pam">{closingMoney(line.amount)} ₪</span>
                                        {editable && (
                                            <button type="button" className="mt" disabled={busy} onClick={() => match(line, 'pending')}>
                                                إرجاع للكشف
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="note2">
                            <Icon name="info" />
                            <span>رقم الكشف يجمع الدفعات للمراجعة ولا ينشئ دفعات جديدة. كل دفعة تُدرج في كشف إغلاق يومي واحد فقط.</span>
                        </div>
                    </section>
                </div>

                <div>
                    <section className="pn">
                        <h3>
                            <span className="ix">
                                <Icon name="receipt" />
                            </span>
                            مطابقة الصندوق النقدي
                            <span className="r">بالشيكل</span>
                        </h3>
                        <div className="formula">
                            <div className="row">
                                <span>رصيد البداية</span>
                                <b>{closingMoney(closing.cash.opening)}</b>
                            </div>
                            <div className="row">
                                <span>+ المقبوضات النقدية</span>
                                <b>{closingMoney(closing.cash.receipts)}</b>
                            </div>
                            <div className="row">
                                <span>− المصروفات والرديات النقدية</span>
                                <b>{closingMoney(closing.cash.expenses)}</b>
                            </div>
                            {closing.cashRefunds.map((refund) => (
                                <div key={refund.id} className="row sub">
                                    <span>
                                        إرجاع دفعة{refund.voucherNumber ? ` · سند ${refund.voucherNumber}` : ''} · {refund.subscriptionName} · {refund.time}
                                    </span>
                                    <b>{closingMoney(refund.amount)}</b>
                                </div>
                            ))}
                            <div className="row">
                                <span>− التسليمات للخزينة</span>
                                <b>{closingMoney(closing.cash.handedOver)}</b>
                            </div>
                            <div className="row t">
                                <span>الرصيد المتوقع</span>
                                <b>{closingMoney(closing.cash.expected)}</b>
                            </div>
                        </div>

                        <div className="den">
                            {[...cashNotes.map((value) => [value, 'ورقة']), ...cashCoins.map((value) => [value, 'عملة'])].map(([value, kind]) => (
                                <label key={value} className={kind === 'عملة' ? 'coin' : ''}>
                                    {kind}
                                    <span className="v">
                                        <em>{value}</em>
                                        <input
                                            type="number"
                                            min="0"
                                            inputMode="numeric"
                                            aria-label={`عدد فئة ${value}`}
                                            value={denominations[value] ?? ''}
                                            placeholder="0"
                                            disabled={!editable}
                                            onChange={(event) => setDenominations({ ...denominations, [value]: event.target.value })}
                                        />
                                    </span>
                                </label>
                            ))}
                            <label className="coin">
                                كسور
                                <span className="v">
                                    <em>أغورة</em>
                                    <input
                                        type="number"
                                        min="0"
                                        max="99"
                                        inputMode="numeric"
                                        aria-label="عدد الأغورات"
                                        value={denominations.agorot ?? ''}
                                        placeholder="0"
                                        disabled={!editable}
                                        onChange={(event) => setDenominations({ ...denominations, agorot: event.target.value })}
                                    />
                                </span>
                            </label>
                        </div>

                        <div className={`cnt ${check?.tone ?? ''}`}>
                            <span>النقد المعدود</span>
                            <div>
                                <b>{counted === null ? '—' : closingMoney(counted)}</b>
                                {check && <span className="d">{check.label}</span>}
                            </div>
                        </div>

                        {check && check.difference !== 0 && (
                            <div className={`reason ${editable ? 'ed' : ''} ${editable && (!reason || !notes.trim()) ? 'req' : ''}`}>
                                <span className="lab">
                                    <Icon name="note" /> {editable ? 'سبب الفرق مطلوب قبل الإرسال' : 'سبب الفرق المسجّل'}
                                </span>
                                {editable && (
                                    <div className="chips">
                                        {differenceReasons.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                aria-pressed={reason === option.value}
                                                onClick={() => setReason(option.value)}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <textarea
                                    aria-label="سبب الفرق"
                                    placeholder="اشرح الفرق ومن المسؤول عن متابعته"
                                    value={notes}
                                    readOnly={!editable}
                                    onChange={(event) => setNotes(event.target.value)}
                                />
                            </div>
                        )}
                    </section>

                    <section className="pn">
                        <h3>
                            <span className="ix">
                                <Icon name="history" />
                            </span>
                            سجل الكشف
                        </h3>
                        <ul className="tml">
                            {closing.events.map((event) => (
                                <li key={event.id} className={EVENT_TONES[event.action] ?? ''}>
                                    <b>{event.description}</b>
                                    <small>
                                        {event.by} · <span className="num">{event.at}</span>
                                    </small>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </div>

            <div className="abar">
                {editable && (
                    <div className="chk">
                        {checks.map((item) => (
                            <span key={item.label} className={item.done ? 'on' : ''}>
                                <i>
                                    <Icon name="check" />
                                </i>
                                {item.label}
                            </span>
                        ))}
                    </div>
                )}
                {closing.status === 'approved' && (
                    <span className="wait" style={{ color: 'var(--cl-success)' }}>
                        <Icon name="lock" />
                        الكشف {closing.number} معتمد
                    </span>
                )}
                {errors.closing && (
                    <span className="wait" role="alert" style={{ color: 'var(--cl-danger)' }}>
                        <Icon name="alert" />
                        {errors.closing}
                    </span>
                )}
                <div className="sp">
                    {editable && (
                        <>
                            <button type="button" className="btn" disabled={busy || !countChanged || counted === null} onClick={() => saveCount()}>
                                حفظ المسودة
                            </button>
                            <button type="button" className="btn pr" disabled={busy || checks.some((item) => !item.done)} onClick={submit}>
                                <Icon name="send" />
                                {closing.status === 'returned' ? 'إعادة الإرسال للتدقيق' : 'إرسال للتدقيق'}
                            </button>
                        </>
                    )}
                    {closing.status === 'submitted' && closing.can.audit && (
                        <>
                            <button type="button" className="btn dg" disabled={busy} onClick={() => setReturning(true)}>
                                <Icon name="undo" />
                                إرجاع مع السبب
                            </button>
                            <button
                                type="button"
                                className="btn ok2"
                                disabled={busy || !closing.can.approve}
                                title={closing.can.approve ? undefined : 'أعددت هذا الكشف، فيعتمده مدقق آخر'}
                                onClick={() => router.post(`/closings/${closing.id}/approve`, {}, options)}
                            >
                                <Icon name="check" />
                                اعتماد الكشف
                            </button>
                        </>
                    )}
                    {closing.status === 'submitted' && !closing.can.audit && (
                        <span className="wait">
                            <Icon name="clock" />
                            بانتظار المدقق
                        </span>
                    )}
                    {['draft', 'returned'].includes(closing.status) && !closing.can.prepare && (
                        <span className="wait">
                            <Icon name="clock" />
                            بانتظار المحاسب
                        </span>
                    )}
                    {closing.status === 'approved' && (
                        <>
                            <button type="button" className="btn" onClick={() => window.print()}>
                                <Icon name="printer" />
                                طباعة الكشف
                            </button>
                            {closing.can.handOver && Number(closing.countedCash) > 0 && (
                                <button type="button" className="btn pr" onClick={onHandOver}>
                                    <Icon name="truck" />
                                    تسليم النقد للشركة
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {returning && (
                <div
                    className="mdl"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="return-title"
                    onClick={(event) => event.target === event.currentTarget && setReturning(false)}
                >
                    <form className="bx" onSubmit={sendBack}>
                        <div className="ic" style={{ background: 'var(--cl-danger-t)', color: 'var(--cl-danger)' }}>
                            <Icon name="undo" />
                        </div>
                        <h4 id="return-title">إرجاع الكشف {closing.number} للتصحيح</h4>
                        <p>اكتب ما يجب على المحاسب تصحيحه؛ يظهر له في الكشف وفي سجله.</p>
                        <div className="reason ed" style={{ marginTop: 12 }}>
                            <textarea
                                autoFocus
                                aria-label="سبب الإرجاع"
                                value={returnReason}
                                onChange={(event) => setReturnReason(event.target.value)}
                            />
                        </div>
                        {errors.reason && <div className="err">{errors.reason}</div>}
                        <div className="ft">
                            <button type="button" className="btn" onClick={() => setReturning(false)}>
                                إلغاء
                            </button>
                            <button type="submit" className="btn dg" disabled={busy || !returnReason.trim()}>
                                <Icon name="undo" />
                                إرجاع مع السبب
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}

function cleanCount(denominations) {
    return Object.fromEntries(
        Object.entries(denominations ?? {})
            .filter(([, count]) => Number(count) > 0)
            .map(([value, count]) => [value, Number(count)])
            // Notes and coins from the largest down, the agorot (not a face value) last.
            .sort(([a], [b]) => (a === 'agorot') - (b === 'agorot') || Number(b) - Number(a)),
    );
}

function AccountState({ account, check }) {
    if (account.key === 'cash') {
        if (!check) {
            return (
                <span className="ms bad">
                    <Icon name="receipt" />
                    لم يُعدّ بعد
                </span>
            );
        }

        return check.difference === 0 ? (
            <span className="ms ok">
                <Icon name="check" />
                المعدود مطابق
            </span>
        ) : (
            <span className="ms bad">
                <Icon name="alert" />
                {check.label}
            </span>
        );
    }

    return account.pending > 0 ? (
        <span className="ms no">
            <Icon name="clock" />
            {account.pending} بانتظار المطابقة
        </span>
    ) : (
        <span className="ms ok">
            <Icon name="check" />
            مطابق مع الحساب
        </span>
    );
}

function StatusBanner({ closing, userId }) {
    if (closing.status === 'returned') {
        return (
            <div className="ban bad">
                <Icon name="undo" />
                <div>
                    <b>أعاد {closing.reviewedBy ?? 'المدقق'} الكشف للتصحيح</b>
                    {closing.returnReason}
                    <br />
                    {closing.can.prepare ? 'صحّح ثم أعد المطابقة والإرسال.' : 'الكشف الآن عند المحاسب.'}
                </div>
            </div>
        );
    }

    if (closing.status === 'submitted') {
        return closing.can.audit ? (
            <div className="ban inf">
                <Icon name="shield" />
                <div>
                    <b>الكشف بانتظار تدقيقك</b>
                    {closing.preparedById === userId
                        ? 'أعددت هذا الكشف بنفسك، فيعتمده مدقق آخر. يمكنك إرجاعه للتصحيح.'
                        : `أعدّه ${closing.preparedBy ?? 'المحاسب'}، وأنت شخص مختلف عن مُعدّه ✓. راجع الدفعات وعدّ النقد والفرق، ثم اعتمد أو أرجِع مع السبب.`}
                </div>
            </div>
        ) : (
            <div className="ban inf">
                <Icon name="send" />
                <div>
                    <b>أُرسل للتدقيق</b>
                    الكشف مقفل حتى يعتمده المدقق أو يعيده إليك.
                </div>
            </div>
        );
    }

    if (closing.status === 'approved') {
        return (
            <div className="ban ok">
                <Icon name="lock" />
                <div>
                    <b>معتمد ومحمي من التعديل المباشر</b>
                    اعتمده {closing.reviewedBy} في <span className="num">{closing.reviewedAt}</span>. أي تصحيح لاحق يكون حركة موثّقة مرتبطة بهذا
                    الكشف.
                </div>
            </div>
        );
    }

    return closing.can.prepare ? null : (
        <div className="ban inf">
            <Icon name="info" />
            <div>
                <b>الكشف ما زال مسودة عند المحاسب</b>
                يظهر لك للاطلاع فقط حتى يُرسل للتدقيق.
            </div>
        </div>
    );
}
