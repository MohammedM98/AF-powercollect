import { Link, useForm, usePage } from '@inertiajs/react';
import { closingMoney } from '@/lib/closing';
import Icon from '@/Components/Icon';
import InputError from '@/Components/InputError';
import { cashAmountClass } from '@/Components/FinancialBalance';

const CHANNELS = { cash: 'النقد', bank: 'البنوك', wallets: 'المحافظ', other: 'أخرى' };

function Movements({ title, lines, timezone }) {
    const localDate = (value) => new Intl.DateTimeFormat('ar', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    return <section className="pn">
        <h3>{title}<span className="r">{lines.length} حركات</span></h3>
        {lines.length === 0 ? <p className="s">لا توجد حركات في هذه الفترة.</p> : <div className="mxw overflow-x-auto" tabIndex={0} role="region" aria-label={title}><table className="mx financial-movements"><caption className="sr-only">{title}</caption><thead><tr><th scope="col">الحركة والأصل</th><th scope="col">أثر السجل ₪</th><th scope="col">تحصيل فعلي ₪</th><th scope="col">تاريخ الحدث والتسجيل</th><th scope="col">السبب والموظف</th></tr></thead><tbody>{lines.map((line) => <tr key={line.transactionId}>
            <td><Link href={`/subscriptions/${line.subscriptionId}/statement`}>حركة #{line.transactionId}</Link>{line.subscriptionName && <span className="movement-detail">{line.subscriptionName}</span>}{line.originalId && <span className="movement-detail">الأصل #{line.originalId} · {closingMoney(line.originalAmount)} ₪</span>}<span className="movement-detail">{line.branchName} · {line.period}</span></td>
            <td><bdi>{closingMoney(line.ledgerEffect)}</bdi></td><td><bdi className={cashAmountClass(line.collectionEffect)}>{closingMoney(line.collectionEffect)}</bdi></td>
            <td><span className="movement-detail"><b>تاريخ الحدث</b><br />{localDate(line.actualAt)}</span><span className="movement-detail"><b>وقت التسجيل</b><br />{localDate(line.recordedAt)}</span></td><td><span className="movement-detail">{line.reason || '—'}</span><span className="movement-detail">سجلها {line.enteredBy || '—'}</span></td>
        </tr>)}</tbody></table></div>}
    </section>;
}

export default function WeeklyFinancialReport({ view, section }) {
    const { can } = usePage().props;
    const report = view.financialReport;
    const form = useForm({ action: '', notes: '', counted_cash: report.cashTotal, verified_bank: report.bankTotal, verified_wallets: report.walletTotal, verified_other: report.otherTotal });
    function audit(action) {
        form.transform((data) => ({ ...data, action })).put(`/closing-periods/${view.closingPeriodId}/audit`, { preserveScroll: true });
    }
    return <>
        {section === 'overview' && <>
        <section className="pn">
            <h3><Icon name="lock" />{view.workflowLabel}<span className="r">{view.number}</span></h3>
            <p className="s">وقت القطع: <bdi>{new Date(view.cutoffAt).toLocaleString('ar', { timeZone: view.timezone })}</bdi> · {view.timezone} · يسمح بالاعتماد بعد <bdi>{new Date(view.eligibleAt).toLocaleString('ar', { timeZone: view.timezone })}</bdi></p>
            <p className="s">الفترة تعتمد على تاريخ التسجيل؛ الإدخالات المتأخرة تحتفظ بتاريخ الحدث الأصلي. أثر السجل الموجب يزيد المديونية والسالب يخفضها.</p>
            {view.legacySnapshotMissing && <div className="ban"><Icon name="alert" /><p>إغلاق قديم لا يحتوي لقطة تاريخية. يلزم تثبيت بياناته الحالية مع بيان مصدرها قبل التدقيق.</p></div>}
            {view.legacyBaseline && <div className="ban"><Icon name="info" /><p>إغلاق سابق للترقية: الأرقام مثبتة من البيانات المتاحة وقت الترقية؛ لم يكن النظام القديم يحتفظ بلقطة وقت الاعتماد.</p></div>}
            <InputError message={form.errors.period} />
            {view.canPrepare && view.workflowStatus === 'open' && <button type="button" className="btn" disabled={form.processing} onClick={() => audit('prepare')}>إعداد للمراجعة</button>}
        </section>
        <div className="kp">
            <div><small>التحصيل الفعلي</small><b className={cashAmountClass(report.actualCollectionTotal)}>{closingMoney(report.actualCollectionTotal)} ₪</b><span>{report.paymentCount} دفعات · {report.transactionCount} حركات</span></div>
            <div><small>تسويات السجل</small><b>{closingMoney(report.ledgerAdjustmentsTotal)} ₪</b><span>لا تُخصم من التحصيل الفعلي</span></div>
            <div><small>تحميلات الفترة</small><b>{closingMoney(report.chargesTotal)} ₪</b><span>قراءات ورسوم وغرامات</span></div>
            <div><small>تسويات فترات سابقة</small><b>{closingMoney(report.previousPeriodAdjustmentsTotal)} ₪</b><span>مرتبطة بالحركات الأصلية</span></div>
            <div><small>إرجاعات نقدية فعلية</small><b className={cashAmountClass(report.refundsTotal)}>{closingMoney(report.refundsTotal)} ₪</b><span>حركة أموال منفصلة عن التصحيحات</span></div>
        </div>
        <section className="pn"><h3>التحصيل حسب وسيلة الدفع</h3><div className="mxw overflow-x-auto"><table className="mx"><thead><tr><th>القناة</th><th>عدد الدفعات</th><th>المبلغ ₪</th></tr></thead><tbody>{report.methods.map((method) => <tr key={`${method.method}-${method.channel}`}><td>{method.channel}</td><td>{method.count}</td><td>{closingMoney(method.amount)}</td></tr>)}</tbody><tfoot><tr><td>إجمالي التحصيل الفعلي</td><td>{report.paymentCount}</td><td>{closingMoney(report.actualCollectionTotal)}</td></tr></tfoot></table></div></section>
        </>}
        {section === 'details' && <>
        <Movements title="تصحيحات السجل المالي" lines={report.adjustments} timezone={view.timezone} />
        <Movements title="الإدخالات المتأخرة" lines={report.lateEntries} timezone={view.timezone} />
        <Movements title="الإلغاءات المرتبطة بالأصل" lines={report.reversals} timezone={view.timezone} />
        <section className="pn"><h3>متابعة التدقيق المالي</h3>
            <p className="s">يُرسل كشف كل فرع من الصندوق المالي، ثم تُراجع حركاته في وحدة التدقيق المالي المستقلة. مرجع المدقق يمكن أن يبقى خارج الموقع.</p>
            {view.reconciliation && <div className="mxw overflow-x-auto" tabIndex={0} role="region" aria-label="نتيجة التدقيق السابقة"><table className="mx"><thead><tr><th>القناة</th><th>المتوقع</th><th>المتحقق</th><th>الفرق</th></tr></thead><tbody>{Object.entries(view.reconciliation).map(([channel, row]) => <tr key={channel}><td>{CHANNELS[channel]}</td><td>{closingMoney(row.expected)}</td><td>{closingMoney(row.verified)}</td><td>{closingMoney(row.difference)}</td></tr>)}</tbody></table></div>}
            {view.auditNotes && <p className="s">{view.auditNotes}</p>}
            {can?.viewFinancialAudit && <Link className="btn" href="/financial-audit"><Icon name="shield" />فتح التدقيق المالي</Link>}
        </section>
        </>}
    </>;
}
