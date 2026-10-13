import { Fragment, useState } from 'react';
import { Link } from '@inertiajs/react';
import { boxTypes } from '../Payments/CollectorCashBox';
import { PrimaryButton, SecondaryButton, StatusPill, Panel, MoneyStack, Money, FixedTable, dateTime, periodRange, periodLabel, ClosingStepper, CashLedger, VersionDifferences } from './ClosingComponents';

const currencies = ['ILS', 'USD', 'JOD'];
const statuses = { pending: ['بانتظار المراجعة', 'amber'], missing: ['غير موجودة في البنك', 'red'], rejected: ['مرفوضة', 'red'], confirmed: ['مؤكدة / مقبولة', 'green'] };
const uniqueBoxes = (boxes) => [...new Map(boxes.map((box) => [box.id, box])).values()];

/** Each table's columns and their widths; the column without one takes what is left. */
const entryColumns = [['النوع', 90], ['المشترك'], ['رقم الحساب', 130], ['الصندوق', 130], ['الحوالة / الخدمة', 200], ['المبلغ', 150], ['الحالة', 180]];
const boxColumns = [['الصندوق', 130], ['النوع', 120], ['فُتح ← أُغلق', 190], ['الحركات', 90], ['المتوقع', 160], ['عدّ المحصّل', 160], ['عدّ الفرع', 160], ['الفرق / القرار'], ['الحالة', 180]];
const collectorColumns = [['المحصّل'], ['الصناديق', 100], ['الكاش المستلم', 160], ['الحوالات المؤكدة', 160], ['المقاصات المقبولة', 160], ['مرحّل', 190], ['', 150]];

function EntryTable({ entries }) {
    return <div className="tw"><FixedTable columns={entryColumns}>{entries.map((entry) => <tr key={entry.id} className={entry.transaction?.status !== 'active' ? 'opacity-50' : ''}><td>{entry.method === 'clearing' ? 'مقاصة' : 'حوالة'}</td><td>{entry.statement_url ? <Link href={entry.statement_url} prefetch className="lnk">{entry.transaction?.subscription?.subscription_name || entry.transaction?.subscription?.full_name}</Link> : entry.transaction?.subscription?.full_name ?? '—'}</td><td dir="ltr" className="num">{entry.transaction?.subscription?.account_number ?? '—'}</td><td dir="ltr" className="num">{entry.box?.number?.slice(-10) ?? `#${entry.cash_box_id}`}</td><td>{entry.method === 'clearing' ? entry.transaction?.notes : <>{entry.transaction?.bank_name} · <span dir="ltr">{entry.transaction?.reference_number}</span></>}</td><td><Money amount={entry.amount} currency={entry.currency} /></td><td><StatusPill tone={statuses[entry.status]?.[1]}>{entry.transaction?.status !== 'active' ? 'ملغاة' : statuses[entry.status]?.[0]}</StatusPill></td></tr>)}</FixedTable></div>;
}

function BoxTable({ boxes, onOpenBox }) {
    return <div className="tw"><FixedTable columns={boxColumns}>{boxes.map((box) => {
        const cash = (box.type ?? 'cash') === 'cash';
        const active = (box.payments ?? []).filter((entry) => !entry.transaction || entry.transaction.status === 'active');
        const totals = Object.fromEntries(currencies.map((currency) => [currency, active.filter((entry) => entry.currency === currency).reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0)]));
        const difference = box.head_counts && box.expected_counts ? Object.fromEntries(currencies.map((currency) => [currency, Number(box.head_counts[currency] ?? 0) - Number(box.expected_counts[currency] ?? 0)])) : null;
        return <tr key={box.id}><td><button type="button" className="lnk num" dir="ltr" onClick={() => onOpenBox(box)}>{box.number.slice(-10)}</button></td><td>{boxTypes[box.type] ?? 'نقدي'}</td><td className="nw">{dateTime(box.opened_at)}<br />{dateTime(box.closed_at)}</td><td className="num">{box.payments?.length ?? 0}</td><td><MoneyStack amounts={cash ? box.expected_counts ?? totals : totals} /></td><td>{cash && box.collector_counts ? <MoneyStack amounts={box.collector_counts} /> : '—'}</td><td>{cash && box.head_counts ? <MoneyStack amounts={box.head_counts} /> : '—'}</td><td>{cash ? <>{difference && <MoneyStack amounts={difference} />}{Object.values(box.decisions ?? {}).includes('debt') && <StatusPill tone="red">دين على المحصّل</StatusPill>}</> : <span>{active.filter((entry) => entry.status === 'confirmed').length} مقبولة / مؤكدة · {active.filter((entry) => ['missing', 'rejected', 'pending'].includes(entry.status)).length} مرحّلة</span>}</td><td><StatusPill tone={box.status === 'received' ? 'green' : 'amber'}>{box.status === 'received' ? 'مستلم' : 'مرحّل'}</StatusPill>{box.status === 'received' && !box.confirmed_at && <small>بانتظار تأكيد التسليم</small>}</td></tr>;
    })}</FixedTable></div>;
}

