/**
 * The permissions editor's model (Pages/Settings/Permissions.jsx). Each
 * section's everyday permissions climb a ladder — view, then add, then edit
 * — so one level stands for all the permissions up to it. Sensitive ones
 * (delete, approve, adjust balances…) are never part of a level: each is
 * its own switch. Every level is just a set of the real permissions, so
 * an employee whose permissions don't sit on the ladder (say, edit
 * without add) shows as "custom" with the exact switches, never rounded.
 */

/** Each section's ladder: its everyday actions in order, and what each level is called. */
const LADDERS = {
    crud: { actions: ['view', 'create', 'update'], levels: ['بدون', 'عرض', 'إضافة', 'تعديل'], long: ['لا يرى القسم', 'يرى فقط', 'يرى ويضيف', 'يرى ويضيف ويعدّل'] },
    meter_readings: { actions: ['view', 'record'], levels: ['بدون', 'عرض', 'تسجيل'], long: ['لا يرى القراءات', 'يرى القراءات', 'يرى ويسجّل القراءات'] },
    collections: { actions: ['view', 'record'], levels: ['بدون', 'عرض السجل', 'إضافة دفعة'], long: ['لا يملك عرض السجل أو إضافة دفعة', 'يعرض السجل المالي', 'يعرض السجل المالي ويضيف دفعات'] },
    messages: { actions: ['view', 'send'], levels: ['بدون', 'عرض', 'إرسال'], long: ['لا يرى الرسائل', 'يرى الرسائل', 'يرى ويرسل الرسائل'] },
    print_templates: { actions: ['manage'], levels: ['بدون', 'إدارة'], long: ['لا يدير القوالب', 'يدير قوالب الطباعة'] },
};

/** Sections whose everyday actions aren't a ladder (each is its own switch). */
const NO_LADDER = ['closings', 'reports'];

/**
 * The permissions set apart as their own switches, keyed by action or by
 * `section.action`. `danger` ones ask before they are turned on.
 */
export const SENSITIVE = {
    delete: { label: 'الحذف', hint: 'يحذف ما لا يرتبط به شيء — تُمنح بحذر', danger: true },
    minimum_charge: { label: 'تعديل الحد الأدنى للدفع', hint: 'صلاحية خاصة', danger: false },
    approve: { label: 'اعتماد القراءات', hint: 'تُضاف مبالغها إلى حسابات المشتركين', danger: true },
    confirm: { label: 'تأكيد التحصيل', hint: 'تُمنح بحذر', danger: true },
    adjust: { label: 'إضافة تحميل أو خصم أو تسوية', hint: 'يشمل الخصم الدائم وتسوية الرصيد — لا يمنح تعديل الحركات أو حذفها', danger: true },
    correct: { label: 'تعديل مبلغ الحركة', hint: 'تصحيح مبلغ تحميل أو دفعة من مسار التصحيح، مع حفظ السبب والأثر المالي', danger: true },
    'meter_readings.correct': { label: 'تصحيح القراءة الأسبوعية', hint: 'يعدّل قراءة الأسبوع المتاح؛ القراءة المعتمدة تعود للاعتماد', danger: true },
    'subscriptions.bulk_update': { label: 'تعديل المشتركين جماعيًا', hint: 'تعديل الحالة أو الحد الأدنى لمجموعة، مع صلاحية تعديل الحقل نفسه', danger: true },
    'collections.amend': { label: 'تعديل بيانات الدفعة', hint: 'تعديل البنك والمرسل والملاحظات؛ لا يغيّر المبلغ أو رقم المرجع', danger: true },
    'collections.refund': { label: 'ردّ الدفعة', hint: 'يردّ المبلغ بقيد مرتبط؛ تبقى الدفعة وسجل الردّ ظاهرين', danger: true },
    'collections.delete': { label: 'إلغاء الحركات المالية', hint: 'إلغاء حركة بقيد عكسي، وتبقى ظاهرة في الكشف', danger: true },
    'collections.force_delete': { label: 'الحذف النهائي للحركة', hint: 'يحذف الحركة المؤهلة أو سلسلة إلغائها من الكشف، مع الاحتفاظ بسجل تدقيق؛ لا يحذف القراءة', danger: true },
    'reports.export': { label: 'تنزيل التقارير المالية', hint: 'تنزيل CSV للكشوف والتقارير التي يملك عرضها فقط', danger: false },
    'closings.audit': { label: 'تدقيق واعتماد الكشوف', hint: 'يعيد كشوف الفروع أو يعتمدها', danger: true },
};

