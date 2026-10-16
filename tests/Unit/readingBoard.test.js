import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardColumns, boardCounters, boxMatches, columnTotals, draggedBoxIds, movePayload } from '../../resources/js/lib/readingBoard.js';

const boards = [
    { id: 1, number: 'B-001', name: 'المدارس 1', subAreaId: 7, subscribers: 4, read: 1, version: 0, column: 'available', status: null },
    { id: 2, number: 'B-002', name: 'المدارس 2', subAreaId: 8, subscribers: 6, read: 6, version: 2, column: 'reader:5', status: 'approved' },
    { id: 3, number: 'B-003', name: 'السوق', subAreaId: 7, subscribers: 3, read: 0, version: 1, column: 'paper', status: 'draft' },
];

test('the pool comes first, then paper, then each reader', () => {
    assert.deepEqual(boardColumns([{ id: 5, name: 'أحمد' }]).map((column) => column.key), ['available', 'paper', 'reader:5']);
});

test('boxes are found by number or name within the chosen sub-area', () => {
    assert.equal(boxMatches(boards[0], 'b-001', ''), true);
    assert.equal(boxMatches(boards[0], 'المدارس', 8), false);
    assert.equal(boxMatches(boards[2], 'السوق', '7'), true);
});

test('dragging a chosen box carries every chosen box, otherwise only itself', () => {
    assert.deepEqual(draggedBoxIds(1, new Set([1, 3])), [1, 3]);
    assert.deepEqual(draggedBoxIds(2, new Set([1, 3])), [2]);
});

test('a move sends each box with the version shown and the target column', () => {
    assert.deepEqual(movePayload([1, 2], { target: 'mobile', userId: 5 }, boards), { box_ids: [1, 2], target: 'mobile', user_id: 5, versions: { 1: 0, 2: 2 }, confirm_downloaded: false });
    assert.equal(movePayload([3], { target: 'available' }, boards, true).user_id, null);
});

test('the counters and a column\'s totals add up', () => {
    assert.deepEqual(boardCounters(boards), { available: 1, mobile: 1, paper: 1, approved: 1, draft: 1, subscribers: 13 });
    assert.deepEqual(columnTotals(boards), { boxes: 3, subscribers: 13, read: 7, drafts: 1 });
});
