/**
 * The reading cycle board's small rules, kept apart from the page so they
 * can be tested on their own.
 */

/** How each stage of a cycle is shown. */
export const STAGES = {
    preparing: { label: 'تحضير', tone: 'blue' },
    reading_day: { label: 'يوم القراءة', tone: 'green' },
    ended: { label: 'انتهى يوم القراءة', tone: 'amber' },
    closed: { label: 'مغلقة', tone: 'gray' },
};

/** The board's columns in order: the available pool, paper, then each reader. */
export function boardColumns(readers) {
    return [
        { key: 'available', target: 'available', label: 'الطبلونات المتاحة' },
        { key: 'paper', target: 'paper', label: 'الكشوف الورقية' },
        ...readers.map((reader) => ({ key: `reader:${reader.id}`, target: 'mobile', userId: reader.id, label: reader.name })),
    ];
}

/** Whether a box matches the search (its number or name) and the chosen sub-area. */
export function boxMatches(box, search, subAreaId) {
    const term = String(search ?? '').trim().toLowerCase();
    const inSubArea = !subAreaId || String(box.subAreaId) === String(subAreaId);

    return inSubArea && (!term || `${box.number} ${box.name}`.toLowerCase().includes(term));
}

/** The boxes, subscribers, readings and drafts of one column. */
export function columnTotals(boxes) {
    return boxes.reduce(
        (totals, box) => ({
            boxes: totals.boxes + 1,
            subscribers: totals.subscribers + box.subscribers,
            read: totals.read + box.read,
            drafts: totals.drafts + (box.status === 'draft' ? 1 : 0),
        }),
        { boxes: 0, subscribers: 0, read: 0, drafts: 0 },
    );
}

/**
 * The boxes a drag carries: every chosen box when the dragged one is
 * chosen, otherwise just the dragged one.
 */
export function draggedBoxIds(boxId, selectedIds) {
    return selectedIds.has(boxId) ? [...selectedIds] : [boxId];
}

/** The request that moves the boxes to a column, each from the version shown. */
export function movePayload(boxIds, column, boards, confirmDownloaded = false) {
    const versions = Object.fromEntries(boards.filter((box) => boxIds.includes(box.id)).map((box) => [box.id, box.version]));

    return {
        box_ids: boxIds,
        target: column.target,
        user_id: column.userId ?? null,
        versions,
        confirm_downloaded: confirmDownloaded,
    };
}

/** The board's counters: available, by reader, paper, approved and draft boxes. */
export function boardCounters(boards) {
    return {
        available: boards.filter((box) => box.column === 'available').length,
        mobile: boards.filter((box) => box.column.startsWith('reader:')).length,
        paper: boards.filter((box) => box.column === 'paper').length,
        approved: boards.filter((box) => box.status === 'approved').length,
        draft: boards.filter((box) => box.status === 'draft').length,
        subscribers: boards.reduce((total, box) => total + box.subscribers, 0),
    };
}