/** The everyday actions shown as switches (a section without a ladder, or one cut short). */
export const ACTION_LABELS = {
    view: 'عرض',
    create: 'إضافة',
    update: 'تعديل',
    record: 'تسجيل',
    send: 'إرسال',
    manage: 'إدارة',
    prepare: 'إعداد كشوف الفرع',
    view_all: 'عرض كل الفروع والتقارير',
    branch_performance: 'أداء الفروع',
    debt_aging: 'أعمار الديون',
    transaction_audit: 'سجل التدقيق',
};

/** What an everyday switch opens, in a line under its name. */
const ACTION_HINTS = {
    prepare: 'الإغلاق اليومي لفرعه وتسليم النقد',
    view_all: 'كشوف كل الفروع وتقاريرها، للقراءة فقط',
    branch_performance: 'أرقام الفرع ومقارنته بالفروع الأخرى',
    debt_aging: 'المشتركون المدينون وكم مضى على ديونهم',
    transaction_audit: 'من عدّل أو ألغى أو حذف أي حركة، ومتى ولماذا',
};

function sensitiveOf(sectionKey, action) {
    return SENSITIVE[`${sectionKey}.${action}`] ?? SENSITIVE[action] ?? null;
}

/**
 * A section as the editor lays it out: `ladder` (its level names and the
 * permission ids each level adds, in order — only as far as the actor may
 * grant without a gap), `switches` (everyday permissions off the ladder)
 * and `sensitive` (each with its label, hint and danger).
 */
export function sectionModel(group) {
    const available = group.actions.filter((entry) => entry.permission);
    const ladderDef = NO_LADDER.includes(group.key) ? null : (LADDERS[group.key] ?? LADDERS.crud);
    const ladderEntries = [];

    if (ladderDef) {
        for (const action of ladderDef.actions) {
            const entry = available.find((candidate) => candidate.action === action);

            if (!entry) {
                break;
            }

            ladderEntries.push(entry);
        }
    }

    const onLadder = new Set(ladderEntries.map((entry) => entry.action));
    const offLadder = available.filter((entry) => !onLadder.has(entry.action));

    return {
        key: group.key,
        label: group.label,
        ladder: ladderEntries.length
            ? {
                  ids: ladderEntries.map((entry) => entry.permission.id),
                  actions: ladderEntries.map((entry) => entry.action),
                  labels: ladderEntries.map((entry) => group.key === 'collections' ? ({ view: 'عرض السجل المالي', record: 'إضافة دفعة' }[entry.action] ?? entry.permission.label) : entry.permission.label),
                  levels: ladderDef.levels.slice(0, ladderEntries.length + 1),
                  long: ladderDef.long.slice(0, ladderEntries.length + 1),
              }
            : null,
        switches: offLadder
            .filter((entry) => !sensitiveOf(group.key, entry.action))
            .map((entry) => ({
                id: entry.permission.id,
                action: entry.action,
                label: group.key === 'closings' && entry.action === 'view' ? 'عرض كشوف الفرع' : (ACTION_LABELS[entry.action] ?? entry.permission.label),
                hint: group.key === 'closings' && entry.action === 'view' ? 'كشوف وتقارير الفرع دون إعدادها أو اعتمادها' : (ACTION_HINTS[entry.action] ?? null),
            })),
        sensitive: offLadder
            .filter((entry) => sensitiveOf(group.key, entry.action))
            .map((entry) => ({ id: entry.permission.id, action: entry.action, ...sensitiveOf(group.key, entry.action) })),
    };
}

/** Every permission id a section governs. */
export function sectionIds(section) {
    return [...(section.ladder?.ids ?? []), ...section.switches.map((item) => item.id), ...section.sensitive.map((item) => item.id)];
}