export default function BranchPackage({ closing, package: parcel, holdsCash, access, urls, versions, onAction, onOpenBox }) {
    const [expanded, setExpanded] = useState([]);
    if (!parcel || !closing.summary) return null;
    const summary = closing.summary;
    const frozen = !!closing.submitted_snapshot;
    const carry = parcel.carriedOut ?? { boxes: [], entries: [] };
    const allBoxes = uniqueBoxes([...(parcel.boxes ?? []), ...(parcel.carriedIn ?? []), ...carry.boxes]);
    const incomingEntries = [...(parcel.electronic ?? []), ...(parcel.clearings ?? [])].filter((entry) => entry.confirmed_in_closing_id === closing.id && !(parcel.boxes ?? []).some((box) => box.id === entry.cash_box_id));
    const requiredCount = frozen ? Object.values(parcel.safeBalanceAtSubmission ?? {}).some((amount) => Number(amount) !== 0) : holdsCash;
    const deliveries = Object.fromEntries(currencies.map((currency) => [currency, (parcel.transfers ?? []).filter((transfer) => transfer.currency === currency).reduce((sum, transfer) => sum + Number(transfer.amount), 0)]));
    const ended = new Date(closing.coverage_until) <= new Date();
    function toggle(id) { setExpanded((ids) => ids.includes(id) ? ids.filter((key) => key !== id) : [...ids, id]); }

    return <div className="space-y-5">
        <header className="ph"><div><h2>طرد الفرع · {periodLabel(closing)}</h2><p>{periodRange(closing)} · القطع {dateTime(closing.coverage_until)}</p></div><StatusPill tone={frozen ? 'green' : 'blue'}>{frozen ? 'طرد مُرسل' : 'طرد قيد التجهيز'}</StatusPill></header>
        <ClosingStepper closing={closing} />
        {frozen && <div className="bn p"><b>هذه الأرقام محفوظة لحظة إرسال الطرد. الحركات التالية تُسجّل في طرد لاحق.</b></div>}
        <Panel title="قائمة مراجعة الطرد" icon="shield" hint="التنبيهات تُرحّل إلى الأسبوع القادم ولا تمنع الإرسال.">
            <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><span>وصل وقت القطع</span><StatusPill tone={ended ? 'green' : 'amber'}>{ended ? 'تمّ' : 'بانتظار القطع'}</StatusPill></div><div className="flex flex-wrap items-center justify-between gap-3"><span>أُرسل طرد الأسبوع السابق</span><StatusPill tone={closing.blockers.includes('أرسل الإغلاق السابق أولًا.') ? 'amber' : 'green'}>{closing.blockers.includes('أرسل الإغلاق السابق أولًا.') ? 'مطلوب' : 'تمّ'}</StatusPill></div>{requiredCount && <div className="flex flex-wrap items-center justify-between gap-3"><span>جرد الخزنة (الفرع يحتفظ بكاش)</span>{parcel.safeCount ? <StatusPill tone="green">تمّ</StatusPill> : <><StatusPill tone="amber">مطلوب</StatusPill>{!frozen && ended && access.approve && <SecondaryButton onClick={() => onAction('safe-count', closing)}>جرد الخزنة</SecondaryButton>}</>}</div>}{(parcel.warnings ?? []).map((warning) => <p key={warning} className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">{warning}</p>)}{summary.unsyncedCollectors?.length > 0 && <p className="text-sm text-amber-700">لم تتم مزامنة الجوال: {summary.unsyncedCollectors.map((person) => person.name).join('، ')}</p>}</div>
        </Panel>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[['الكاش المستلم', summary.cash], ['الحوالات المؤكدة', summary.bank], ['المقاصات المقبولة', summary.clearing], ['كاش مع المحصّلين (مرحّل)', summary.cashWithCollectors], ['تسليمات للشركة', deliveries]].map(([label, amounts]) => <article key={label} className="card pad space-y-3"><b>{label}</b><MoneyStack amounts={amounts} /></article>)}
            <article className="card pad space-y-3"><b>حركات مرحّلة</b><p className="num text-2xl">{summary.carriedOutEntries ?? 0}</p><small>{summary.carriedOutBoxes ?? 0} صناديق لم تُستلم · {summary.inTransit ?? 0} تسليمات قيد النقل</small></article>
        </div>
        <Panel title="المحصّلون وصناديقهم" icon="table" hint="افتح صف الموظف ثم الصندوق للاطلاع على حركاته."><div className="tw"><FixedTable columns={collectorColumns}>{(summary.byCollector ?? []).map((person) => <Fragment key={person.userId ?? 'direct'}><tr><td>{person.name}</td><td className="num">{person.boxCount}</td><td><MoneyStack amounts={person.cash} /></td><td><MoneyStack amounts={person.bank} /></td><td><MoneyStack amounts={person.clearing} /></td><td>{person.carriedBoxes + person.carriedEntries > 0 ? <StatusPill tone="amber">{person.carriedBoxes} صناديق · {person.carriedEntries} حركات</StatusPill> : '—'}</td><td><SecondaryButton aria-expanded={expanded.includes(person.userId)} onClick={() => toggle(person.userId)}>عرض الصناديق</SecondaryButton></td></tr>{expanded.includes(person.userId) && <tr><td colSpan={7}><BoxTable boxes={allBoxes.filter((box) => box.user_id === person.userId)} onOpenBox={onOpenBox} /></td></tr>}</Fragment>)}</FixedTable></div></Panel>
        {(parcel.carriedIn?.length > 0 || incomingEntries.length > 0) && <Panel title="مرحّل من أسابيع سابقة" icon="history" hint="الصناديق والحركات التي يسوّيها هذا الطرد من أسابيع أقدم.">{parcel.carriedIn?.length > 0 && <BoxTable boxes={parcel.carriedIn} onOpenBox={onOpenBox} />}{incomingEntries.length > 0 && <EntryTable entries={incomingEntries} />}</Panel>}
        {(carry.boxes.length > 0 || carry.entries.length > 0) && <Panel title="يُرحّل إلى الأسبوع القادم" icon="layers" hint="تبقى هذه الحركات في صناديقها الأصلية إلى حين الاستلام أو التأكيد أو الإلغاء.">{carry.boxes.length > 0 && <BoxTable boxes={carry.boxes} onOpenBox={onOpenBox} />}{carry.entries.length > 0 && <EntryTable entries={carry.entries} />}</Panel>}
        {summary.cashLedger && <Panel title="معادلة الكاش والخزنة" icon="vault"><CashLedger ledger={summary.cashLedger} />{parcel.safeCount && <div className="mt-4 space-y-2"><b>جرد الخزنة</b><MoneyStack amounts={parcel.safeCount.counts} /><p>{parcel.safeCount.reason}</p></div>}</Panel>}
        {(parcel.transfers?.length > 0 || parcel.debts?.length > 0 || parcel.adjustments?.length > 0) && <Panel title="التسليمات والديون والتصحيحات" icon="bank"><div className="space-y-3">{(parcel.transfers ?? []).map((transfer) => <div key={transfer.id} className="flex flex-wrap items-center gap-3"><span>{transfer.recipient?.name ?? 'خزنة الشركة'}</span><Money amount={transfer.amount} currency={transfer.currency} /><a className="lnk" href={`${urls.proofs}/transfer/${transfer.id}`}>صورة الإثبات</a><StatusPill tone={transfer.status === 'received' ? 'green' : 'amber'}>{transfer.status === 'received' ? 'مستلم' : 'قيد النقل'}</StatusPill></div>)}{(parcel.debts ?? []).map((debt) => <p key={debt.id}>دين الصندوق #{debt.cash_box_id} · <Money amount={debt.remaining} currency={debt.currency} /></p>)}{(parcel.adjustments ?? []).map((adjustment) => <p key={adjustment.id}>تصحيح: {adjustment.reason} · <Money amount={adjustment.amount} currency={adjustment.currency} /></p>)}</div></Panel>}
        {!frozen && closing.blockers.length > 0 && <div className="bn a"><ul>{closing.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
        <div className="acts">{!frozen && access.approve && <><PrimaryButton disabled={closing.blockers.length > 0} onClick={() => onAction('submit', closing)}>إغلاق الطرد وإرساله للتدقيق</PrimaryButton>{!ended && <SecondaryButton onClick={() => onAction('early', closing)}>إغلاق مبكر</SecondaryButton>}</>}{closing.status === 'submitted' && !closing.reviewed_at && !closing.reviewed_by && access.approve && <SecondaryButton onClick={() => onAction('withdraw', closing)}>سحب الطرد</SecondaryButton>}</div>
        {versions.length > 0 && <Panel title="النسخ المرسلة" icon="history">{versions.map((version, index) => <details key={version.id} className="version-row"><summary>النسخة {version.version} · {dateTime(version.created_at)}{version.withdrawn_at ? ' · مسحوبة' : ''}</summary><p>{version.notes}</p><MoneyStack amounts={version.snapshot.safeBalanceAtSubmission} />{versions[index + 1] && <VersionDifferences version={version} previous={versions[index + 1]} />}</details>)}</Panel>}
    </div>;
}
