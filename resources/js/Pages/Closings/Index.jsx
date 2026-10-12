import { useEffect, useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from './ClosingIcon';
import BaseModal from '@/Components/Modal';
import { formatMoney } from '@/lib/format';
import { closingVersionDifferences } from '@/lib/closingVersions';
import './closing.css';

const currencies = { ILS: 'شيكل', USD: 'دولار', JOD: 'دينار' };
const symbols = { ILS: '₪', USD: '$', JOD: 'د.أ' };
const weekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const tabs = [['current', 'الأسبوع الحالي', 'home'], ['boxes', 'الصناديق', 'inbox'], ['safe', 'الخزنة والتسليم', 'vault'], ['history', 'الإغلاقات', 'layers'], ['notes', 'ملاحظات التدقيق', 'messages'], ['settings', 'الإعدادات', 'cog']];
const boxStatuses = { open: ['مفتوح', 'blue'], pending: ['بانتظار التسليم', 'amber'], received: ['مستلم', 'green'] };
const noteStatuses = { awaiting_reply: 'بانتظار الرد', rejected: 'مرفوضة · تحتاج ردًا', with_collector: 'عند المحصّل', collector_replied: 'ردّ المحصّل', awaiting_audit: 'بانتظار قرار التدقيق', closed: 'مغلقة' };
const inputClass = 'inp';
const cardClass = 'card';
const emptyCounts = { ILS: '', USD: '', JOD: '' };
function Modal({ panelClassName = '', ...props }) {
    return <BaseModal {...props} centered panelClassName={`closing-ui closing-dialog ${panelClassName}`} />;
}
function PrimaryButton({ className = '', children, ...props }) {
    return <button type="button" {...props} className={`btn pr ${className}`}>{children}</button>;
}
function SecondaryButton({ className = '', children, ...props }) {
    return <button type="button" {...props} className={`btn ${className}`}>{children}</button>;
}
function StatusPill({ tone, children }) {
    const colors = { green: 'g', amber: 'a', red: 'r', blue: 'b', purple: 'p' };
    return <span className={`pl ${colors[tone] ?? ''}`}><i />{children}</span>;
}
const dateTime = (value) => value ? new Intl.DateTimeFormat('ar-SY-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value)) : '—';
const branchClock = (value) => new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value));
const branchDate = (value) => new Intl.DateTimeFormat('ar-SY-u-nu-latn', { day: 'numeric', month: 'long', timeZone: 'Asia/Gaza' }).format(new Date(value));
const periodRange = (period) => `${branchDate(period.coverage_from)} — ${branchDate(period.coverage_until)}`;
function periodLabel(period) {
    if (!period) return '—';
    if (period.workflow_settings?.continuation) return 'تكملة الأسبوع';
    if (period.workflow_settings?.frequency === 'daily') return branchDate(period.coverage_from);
    const date = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(period.coverage_from)));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return `الأسبوع ${Math.ceil((((date - yearStart) / 86400000) + 1) / 7)}`;
}
const money = (value, currency = 'ILS') => `${formatMoney(value ?? 0)} ${symbols[currency]}`;
const totals = (payments, method = 'cash') => Object.fromEntries(Object.keys(currencies).map((currency) => [currency, payments.filter((payment) => payment.currency === currency && (method === 'all' || (method === 'electronic' ? payment.method !== 'cash' : payment.method === method)) && (!payment.transaction || payment.transaction.status === 'active')).reduce((sum, payment) => sum + Number(payment.amount), 0)]));

function MoneyStack({ amounts, className = '' }) {
    return <div className={`money-stack ${className}`}>{Object.keys(currencies).map((currency) => <Money key={currency} amount={amounts?.[currency]} currency={currency} />)}</div>;
}

function Money({ amount, currency = 'ILS' }) {
    return <span className="mny"><b className="num" dir="ltr">{formatMoney(amount ?? 0)}</b><i>{symbols[currency]}</i></span>;
}

function Metric({ icon, label, amounts, value, hint, tone, onClick }) {
    return <button type="button" className={`kpi ${tone}`} onClick={onClick}>
        <span className="ki"><Icon name={icon} /></span>
        <div className="kv"><span>{label}</span><b>{amounts ? <Money amount={amounts.ILS} /> : value}</b>
            {amounts && (Number(amounts.USD) !== 0 || Number(amounts.JOD) !== 0) && <div className="s3"><Money amount={amounts.USD} currency="USD" /><span className="sep3" /><Money amount={amounts.JOD} currency="JOD" /></div>}
            <small>{hint}</small>
        </div><span className="go"><Icon name="chevron-left" /></span>
    </button>;
}

function Section({ title, hint, action, children }) {
    return <section className="closing-section"><div className="h2"><div><h2>{title}</h2>{hint && <p className="section-hint">{hint}</p>}</div><div className="r">{action}</div></div>{children}</section>;
}

function Empty({ children }) {
    return <div className="card"><div className="empty"><Icon name="table" />{children}</div></div>;
}

function Field({ label, children }) {
    return <label className="grid gap-2 text-sm font-semibold text-gray-700">{label}{children}</label>;
}

function PageHeading({ title, hint, action }) {
    return <div className="ph"><div><h2>{title}</h2><p>{hint}</p></div><div className="acts">{action}</div></div>;
}

function Panel({ title, hint, icon, children }) {
    return <section className="sec"><header><span className="si"><Icon name={icon} /></span><div><h3>{title}</h3><small>{hint}</small></div></header><div className="bd">{children}</div></section>;
}

function CountFields({ form }) {
    return <div className="cur3">{Object.entries(currencies).map(([currency, label]) => <label className="ccin" key={currency}><span>{label} <i>{symbols[currency]}</i></span><input autoComplete="off" required type="number" min="0" step="0.01" dir="ltr" className="num" placeholder="0" value={form.data.counts[currency]} onChange={(event) => form.setData('counts', { ...form.data.counts, [currency]: event.target.value })} /></label>)}</div>;
}

function ClosingPill({ closing }) {
    const open = new Date(closing.coverage_until) > new Date();
    const state = closing.open_notes_count > 0 ? ['بملاحظات', 'amber'] : closing.status === 'approved' ? ['مقبول', 'green'] : closing.submitted_snapshot ? (closing.reviewed_at ? ['قيد التدقيق', 'blue'] : ['مُرسل', 'purple']) : open ? ['مفتوح', 'blue'] : ['جاهز للمراجعة', 'amber'];
    return <StatusPill tone={state[1]}>{state[0]}</StatusPill>;
}

function CollectorCard({ name, boxes, debts, onOpen, direct = false, color = 0 }) {
    const open = boxes.find((box) => box.status === 'open');
    const pending = boxes.filter((box) => box.status === 'pending');
    return <article className="cc"><header><span className={`av hu${color % 5 + 1}`}>{direct ? <Icon name="wallet" /> : name.slice(0, 1)}</span><div><b>{name}</b><small>{direct ? 'دفعات المشترك المباشرة' : 'صندوق الموظف'}</small></div>{open && <button className="ib sm" aria-label={`عرض صندوق ${name}`} onClick={() => onOpen(open)}><Icon name="eye" /></button>}</header>
        <div className="cc-o"><span className="lbl">{open ? <>صندوق مفتوح <b className="num">{open.number.slice(-8)}</b></> : 'لا يوجد صندوق مفتوح'}</span>
            <div className="v"><MoneyStack amounts={totals(open?.payments ?? [], direct ? 'electronic' : 'cash')} /><small>{open?.payments.length ? `${open.payments.length} دفعات · من ${dateTime(open.opened_at)}` : 'لسا فاضي'}</small></div>
            {direct && <small className="muted">بيتسكّر لحاله بوقت القطع بس</small>}
        </div>
        <div className={`cc-p ${pending.length ? '' : 'ok'}`}><div>{pending.length ? <><span>{pending.length} صندوق بانتظار {direct ? 'التأكيد' : 'التسليم'}</span><small><MoneyStack amounts={totals(pending.flatMap((box) => box.payments), direct ? 'electronic' : 'cash')} /></small></> : <span><Icon name="check" /> ما معه صناديق بانتظار التسليم</span>}</div>{pending.length > 0 && <SecondaryButton className="sm" onClick={() => onOpen(pending[0])}>{direct ? 'تأكيد' : 'استلام'}</SecondaryButton>}</div>
        {debts.map((debt) => <div key={debt.id} className="cc-d"><span><Icon name="currency" /> دين متبقٍ: <Money amount={debt.remaining} currency={debt.currency} /></span></div>)}
    </article>;
}

