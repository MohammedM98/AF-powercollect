import { useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { formatMoney } from '@/lib/format';
import { auditStatusLabels, financialBoxesTotals } from '@/lib/financialBoxes';
import BoxDetails from '../Payments/BoxDetails';
import FinancialBoxList from '../Payments/FinancialBoxList';
import SecondaryButton from '@/Components/SecondaryButton';
import PrimaryButton from '@/Components/PrimaryButton';
import { boxTypes } from '../Payments/CollectorCashBox';
import { financialAmountsLine } from '../Payments/FinancialBoxComponents';

/** The states a sent box goes through in audit, as the tiles and tabs show them. */
const states = [
    ['waiting', 'وارد جديد', 'send', 'bg-sky-500/10 text-sky-600 dark:text-sky-400', 'صناديق لم يبدأ تدقيقها'],
    ['reviewing', 'قيد التدقيق', 'eye', 'bg-violet-500/10 text-violet-600 dark:text-violet-400', 'صناديق مفتوحة للتدقيق'],
    ['returned', 'أُعيدت بملاحظات', 'alert', 'bg-brand-500/10 text-brand-600', 'بانتظار ردّ الفرع'],
    ['approved', 'مُدقّقة', 'check', 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', 'صناديق اعتُمدت'],
];

/**
 * The boxes the branches send to audit, each on its own with its number and
 * the branch that sent it, oldest first: narrowed to one branch and one
 * state, opened to review its entries, then approved (charging the branch a
 * debt for it if need be) or sent back to the branch with a note.
 */
export default function BoxAuditIndex({ boxes, branches, counts, filters, urls }) {
    const { errors } = usePage().props;
    const [search, setSearch] = useState('');
    const [type, setType] = useState('');
    const [boxId, setBoxId] = useState(() => Number(new URLSearchParams(window.location.search).get('box')) || null);
    const selectedBox = boxes.find((box) => box.id === boxId);
    const shown = boxes.filter((box) => (!type || box.type === type) && `${box.number} ${box.user?.name ?? ''} ${box.branchName ?? ''}`.includes(search.trim()));
    const totalWaiting = branches.reduce((sum, branch) => sum + branch.waiting, 0);

    function visit(changes) {
        router.get(urls.index, { ...filters, ...changes }, { preserveScroll: true, preserveState: true, replace: true });
    }

    function open(box) {
        setBoxId(box.id);
        if (box.audit_status === 'waiting') {
            router.post(`${urls.actions}/${box.id}/start`, {}, { preserveScroll: true, preserveState: true });
        }
    }

    function act(action, data) {
        router.post(`${urls.actions}/${selectedBox.id}/${action}`, data, { preserveScroll: true, preserveState: true, onSuccess: () => setBoxId(null) });
    }

    const branchChip = (id, label, waiting) => <button key={id ?? 'all'} type="button" onClick={() => visit({ branch_id: id })} aria-pressed={filters.branch_id === id} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${filters.branch_id === id ? 'border-transparent bg-gray-900 text-surface shadow-lift' : 'border-gray-200 bg-surface text-gray-700 hover:border-gray-300'}`}>
        {id && <Icon name="building" className="h-4 w-4" />}{label}
        {waiting > 0 && <span className="rounded-full bg-brand-600 px-1.5 font-display text-xs leading-5 text-white" title="وارد جديد">{waiting}</span>}
    </button>;

    return <AuthenticatedLayout header={<div><p className="text-sm font-semibold text-gray-500">قسم التدقيق المالي</p><h2 className="mt-1 text-3xl font-bold text-gray-900">تدقيق صناديق الفروع</h2><p className="mt-1 text-sm text-gray-500">كل صندوق يصل منفردًا برقمه من الفرع الذي أرسله. ابدأ بالأقدم وصولًا.</p></div>}>
        <Head title="تدقيق صناديق الفروع" />
        <div className="financial-boxes financial-surface space-y-5">
            {errors?.action && <p role="alert" className="rounded-control bg-red-500/10 p-4 text-sm text-red-700">{errors.action}</p>}
            <nav aria-label="الفرع المرسل" className="flex flex-wrap gap-2">{branchChip(null, 'كل الفروع', totalWaiting)}{branches.map((branch) => branchChip(branch.id, branch.name, branch.waiting))}</nav>
            <section aria-label="ملخص" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {states.map(([value, label, icon, tone, hint]) => <button key={value} type="button" onClick={() => visit({ status: value })} aria-pressed={filters.status === value} className={`flex min-w-0 items-center gap-3 rounded-card border bg-surface p-4 text-start shadow-card transition hover:-translate-y-0.5 hover:shadow-lift motion-reduce:transform-none ${filters.status === value ? 'border-gray-900' : 'border-gray-100'}`}>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] ${tone}`}><Icon name={icon} className="h-5 w-5" /></span>
                    <span className="min-w-0"><span className="block text-sm font-semibold text-gray-600">{label}</span><span className="mt-0.5 block font-display text-xl font-bold text-gray-900">{counts[value].toLocaleString('en')}</span><span className="block text-xs text-gray-500">{hint}</span></span>
                </button>)}
            </section>
            <section aria-label="الصناديق المرسلة">
                <div className="data-table-toolbar flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80"><Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" /><input type="text" aria-label="ابحث برقم الصندوق أو الموظف أو الفرع" placeholder="رقم الصندوق، الموظف أو الفرع" value={search} onChange={(event) => setSearch(event.target.value)} className="block w-full py-2.5 pe-4 ps-10 text-sm" /></div>
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                        <SegmentedTabs label="نوع الصندوق" value={type} onChange={setType} options={[{ value: '', label: 'كل الأنواع' }, ...Object.entries(boxTypes).map(([value, label]) => ({ value, label }))]} />
                        <SegmentedTabs label="حالة التدقيق" value={filters.status} onChange={(status) => visit({ status })} options={[...states.map(([value, label]) => ({ value, label: <>{label} · <span className="font-display">{counts[value]}</span></> })), { value: 'all', label: 'الكل' }]} />
                    </div>
                </div>
                <div className="data-table-container financial-box-list-container">
                    {shown.length ? <FinancialBoxList boxes={shown} byBranch onOpen={open} renderActions={(box) => ['waiting', 'reviewing'].includes(box.audit_status)
                        ? <PrimaryButton type="button" onClick={() => open(box)} className="whitespace-nowrap px-3 py-1.5"><Icon name="eye" className="h-4 w-4" />تدقيق</PrimaryButton>
                        : <SecondaryButton type="button" onClick={() => open(box)} className="whitespace-nowrap px-3 py-1.5">عرض الصندوق</SecondaryButton>} />
                        : <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-gray-500"><Icon name="shield" className="h-8 w-8 text-gray-400" /><p>{boxes.length ? 'لا توجد صناديق بهذه الفلاتر.' : `لا صناديق ${auditStatusLabels[filters.status]?.[0] ?? ''} الآن.`}</p></div>}
                </div>
                <p className="data-table-totals text-sm text-gray-600"><span>المعروض <b className="font-display text-gray-900">{shown.length}</b> صندوقًا</span><span>المجموع: <b className="font-display text-gray-900">{financialAmountsLine(financialBoxesTotals(shown))}</b> · <span className="font-display">{formatMoney(shown.reduce((sum, box) => sum + Number(box.branch_debt ?? 0), 0))}</span> شيكل ديون على الفروع</span></p>
            </section>
        </div>
        {selectedBox && <BoxDetails key={selectedBox.id} box={selectedBox} branchName={selectedBox.branchName} onClose={() => setBoxId(null)} audit={{
            onApprove: (debt, reason) => act('approve', { debt, debt_reason: reason }),
            onReturn: (body, entryIds) => act('return', { body, entry_ids: entryIds }),
        }} />}
    </AuthenticatedLayout>;
}
