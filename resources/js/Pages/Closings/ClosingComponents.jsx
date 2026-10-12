import Icon from './ClosingIcon';
import { Link } from '@inertiajs/react';
import { formatMoney } from '@/lib/format';
import { closingVersionDifferences } from '@/lib/closingVersions';
const currencies = { ILS: 'شيكل', USD: 'دولار', JOD: 'دينار' };
const symbols = { ILS: '₪', USD: '$', JOD: 'د.أ' };
const money = (value, currency = 'ILS') => `${formatMoney(value ?? 0)} ${symbols[currency]}`;
export function PrimaryButton({ className = '', children, ...props }) {
    return <button type="button" {...props} className={`btn pr ${className}`}>{children}</button>;
}
export function SecondaryButton({ className = '', children, ...props }) {
    return <button type="button" {...props} className={`btn ${className}`}>{children}</button>;
}
export function StatusPill({ tone, children }) {
    const colors = { green: 'g', amber: 'a', red: 'r', blue: 'b', purple: 'p' };
    return <span className={`pl ${colors[tone] ?? ''}`}><i />{children}</span>;
}
export const dateTime = (value) => value ? new Intl.DateTimeFormat('ar-SY-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value)) : '—';
export const branchClock = (value) => new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value));
export const branchDate = (value) => new Intl.DateTimeFormat('ar-SY-u-nu-latn', { day: 'numeric', month: 'long', timeZone: 'Asia/Gaza' }).format(new Date(value));
export const periodRange = (period) => `${branchDate(period.coverage_from)} — ${branchDate(period.coverage_until)}`;
export function periodLabel(period) {
    if (!period) return '—';
    if (period.workflow_settings?.continuation) return 'تكملة الأسبوع';
    if (period.workflow_settings?.frequency === 'daily') return branchDate(period.coverage_from);
    const date = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(period.coverage_from)));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return `الأسبوع ${Math.ceil((((date - yearStart) / 86400000) + 1) / 7)}`;
}

export function MoneyStack({ amounts, className = '' }) {
    return <div className={`money-stack ${className}`}>{Object.keys(currencies).map((currency) => <Money key={currency} amount={amounts?.[currency]} currency={currency} />)}</div>;
}

export function Money({ amount, currency = 'ILS' }) {
    return <span className="mny"><b className="num" dir="ltr">{formatMoney(amount ?? 0)}</b><i>{symbols[currency]}</i></span>;
}


export function Panel({ title, hint, icon, children }) {
    return <section className="sec"><header><span className="si"><Icon name={icon} /></span><div><h3>{title}</h3><small>{hint}</small></div></header><div className="bd">{children}</div></section>;
}


export function ClosingStepper({ closing }) {
    const labels = ['مفتوح', 'جاهز للمراجعة', 'مُرسل', 'قيد التدقيق', closing.open_notes_count > 0 ? 'بملاحظات' : 'مقبول'];
    const stage = closing.open_notes_count > 0 || closing.status === 'approved' ? 4 : closing.submitted_snapshot ? (closing.reviewed_at ? 3 : 2) : new Date(closing.coverage_until) > new Date() ? 0 : 1;
    return <ol className="stp">{labels.map((label, index) => <li key={label} className={index < stage ? 'done' : index === stage ? `on ${closing.open_notes_count > 0 ? 'bad' : ''}` : ''}><span>{index < stage ? <Icon name="check" /> : index + 1}</span><b>{label}</b></li>)}</ol>;
}

export function CashLedger({ ledger }) {
    const labels = { opening: 'رصيد أول الفترة', received: 'استلام الصناديق', repayments: 'تسديد الديون', sent: 'ما خرج للشركة (−)', adjustments: 'قيود التصحيح', safeDifference: 'فرق جرد الخزنة', remaining: 'الرصيد الباقي للفترة', afterCutoff: 'حركة الفترات التالية', actualNow: 'الرصيد الفعلي الآن' };
    return <div className="overflow-x-auto rounded-xl border border-gray-200"><table className="dt w-full min-w-[440px] text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="p-3 text-start">معادلة الكاش</th>{Object.values(currencies).map((label) => <th key={label} className="p-3 text-start">{label}</th>)}</tr></thead><tbody>{Object.entries(labels).map(([key, label]) => <tr key={key} className={`border-t border-gray-100 ${['remaining', 'actualNow'].includes(key) ? 'bg-brand-50 font-bold text-brand-600' : 'text-gray-700'}`}><td className="p-3">{label}</td>{Object.keys(currencies).map((currency) => <td key={currency} dir="ltr" className="p-3 font-display tabular-nums">{formatMoney(ledger[key]?.[currency])}</td>)}</tr>)}</tbody></table></div>;
}