/** Exact action names for review, including custom combinations off a ladder. */
export function permissionEntries(sections) {
    return sections.flatMap((section) => [
        ...(section.ladder?.ids ?? []).map((id, index) => ({ id, action: section.ladder.actions[index], label: section.ladder.labels[index], sensitive: false })),
        ...section.switches.map((item) => ({ ...item, sensitive: false })),
        ...section.sensitive.map((item) => ({ ...item, sensitive: true })),
    ].map((item) => ({ ...item, section: section.label, sectionKey: section.key })));
}

/** Each actual grant added or removed; a swap always produces both changes. */
export function individualChanges(sections, saved, current) {
    return permissionEntries(sections)
        .filter((item) => saved.includes(item.id) !== current.includes(item.id))
        .map((item) => ({ ...item, added: current.includes(item.id), text: `${item.section}: ${item.label}` }));
}

/** Group shortcuts operate on visible sections and leave all other grants alone. */
export function withGroupAccess(sections, selected, viewOnly) {
    const governed = sections.flatMap(sectionIds);
    const next = selected.filter((id) => !governed.includes(id));

    if (viewOnly) {
        for (const section of sections) {
            if (section.ladder?.actions[0] === 'view') {
                next.push(section.ladder.ids[0]);
            }
            for (const item of section.switches) {
                if (item.action === 'view' || (section.key === 'reports' && ['branch_performance', 'debt_aging', 'transaction_audit'].includes(item.action))) {
                    next.push(item.id);
                } else if (item.action === 'view_all' && selected.includes(item.id)) {
                    next.push(item.id);
                }
            }
        }
    }

    return next;
}

export function filterSections(sections, selected, saved, query, mode = 'all') {
    const needle = query.trim().toLocaleLowerCase();

    return sections.filter((section) => {
        const entries = permissionEntries([section]);
        const matchesQuery = !needle || [section.label, ...entries.flatMap((item) => [item.label, item.hint])]
            .filter(Boolean).some((text) => text.toLocaleLowerCase().includes(needle));
        const matchesMode = mode === 'all'
            || (mode === 'enabled' && sectionIds(section).some((id) => selected.includes(id)))
            || (mode === 'sensitive' && section.sensitive.length > 0)
            || (mode === 'changed' && sectionIds(section).some((id) => saved.includes(id) !== selected.includes(id)));

        return matchesQuery && matchesMode;
    });
}

/**
 * The level the selected permissions reach on a ladder: n when exactly its
 * first n permissions are held, or null when they don't sit on it (custom).
 */
export function levelOf(ladder, selectedIds) {
    const held = ladder.ids.map((id) => selectedIds.includes(id));
    const level = held.indexOf(false) === -1 ? held.length : held.indexOf(false);

    return held.slice(level).some(Boolean) ? null : level;
}

/** The selected permissions with a ladder set to `level`: its first `level` permissions held, the rest not. */
export function withLevel(ladder, selectedIds, level) {
    const others = selectedIds.filter((id) => !ladder.ids.includes(id));

    return [...others, ...ladder.ids.slice(0, level)];
}

/** The selected permissions with one turned on or off. */
export function withToggled(selectedIds, id, on) {
    const others = selectedIds.filter((selected) => selected !== id);

    return on ? [...others, id] : others;
}

/** Whether two sets of permission ids hold the same permissions. */
export function samePermissions(first, second) {
    return first.length === second.length && first.every((id) => second.includes(id));
}

/**
 * What changed from `saved` to `current`, section by section, as short
 * lines: `{ text, added }` — a ladder's new level, or a permission turned on
 * or off.
 */
export function changesBetween(sections, saved, current) {
    const changes = [];

    for (const section of sections) {
        if (section.ladder) {
            const before = levelOf(section.ladder, saved);
            const after = levelOf(section.ladder, current);

            if (!samePermissions(section.ladder.ids.filter((id) => saved.includes(id)), section.ladder.ids.filter((id) => current.includes(id)))) {
                changes.push({
                    text: `${section.label}: ${after === null ? 'مخصّص' : section.ladder.levels[after]}`,
                    added: before === null || after === null ? current.length >= saved.length : after > before,
                });
            }
        }

        for (const item of [...section.switches, ...section.sensitive]) {
            const was = saved.includes(item.id);
            const is = current.includes(item.id);

            if (was !== is) {
                changes.push({ text: `${section.label}: ${item.label}`, added: is });
            }
        }
    }

    return changes;
}
