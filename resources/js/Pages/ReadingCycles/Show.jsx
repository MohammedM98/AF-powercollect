import { useEffect, useMemo, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton, { secondaryButtonClass } from '@/Components/SecondaryButton';
import InputError from '@/Components/InputError';
import { formatNumber } from '@/lib/format';
import { STAGES, boardColumns, boardCounters, boxMatches, columnTotals, draggedBoxIds, movePayload } from '@/lib/readingBoard';
import PageHeader from '@/Components/PageHeader';


function Counter({ label, value, tone = 'text-gray-900' }) {
    return (
        <div className="rounded-card border border-gray-100 bg-surface px-4 py-3 shadow-card">
            <p className="text-xs font-semibold text-gray-500">{label}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${tone}`}>{value}</p>
        </div>
    );
}

/** One meter box on the board, picked with its box or dragged to another column. */
function BoxCard({ box, selected, canMove, onToggle, onDragStart }) {
    return (
        <li
            draggable={canMove}
            onDragStart={(event) => onDragStart(event, box)}
            className={`rounded-control border bg-surface px-3 py-2 text-sm shadow-sm transition ${selected ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-gray-100'} ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
            <div className="flex items-start gap-2">
                {canMove && <input type="checkbox" checked={selected} onChange={() => onToggle(box.id)} aria-label={`تحديد الطبلون ${box.number}`} className="mt-0.5 rounded border-gray-300 text-brand-600" />}
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                        <b className="font-display text-gray-900" dir="ltr">{box.number}</b>
                        <span className="truncate text-gray-600">{box.name}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                        {box.subAreaName ?? '—'} · {formatNumber(box.subscribers)} مشترك
                        {box.read > 0 && <> · قُرئ {formatNumber(box.read)}</>}
                    </p>
                    {box.status && (
                        <p className="mt-1 flex flex-wrap items-center gap-1">
                            <StatusPill tone={box.status === 'approved' ? 'green' : 'amber'} label={box.status === 'approved' ? 'معتمد' : 'مسودة'} />
                            {box.downloaded && <StatusPill tone={box.downloadedCurrent ? 'blue' : 'gray'} label={box.downloadedCurrent ? 'نزّله القارئ' : 'نُزّلت نسخة أقدم'} />}
                        </p>
                    )}
                </div>
            </div>
        </li>
    );
}

/** What a move or approval did, with each box it could not move and why. */
function AllocationReport({ result, onConfirmDownloaded, onClose }) {
    const needsConfirmation = result.conflicts.some((conflict) => conflict.reason.includes('أكّد النقل'));

    return (
        <section role="status" aria-live="polite" className={`mb-5 rounded-card border p-4 ${result.conflicts.length ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
            <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-gray-900">
                    {result.action === 'approve' ? 'اعتُمد' : result.action === 'copy' ? 'نُسخ من الدورة السابقة' : 'نُقل'} {formatNumber(result.moved)} طبلون
                    {result.conflicts.length > 0 && <> · لم يُطبَّق على {formatNumber(result.conflicts.length)}</>}
                </p>
                <button type="button" onClick={onClose} aria-label="إغلاق التقرير" className="rounded-control p-1.5 text-gray-500 hover:bg-gray-100">
                    <Icon name="close" className="h-4 w-4" />
                </button>
            </div>
            {result.conflicts.length > 0 && (
                <ul className="mt-3 max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-control border border-gray-100 bg-surface text-sm">
                    {result.conflicts.map((conflict, index) => (
                        <li key={`${conflict.boxId ?? conflict.label}-${index}`} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                            <b className="text-gray-900">{conflict.label}</b>
                            <span className="text-xs text-gray-600">{conflict.reason}</span>
                        </li>
                    ))}
                </ul>
            )}
            {needsConfirmation && onConfirmDownloaded && (
                <button type="button" onClick={onConfirmDownloaded} className="mt-3 inline-flex items-center gap-1.5 rounded-control bg-amber-600 px-3 py-2 text-sm font-bold text-white">
                    <Icon name="warning" className="h-4 w-4" />
                    أؤكد نقل الطبلونات التي نزّلها القارئ (قراءاته غير المرفوعة تُحفظ للمراجعة)
                </button>
            )}
        </section>
    );
}

/** Move the cycle's reading day within the days its week allows. */
function ReadingDayModal({ cycle, onClose }) {
    const { errors } = usePage().props;
    const [date, setDate] = useState(cycle.readingDate);

    function submit(event) {
        event.preventDefault();
        router.patch(`/reading-cycles/${cycle.id}`, { reading_date: date }, { preserveScroll: true, onSuccess: onClose });
    }

    return (
        <Modal show onClose={onClose} maxWidth="md" centered>
            <form onSubmit={submit} className="space-y-4 p-7" aria-labelledby="reading-day-title">
                <h3 id="reading-day-title" className="text-lg font-bold text-gray-900">تغيير يوم القراءة لهذه الدورة</h3>
                <p className="text-sm text-gray-600">نهاية الأسبوع {cycle.weekEnd}. يمكن تأخير القراءة حتى {cycle.maxReadingDate} إذا واجه الفرع مشكلة، ولا يمكن تقديمها قبل نهاية الأسبوع.</p>
                <input type="date" min={cycle.weekEnd} max={cycle.maxReadingDate} value={date} onChange={(event) => setDate(event.target.value)} className="block w-full text-sm" required />
                <InputError message={errors.reading_date} />
                <p className="text-xs text-gray-500">القرّاء الذين نزّلوا مهامهم ينزّلونها من جديد ليعرفوا اليوم الجديد؛ القراءات في غير يوم القراءة تُحفظ للمراجعة.</p>
                <div className="flex justify-end gap-3">
                    <SecondaryButton onClick={onClose}>إلغاء</SecondaryButton>
                    <PrimaryButton type="submit">حفظ</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}

/**
 * A reading cycle's allocation board: the available boxes, one column per
 * field reader and one for the paper sheets. Boxes move by dragging them —
 * every chosen box at once — or with "assign to", which works on touch
 * screens too. Each move is checked on the server against the version
 * shown, so two people moving the same box never both win.
 */
export default function Show({ cycle, boards, readers, subAreaOptions, paperSheets, reviewCount, abilities }) {
    const { flash, props } = usePage();
    const errors = props.errors ?? {};
    const [selected, setSelected] = useState(() => new Set());
    const [search, setSearch] = useState('');
    const [subAreaId, setSubAreaId] = useState('');
    const [target, setTarget] = useState('');
    const [dragOver, setDragOver] = useState(null);
    const [result, setResult] = useState(null);
    const [lastMove, setLastMove] = useState(null);
    const [editingDay, setEditingDay] = useState(false);
    const [busy, setBusy] = useState(false);
    const columns = useMemo(() => boardColumns(readers), [readers]);
    const counters = boardCounters(boards);
    const stage = STAGES[cycle.stage];

    useEffect(() => {
        if (flash?.allocationResult) {
            setResult(flash.allocationResult);
        }
    }, [flash]);

    function toggle(id) {
        setSelected((current) => {
            const next = new Set(current);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function toggleColumn(boxes) {
        setSelected((current) => {
            const next = new Set(current);
            const everyChosen = boxes.length > 0 && boxes.every((box) => next.has(box.id));
            boxes.forEach((box) => (everyChosen ? next.delete(box.id) : next.add(box.id)));
            return next;
        });
    }

    function move(boxIds, column, confirmDownloaded = false) {
        const ids = boxIds.filter((id) => boards.find((box) => box.id === id)?.column !== column.key || confirmDownloaded);

        if (ids.length === 0) {
            return;
        }

        setBusy(true);
        setLastMove({ boxIds: ids, column });
        router.post(`/reading-cycles/${cycle.id}/assignments`, movePayload(ids, column, boards, confirmDownloaded), {
            preserveScroll: true,
            onSuccess: () => setSelected(new Set()),
            onFinish: () => setBusy(false),
        });
    }

    function approve(data) {
        router.post(`/reading-cycles/${cycle.id}/assignments/approve`, data, { preserveScroll: true });
    }

    function onDragStart(event, box) {
        event.dataTransfer.setData('text/plain', JSON.stringify(draggedBoxIds(box.id, selected)));
        event.dataTransfer.effectAllowed = 'move';
    }

    function onDrop(event, column) {
        event.preventDefault();
        setDragOver(null);

        try {
            move(JSON.parse(event.dataTransfer.getData('text/plain')), column);
        } catch {
            // Something other than boxes was dropped.
        }
    }

    function assignSelected() {
        const column = columns.find((candidate) => candidate.key === target);

        if (column) {
            move([...selected], column);
        }
    }

    function createSheet() {
        const ids = [...selected].filter((id) => boards.find((box) => box.id === id)?.column === 'paper');
        router.post(`/reading-cycles/${cycle.id}/paper-sheets`, { box_ids: ids });
    }

    const selectedPaperApproved = [...selected].filter((id) => {
        const box = boards.find((candidate) => candidate.id === id);

        return box?.column === 'paper' && box.status === 'approved';
    }).length;

    return (
        <AuthenticatedLayout
            header={
                <>
                    <PageHeader
                        eyebrow={<><Link href="/reading-cycles" className="hover:underline">توزيع القراءات</Link> / {cycle.branchName}</>}
                        title={<>قراءة {cycle.readingDayName} <span dir="ltr" className="font-display">{cycle.readingDate}</span></>}
                        titleAddon={<StatusPill tone={stage.tone} label={stage.label} />}
                        meta={<>أسبوع القراءة <span dir="ltr">{cycle.weekStart}</span> — <span dir="ltr">{cycle.weekEnd}</span>{cycle.readingDate !== cycle.weekEnd && ' · يوم القراءة مؤجل لهذه الدورة'}</>}
                    />
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {abilities.review && (
                            <Link href={`/reading-cycles/${cycle.id}/submissions`} className={secondaryButtonClass}>
                                <Icon name="list" className="h-4 w-4" />
                                القراءات الميدانية
                                {reviewCount > 0 && <span className="rounded-full bg-amber-500 px-2 text-xs font-bold text-white">{formatNumber(reviewCount)}</span>}
                            </Link>
                        )}
                        {abilities.manage && (
                            <button type="button" onClick={() => setEditingDay(true)} className={secondaryButtonClass}>
                                <Icon name="calendar" className="h-4 w-4" />
                                يوم القراءة
                            </button>
                        )}
                        {abilities.manage && cycle.hasPrevious && (
                            <button type="button" onClick={() => router.post(`/reading-cycles/${cycle.id}/copy-previous`, {}, { preserveScroll: true })} title={cycle.previousLabel} className={secondaryButtonClass}>
                                <Icon name="repeat" className="h-4 w-4" />
                                نسخ توزيع الدورة السابقة
                            </button>
                        )}
                        {abilities.manageCycle && (
                            <button type="button" onClick={() => router.patch(`/reading-cycles/${cycle.id}`, { closed: !cycle.isClosed }, { preserveScroll: true })} className={secondaryButtonClass}>
                                <Icon name={cycle.isClosed ? 'unlock' : 'lock'} className="h-4 w-4" />
                                {cycle.isClosed ? 'إعادة فتح الدورة' : 'إغلاق الدورة'}
                            </button>
                        )}
                        {abilities.approve && counters.draft > 0 && (
                            <PrimaryButton onClick={() => approve({})}>
                                <Icon name="check" className="h-4 w-4" />
                                اعتماد كل الجاهز ({formatNumber(counters.draft)})
                            </PrimaryButton>
                        )}
                    </div>
                </>
            }
        >
            <Head title={`توزيع القراءات — ${cycle.readingDate}`} />

            {result && <AllocationReport result={result} onClose={() => setResult(null)} onConfirmDownloaded={abilities.manage && lastMove ? () => { setResult(null); move(lastMove.boxIds, lastMove.column, true); } : null} />}
            {(errors.box_ids || errors.approve || errors.copy) && !result && <p className="mb-4 rounded-control bg-red-500/10 px-4 py-2 text-sm text-red-700">{errors.box_ids ?? errors.approve ?? errors.copy}</p>}

            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Counter label="متاحة غير موزّعة" value={formatNumber(counters.available)} tone="text-amber-700 dark:text-amber-400" />
                <Counter label="للقرّاء الميدانيين" value={formatNumber(counters.mobile)} />
                <Counter label="للكشوف الورقية" value={formatNumber(counters.paper)} />
                <Counter label="معتمدة" value={formatNumber(counters.approved)} tone="text-emerald-700 dark:text-emerald-400" />
                <Counter label="مسودة" value={formatNumber(counters.draft)} />
                <Counter label="المشتركون" value={formatNumber(counters.subscribers)} />
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-gray-100 bg-surface p-4 shadow-card">
                <div className="min-w-[12rem] flex-1">
                    <label htmlFor="board-search" className="mb-1 block text-xs font-semibold text-gray-600">بحث بالرقم أو الاسم</label>
                    <input id="board-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="block w-full text-sm" />
                </div>
                <div>
                    <label htmlFor="board-subarea" className="mb-1 block text-xs font-semibold text-gray-600">منطقة 2</label>
                    <select id="board-subarea" value={subAreaId} onChange={(event) => setSubAreaId(event.target.value)} className="block text-sm">
                        <option value="">كل المناطق</option>
                        {subAreaOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </div>
                {abilities.manage && (
                    <div className="flex flex-wrap items-end gap-2">
                        <div>
                            <label htmlFor="board-target" className="mb-1 block text-xs font-semibold text-gray-600">تخصيص المحدد ({formatNumber(selected.size)}) إلى</label>
                            <select id="board-target" value={target} onChange={(event) => setTarget(event.target.value)} className="block text-sm">
                                <option value="">اختر…</option>
                                {columns.map((column) => <option key={column.key} value={column.key}>{column.key === 'available' ? 'إعادة إلى المتاحة' : column.label}</option>)}
                            </select>
                        </div>
                        <PrimaryButton onClick={assignSelected} disabled={busy || selected.size === 0 || !target}>تخصيص</PrimaryButton>
                        {selected.size > 0 && <SecondaryButton onClick={() => setSelected(new Set())}>إلغاء التحديد</SecondaryButton>}
                    </div>
                )}
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4" aria-busy={busy}>
                {columns.map((column) => {
                    const all = boards.filter((box) => box.column === column.key);
                    const shown = all.filter((box) => boxMatches(box, search, subAreaId));
                    const totals = columnTotals(all);

                    return (
                        <section
                            key={column.key}
                            aria-label={column.label}
                            onDragOver={(event) => {
                                if (abilities.manage) {
                                    event.preventDefault();
                                    setDragOver(column.key);
                                }
                            }}
                            onDragLeave={() => setDragOver((current) => (current === column.key ? null : current))}
                            onDrop={(event) => abilities.manage && onDrop(event, column)}
                            className={`flex w-72 shrink-0 flex-col rounded-card border bg-gray-50 ${dragOver === column.key ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-gray-100'}`}
                        >
                            <header className="border-b border-gray-100 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="flex items-center gap-1.5 font-bold text-gray-900">
                                        <Icon name={column.key === 'available' ? 'table' : column.key === 'paper' ? 'printer' : 'user'} className="h-4 w-4 text-gray-500" />
                                        {column.label}
                                    </h3>
                                    {abilities.manage && shown.length > 0 && (
                                        <button type="button" onClick={() => toggleColumn(shown)} className="text-xs font-semibold text-brand-600 hover:underline">تحديد الكل</button>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    {formatNumber(totals.boxes)} طبلون · {formatNumber(totals.subscribers)} مشترك
                                    {column.key !== 'available' && totals.subscribers > 0 && <> · قُرئ {formatNumber(totals.read)}</>}
                                </p>
                                {abilities.approve && column.key !== 'available' && totals.drafts > 0 && (
                                    <button type="button" onClick={() => approve(column.key === 'paper' ? { paper: true } : { user_id: column.userId })} className="mt-2 inline-flex items-center gap-1 rounded-control bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700">
                                        <Icon name="check" className="h-3.5 w-3.5" />
                                        {column.key === 'paper' ? 'اعتماد الورقي' : 'اعتماد هذا القارئ'} ({formatNumber(totals.drafts)})
                                    </button>
                                )}
                            </header>
                            <ul className="flex min-h-[8rem] flex-1 flex-col gap-2 overflow-y-auto p-3" style={{ maxHeight: '60vh' }}>
                                {shown.length === 0 && <li className="py-6 text-center text-xs text-gray-400">{abilities.manage ? 'اسحب الطبلونات إلى هنا' : 'لا توجد طبلونات'}</li>}
                                {shown.map((box) => (
                                    <BoxCard key={box.id} box={box} selected={selected.has(box.id)} canMove={abilities.manage} onToggle={toggle} onDragStart={onDragStart} />
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>

            {(abilities.printSheets || paperSheets.length > 0) && (
                <section className="mt-6 rounded-card border border-gray-100 bg-surface p-5 shadow-card" aria-labelledby="sheets-title">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 id="sheets-title" className="font-bold text-gray-900">الكشوف الورقية</h3>
                            <p className="text-xs text-gray-500">حدّد طبلونات معتمدة من عمود الكشوف الورقية لإنشاء كشف برقم خاص. إعادة الطباعة تُحسب ولا تكرر التوزيع. تُدخل القراءات لاحقًا من صفحة القراءات.</p>
                        </div>
                        {abilities.printSheets && (
                            <PrimaryButton onClick={createSheet} disabled={selectedPaperApproved === 0}>
                                <Icon name="printer" className="h-4 w-4" />
                                إنشاء كشف ({formatNumber(selectedPaperApproved)})
                            </PrimaryButton>
                        )}
                    </div>
                    {paperSheets.length > 0 && (
                        <ul className="mt-4 divide-y divide-gray-100 rounded-control border border-gray-100 text-sm">
                            {paperSheets.map((sheet) => (
                                <li key={sheet.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                    <span>
                                        <b className="font-display" dir="ltr">{sheet.number}</b> · {formatNumber(sheet.boxes)} طبلون
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {sheet.printCount > 0 ? `طُبع ${formatNumber(sheet.printCount)} مرة · آخرها ${sheet.lastPrintedAt} (${sheet.lastPrintedBy})` : 'لم يُطبع بعد'}
                                    </span>
                                    {abilities.printSheets && <Link href={`/paper-sheets/${sheet.id}`} className="text-sm font-semibold text-brand-600 hover:underline">فتح للطباعة</Link>}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {editingDay && <ReadingDayModal cycle={cycle} onClose={() => setEditingDay(false)} />}
        </AuthenticatedLayout>
    );
}