function ActionModal({ action, onClose, props }) {
    const { branch, urls, recipients, staff, settings, receivers, approvers, current, transitionUntil } = props;
    const form = useForm({ branch_id: branch.id, counts: { ...emptyCounts }, reason: '', recounted: false, decisions: { ILS: 'accepted', USD: 'accepted', JOD: 'accepted' }, acknowledged: false, notes: '', amount: '', currency: 'ILS', method: 'hand_delivery', recipient_id: '', proof: null, kind: 'clarification', body: '', document: null, book: 'cash', settings: { ...settings }, receivers: [...receivers], approvers: [...approvers] });
    const names = { start: 'بدء الإغلاق الأسبوعي للفرع', close: 'إغلاق صندوقي', 'collector-count': 'عدّ الصندوق عند التسليم', 'head-count': 'عدّ المبلغ المستلم', receive: 'مراجعة العدّ واعتماد الاستلام', 'safe-count': 'جرد الخزنة', submit: 'اعتماد الإغلاق وإرساله', withdraw: 'سحب الإغلاق', early: 'إغلاق الفترة مبكرًا', transfer: 'تسليم كاش للشركة', repay: 'تسديد دين المحصّل', reply: 'الرد على ملاحظة التدقيق', settings: 'إعدادات الإغلاق' };
    const countAction = ['close', 'collector-count', 'head-count', 'safe-count'].includes(action.kind);
    const box = action.record;
    function submit(event) {
        event.preventDefault();
        form.post(`${urls.actions}/${action.kind}${box?.id ? `/${box.id}` : ''}`, { preserveScroll: true, onSuccess: onClose });
    }
    function toggleGrant(key, id) {
        form.setData(key, form.data[key].includes(id) ? form.data[key].filter((value) => value !== id) : [...form.data[key], id]);
    }
    return <Modal show onClose={onClose} maxWidth="2xl"><form onSubmit={submit} className="flex max-h-[90vh] flex-col"><header className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-5"><div><h2 className="text-xl font-bold text-gray-900">{names[action.kind]}</h2><p className="mt-1 text-sm text-gray-500">{box?.number ?? branch.name}</p></div><button type="button" onClick={onClose} aria-label="إغلاق النافذة" className="rounded-lg p-2 text-gray-500 hover:bg-gray-50"><Icon name="close" className="h-5 w-5" /></button></header><div className="space-y-5 overflow-y-auto p-6">
        {countAction && <><p className="rounded-xl bg-blue-500/10 p-4 text-sm text-blue-600">عدّ الكاش لكل عملة واكتب المجموع. يظهر المتوقع بعد حفظ العدّ؛ لا يتم تحويل العملات.</p><CountFields form={form} /><Field label="سبب الفرق، إن وُجد"><textarea className={inputClass} rows="3" value={form.data.reason} onChange={(event) => form.setData('reason', event.target.value)} /></Field></>}
        {action.kind === 'receive' && <><div className="overflow-x-auto rounded-xl border border-gray-200"><table className="dt w-full text-start text-sm"><thead className="bg-gray-50 text-gray-500"><tr>{['العملة', 'عدّك', 'عدّ المحصّل', 'المتوقع', 'الفرق', 'قرار الفرق'].map((title) => <th key={title} className="whitespace-nowrap p-3 text-start">{title}</th>)}</tr></thead><tbody>{Object.entries(currencies).map(([currency, label]) => <tr key={currency} className="border-t border-gray-100"><td className="p-3">{label}</td><td className="p-3">{money(box.head_counts?.[currency], currency)}</td><td className="p-3">{money(box.collector_counts?.[currency], currency)}</td><td className="p-3">{money(box.expected_counts?.[currency], currency)}</td><td className="p-3" dir="ltr">{money(Number(box.head_counts?.[currency] ?? 0) - Number(box.expected_counts?.[currency] ?? 0), currency)}</td><td className="p-3"><select className={inputClass} value={form.data.decisions[currency]} onChange={(event) => form.setData('decisions', { ...form.data.decisions, [currency]: event.target.value })}><option value="accepted">قبول السبب</option><option value="debt">العجز دين على المحصّل</option></select></td></tr>)}</tbody></table></div><Field label="سبب الفرق / قرار الاستلام"><textarea className={inputClass} value={form.data.reason} onChange={(event) => form.setData('reason', event.target.value)} placeholder={box.reason ?? ''} /></Field><label className="flex items-center gap-3 text-sm text-gray-700"><input type="checkbox" checked={form.data.recounted} onChange={(event) => form.setData('recounted', event.target.checked)} />أعدنا العدّ معًا عند اختلاف العدّين؛ المعتمد عدّ المستلم.</label></>}
        {action.kind === 'submit' && <><ReviewSummary closing={box} /><p className="rounded-xl bg-brand-50 p-4 text-sm text-brand-600">تتجمّد الأرقام لحظة الإرسال. أي تصحيح لاحق يُسجّل في الأسبوع المفتوح.</p><ul className="space-y-2 text-sm text-gray-700"><li>الفترة: {dateTime(box.coverage_from)} — {dateTime(box.coverage_until)}</li><li>الدفتر: {box.book === 'combined' ? 'الكاش والبنك مدمجان' : box.book === 'cash' ? 'الكاش' : 'البنك'}</li></ul><Field label="ملاحظة للتدقيق (اختياري)"><textarea className={inputClass} value={form.data.notes} onChange={(event) => form.setData('notes', event.target.value)} /></Field><label className="flex items-center gap-3 text-sm font-bold text-gray-900"><input required type="checkbox" checked={form.data.acknowledged} onChange={(event) => form.setData('acknowledged', event.target.checked)} />أقرّ أن الأرقام صحيحة.</label></>}
        {action.kind === 'start' && <p className="text-sm leading-7 text-gray-700">يبدأ مسار الإغلاق الأسبوعي من هذه اللحظة، وتدخل فيه الدفعات الجديدة. تبقى الإغلاقات التاريخية محفوظة. حدّد لاحقًا يوم البداية ووقت القطع من تبويب الإعدادات.</p>}
        {action.kind === 'early' && <p className="text-sm leading-7 text-gray-700">يغطي الإغلاق من بداية الفترة حتى الآن، وتُغلق الصناديق المفتوحة وتحتاج إلى جرد. تبدأ فترة «تكملة الأسبوع» حتى {dateTime(box.scheduled_until)}.</p>}
        {action.kind === 'withdraw' && <p className="text-sm leading-7 text-gray-700">يمكن سحب الإغلاق قبل أن يفتحه التدقيق. تُحفظ النسخة السابقة، وينشئ الإرسال التالي نسخة جديدة.</p>}
        {['transfer', 'repay'].includes(action.kind) && <><Field label={action.kind === 'repay' ? `المبلغ نقدًا · المتبقي ${money(box.remaining, box.currency)}` : 'المبلغ'}><input required type="number" min="0.01" step="0.01" dir="ltr" className={inputClass} value={form.data.amount} onChange={(event) => form.setData('amount', event.target.value)} /></Field>{action.kind === 'transfer' && <><Field label="العملة"><select className={inputClass} value={form.data.currency} onChange={(event) => form.setData('currency', event.target.value)}>{Object.entries(currencies).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="طريقة التسليم"><select className={inputClass} value={form.data.method} onChange={(event) => form.setData('method', event.target.value)}><option value="hand_delivery">خزنة الشركة</option><option value="bank_deposit">إيداع في حساب الشركة</option></select></Field><Field label="المستلم"><select required className={inputClass} value={form.data.recipient_id} onChange={(event) => form.setData('recipient_id', event.target.value)}><option value="">اختر المستلم</option>{recipients.filter((person) => person.id !== props.actorId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="صورة الإثبات (إلزامية)"><input required type="file" accept="image/jpeg,image/png,image/webp" className={inputClass} onChange={(event) => form.setData('proof', event.target.files[0])} /></Field></>}</>}
        {action.kind === 'reply' && <><p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">{box.body}</p><Field label="نوع الرد"><select className={inputClass} value={form.data.kind} onChange={(event) => form.setData('kind', event.target.value)}><option value="clarification">اعتراض / توضيح</option><option value="adjustment">صحّحت بقيد في الأسبوع المفتوح</option><option value="document">إرفاق مستند</option>{box.cash_box_id && <option value="collector">تحويل للمحصّل</option>}</select></Field><Field label="الرد / سبب التصحيح"><textarea required rows="3" className={inputClass} value={form.data.body} onChange={(event) => form.setData('body', event.target.value)} /></Field>{box.differences && !box.difference_decisions && form.data.kind !== 'collector' && <div className="space-y-3 rounded-xl border border-gray-200 p-4"><h3 className="text-sm font-bold text-gray-900">قرار فروقات التدقيق</h3>{Object.entries(box.differences).filter(([, amount]) => Number(amount) !== 0).map(([currency, amount]) => <Field key={currency} label={`${currencies[currency]} · فرق ${money(amount, currency)}`}><select className={inputClass} value={form.data.decisions[currency]} onChange={(event) => form.setData('decisions', { ...form.data.decisions, [currency]: event.target.value })}><option value="accepted">قبول السبب / الزيادة للشركة</option>{Number(amount) < 0 && <option value="debt">رفض السبب · دين على المحصّل</option>}</select></Field>)}</div>}{form.data.kind === 'document' && <Field label="المستند"><input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => form.setData('document', event.target.files[0])} /></Field>}{form.data.kind === 'adjustment' && <div className="grid gap-3 sm:grid-cols-3"><Field label="الدفتر"><select className={inputClass} value={form.data.book} onChange={(event) => form.setData('book', event.target.value)}><option value="cash">كاش</option><option value="bank">إلكتروني</option></select></Field><Field label="العملة"><select className={inputClass} value={form.data.currency} onChange={(event) => form.setData('currency', event.target.value)}>{Object.entries(currencies).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="المبلغ (+ / −)"><input required type="number" step="0.01" dir="ltr" className={inputClass} value={form.data.amount} onChange={(event) => form.setData('amount', event.target.value)} /></Field></div>}</>}
        {action.kind === 'settings' && <><div className="grid gap-4 sm:grid-cols-2"><Field label="يوم بداية الأسبوع"><select className={inputClass} value={form.data.settings.week_starts_on} onChange={(event) => form.setData('settings', { ...form.data.settings, week_starts_on: Number(event.target.value) })}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></Field><Field label="وقت القطع"><input required type="time" className={inputClass} value={form.data.settings.cutoff_time} onChange={(event) => form.setData('settings', { ...form.data.settings, cutoff_time: event.target.value })} /></Field><Field label="الإغلاق الرسمي"><select className={inputClass} value={form.data.settings.frequency} onChange={(event) => form.setData('settings', { ...form.data.settings, frequency: event.target.value })}><option value="weekly">أسبوعي</option><option value="daily">يومي</option></select></Field><Field label="الكاش والبنك"><select className={inputClass} value={form.data.settings.arrangement} onChange={(event) => form.setData('settings', { ...form.data.settings, arrangement: event.target.value })}><option value="combined">مدمج · إغلاق واحد</option><option value="separate">منفصل · إغلاقان</option></select></Field></div><p className="rounded-xl bg-blue-500/10 p-4 text-sm leading-7 text-blue-600">يسري تغيير الموعد والترتيب بعد {dateTime(current?.scheduled_until)}. الفترة الانتقالية تُعرض قبل الحفظ. الصلاحيات تُفعّل فورًا.</p><TransitionPreview from={current?.scheduled_until} settings={form.data.settings} /><fieldset className="space-y-3"><legend className="font-bold text-gray-900">صلاحيات الفرع</legend>{staff.map((person) => <div key={person.id} className="flex flex-wrap items-center gap-4 text-sm text-gray-700"><b className="min-w-28 flex-1">{person.name}</b>{[['receivers', 'العدّ والاستلام'], ['approvers', 'الاعتماد والإرسال']].map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form.data[key].includes(person.id)} onChange={() => toggleGrant(key, person.id)} />{label}</label>)}</div>)}</fieldset></>}
        {Object.keys(form.errors).length > 0 && <div role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">{Object.entries(form.errors).map(([key, error]) => <p key={key}>{error}</p>)}</div>}
        {form.progress && <progress className="w-full" value={form.progress.percentage} max="100" />}
    </div><footer className="flex justify-end gap-3 border-t border-gray-100 p-5"><SecondaryButton type="button" onClick={onClose}>إلغاء</SecondaryButton><PrimaryButton type="submit" disabled={form.processing}>{form.processing ? 'جارٍ الحفظ…' : action.kind === 'submit' ? 'اعتماد وإرسال' : 'تأكيد وحفظ'}</PrimaryButton></footer></form></Modal>;
}

function TransitionPreview({ from, settings }) {
    if (!from) return null;
    // Use the branch's civil date; UTC arithmetic here avoids the browser's local timezone.
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(from));
    const parts = Object.fromEntries(local.map((part) => [part.type, part.value]));
    const start = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
    const [hours, minutes] = settings.cutoff_time.split(':').map(Number);
    const end = new Date(start);
    end.setUTCHours(hours, minutes, 0, 0);
    if (settings.frequency === 'weekly') end.setUTCDate(end.getUTCDate() + (Number(settings.week_starts_on) - end.getUTCDay() + 7) % 7);
    if (end <= start) end.setUTCDate(end.getUTCDate() + (settings.frequency === 'weekly' ? 7 : 1));
    const days = (end - start) / 86400000;
    return <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700">طول الفترة القادمة: <b className="font-display">{days.toFixed(2)}</b> يوم. تنتهي بتاريخ <b dir="ltr">{end.toISOString().slice(0, 10)} {settings.cutoff_time}</b> بتوقيت الفرع.</div>;
}

export default function ClosingsIndex(props) {
    const { branch, branches, started, current, closings, boxes, safeBalance, transfers, debts, notes, settings, pendingChange, safeCounts, adjustments, versions, access, urls, selectedClosingId, actorId } = props;
    const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') ?? 'current');
    const [action, setAction] = useState(null);
    const [boxId, setBoxId] = useState(null);
    const [boxFilter, setBoxFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
    const allPayments = boxes.flatMap((box) => box.payments);
    const periodBoxes = boxes.filter((box) => closings.find((closing) => closing.id === box.closing_id)?.coverage_from === current?.coverage_from);
    const cashTotals = totals(periodBoxes.flatMap((box) => box.payments));
    const electronicTotals = totals(periodBoxes.flatMap((box) => box.payments), 'electronic');
    const pendingBoxes = boxes.filter((box) => box.status === 'pending');
    const missing = allPayments.filter((payment) => payment.method !== 'cash' && payment.status === 'missing');
    const transit = transfers.filter((transfer) => transfer.status === 'in_transit');
    const overdue = closings.filter((closing) => !closing.submitted_snapshot && new Date(closing.coverage_until).getTime() <= now);
    const openNotes = notes.filter((note) => ['awaiting_reply', 'rejected', 'collector_replied'].includes(note.status));
    const selected = closings.find((closing) => closing.id === selectedClosingId);
    const selectedBox = boxes.find((box) => box.id === boxId);
    const filteredBoxes = boxes.filter((box) => (boxFilter === 'all' || box.status === boxFilter) && `${box.number} ${box.user?.name ?? 'الدفعات المباشرة'}`.includes(search));
    function openAction(kind, record = null) { setBoxId(null); setAction({ kind, record }); }
    function perform(kind, record, extra = {}) { router.post(`${urls.actions}/${kind}/${record.id}`, { branch_id: branch.id, ...extra }, { preserveScroll: true }); }
    function selectClosing(closing) { setTab('history'); router.get(urls.index, { branch_id: branch.id, closing_id: closing.id, tab: 'history' }, { preserveScroll: true, preserveState: true }); }
    function go(nextTab) { setTab(nextTab); const url = new URL(window.location.href); url.searchParams.set('tab', nextTab); window.history.replaceState({}, '', url); }
    const grouped = [...new Set(boxes.map((box) => box.user_id))].map((userId) => ({ id: userId, boxes: boxes.filter((box) => box.user_id === userId) }));
    const remaining = current ? Math.max(0, new Date(current.coverage_until).getTime() - now) : 0;
    const progress = current ? Math.max(0, Math.min(100, (now - new Date(current.coverage_from).getTime()) / (new Date(current.coverage_until) - new Date(current.coverage_from)) * 100)) : 0;
    const collectorCash = totals(pendingBoxes.flatMap((box) => box.payments));
    const transitTotals = Object.fromEntries(Object.keys(currencies).map((key) => [key, transit.filter((item) => item.currency === key).reduce((sum, item) => sum + Number(item.amount), 0)]));
    const people = [...props.staff];
    grouped.filter((group) => group.id !== null && !people.some((person) => person.id === group.id)).forEach((group) => people.push({ id: group.id, name: group.boxes[0].user?.name ?? 'موظف' }));
    return <AuthenticatedLayout><Head title="الإغلاق" /><div dir="rtl" className="closing-ui closing-page">
        {props.errors?.action && <div role="alert" className="bn r">{props.errors.action}</div>}
        <header className="clt">
            <div><h1>الإغلاق</h1><p>{branches.length > 1 && <select aria-label="الفرع" className="inp branch-select" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}{branches.length <= 1 && branch.name}{current && <> · {periodLabel(current)} شغّال · القطع {branchDate(current.coverage_until)} {branchClock(current.coverage_until)}</>}</p></div>
            <div className="acts">
                {started && <PrimaryButton onClick={() => selectClosing(current)}><Icon name="layers" />إغلاق {periodLabel(current)}</PrimaryButton>}
            </div>
        </header>
        <nav aria-label="أقسام الإغلاق" className="ctabs">
            {tabs.map(([key, label, icon]) => {
                const count = key === 'notes' ? openNotes.length : key === 'boxes' ? pendingBoxes.length : key === 'history' ? overdue.length : 0;
                return <button key={key} onClick={() => go(key)} aria-current={tab === key ? 'page' : undefined}><Icon name={icon} /><span>{label}</span>{count > 0 && <em>{count}</em>}</button>;
            })}
        </nav>
        {!started ? <Empty><b>ابدأ الإغلاق الأسبوعي لهذا الفرع</b><p>تُجمع الدفعات الجديدة في صناديق عمل، مع فصل كل عملة.</p>{access.manage && <PrimaryButton onClick={() => openAction('start')}>بدء الإغلاق الأسبوعي</PrimaryButton>}</Empty> : <>
        {tab === 'current' && <>
            <section className="whero">
                <div className="wh-a">
                    <span className="wk"><Icon name="calendar" />{current.workflow_settings?.continuation ? 'تكملة الأسبوع' : settings.frequency === 'daily' ? 'الفترة الحالية' : 'الأسبوع الحالي'} · {current.book === 'combined' ? 'مدمج' : 'منفصل'}</span>
                    <h2>{periodLabel(current)}</h2><p>{periodRange(current)} · القطع {branchClock(current.coverage_until)}</p>
                    <div className="cd"><div className="rw"><svg className="ring" viewBox="0 0 64 64" aria-hidden="true"><circle className="tr" cx="32" cy="32" r="26" /><circle className="pg" cx="32" cy="32" r="26" strokeDasharray="163.36" strokeDashoffset={163.36 * (1 - progress / 100)} /></svg><span className="rp num">{Math.round(progress)}%</span></div>
                        <div><b>{Math.floor(remaining / 86400000)} يوم و{Math.floor(remaining / 3600000) % 24} ساعة</b><small>على القطع · {dateTime(current.coverage_until)}</small><small className="dim">بوقت القطع الصناديق المفتوحة بتنسكّر لحالها</small></div>
                    </div>
                </div>
                <div className="wh-b"><span className="lb">المحصّل هالأسبوع (كاش)</span><div className="big"><Money amount={cashTotals.ILS} /></div><div className="sm"><Money amount={cashTotals.USD} currency="USD" /><Money amount={cashTotals.JOD} currency="JOD" /></div><div className="eln"><Icon name="wallet" />إلكتروني <Money amount={electronicTotals.ILS} /></div>{(electronicTotals.USD > 0 || electronicTotals.JOD > 0) && <div className="sm"><Money amount={electronicTotals.USD} currency="USD" /><Money amount={electronicTotals.JOD} currency="JOD" /></div>}</div>
                <div className="wh-c"><span className="lb">المحصّل بالشيكل كل يوم</span><DailyBars payments={periodBoxes.flatMap((box) => box.payments)} current={current} now={now} /></div>
            </section>
            <Section title="شو لازم تعمل هلأ"><div className="todo">
                {overdue.length > 0 && <Task tone="b" icon="shield" label={`${overdue.length} إغلاق جاهز للمراجعة والإرسال`} hint="كمّل النواقص ثم أرسل الإغلاقات بالترتيب." onClick={() => go('history')} action="راجع وابعت" />}
                {pendingBoxes.length > 0 && <Task tone="a" icon="table" label={`${pendingBoxes.length} صندوق بانتظار التسليم`} hint="عدّ المبلغ المستلم، ثم راجع الفرق واعتمد الاستلام." onClick={() => go('boxes')} action="استلام" />}
                {openNotes.length > 0 && <Task tone="r" icon="messages" label={`${openNotes.length} ملاحظة تدقيق بانتظار ردّك`} hint="كل تصحيح بينزل بالأسبوع المفتوح." onClick={() => go('notes')} action="ردّ" />}
                {!pendingBoxes.length && !overdue.length && !openNotes.length && <Task tone="g" icon="check" label="كل اشي تمام" hint="ما في اشي بانتظارك هلأ" />}
            </div></Section>
            <div className="kpis k4 overview-kpis">
                <Metric icon="hand" tone="warn" label="الكاش مع المحصّلين" amounts={collectorCash} hint={`${pendingBoxes.length} صندوق مسكّر وما انسلّم`} onClick={() => go('boxes')} />
                <Metric icon="vault" tone="br" label="الكاش بالخزنة" amounts={safeBalance} hint="حسب النظام هلأ" onClick={() => go('safe')} />
                <Metric icon="truck" tone="info" label="قيد النقل للشركة" amounts={transitTotals} hint="بانتظار تأكيد الخزنة" onClick={() => go('safe')} />
                <Metric icon="wallet" tone="pur" label="دفعات إلكترونية معلّقة" value={missing.length} hint={missing.length ? 'بتنتقل لحد ما تنلقى' : 'ولا وحدة'} onClick={() => selectClosing(current)} />
            </div>
            <Section title="المحصّلين والصناديق" action={<button onClick={() => go('boxes')} className="lnk">كل الصناديق</button>}><div className="cgrid">
                {people.map((person, index) => <CollectorCard key={person.id} name={person.name} color={index} boxes={boxes.filter((box) => box.user_id === person.id)} debts={debts.filter((debt) => debt.user_id === person.id)} onOpen={(box) => setBoxId(box.id)} />)}
                <CollectorCard name="الدفعات المباشرة" direct boxes={boxes.filter((box) => box.kind === 'direct')} debts={[]} onOpen={(box) => setBoxId(box.id)} />
            </div></Section>
            <Section title="آخر الحركات"><ClosingFeed boxes={boxes} transfers={transfers} notes={notes} /></Section>
        </>}
        {tab === 'boxes' && <>
            <PageHeading title="استلام الصناديق" hint="المحصّل بيسكّر صندوقه وقت ما بدّه، وبيسلّمه هون. كل صندوق بيتبع الأسبوع اللي انسكّر فيه." />
            <div className="fbar"><div className="frow"><div className="chips">{[['pending', 'بانتظار التسليم'], ['open', 'مفتوحة هلأ'], ['received', 'مستلمة'], ['all', 'الكل']].map(([key, label]) => <button key={key} aria-pressed={boxFilter === key} onClick={() => setBoxFilter(key)}>{label}<span>{key === 'all' ? boxes.length : boxes.filter((box) => box.status === key).length}</span></button>)}</div><div className="srch"><Icon name="search" /><input aria-label="البحث عن صندوق" placeholder="ابحث باسم الشخص أو رقم الصندوق" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div></div>
            {filteredBoxes.length ? <div className="tw"><table className="dt"><thead><tr>{['الصندوق', 'الشخص', 'انفتح ← انسكّر', 'الكاش', 'إلكتروني', 'الأسبوع', 'الحالة', ''].map((label, index) => <th key={index}>{label}</th>)}</tr></thead><tbody>{filteredBoxes.map((box) => <tr key={box.id}>
                <td className="nw"><b className="num" dir="ltr">{box.number.slice(-10)}</b></td><td><span className="who"><span className="av s hu1">{box.user?.name?.slice(0, 1) ?? <Icon name="wallet" />}</span>{box.user?.name ?? 'الدفعات المباشرة'}</span></td><td className="nw">{dateTime(box.opened_at)}<br />{box.closed_at ? dateTime(box.closed_at) : <span className="muted">لسا مفتوح</span>}</td><td className="am"><MoneyStack amounts={totals(box.payments)} /></td><td className="am"><MoneyStack amounts={totals(box.payments, 'electronic')} /></td><td className="nw">{periodLabel(closings.find((closing) => closing.id === box.closing_id))}</td><td><StatusPill tone={boxStatuses[box.status][1]}>{boxStatuses[box.status][0]}</StatusPill>{box.status === 'received' && !box.confirmed_at && <small className="confirmation-hint">ينتظر تأكيد المحصّل</small>}</td><td><SecondaryButton className={`sm ${box.status === 'pending' ? 'pr' : ''}`} onClick={() => setBoxId(box.id)}>{box.status === 'pending' ? 'استلام' : 'عرض الصندوق'}</SecondaryButton></td>
            </tr>)}</tbody></table></div> : <Empty><b>ما في صناديق هون</b><small>لما محصّل يسجّل دفعة أو يسكّر صندوق، بيظهر هون.</small></Empty>}
        </>}
        {tab === 'safe' && <>
            <PageHeading title="الخزنة والتسليم للشركة" hint="الكاش اللي استلمه الفرع من الصناديق بيطلع للشركة: لخزنة الشركة أو إيداع بالبنك، مع صورة إثبات." action={access.approve && <PrimaryButton onClick={() => openAction('transfer')}><Icon name="bank" />تسليم للشركة</PrimaryButton>} />
            <div className="safe3">{Object.entries(currencies).map(([key, label]) => <div className={`sf ${key}`} key={key}><span>{label}</span><b><Money amount={safeBalance[key]} currency={key} /></b><small>{transitTotals[key] > 0 ? <>قيد النقل <Money amount={transitTotals[key]} currency={key} /></> : 'ما في اشي قيد النقل'}</small></div>)}</div>
            {debts.length > 0 && <Panel title="ديون المحصّلين" icon="currency" hint="بيضل الدين ظاهر لحد ما ينسدّ"><div className="dlist">{debts.map((debt) => <div className="dl" key={debt.id}><span className="av s">{debt.user?.name?.slice(0, 1)}</span><b>{debt.user?.name}</b><Money amount={debt.remaining} currency={debt.currency} />{access.receive && debt.user_id !== actorId && <SecondaryButton className="sm" onClick={() => openAction('repay', debt)}>تسديد نقدًا</SecondaryButton>}</div>)}</div></Panel>}
            <Panel title="التسليمات للشركة" icon="bank" hint="قيد النقل لا يمنع إرسال الإغلاق.">{transfers.length ? <div className="tw flat"><table className="dt"><thead><tr>{['الوقت', 'الطريقة', 'لمين', 'المبلغ', 'الإثبات', 'الحالة', ''].map((title, index) => <th key={index}>{title}</th>)}</tr></thead><tbody>{transfers.map((transfer) => <tr key={transfer.id}><td className="nw">{dateTime(transfer.sent_at)}</td><td>{transfer.method === 'bank_deposit' ? 'إيداع بالبنك' : 'خزنة الشركة'}</td><td>{transfer.recipient?.name}</td><td className="am"><Money amount={transfer.amount} currency={transfer.currency} /></td><td><a className="file" href={`${urls.proofs}/transfer/${transfer.id}`}><Icon name="eye" />صورة الإثبات</a></td><td><StatusPill tone={transfer.status === 'received' ? 'green' : 'amber'}>{transfer.status === 'received' ? 'استلمته الخزنة' : 'قيد النقل'}</StatusPill></td><td>{transfer.status === 'in_transit' && transfer.recipient_id === actorId && <SecondaryButton className="sm" onClick={() => router.post(`${urls.transferReceipts}/${transfer.id}`, {}, { preserveScroll: true })}>تأكيد الاستلام</SecondaryButton>}</td></tr>)}</tbody></table></div> : <Empty><b>لم تُسجّل تسليمات للشركة بعد.</b></Empty>}</Panel>
            <Panel title="حركة الخزنة" icon="history" hint="حركات الفرع المسجّلة"><ClosingFeed boxes={boxes.filter((box) => box.status === 'received')} transfers={transfers} notes={[]} /></Panel>
        </>}
        {tab === 'history' && <>
            {selected ? <><button className="lnk" onClick={() => router.get(urls.index, { branch_id: branch.id, tab: 'history' }, { preserveScroll: true, preserveState: true })}><Icon name="chevron-left" />الإغلاقات</button><ClosingDetails {...props} closing={selected} onAction={openAction} /></> : <>
            <PageHeading title="الإغلاقات" hint="الإغلاق الرسمي أسبوعي. كل أسبوع فيه كل الصناديق اللي انسكّرت جوّاه، وبينبعت للتدقيق بالترتيب." />
            <div className="cnts big"><span><Icon name="table" />ما انبعتت: <b>{overdue.length}</b></span><span><Icon name="messages" />ملاحظات مفتوحة: <b>{openNotes.length}</b></span><span><Icon name="clock" />بدون مهلة إرسال · العدّاد بس للتذكير</span></div>
            <div className="tw"><table className="dt"><thead><tr>{['الفترة', 'التواريخ', 'الترتيب', 'الصناديق', 'الحالة', ''].map((title, index) => <th key={index}>{title}</th>)}</tr></thead><tbody>{closings.map((closing) => <tr key={closing.id} className={new Date(closing.coverage_until).getTime() > now ? 'cur' : ''}><td className="nw"><b>{periodLabel(closing)}</b>{closing.is_manual && <small className="muted"> · مبكر</small>}</td><td className="nw">{periodRange(closing)}</td><td>{closing.book === 'combined' ? 'مدمج' : closing.book === 'cash' ? 'الكاش · منفصل' : 'البنك · منفصل'}</td><td className="num">{boxes.filter((box) => box.closing_id === closing.id).length}</td><td><ClosingPill closing={closing} /></td><td><SecondaryButton className={`sm ${!closing.submitted_snapshot && new Date(closing.coverage_until).getTime() <= now ? 'pr' : ''}`} onClick={() => selectClosing(closing)}>{!closing.submitted_snapshot && new Date(closing.coverage_until).getTime() <= now ? 'راجع وابعت' : 'مراجعة التفاصيل'}</SecondaryButton></td></tr>)}</tbody></table></div>

            </>}
        </>}
        {tab === 'notes' && <>
            <PageHeading title="ملاحظات التدقيق" hint="التدقيق قسم منفصل. الإغلاق اللي انبعت ما بيتغيّر، وكل تصحيح بينزل كقيد بالأسبوع المفتوح." />
            {notes.length ? notes.map((note) => <article className="nt" key={note.id}><header><span className="nid num">#{note.id}</span><span className="tg">{note.closing?.number.slice(-8)}</span><StatusPill tone={note.status === 'closed' ? 'green' : 'amber'}>{noteStatuses[note.status]}</StatusPill><small>{dateTime(note.created_at)}</small></header><blockquote className="aq"><small><Icon name="shield" />قسم التدقيق</small>{note.body}</blockquote>{note.replies.length > 0 && <div className="thr">{note.replies.map((reply) => <div className="bub h" key={reply.id}><small>{reply.user?.name} · {dateTime(reply.created_at)}</small>{reply.body}{reply.document_path && <a href={`${urls.proofs}/reply/${reply.id}`} className="file"><Icon name="eye" />المستند المرفق</a>}</div>)}</div>}{access.approve && ['awaiting_reply', 'rejected', 'collector_replied'].includes(note.status) && <div className="nacts"><PrimaryButton className="sm" onClick={() => openAction('reply', note)}><Icon name="messages" />الرد على الملاحظة</PrimaryButton></div>}</article>) : <Empty><b>ما في ملاحظات هون</b></Empty>}
        </>}
        {tab === 'settings' && <SettingsOverview {...props} onAction={openAction} />}
        </>}
    </div>{action && <ActionModal key={`${action.kind}-${action.record?.id}`} action={action} onClose={() => setAction(null)} props={props} />}
    {selectedBox && <Modal show onClose={() => setBoxId(null)} maxWidth="2xl"><div className="space-y-5 p-6"><header className="flex items-center justify-between"><h2 className="text-xl font-bold text-gray-900">{selectedBox.user?.name ?? 'الدفعات المباشرة'}</h2><button onClick={() => setBoxId(null)} aria-label="إغلاق النافذة"><Icon name="close" className="h-5 w-5 text-gray-500" /></button></header><p className="font-display text-xs text-gray-500" dir="ltr">{selectedBox.number}</p><StatusPill tone={boxStatuses[selectedBox.status][1]}>{boxStatuses[selectedBox.status][0]}</StatusPill><div className="max-h-72 space-y-2 overflow-y-auto">{selectedBox.payments.map((payment) => <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 p-3 text-sm" key={payment.id}><div className="flex-1"><b>{payment.method === 'cash' ? 'كاش' : payment.transaction?.bank_name ?? 'دفعة إلكترونية'}</b><p className="text-xs text-gray-500">{dateTime(payment.occurred_at)}{payment.is_late ? ' · متأخرة' : ''}</p></div><span className="font-display">{money(payment.amount, payment.currency)}</span>{payment.method !== 'cash' && <><StatusPill tone={payment.status === 'confirmed' ? 'green' : 'amber'}>{payment.status === 'confirmed' ? 'مؤكدة' : payment.status === 'missing' ? 'معلّقة' : 'بانتظار التأكيد'}</StatusPill>{access.receive && payment.status !== 'confirmed' && <><button className="text-xs font-bold text-emerald-700" onClick={() => perform('electronic', payment, { status: 'confirmed' })}>تأكيد</button><button className="text-xs font-bold text-amber-700" onClick={() => perform('electronic', payment, { status: 'missing' })}>تعليق</button>{access.manage && selectedBox.kind !== 'direct' && selectedBox.status === 'open' && payment.status === 'pending' && <button className="text-xs font-bold text-brand-600" onClick={() => perform('direct', payment)}>نقل للدفعات المباشرة</button>}</>}</>}</div>)}</div><div className="flex flex-wrap gap-3">{selectedBox.isOwn && selectedBox.status === 'open' && <PrimaryButton onClick={() => openAction('close', selectedBox)}>عدّ وإغلاق صندوقي</PrimaryButton>}{selectedBox.isOwn && selectedBox.status === 'pending' && !selectedBox.collector_counts && <PrimaryButton onClick={() => openAction('collector-count', selectedBox)}>عدّ الكاش عند التسليم</PrimaryButton>}{selectedBox.canCount && selectedBox.collectorCounted && selectedBox.kind !== 'direct' && selectedBox.status === 'pending' && !selectedBox.head_counts && <PrimaryButton onClick={() => openAction('head-count', selectedBox)}>عدّ المبلغ المستلم</PrimaryButton>}{selectedBox.canCount && selectedBox.status === 'pending' && selectedBox.head_counts && selectedBox.received_by === actorId && <PrimaryButton onClick={() => openAction('receive', selectedBox)}>مراجعة العدّ واعتماد الاستلام</PrimaryButton>}{selectedBox.isOwn && selectedBox.status === 'received' && !selectedBox.confirmed_at && <PrimaryButton onClick={() => perform('confirm', selectedBox)}>أؤكّد تسليم الصندوق</PrimaryButton>}</div>{selectedBox.status === 'pending' && selectedBox.kind !== 'direct' && !selectedBox.collectorCounted && <p className="text-sm text-amber-700">بانتظار حفظ عدّ المحصّل قبل عدّ المستلم.</p>}<BoxCountSummary box={selectedBox} />{selectedBox.status === 'received' && <MoneyStack amounts={selectedBox.head_counts} className="text-lg font-bold text-gray-900" />}</div></Modal>}
    </AuthenticatedLayout>;
}

function Task({ tone, icon, label, hint, onClick, action }) {
    return <div className={`td ${tone}`}><span className="ti"><Icon name={icon} /></span><div><b>{label}</b><small>{hint}</small></div>{onClick && <SecondaryButton className="sm" onClick={onClick}>{action}<Icon name="chevron-left" /></SecondaryButton>}</div>;
}

function DailyBars({ payments, current, now }) {
    const civilDate = (value) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Gaza' }).format(new Date(value));
    const start = new Date(`${civilDate(current.coverage_from)}T00:00:00Z`);
    const end = new Date(`${civilDate(current.coverage_until)}T00:00:00Z`);
    const count = Math.min(15, Math.max(1, Math.round((end - start) / 86400000) + 1));
    const days = Array.from({ length: count }, (_, index) => {
        const from = start.getTime() + index * 86400000;
        const key = new Date(from).toISOString().slice(0, 10);
        const amount = totals(payments.filter((payment) => civilDate(payment.occurred_at) === key)).ILS;
        return { from, key, amount };
    });
    const max = Math.max(1, ...days.map((day) => day.amount));
    return <div className="dbars" role="img" aria-label="التحصيل النقدي بالشيكل حسب اليوم">{days.map((day) => {
        const future = day.key > civilDate(now);
        const today = day.key === civilDate(now);
        const label = new Intl.DateTimeFormat('ar-SY', { weekday: 'short', timeZone: 'UTC' }).format(new Date(day.from));
        return <div key={day.from} tabIndex="0" className={`db ${future ? 'fut' : ''} ${today ? 'now' : ''}`} data-tip={`${branchDate(day.from)} · ${future ? 'لسا ما إجا' : money(day.amount)}`}><div className="col">{!future && <i style={{ height: `${Math.max(3, day.amount / max * 100)}%` }} />}{today && day.amount > 0 && <em className="num" style={{ bottom: `calc(${Math.max(3, day.amount / max * 100)}% + 4px)` }}>{formatMoney(day.amount)}</em>}</div><small>{label.replace('ال', '').slice(0, 3)}</small></div>;
    })}</div>;
}

function ClosingFeed({ boxes, transfers, notes }) {
    const movements = [
        ...boxes.filter((box) => box.closed_at).map((box) => ({ id: `box-${box.id}`, at: box.closed_at, icon: 'table', tone: box.status === 'received' ? 'g' : 'a', text: `${box.user?.name ?? 'الدفعات المباشرة'} · ${box.status === 'received' ? 'استلام صندوق' : 'إغلاق صندوق'} ${box.number.slice(-8)}` })),
        ...transfers.map((transfer) => ({ id: `transfer-${transfer.id}`, at: transfer.sent_at, icon: 'bank', tone: 'b', text: `تسليم للشركة · ${money(transfer.amount, transfer.currency)}` })),
        ...notes.map((note) => ({ id: `note-${note.id}`, at: note.created_at, icon: 'messages', tone: 'p', text: `ملاحظة تدقيق #${note.id} · ${noteStatuses[note.status]}` })),
    ].sort((left, right) => new Date(right.at) - new Date(left.at)).slice(0, 8);
    return <div className="card feed">{movements.length ? <ul className="fl">{movements.map((item) => <li key={item.id} className={item.tone}><span className="fi"><Icon name={item.icon} /></span><div><b>{item.text}</b><small>{dateTime(item.at)}</small></div></li>)}</ul> : <div className="empty"><Icon name="history" /><b>ما في حركات</b></div>}</div>;
}

function SettingsOverview({ settings, current, pendingChange, staff, receivers, approvers, access, onAction }) {
    const edit = () => onAction('settings');
    return <>
        <PageHeading title="إعدادات الإغلاق" hint="رئيس الفرع بيتحكّم فيها من هون. أي تغيير بيبدأ من الفترة الجاية، وبينحفظ بالسجل." action={access.manage && <PrimaryButton onClick={edit}><Icon name="cog" />تعديل الإعدادات</PrimaryButton>} />
        {pendingChange && <div className="bn p"><Icon name="clock" /><div><b>تغيير مجدول يبدأ من {dateTime(pendingChange.effective_from)}</b><TransitionPreview from={pendingChange.effective_from} settings={pendingChange.settings} /></div></div>}
        <div className="setg">
            <section className="sc"><h3><Icon name="calendar" />يوم بداية الأسبوع</h3><div className="chips">{[6, 0, 1, 2, 3, 4, 5].map((index) => <button key={index} disabled={!access.manage} aria-pressed={Number(settings.week_starts_on) === index} onClick={edit}>{weekdays[index]}</button>)}</div></section>
            <section className="sc"><h3><Icon name="clock" />وقت القطع</h3><div className="chips">{[...new Set(['14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '22:00', settings.cutoff_time])].sort().map((time) => <button key={time} disabled={!access.manage} aria-pressed={settings.cutoff_time === time} onClick={edit}><b className="num">{time}</b></button>)}</div></section>
            <p className="sline"><Icon name="shield" />أي دفعة بعد القطع بتروح للفترة اللي بعدها، والصناديق المفتوحة بتنسكّر لحالها.</p>
            <section className="sc"><h3><Icon name="table" />الإغلاق الرسمي</h3><div className="opts">{[['weekly', 'أسبوعي', 'المعتمد بالشركة. المحصّلين بيسكّروا صناديقهم وقت ما بدّهم، وكل الصناديق بتدخل إغلاق الأسبوع.'], ['daily', 'يومي', 'نفس الخطوات، بس الفترة يوم.']].map(([key, label, hint]) => <button className="opt" key={key} disabled={!access.manage} aria-pressed={settings.frequency === key} onClick={edit}><b>{label}{key === 'weekly' && <StatusPill tone="green">معتمد</StatusPill>}</b><small>{hint}</small></button>)}</div></section>
            <section className="sc"><h3><Icon name="wallet" />الكاش والبنك</h3><div className="opts">{[['combined', 'مدمج', 'إغلاق واحد فيه الكاش والإلكتروني.'], ['separate', 'منفصل', 'إغلاقين: واحد للكاش وواحد للبنك والإلكتروني. كل واحد بينبعت وبينرجع لحاله.']].map(([key, label, hint]) => <button className="opt" key={key} disabled={!access.manage} aria-pressed={settings.arrangement === key} onClick={edit}><b>{label}</b><small>{hint}</small></button>)}</div></section>
        </div>
        <Section title="إغلاق مبكر"><div className="card pad"><p>بيسكّر الفترة هلأ، وكل الصناديق المفتوحة بتنسكّر وبتحتاج تنجرد. باقي الأيام بتصير «تكملة الأسبوع» حتى {dateTime(current.scheduled_until)}، ويوم البداية ما بيتغيّر.</p>{access.approve && <SecondaryButton onClick={() => onAction('early', current)}><Icon name="bolt" />إغلاق مبكر لـ{periodLabel(current)}</SecondaryButton>}</div></Section>
        <Section title="الصلاحيات" hint="التفويضات الإضافية بتشتغل على طول؛ يدير رئيس الفرع الصلاحيات من تعديل الإعدادات."><div className="tw"><table className="dt perm"><thead><tr><th>الموظف</th><th>تفويض العدّ والاستلام</th><th>تفويض الاعتماد والإرسال</th></tr></thead><tbody>{staff.map((person) => <tr key={person.id}><td><span className="who"><span className="av s">{person.name.slice(0, 1)}</span>{person.name}</span></td><td><StatusPill tone={receivers.includes(person.id) ? 'green' : undefined}>{receivers.includes(person.id) ? 'مفعّل' : '—'}</StatusPill></td><td><StatusPill tone={approvers.includes(person.id) ? 'green' : undefined}>{approvers.includes(person.id) ? 'مفعّل' : '—'}</StatusPill></td></tr>)}</tbody></table></div><p className="pn muted"><Icon name="shield" />ما حدا بيستلم صندوقه هو. حتى لو معه الصلاحية، صندوقه بيستلمه شخص تاني.</p></Section>
    </>;
}

function ClosingDetails({ closing, closings, boxes, safeCounts, adjustments, versions, access, urls, transfers, debts, onAction }) {
    const snapshot = closing.submitted_snapshot;
    const periodIds = closings.filter((period) => period.coverage_from === closing.coverage_from).map((period) => period.id);
    const periodBoxes = snapshot?.boxes ?? boxes.filter((box) => periodIds.includes(box.closing_id) && (closing.book === 'combined' || (closing.book === 'bank' ? box.kind === 'direct' : box.kind !== 'direct')));
    const safe = snapshot?.safeCount ?? safeCounts.find((count) => count.closing_id === closing.id);
    const corrections = snapshot?.adjustments ?? adjustments.filter((item) => item.closing_id === closing.id);
    const open = new Date(closing.coverage_until) > new Date();
    return <>
        <PageHeading title={`إغلاق ${periodLabel(closing)}`} hint={`${periodRange(closing)} · القطع ${branchClock(closing.coverage_until)} · ${closing.book === 'combined' ? 'مدمج' : closing.book === 'cash' ? 'الكاش · منفصل' : 'البنك · منفصل'}`} action={<ClosingPill closing={closing} />} />
        <ClosingStepper closing={closing} />
        {open && <div className="bn b"><Icon name="clock" /><div><b>الأسبوع شغّال · بيتسكّر لحاله {dateTime(closing.coverage_until)}</b><small>الأرقام حيّة وبتتحدّث حتى الاعتماد.</small></div>{access.approve && <div className="r"><SecondaryButton className="sm" onClick={() => onAction('early', closing)}><Icon name="bolt" />إغلاق مبكر</SecondaryButton></div>}</div>}
        {snapshot && <div className="bn p"><Icon name="shield" /><div><b>الأرقام المعتمدة المحفوظة لحظة الإرسال</b><small>أي تصحيح لاحق يدخل الفترة المفتوحة.</small></div></div>}
        {closing.blockers.length > 0 && <div className="bn a"><Icon name="shield" /><div><b>قبل ما تبعت، كمّل النواقص</b><ul className="blocker-list">{closing.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div></div>}
        <Panel title="ملخص الإغلاق ومعادلة الكاش" hint="كل عملة لحالها · ما في تحويل بين العملات" icon="currency"><ReviewSummary closing={closing} /></Panel>
        <Panel title="الصناديق حسب الشخص" hint={`${periodBoxes.length} صندوق في هذه الفترة`} icon="users">{periodBoxes.length ? <div className="tw flat"><table className="dt"><thead><tr><th>الشخص</th><th>الصندوق</th><th>الكاش المستلم</th><th>الحالة</th></tr></thead><tbody>{periodBoxes.map((box) => <tr key={box.id}><td><span className="who"><span className="av s hu1">{box.user?.name?.slice(0, 1) ?? <Icon name="wallet" />}</span>{box.user?.name ?? 'الدفعات المباشرة'}</span></td><td className="num">{box.number.slice(-8)}</td><td className="am"><MoneyStack amounts={box.head_counts ?? {}} /><details><summary className="lnk">تفاصيل العدّ</summary><BoxCountSummary box={box} /></details></td><td><StatusPill tone={boxStatuses[box.status][1]}>{boxStatuses[box.status][0]}</StatusPill></td></tr>)}</tbody></table></div> : <Empty><b>ما في صناديق بهالفترة</b></Empty>}</Panel>
        {safe && <Panel title="جرد الخزنة محفوظ" icon="vault"><div className="sfr">{Object.entries(currencies).map(([key, label]) => <div key={key}><span>{label}</span><b><Money amount={safe.counts[key]} currency={key} /></b><small>المتوقع <Money amount={safe.expected[key]} currency={key} /></small><small>الفرق <Money amount={safe.differences[key]} currency={key} /></small></div>)}</div><p className="section-hint">{safe.reason}</p></Panel>}
        <ClosingMovements closing={closing} closings={closings} boxes={boxes} transfers={transfers} debts={debts} urls={urls} />
        {corrections.length > 0 && <Panel title="تصحيحات أسابيع سابقة" icon="history">{corrections.map((item) => <p className="section-hint" key={item.id}>ملاحظة #{item.audit_note_id}: {money(item.amount, item.currency)} · {item.reason}</p>)}</Panel>}
        <div className="rowb">{!snapshot && !open && access.approve && <>{closing.book !== 'bank' && !safe && <SecondaryButton onClick={() => onAction('safe-count', closing)}>جرد الخزنة (عدّ أعمى)</SecondaryButton>}<PrimaryButton disabled={closing.blockers.length > 0} onClick={() => onAction('submit', closing)}>مراجعة واعتماد وإرسال</PrimaryButton></>}{closing.status === 'submitted' && !closing.reviewed_at && !closing.reviewed_by && access.approve && <SecondaryButton onClick={() => onAction('withdraw', closing)}>سحب الإغلاق</SecondaryButton>}</div>
        {versions.length > 0 && <Panel title="النسخ المرسلة" hint="كل إرسال بينحفظ كنسخة" icon="history">{versions.map((version, index) => <details key={version.id} className="version-row"><summary>النسخة {version.version} · {dateTime(version.created_at)}{version.withdrawn_at ? ' · مسحوبة' : ''}</summary><p className="section-hint">{version.notes ?? 'دون ملاحظة'}</p><MoneyStack amounts={version.snapshot.safeBalanceAtSubmission} />{versions[index + 1] && <VersionDifferences version={version} previous={versions[index + 1]} />}</details>)}</Panel>}
    </>;
}

function ClosingStepper({ closing }) {
    const labels = ['مفتوح', 'جاهز للمراجعة', 'مُرسل', 'قيد التدقيق', closing.open_notes_count > 0 ? 'بملاحظات' : 'مقبول'];
    const stage = closing.open_notes_count > 0 || closing.status === 'approved' ? 4 : closing.submitted_snapshot ? (closing.reviewed_at ? 3 : 2) : new Date(closing.coverage_until) > new Date() ? 0 : 1;
    return <ol className="stp">{labels.map((label, index) => <li key={label} className={index < stage ? 'done' : index === stage ? `on ${closing.open_notes_count > 0 ? 'bad' : ''}` : ''}><span>{index < stage ? <Icon name="check" /> : index + 1}</span><b>{label}</b></li>)}</ol>;
}
function ReviewSummary({ closing }) {
    const summary = closing.summary;
    if (!summary) return null;
    return <div className="space-y-4 rounded-xl border border-gray-200 p-4">
        {closing.book !== 'bank' && <div><b className="text-sm text-gray-700">الكاش المستلم فعليًا</b><MoneyStack amounts={summary.cash} className="mt-2 text-lg font-bold text-gray-900" /></div>}
        {closing.book !== 'cash' && <div><b className="text-sm text-gray-700">الإلكتروني المؤكّد لهذا الإغلاق</b><MoneyStack amounts={summary.bank} className="mt-2 text-lg font-bold text-gray-900" /></div>}
        {summary.cashLedger && <CashLedger ledger={summary.cashLedger} />}
        {(summary.pendingElectronic > 0 || summary.missingElectronic > 0 || summary.inTransit > 0) && <p className="rounded-lg bg-amber-500/10 p-3 text-xs leading-6 text-amber-700 dark:text-amber-400">تنبيهات لا تمنع الإرسال: {summary.pendingElectronic} دفعات بانتظار التأكيد، {summary.missingElectronic} معلّقة، {summary.inTransit} تسليمات قيد النقل. الدفعات المعلّقة تُحسب عند العثور عليها في الفترة المفتوحة.</p>}
        {summary.unsyncedCollectors?.length > 0 && <p className="rounded-lg bg-amber-500/10 p-3 text-xs leading-6 text-amber-700 dark:text-amber-400">لم يصل تأكيد مزامنة بعد القطع، أو توجد دفعات على الجوال بانتظار المزامنة: {summary.unsyncedCollectors.map((person) => person.name).join('، ')}. هذا تنبيه ولا يمنع الإرسال.</p>}
    </div>;
}

function CashLedger({ ledger }) {
    const labels = { opening: 'رصيد أول الفترة', received: 'استلام الصناديق', repayments: 'تسديد الديون', sent: 'ما خرج للشركة (−)', adjustments: 'قيود التصحيح', safeDifference: 'فرق جرد الخزنة', remaining: 'الرصيد الباقي للفترة', afterCutoff: 'حركة الفترات التالية', actualNow: 'الرصيد الفعلي الآن' };
    return <div className="overflow-x-auto rounded-xl border border-gray-200"><table className="dt w-full min-w-[440px] text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="p-3 text-start">معادلة الكاش</th>{Object.values(currencies).map((label) => <th key={label} className="p-3 text-start">{label}</th>)}</tr></thead><tbody>{Object.entries(labels).map(([key, label]) => <tr key={key} className={`border-t border-gray-100 ${['remaining', 'actualNow'].includes(key) ? 'bg-brand-50 font-bold text-brand-600' : 'text-gray-700'}`}><td className="p-3">{label}</td>{Object.keys(currencies).map((currency) => <td key={currency} dir="ltr" className="p-3 font-display tabular-nums">{formatMoney(ledger[key]?.[currency])}</td>)}</tr>)}</tbody></table></div>;
}

function ClosingMovements({ closing, boxes, closings, transfers, debts, urls }) {
    const periodIds = closings.filter((period) => period.coverage_from === closing.coverage_from).map((period) => period.id);
    const snapshot = closing.submitted_snapshot;
    const periodBoxes = boxes.filter((box) => periodIds.includes(box.closing_id));
    const electronic = closing.book === 'cash' ? [] : (snapshot?.electronic ?? boxes.flatMap((box) => box.payments).filter((payment) => payment.method !== 'cash' && (periodBoxes.some((box) => box.id === payment.cash_box_id) || payment.confirmed_in_closing_id === closing.id)));
    const deliveries = closing.book === 'bank' ? [] : (snapshot?.transfers ?? transfers.filter((transfer) => transfer.closing_id === closing.id));
    const periodDebts = closing.book === 'bank' ? [] : (snapshot?.debts ?? debts.filter((debt) => periodBoxes.some((box) => box.id === debt.cash_box_id)));
    return <div className="space-y-4">
        {electronic.length > 0 && <div><h3 className="mb-2 text-sm font-bold text-gray-900">الدفعات الإلكترونية</h3><div className="divide-y divide-gray-100 rounded-xl border border-gray-200">{electronic.map((payment) => <div key={payment.id} className="flex flex-wrap items-center gap-3 p-3 text-sm text-gray-700"><span className="flex-1">{payment.transaction?.bank_name ?? 'إلكتروني'} · {payment.transaction?.reference_number ?? '—'}<small className="mt-1 block text-gray-500">{dateTime(payment.occurred_at)}{payment.is_late ? ' · متأخرة' : ''}</small></span><b dir="ltr" className="font-display">{money(payment.amount, payment.currency)}</b><StatusPill tone={payment.status === 'confirmed' ? 'green' : 'amber'}>{payment.status === 'confirmed' ? 'مؤكدة' : payment.status === 'missing' ? 'معلّقة' : 'بانتظار التأكيد'}</StatusPill></div>)}</div></div>}
        {deliveries.length > 0 && <div><h3 className="mb-2 text-sm font-bold text-gray-900">التسليمات للشركة</h3>{deliveries.map((transfer) => <div key={transfer.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 py-3 text-sm text-gray-700"><span className="flex-1">{transfer.recipient?.name ?? 'خزنة الشركة'} · {dateTime(transfer.sent_at)}</span><b dir="ltr" className="font-display">{money(transfer.amount, transfer.currency)}</b><a href={`${urls.proofs}/transfer/${transfer.id}`} className="text-brand-600 underline">صورة الإثبات</a><StatusPill tone={transfer.status === 'received' ? 'green' : 'amber'}>{transfer.status === 'received' ? 'مستلم' : 'قيد النقل'}</StatusPill></div>)}</div>}
        {periodDebts.length > 0 && <div><h3 className="text-sm font-bold text-gray-900">ديون الصناديق</h3>{periodDebts.map((debt) => <p key={debt.id} className="mt-2 text-sm text-gray-700">الصندوق #{debt.cash_box_id} · الدين {money(debt.amount, debt.currency)} · المتبقي {money(debt.remaining, debt.currency)}</p>)}</div>}
    </div>;
}

function BoxCountSummary({ box }) {
    if (!box.expected_counts) return null;
    return <div className="w-full overflow-x-auto rounded-xl border border-gray-200"><table className="dt w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr>{['العملة', 'المتوقع', 'عدّ المحصّل', 'عدّ المستلم', 'الفرق', 'القرار'].map((title) => <th key={title} className="whitespace-nowrap p-3 text-start">{title}</th>)}</tr></thead><tbody>{Object.entries(currencies).map(([currency, label]) => <tr key={currency} className="border-t border-gray-100 text-gray-700"><td className="p-3">{label}</td><td className="p-3" dir="ltr">{money(box.expected_counts[currency], currency)}</td><td className="p-3" dir="ltr">{box.collector_counts ? money(box.collector_counts[currency], currency) : '—'}</td><td className="p-3" dir="ltr">{box.head_counts ? money(box.head_counts[currency], currency) : '—'}</td><td className="p-3" dir="ltr">{box.head_counts ? money(Number(box.head_counts[currency]) - Number(box.expected_counts[currency]), currency) : '—'}</td><td className="p-3">{box.decisions?.[currency] === 'debt' ? 'دين على المحصّل' : box.decisions?.[currency] === 'accepted' ? 'مقبول' : '—'}</td></tr>)}</tbody></table>{box.reason && <p className="border-t border-gray-100 p-3 text-xs text-gray-500">السبب: {box.reason}</p>}</div>;
}

function VersionDifferences({ version, previous }) {
    const difference = closingVersionDifferences(version, previous);
    return <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 text-xs text-gray-500">
        <p>التغيّر عن النسخة {previous.version} (النسخة الحالية − السابقة)</p>
        {version.snapshot.book !== 'bank' && <div>الكاش المستلم:<MoneyStack amounts={difference.cash} className="mt-1" />رصيد الخزنة:<MoneyStack amounts={difference.safe} className="mt-1" /></div>}
        {version.snapshot.book !== 'cash' && <div>الإلكتروني المؤكّد:<MoneyStack amounts={difference.bank} className="mt-1" /></div>}
        {Object.entries({ boxes: 'صناديق تغيّرت', electronic: 'دفعات إلكترونية تغيّرت', transfers: 'تسليمات تغيّرت', adjustments: 'قيود تصحيح تغيّرت' }).map(([key, label]) => difference.changed[key].length > 0 && <p key={key}>{label}: {difference.changed[key].map((id) => `#${id}`).join('، ')}</p>)}
    </div>;
}
