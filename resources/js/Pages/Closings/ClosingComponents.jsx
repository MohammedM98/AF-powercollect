import Icon from './ClosingIcon';
import { formatMoney } from '@/lib/format';
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

export function Panel({ title, hint, icon, children }) {
    return <section className="sec"><header><span className="si"><Icon name={icon} /></span><div><h3>{title}</h3><small>{hint}</small></div></header><div className="bd">{children}</div></section>;
}

