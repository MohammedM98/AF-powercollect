import Icon from './ClosingIcon';
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
    return <span className={`mny ${Number(amount ?? 0) === 0 ? 'zero' : ''}`}><b className="num" dir="ltr">{formatMoney(amount ?? 0)}</b><i>{symbols[currency]}</i></span>;
}

/**
 * A table whose columns keep set widths (`[title, width]`, a width in
 * pixels or none for the one column that takes what is left), so a big or
 * small figure never resizes a column; wider than its panel, it scrolls.
 */
export function FixedTable({ columns, className = '', children }) {
    const minWidth = columns.reduce((sum, [, width]) => sum + (width ?? 180), 0);
    return <table className={`dt fx ${className}`} style={{ minWidth }}><colgroup>{columns.map(([, width], index) => <col key={index} style={width ? { width } : undefined} />)}</colgroup><thead><tr>{columns.map(([title], index) => <th key={index}>{title}</th>)}</tr></thead><tbody>{children}</tbody></table>;
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
    // Shekels always; a dollar or dinar column only for a period that still moved some.
    const shown = Object.keys(currencies).filter((currency) => currency === 'ILS' || Object.keys(labels).some((key) => Number(ledger[key]?.[currency] ?? 0) !== 0));
    return <div className="overflow-x-auto rounded-xl border border-gray-200"><table className="dt w-full min-w-[440px] text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="p-3 text-start">معادلة الكاش</th>{shown.map((currency) => <th key={currency} className="p-3 text-start">{currencies[currency]}</th>)}</tr></thead><tbody>{Object.entries(labels).map(([key, label]) => <tr key={key} className={`border-t border-gray-100 ${['remaining', 'actualNow'].includes(key) ? 'bg-brand-50 font-bold text-brand-600' : 'text-gray-700'}`}><td className="p-3">{label}</td>{shown.map((currency) => <td key={currency} dir="ltr" className="p-3 font-display tabular-nums">{formatMoney(ledger[key]?.[currency])}</td>)}</tr>)}</tbody></table></div>;
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