export function VersionDifferences({ version, previous }) {
    const difference = closingVersionDifferences(version, previous);
    return <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 text-xs text-gray-500">
        <p>التغيّر عن النسخة {previous.version} (النسخة الحالية − السابقة)</p>
        {version.snapshot.book !== 'bank' && <div>الكاش المستلم:<MoneyStack amounts={difference.cash} className="mt-1" />رصيد الخزنة:<MoneyStack amounts={difference.safe} className="mt-1" /></div>}
        {version.snapshot.book !== 'cash' && <div>الإلكتروني المؤكّد:<MoneyStack amounts={difference.bank} className="mt-1" /></div>}
        {version.snapshot.book !== 'cash' && <div>المقاصات المقبولة:<MoneyStack amounts={difference.clearing} className="mt-1" /></div>}
        {Object.entries({ boxes: 'صناديق تغيّرت', electronic: 'دفعات إلكترونية تغيّرت', transfers: 'تسليمات تغيّرت', adjustments: 'قيود تصحيح تغيّرت' }).map(([key, label]) => difference.changed[key].length > 0 && <p key={key}>{label}: {difference.changed[key].map((id) => `#${id}`).join('، ')}</p>)}
    </div>;
}

export function BoxTransactions({ box, canReview, access, perform }) {
    const cash = (box.type ?? 'cash') === 'cash';
    const clearing = box.type === 'clearing';
    const hidden = cash && !box.head_counts && !box.isOwn && box.status !== 'received';
    const columns = ['#', 'التاريخ والوقت', 'المشترك', 'رقم الحساب', ...(cash ? ['رقم السند', 'العملة'] : clearing ? ['الخدمة المقدّمة'] : ['البنك المستلم', 'البنك المرسل', 'رقم الحوالة']), 'المبلغ', 'الحالة', ''];
    return <div className="max-h-96 overflow-auto"><table className="dt w-full"><thead><tr>{columns.map((label, index) => <th key={index} className="whitespace-nowrap text-start">{label}</th>)}</tr></thead><tbody>{(box.payments ?? []).map((entry, index) => {
        const active = !entry.transaction || entry.transaction.status === 'active';
        const rejected = ['missing', 'rejected'].includes(entry.status);
        const name = entry.transaction?.subscription?.subscription_name || entry.transaction?.subscription?.full_name || '—';
        return <tr key={entry.id} className={active ? '' : 'opacity-50'}><td className="num">{index + 1}</td><td className="whitespace-nowrap">{dateTime(entry.occurred_at)}{entry.is_late && <StatusPill tone="amber">متأخرة</StatusPill>}</td><td>{entry.statement_url ? <Link href={entry.statement_url} prefetch className="lnk">{name}</Link> : name}</td><td dir="ltr" className="num">{entry.transaction?.subscription?.account_number ?? '—'}</td>{cash ? <><td dir="ltr" className="num">{entry.transaction?.manual_voucher_number ?? entry.transaction?.voucher_number ?? '—'}</td><td>{currencies[entry.currency]}</td></> : clearing ? <td>{entry.transaction?.notes ?? '—'}</td> : <><td>{entry.transaction?.bank_name ?? '—'}</td><td>{entry.transaction?.sender_bank_name ?? '—'}</td><td dir="ltr" className="num">{entry.transaction?.reference_number ?? '—'}</td></>}<td className="whitespace-nowrap">{hidden ? 'يظهر بعد العدّ' : <Money amount={entry.amount} currency={entry.currency} />}</td><td><StatusPill tone={!active ? undefined : cash || entry.status === 'confirmed' ? 'green' : rejected ? 'red' : 'amber'}>{!active ? 'ملغاة' : cash ? 'سارية' : entry.status === 'confirmed' ? clearing ? 'مقبولة' : 'مؤكدة' : rejected ? clearing ? 'مرفوضة' : 'غير موجودة في البنك' : 'بانتظار المراجعة'}</StatusPill></td><td><div className="flex flex-wrap gap-2">{active && !cash && canReview && entry.status !== 'confirmed' && <><button className="lnk" onClick={() => perform('electronic', entry, { status: 'confirmed' })}>{clearing ? 'قبول' : 'تأكيد'}</button><button className="text-red-700" onClick={() => perform('electronic', entry, { status: clearing ? 'rejected' : 'missing' })}>{clearing ? 'رفض' : 'غير موجودة'}</button></>}{active && !box.frozen && access.manage && box.kind !== 'direct' && box.status === 'open' && !cash && !clearing && entry.status === 'pending' && <button className="lnk" onClick={() => perform('direct', entry)}>نقل للدفعات المباشرة</button>}</div></td></tr>;
    })}</tbody></table></div>;
}
