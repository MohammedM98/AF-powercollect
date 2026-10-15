import { useEffect, useState } from 'react';
import { Head, Link, router, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from './ClosingIcon';
import BaseModal from '@/Components/Modal';
import { formatMoney } from '@/lib/format';
import { PrimaryButton, SecondaryButton, StatusPill, dateTime, branchClock, branchDate, periodRange, periodLabel, MoneyStack, Money, Panel } from './ClosingComponents';
import BoxDetails from './BoxDetails';
import './closing.css';

const currencies = { ILS: 'شيكل', USD: 'دولار', JOD: 'دينار' };
const symbols = { ILS: '₪', USD: '$', JOD: 'د.أ' };
const weekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const tabs = [['current', 'الأسبوع الحالي', 'home'], ['safe', 'الخزنة والتسليم', 'vault'], ['history', 'الإغلاقات', 'layers'], ['notes', 'ملاحظات التدقيق', 'messages'], ['settings', 'الإعدادات', 'cog']];
const noteStatuses = { awaiting_reply: 'بانتظار الرد', rejected: 'مرفوضة · تحتاج ردًا', with_collector: 'عند المحصّل', collector_replied: 'ردّ المحصّل', awaiting_audit: 'بانتظار قرار التدقيق', closed: 'مغلقة' };
const inputClass = 'inp';
const cardClass = 'card';

/**
 * The currencies to show: shekels, the company's only currency, and a
 * dollar or dinar balance only while the safe still holds some from before
 * every payment was kept in shekels.
 */
const shownCurrencies = (balance) => Object.keys(currencies).filter((currency) => currency === 'ILS' || Number(balance?.[currency] ?? 0) !== 0);
function Modal({ panelClassName = '', ...props }) {
    return <BaseModal {...props} centered panelClassName={`closing-ui closing-dialog ${panelClassName}`} />;
}
const money = (value, currency = 'ILS') => `${formatMoney(value ?? 0)} ${symbols[currency]}`;
const totals = (payments, method = 'cash') => Object.fromEntries(Object.keys(currencies).map((currency) => [currency, payments.filter((payment) => payment.currency === currency && (method === 'all' || (method === 'electronic' ? payment.method !== 'cash' : payment.method === method)) && (!payment.transaction || payment.transaction.status === 'active')).reduce((sum, payment) => sum + Number(payment.amount), 0)]));

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

function ClosingPill({ closing }) {
    const open = new Date(closing.coverage_until) > new Date();
    const state = closing.open_notes_count > 0 ? ['بملاحظات', 'amber'] : closing.status === 'approved' ? ['مقبول', 'green'] : closing.submitted_snapshot ? (closing.reviewed_at ? ['قيد التدقيق', 'blue'] : ['مُرسل', 'purple']) : open ? ['مفتوح', 'blue'] : ['جاهز للمراجعة', 'amber'];
    return <StatusPill tone={state[1]}>{state[0]}</StatusPill>;
}

function CollectorCard({ name, boxes, debts, onOpen, color = 0 }) {
    const open = boxes.find((box) => box.status === 'open');
    const pending = boxes.filter((box) => box.status === 'pending');
    return <article className="cc"><header><span className={`av hu${color % 5 + 1}`}>{name.slice(0, 1)}</span><div><b>{name}</b><small>صندوق الموظف</small></div>{open && <button className="ib sm" aria-label={`عرض صندوق ${name}`} onClick={() => onOpen(open)}><Icon name="eye" /></button>}</header>
        <div className="cc-o"><span className="lbl">{open ? <>صندوق مفتوح <b className="num">{open.number.slice(-8)}</b></> : 'لا يوجد صندوق مفتوح'}</span>
            <div className="v"><MoneyStack amounts={totals(open?.payments ?? [], 'cash')} /><small>{open?.payments.length ? `${open.payments.length} دفعات · من ${dateTime(open.opened_at)}` : 'لسا فاضي'}</small></div>
        </div>
        <div className={`cc-p ${pending.length ? '' : 'ok'}`}><div>{pending.length ? <><span>{pending.length} صندوق بانتظار تأكيد الإغلاق</span><small><MoneyStack amounts={totals(pending.flatMap((box) => box.payments), 'cash')} /></small></> : <span><Icon name="check" /> ما معه صناديق بانتظار تأكيد الإغلاق</span>}</div>{pending.length > 0 && <SecondaryButton className="sm" onClick={() => onOpen(pending[0])}>مراجعة</SecondaryButton>}</div>
        {debts.map((debt) => <div key={debt.id} className="cc-d"><span><Icon name="currency" /> دين متبقٍ: <Money amount={debt.remaining} currency={debt.currency} /></span></div>)}
    </article>;
}

function ActionModal({ action, onClose, props }) {
    const { branch, urls, recipients, staff, settings, receivers, approvers, current, transitionUntil } = props;
    const form = useForm({ branch_id: branch.id, decisions: { ILS: 'accepted', USD: 'accepted', JOD: 'accepted' }, amount: '', currency: 'ILS', method: 'hand_delivery', recipient_id: '', proof: null, kind: 'clarification', body: '', document: null, book: 'cash', settings: { week_starts_on: settings.week_starts_on, cutoff_time: settings.cutoff_time }, receivers: [...receivers], approvers: [...approvers] });
    const names = { start: 'بدء الإغلاق الأسبوعي للفرع', early: 'إغلاق الفترة مبكرًا', transfer: 'تسليم كاش للشركة', repay: 'تسديد دين المحصّل', reply: 'الرد على ملاحظة التدقيق', settings: 'إعدادات الإغلاق' };
    const shown = shownCurrencies(props.safeBalance);
    const box = action.record;
    function submit(event) {
        event.preventDefault();
        form.post(`${urls.actions}/${action.kind}${box?.id ? `/${box.id}` : ''}`, { preserveScroll: true, onSuccess: onClose });
    }
    function toggleGrant(key, id) {
        form.setData(key, form.data[key].includes(id) ? form.data[key].filter((value) => value !== id) : [...form.data[key], id]);
    }
    return <Modal show onClose={onClose} maxWidth="2xl"><form onSubmit={submit} className="flex max-h-[90vh] flex-col"><header className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-5"><div><h2 className="text-xl font-bold text-gray-900">{names[action.kind]}</h2><p className="mt-1 text-sm text-gray-500">{box?.number ?? branch.name}</p></div><button type="button" onClick={onClose} aria-label="إغلاق النافذة" className="rounded-lg p-2 text-gray-500 hover:bg-gray-50"><Icon name="close" className="h-5 w-5" /></button></header><div className="space-y-5 overflow-y-auto p-6">
        {action.kind === 'start' && <p className="text-sm leading-7 text-gray-700">يبدأ مسار الإغلاق الأسبوعي من هذه اللحظة، وتدخل فيه الدفعات الجديدة. تبقى الإغلاقات التاريخية محفوظة. حدّد لاحقًا يوم البداية ووقت القطع من تبويب الإعدادات.</p>}
        {action.kind === 'early' && <p className="text-sm leading-7 text-gray-700">يغطي الطرد الفترة حتى الآن، وتُغلق الصناديق المفتوحة. تنضم الأيام المتبقية إلى الأسبوع القادم حتى موعد قطعه.</p>}
        {['transfer', 'repay'].includes(action.kind) && <><Field label={action.kind === 'repay' ? `المبلغ نقدًا · المتبقي ${money(box.remaining, box.currency)}` : 'المبلغ'}><input required type="number" min="0.01" step="0.01" dir="ltr" className={inputClass} value={form.data.amount} onChange={(event) => form.setData('amount', event.target.value)} /></Field>{action.kind === 'transfer' && <>{shown.length > 1 && <Field label="العملة"><select className={inputClass} value={form.data.currency} onChange={(event) => form.setData('currency', event.target.value)}>{shown.map((key) => <option key={key} value={key}>{currencies[key]}</option>)}</select></Field>}<Field label="طريقة التسليم"><select className={inputClass} value={form.data.method} onChange={(event) => form.setData('method', event.target.value)}><option value="hand_delivery">خزنة الشركة</option><option value="bank_deposit">إيداع في حساب الشركة</option></select></Field><Field label="المستلم"><select required className={inputClass} value={form.data.recipient_id} onChange={(event) => form.setData('recipient_id', event.target.value)}><option value="">اختر المستلم</option>{recipients.filter((person) => person.id !== props.actorId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="صورة الإثبات (إلزامية)"><input required type="file" accept="image/jpeg,image/png,image/webp" className={inputClass} onChange={(event) => form.setData('proof', event.target.files[0])} /></Field></>}</>}
        {action.kind === 'reply' && <><p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">{box.body}</p><Field label="نوع الرد"><select className={inputClass} value={form.data.kind} onChange={(event) => form.setData('kind', event.target.value)}><option value="clarification">اعتراض / توضيح</option><option value="adjustment">صحّحت بقيد في الأسبوع المفتوح</option><option value="document">إرفاق مستند</option>{box.cash_box_id && <option value="collector">تحويل للمحصّل</option>}</select></Field><Field label="الرد / سبب التصحيح"><textarea required rows="3" className={inputClass} value={form.data.body} onChange={(event) => form.setData('body', event.target.value)} /></Field>{box.differences && !box.difference_decisions && form.data.kind !== 'collector' && <div className="space-y-3 rounded-xl border border-gray-200 p-4"><h3 className="text-sm font-bold text-gray-900">قرار فروقات التدقيق</h3>{Object.entries(box.differences).filter(([, amount]) => Number(amount) !== 0).map(([currency, amount]) => <Field key={currency} label={`${currencies[currency]} · فرق ${money(amount, currency)}`}><select className={inputClass} value={form.data.decisions[currency]} onChange={(event) => form.setData('decisions', { ...form.data.decisions, [currency]: event.target.value })}><option value="accepted">قبول السبب / الزيادة للشركة</option>{Number(amount) < 0 && <option value="debt">رفض السبب · دين على المحصّل</option>}</select></Field>)}</div>}{form.data.kind === 'document' && <Field label="المستند"><input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => form.setData('document', event.target.files[0])} /></Field>}{form.data.kind === 'adjustment' && <div className={`grid gap-3 ${shown.length > 1 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}><Field label="الدفتر"><select className={inputClass} value={form.data.book} onChange={(event) => form.setData('book', event.target.value)}><option value="cash">كاش</option><option value="bank">إلكتروني</option></select></Field>{shown.length > 1 && <Field label="العملة"><select className={inputClass} value={form.data.currency} onChange={(event) => form.setData('currency', event.target.value)}>{shown.map((key) => <option key={key} value={key}>{currencies[key]}</option>)}</select></Field>}<Field label="المبلغ (+ / −)"><input required type="number" step="0.01" dir="ltr" className={inputClass} value={form.data.amount} onChange={(event) => form.setData('amount', event.target.value)} /></Field></div>}</>}
        {action.kind === 'settings' && <><div className="grid gap-4 sm:grid-cols-2"><Field label="يوم بداية الأسبوع"><select className={inputClass} value={form.data.settings.week_starts_on} onChange={(event) => form.setData('settings', { ...form.data.settings, week_starts_on: Number(event.target.value) })}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></Field><Field label="وقت القطع"><input required type="time" className={inputClass} value={form.data.settings.cutoff_time} onChange={(event) => form.setData('settings', { ...form.data.settings, cutoff_time: event.target.value })} /></Field></div><p className="rounded-xl bg-blue-500/10 p-4 text-sm leading-7 text-blue-600">يسري تغيير الموعد والترتيب بعد {dateTime(current?.scheduled_until)}. الفترة الانتقالية تُعرض قبل الحفظ. الصلاحيات تُفعّل فورًا.</p><TransitionPreview from={current?.scheduled_until} settings={form.data.settings} /><fieldset className="space-y-3"><legend className="font-bold text-gray-900">صلاحيات الفرع</legend>{staff.map((person) => <div key={person.id} className="flex flex-wrap items-center gap-4 text-sm text-gray-700"><b className="min-w-28 flex-1">{person.name}</b>{[['receivers', 'مراجعة الصناديق وإغلاقها'], ['approvers', 'الاعتماد والإرسال']].map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form.data[key].includes(person.id)} onChange={() => toggleGrant(key, person.id)} />{label}</label>)}</div>)}</fieldset></>}
        {Object.keys(form.errors).length > 0 && <div role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">{Object.entries(form.errors).map(([key, error]) => <p key={key}>{error}</p>)}</div>}
        {form.progress && <progress className="w-full" value={form.progress.percentage} max="100" />}
    </div><footer className="flex justify-end gap-3 border-t border-gray-100 p-5"><SecondaryButton type="button" onClick={onClose}>إلغاء</SecondaryButton><PrimaryButton type="submit" disabled={form.processing}>{form.processing ? 'جارٍ الحفظ…' : 'تأكيد وحفظ'}</PrimaryButton></footer></form></Modal>;
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
    end.setUTCDate(end.getUTCDate() + (Number(settings.week_starts_on) - end.getUTCDay() + 7) % 7);
    if (end <= start) end.setUTCDate(end.getUTCDate() + 7);
    const days = (end - start) / 86400000;
    return <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700">طول الفترة القادمة: <b className="font-display">{days.toFixed(2)}</b> يوم. تنتهي بتاريخ <b dir="ltr">{end.toISOString().slice(0, 10)} {settings.cutoff_time}</b> بتوقيت الفرع.</div>;
}

export default function ClosingsIndex(props) {
    const { branch, branches, started, current, closings, boxes, safeBalance, transfers, debts, notes, settings, pendingChange, safeCounts, adjustments, access, urls, actorId } = props;
    const [tab, setTab] = useState(() => { const requested = new URLSearchParams(window.location.search).get('tab'); return tabs.some(([key]) => key === requested) ? requested : 'current'; });
    const [action, setAction] = useState(null);
    const [boxId, setBoxId] = useState(null);
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
    const selectedBox = boxes.find((box) => box.id === boxId);
    function openAction(kind, record = null) { setBoxId(null); setAction({ kind, record }); }
    function perform(kind, record, extra = {}) { router.post(`${urls.actions}/${kind}/${record.id}`, { branch_id: branch.id, ...extra }, { preserveScroll: true }); }
    function selectClosing(closing) { router.get(urls.weekly, { branch_id: branch.id, closing_id: closing.id }); }
    function openBoxes() { router.visit(urls.boxes); }
    function go(nextTab) { setTab(nextTab); const url = new URL(window.location.href); url.searchParams.set('tab', nextTab); window.history.replaceState({}, '', url); }
    const grouped = [...new Set(boxes.map((box) => box.user_id))].map((userId) => ({ id: userId, boxes: boxes.filter((box) => box.user_id === userId) }));
    const remaining = current ? Math.max(0, new Date(current.coverage_until).getTime() - now) : 0;
    const progress = current ? Math.max(0, Math.min(100, (now - new Date(current.coverage_from).getTime()) / (new Date(current.coverage_until) - new Date(current.coverage_from)) * 100)) : 0;
    const collectorCash = totals(pendingBoxes.flatMap((box) => box.payments));
    const transitTotals = Object.fromEntries(Object.keys(currencies).map((key) => [key, transit.filter((item) => item.currency === key).reduce((sum, item) => sum + Number(item.amount), 0)]));
    const people = [...props.staff];
    grouped.filter((group) => group.id !== null && !people.some((person) => person.id === group.id)).forEach((group) => people.push({ id: group.id, name: group.boxes[0].user?.name ?? 'موظف' }));
    return <AuthenticatedLayout><Head title="الخزنة والكشوفات" /><div dir="rtl" className="closing-ui closing-page">
        {props.errors?.action && <div role="alert" className="bn r">{props.errors.action}</div>}
        <header className="clt">
            <div><h1>الخزنة والكشوفات</h1><p>{branches.length > 1 && <select aria-label="الفرع" className="inp branch-select" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}{branches.length <= 1 && branch.name}{current && <> · {periodLabel(current)} شغّال · القطع {branchDate(current.coverage_until)} {branchClock(current.coverage_until)}</>}</p></div>
            <div className="acts">
                {started && <PrimaryButton onClick={() => selectClosing(current)}><Icon name="layers" />إغلاق {periodLabel(current)}</PrimaryButton>}
            </div>
        </header>
        <nav aria-label="أقسام الخزنة والكشوفات" className="ctabs">
            {tabs.map(([key, label, icon]) => {
                const count = key === 'notes' ? openNotes.length : key === 'history' ? overdue.length : 0;
                return <button key={key} onClick={() => go(key)} aria-current={tab === key ? 'page' : undefined}><Icon name={icon} /><span>{label}</span>{count > 0 && <em>{count}</em>}</button>;
            })}
        </nav>
        {!started ? <Empty><b>ابدأ الإغلاق الأسبوعي لهذا الفرع</b><p>تُجمع الدفعات الجديدة في صناديق عمل بالشيكل.</p>{access.manage && <PrimaryButton onClick={() => openAction('start')}>بدء الإغلاق الأسبوعي</PrimaryButton>}</Empty> : <>
        {tab === 'current' && <>
            <section className="whero">
                <div className="wh-a">
                    <span className="wk"><Icon name="calendar" />الأسبوع الحالي · طرد الفرع</span>
                    <h2>{periodLabel(current)}</h2><p>{periodRange(current)} · القطع {branchClock(current.coverage_until)}</p>
                    <div className="cd"><div className="rw"><svg className="ring" viewBox="0 0 64 64" aria-hidden="true"><circle className="tr" cx="32" cy="32" r="26" /><circle className="pg" cx="32" cy="32" r="26" strokeDasharray="163.36" strokeDashoffset={163.36 * (1 - progress / 100)} /></svg><span className="rp num">{Math.round(progress)}%</span></div>
                        <div><b>{Math.floor(remaining / 86400000)} يوم و{Math.floor(remaining / 3600000) % 24} ساعة</b><small>على القطع · {dateTime(current.coverage_until)}</small><small className="dim">بوقت القطع الصناديق المفتوحة بتنسكّر لحالها</small></div>
                    </div>
                </div>
                <div className="wh-b"><span className="lb">المحصّل هالأسبوع (كاش)</span><div className="big"><Money amount={cashTotals.ILS} /></div>{(cashTotals.USD > 0 || cashTotals.JOD > 0) && <div className="sm"><Money amount={cashTotals.USD} currency="USD" /><Money amount={cashTotals.JOD} currency="JOD" /></div>}<div className="eln"><Icon name="wallet" />إلكتروني <Money amount={electronicTotals.ILS} /></div>{(electronicTotals.USD > 0 || electronicTotals.JOD > 0) && <div className="sm"><Money amount={electronicTotals.USD} currency="USD" /><Money amount={electronicTotals.JOD} currency="JOD" /></div>}</div>
                <div className="wh-c"><span className="lb">المحصّل بالشيكل كل يوم</span><DailyBars payments={periodBoxes.flatMap((box) => box.payments)} current={current} now={now} /></div>
            </section>
            <Section title="شو لازم تعمل هلأ"><div className="todo">
                {overdue.length > 0 && <Task tone="b" icon="shield" label={`${overdue.length} طرد جاهز للإرسال`} hint="كمّل النواقص ثم أرسل الإغلاقات بالترتيب." onClick={() => go('history')} action="راجع وابعت" />}
                {pendingBoxes.length > 0 && <Task tone="a" icon="table" label={`${pendingBoxes.length} صناديق بانتظار تأكيد الإغلاق (تُرحّل إن لم تُؤكَّد)`} hint="اطّلع على الحركات، واطلب من المحصّل تعديل ما فيه خطأ، ثم أكّد إغلاق الصندوق." onClick={openBoxes} action="مراجعة" />}
                {openNotes.length > 0 && <Task tone="r" icon="messages" label={`${openNotes.length} ملاحظة تدقيق بانتظار ردّك`} hint="كل تصحيح بينزل بالأسبوع المفتوح." onClick={() => go('notes')} action="ردّ" />}
                {!pendingBoxes.length && !overdue.length && !openNotes.length && <Task tone="g" icon="check" label="كل اشي تمام" hint="ما في اشي بانتظارك هلأ" />}
            </div></Section>
            <div className="kpis k4 overview-kpis">
                <Metric icon="hand" tone="warn" label="الكاش مع المحصّلين" amounts={collectorCash} hint={`${pendingBoxes.length} صندوق مسكّر بانتظار تأكيد الإغلاق`} onClick={openBoxes} />
                <Metric icon="vault" tone="br" label="الكاش بالخزنة" amounts={safeBalance} hint="حسب النظام هلأ" onClick={() => go('safe')} />
                <Metric icon="truck" tone="info" label="قيد النقل للشركة" amounts={transitTotals} hint="بانتظار تأكيد الخزنة" onClick={() => go('safe')} />
                <Metric icon="wallet" tone="pur" label="دفعات إلكترونية معلّقة" value={missing.length} hint={missing.length ? 'بتنتقل لحد ما تنلقى' : 'ولا وحدة'} onClick={() => selectClosing(current)} />
            </div>
            <Section title="المحصّلين والصناديق" action={<Link href={urls.boxes} prefetch className="lnk">الصناديق المالية</Link>}><div className="cgrid">
                {people.map((person, index) => <CollectorCard key={person.id} name={person.name} color={index} boxes={boxes.filter((box) => box.user_id === person.id)} debts={debts.filter((debt) => debt.user_id === person.id)} onOpen={(box) => setBoxId(box.id)} />)}
            </div></Section>
            <Section title="آخر الحركات"><ClosingFeed boxes={boxes} transfers={transfers} notes={notes} /></Section>
        </>}
        {tab === 'safe' && <>
            <PageHeading title="الخزنة والتسليم للشركة" hint="الكاش اللي استلمه الفرع من الصناديق بيطلع للشركة: لخزنة الشركة أو إيداع بالبنك، مع صورة إثبات." action={access.approve && <PrimaryButton onClick={() => openAction('transfer')}><Icon name="bank" />تسليم للشركة</PrimaryButton>} />
            <div className="safe3">{Object.entries(currencies).filter(([key]) => shownCurrencies(safeBalance).includes(key)).map(([key, label]) => <div className={`sf ${key}`} key={key}><span>{label}</span><b><Money amount={safeBalance[key]} currency={key} /></b><small>{transitTotals[key] > 0 ? <>قيد النقل <Money amount={transitTotals[key]} currency={key} /></> : 'ما في اشي قيد النقل'}</small></div>)}</div>
            {debts.length > 0 && <Panel title="ديون المحصّلين" icon="currency" hint="بيضل الدين ظاهر لحد ما ينسدّ"><div className="dlist">{debts.map((debt) => <div className="dl" key={debt.id}><span className="av s">{debt.user?.name?.slice(0, 1)}</span><b>{debt.user?.name}</b><Money amount={debt.remaining} currency={debt.currency} />{access.receive && debt.user_id !== actorId && <SecondaryButton className="sm" onClick={() => openAction('repay', debt)}>تسديد نقدًا</SecondaryButton>}</div>)}</div></Panel>}
            <Panel title="التسليمات للشركة" icon="bank" hint="قيد النقل لا يمنع إرسال الإغلاق.">{transfers.length ? <div className="tw flat"><table className="dt"><thead><tr>{['الوقت', 'الطريقة', 'لمين', 'المبلغ', 'الإثبات', 'الحالة', ''].map((title, index) => <th key={index}>{title}</th>)}</tr></thead><tbody>{transfers.map((transfer) => <tr key={transfer.id}><td className="nw">{dateTime(transfer.sent_at)}</td><td>{transfer.method === 'bank_deposit' ? 'إيداع بالبنك' : 'خزنة الشركة'}</td><td>{transfer.recipient?.name}</td><td className="am"><Money amount={transfer.amount} currency={transfer.currency} /></td><td><a className="file" href={`${urls.proofs}/transfer/${transfer.id}`}><Icon name="eye" />صورة الإثبات</a></td><td><StatusPill tone={transfer.status === 'received' ? 'green' : 'amber'}>{transfer.status === 'received' ? 'استلمته الخزنة' : 'قيد النقل'}</StatusPill></td><td>{transfer.status === 'in_transit' && transfer.recipient_id === actorId && <SecondaryButton className="sm" onClick={() => router.post(`${urls.transferReceipts}/${transfer.id}`, {}, { preserveScroll: true })}>تأكيد الاستلام</SecondaryButton>}</td></tr>)}</tbody></table></div> : <Empty><b>لم تُسجّل تسليمات للشركة بعد.</b></Empty>}</Panel>
            <Panel title="حركة الخزنة" icon="history" hint="حركات الفرع المسجّلة"><ClosingFeed boxes={boxes.filter((box) => box.status === 'received')} transfers={transfers} notes={[]} /></Panel>
        </>}
        {tab === 'history' && <>
            <PageHeading title="الإغلاقات" hint="طرد أسبوعي واحد يضم صناديق الفرع والحركات المرحّلة، ويُرسل للتدقيق بالترتيب." />
            <div className="cnts big"><span><Icon name="table" />ما انبعتت: <b>{overdue.length}</b></span><span><Icon name="messages" />ملاحظات مفتوحة: <b>{openNotes.length}</b></span><span><Icon name="clock" />بدون مهلة إرسال · العدّاد بس للتذكير</span></div>
            <div className="tw"><table className="dt"><thead><tr>{['الفترة', 'التواريخ', 'الترتيب', 'الصناديق', 'الحالة', ''].map((title, index) => <th key={index}>{title}</th>)}</tr></thead><tbody>{closings.map((closing) => <tr key={closing.id} className={new Date(closing.coverage_until).getTime() > now ? 'cur' : ''}><td className="nw"><b>{periodLabel(closing)}</b>{closing.is_manual && <small className="muted"> · مبكر</small>}</td><td className="nw">{periodRange(closing)}</td><td>{closing.book === 'combined' ? 'مدمج' : closing.book === 'cash' ? 'الكاش · منفصل' : 'البنك · منفصل'}</td><td className="num">{boxes.filter((box) => box.closing_id === closing.id).length}</td><td><ClosingPill closing={closing} /></td><td><SecondaryButton className={`sm ${!closing.submitted_snapshot && new Date(closing.coverage_until).getTime() <= now ? 'pr' : ''}`} onClick={() => selectClosing(closing)}>{!closing.submitted_snapshot && new Date(closing.coverage_until).getTime() <= now ? 'راجع وابعت' : 'مراجعة التفاصيل'}</SecondaryButton></td></tr>)}</tbody></table></div>
        </>}
        {tab === 'notes' && <>
            <PageHeading title="ملاحظات التدقيق" hint="التدقيق قسم منفصل. الإغلاق اللي انبعت ما بيتغيّر، وكل تصحيح بينزل كقيد بالأسبوع المفتوح." />
            {notes.length ? notes.map((note) => <article className="nt" key={note.id}><header><span className="nid num">#{note.id}</span><span className="tg">{note.closing?.number.slice(-8)}</span><StatusPill tone={note.status === 'closed' ? 'green' : 'amber'}>{noteStatuses[note.status]}</StatusPill><small>{dateTime(note.created_at)}</small></header><blockquote className="aq"><small><Icon name="shield" />قسم التدقيق</small>{note.body}</blockquote>{note.replies.length > 0 && <div className="thr">{note.replies.map((reply) => <div className="bub h" key={reply.id}><small>{reply.user?.name} · {dateTime(reply.created_at)}</small>{reply.body}{reply.document_path && <a href={`${urls.proofs}/reply/${reply.id}`} className="file"><Icon name="eye" />المستند المرفق</a>}</div>)}</div>}{access.approve && ['awaiting_reply', 'rejected', 'collector_replied'].includes(note.status) && <div className="nacts"><PrimaryButton className="sm" onClick={() => openAction('reply', note)}><Icon name="messages" />الرد على الملاحظة</PrimaryButton></div>}</article>) : <Empty><b>ما في ملاحظات هون</b></Empty>}
        </>}
        {tab === 'settings' && <SettingsOverview {...props} onAction={openAction} />}
        </>}
    </div>{action && <ActionModal key={`${action.kind}-${action.record?.id}`} action={action} onClose={() => setAction(null)} props={props} />}
    {selectedBox && <BoxDetails box={selectedBox} onClose={() => setBoxId(null)} perform={perform} period={periodLabel(closings.find((closing) => closing.id === selectedBox.closing_id))} />}
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
        ...boxes.filter((box) => box.closed_at).map((box) => ({ id: `box-${box.id}`, at: box.closed_at, icon: 'table', tone: box.status === 'received' ? 'g' : 'a', text: `${box.user?.name ?? '—'} · ${box.status === 'received' ? 'استلام صندوق' : 'إغلاق صندوق'} ${box.number.slice(-8)}` })),
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
            <p className="sline">الإغلاق أسبوعي في طرد واحد يضم الكاش والحوالات والمقاصات.</p>

        </div>
        <Section title="إغلاق مبكر"><div className="card pad"><p>بيسكّر الفترة هلأ، وكل الصناديق المفتوحة بتنسكّر وبتحتاج تنجرد. باقي الأيام تنضم إلى الأسبوع القادم، ويوم البداية ما بيتغيّر.</p>{access.approve && <SecondaryButton onClick={() => onAction('early', current)}><Icon name="bolt" />إغلاق مبكر لـ{periodLabel(current)}</SecondaryButton>}</div></Section>
        <Section title="الصلاحيات" hint="التفويضات الإضافية بتشتغل على طول؛ يدير رئيس الفرع الصلاحيات من تعديل الإعدادات."><div className="tw"><table className="dt perm"><thead><tr><th>الموظف</th><th>تفويض مراجعة الصناديق وإغلاقها</th><th>تفويض الاعتماد والإرسال</th></tr></thead><tbody>{staff.map((person) => <tr key={person.id}><td><span className="who"><span className="av s">{person.name.slice(0, 1)}</span>{person.name}</span></td><td><StatusPill tone={receivers.includes(person.id) ? 'green' : undefined}>{receivers.includes(person.id) ? 'مفعّل' : '—'}</StatusPill></td><td><StatusPill tone={approvers.includes(person.id) ? 'green' : undefined}>{approvers.includes(person.id) ? 'مفعّل' : '—'}</StatusPill></td></tr>)}</tbody></table></div><p className="pn muted"><Icon name="shield" />مسؤول الفرع والمفوّض بالاعتماد يمكنهم تأكيد إغلاق صناديقهم. المفوّض بالمراجعة فقط يؤكد إغلاق صناديق الآخرين.</p></Section>
    </>;
}
