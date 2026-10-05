import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changesBetween, filterSections, individualChanges, levelOf, samePermissions, sectionIds, sectionModel, withGroupAccess, withLevel, withToggled } from '../../resources/js/lib/permissions.js';

const entry = (action, id, label = action) => ({ action, permission: id === null ? null : { id, label } });

const subscribers = sectionModel({
    key: 'subscribers',
    label: 'المشتركون',
    actions: [entry('view', 1), entry('create', 2), entry('update', 3), entry('delete', 4), entry('minimum_charge', 5)],
});

test('a section climbs view, add, edit, with delete and special permissions set apart', () => {
    assert.deepEqual(subscribers.ladder.ids, [1, 2, 3]);
    assert.deepEqual(subscribers.ladder.levels, ['بدون', 'عرض', 'إضافة', 'تعديل']);
    assert.deepEqual(subscribers.sensitive.map((item) => [item.id, item.label]), [[4, 'الحذف'], [5, 'تعديل الحد الأدنى للدفع']]);
    assert.deepEqual(subscribers.switches, []);
    assert.deepEqual(sectionIds(subscribers).sort(), [1, 2, 3, 4, 5]);
});

test('a level is held only when exactly the permissions up to it are', () => {
    assert.equal(levelOf(subscribers.ladder, []), 0);
    assert.equal(levelOf(subscribers.ladder, [1]), 1);
    assert.equal(levelOf(subscribers.ladder, [1, 2, 4]), 2);
    assert.equal(levelOf(subscribers.ladder, [1, 2, 3]), 3);
    // Edit without add, or add without view, sits on no level: it is custom.
    assert.equal(levelOf(subscribers.ladder, [1, 3]), null);
    assert.equal(levelOf(subscribers.ladder, [2]), null);
});

test('setting a level changes only that ladder, leaving delete and other sections as they were', () => {
    assert.deepEqual(withLevel(subscribers.ladder, [3, 4, 99], 2).sort((a, b) => a - b), [1, 2, 4, 99]);
    assert.deepEqual(withLevel(subscribers.ladder, [1, 2, 3, 4], 0), [4]);
    assert.deepEqual(withToggled([1, 4], 4, false), [1]);
    assert.deepEqual(withToggled([1], 4, true), [1, 4]);
});

test('a ladder stops at the first level the actor may not grant, the rest become switches', () => {
    const cut = sectionModel({ key: 'users', label: 'المستخدمون', actions: [entry('view', 1), entry('create', null), entry('update', 3)] });

    assert.deepEqual(cut.ladder.ids, [1]);
    assert.deepEqual(cut.ladder.levels, ['بدون', 'عرض']);
    assert.deepEqual(cut.switches.map((item) => [item.id, item.label]), [[3, 'تعديل']]);
});

test('closings have no ladder: preparing and viewing every branch are separate switches', () => {
    const closings = sectionModel({ key: 'closings', label: 'الإغلاق', actions: [entry('prepare', 7), entry('view_all', 8), entry('audit', 9)] });

    assert.equal(closings.ladder, null);
    assert.deepEqual(closings.switches.map((item) => item.label), ['إعداد كشوف الفرع', 'عرض كل الفروع والتقارير']);
    assert.deepEqual(closings.sensitive.map((item) => item.id), [9]);
});

test('the changes name each new level and each permission turned on or off', () => {
    assert.deepEqual(changesBetween([subscribers], [1], [1, 2, 4]), [
        { text: 'المشتركون: إضافة', added: true },
        { text: 'المشتركون: الحذف', added: true },
    ]);
    assert.deepEqual(changesBetween([subscribers], [1, 2, 3], [1]), [{ text: 'المشتركون: عرض', added: false }]);
    assert.deepEqual(changesBetween([subscribers], [1, 2], [2, 1]), []);
    assert.ok(samePermissions([1, 2], [2, 1]));
    assert.ok(!samePermissions([1, 2], [1]));
});

test('each report is its own switch, explained in a line', () => {
    const reports = sectionModel({
        key: 'reports',
        label: 'التقارير',
        actions: [entry('branch_performance', 10), entry('debt_aging', 11), entry('transaction_audit', 12)],
    });

    assert.equal(reports.ladder, null);
    assert.deepEqual(reports.switches.map((item) => item.label), ['أداء الفروع', 'أعمار الديون', 'سجل التدقيق']);
    assert.ok(reports.switches.every((item) => item.hint));
    assert.deepEqual(reports.sensitive, []);
});

test('review lists exact additions and removals when a custom level swaps actions', () => {
    const changes = individualChanges([subscribers], [1, 2, 4], [1, 3, 5]);
    assert.deepEqual(changes.map(({ id, added, sensitive }) => ({ id, added, sensitive })), [
        { id: 2, added: false, sensitive: false }, { id: 3, added: true, sensitive: false },
        { id: 4, added: false, sensitive: true }, { id: 5, added: true, sensitive: true },
    ]);
});

test('payment permissions use action names and keep edit, refund, cancel and permanent delete independent', () => {
    const payments = sectionModel({ key: 'collections', label: 'الدفعات والحركات المالية', actions: [
        entry('view', 10), entry('record', 11), entry('correct', 12), entry('amend', 13), entry('refund', 14), entry('delete', 15), entry('force_delete', 16),
    ] });
    assert.equal(payments.ladder.labels[1], 'إضافة دفعة');
    assert.deepEqual(withToggled([10, 11], 12, true), [10, 11, 12]);
    assert.deepEqual(individualChanges([payments], [10], [10, 11]).map((item) => item.label), ['إضافة دفعة']);
    assert.equal(payments.sensitive.find((item) => item.id === 14).label, 'ردّ الدفعة');
    assert.equal(payments.sensitive.find((item) => item.id === 15).label, 'إلغاء الحركات المالية');
    assert.equal(payments.sensitive.find((item) => item.id === 16).label, 'الحذف النهائي للحركة');
});

test('search and filters reveal relevant actions without mutating selected grants', () => {
    const readings = sectionModel({ key: 'meter_readings', label: 'القراءات', actions: [entry('view', 10), entry('record', 11), entry('correct', 12)] });
    const selected = [1, 4, 10];
    assert.deepEqual(filterSections([subscribers, readings], selected, [1, 10], 'تصحيح', 'all').map((item) => item.key), ['meter_readings']);
    assert.deepEqual(filterSections([subscribers, readings], selected, [1, 10], '', 'changed').map((item) => item.key), ['subscribers']);
    assert.equal(filterSections([subscribers, readings], [], [], '', 'enabled').length, 0);
    assert.deepEqual(selected, [1, 4, 10]);
});

test('view-only group shortcut preserves report access, does not grant cross-branch access or export, and leaves other sections intact', () => {
    const closings = sectionModel({ key: 'closings', label: 'الكشوف', actions: [entry('view', 10), entry('prepare', 11), entry('view_all', 12), entry('audit', 13)] });
    const reports = sectionModel({ key: 'reports', label: 'التقارير', actions: [entry('debt_aging', 14), entry('export', 15)] });
    assert.deepEqual(withGroupAccess([closings, reports], [99, 11, 13, 15], true), [99, 10, 14]);
    assert.deepEqual(withGroupAccess([closings, reports], [99, 12, 15], true), [99, 10, 12, 14]);
    assert.deepEqual(withGroupAccess([closings, reports], [99, 12, 15], false), [99]);
});
