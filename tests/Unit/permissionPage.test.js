import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rolldown } from 'rolldown';
import { individualChanges, sectionModel } from '../../resources/js/lib/permissions.js';

let PermissionSummary;
let PermissionChangeReview;
let PermissionEditor;

before(async () => {
    const bundle = await rolldown({
        input: path.resolve(import.meta.dirname, '../../resources/js/Pages/Settings/Permissions.jsx'),
        platform: 'node', transform: { jsx: 'react-jsx' },
        resolve: { alias: { '@': path.resolve(import.meta.dirname, '../../resources/js') } },
        plugins: [{
            name: 'render-permission-components',
            resolveId(id) {
                if (/^react(?:-dom)?(?:\/|$)/.test(id) || id === '@inertiajs/react') {
                    return { id: import.meta.resolve(id), external: true };
                }
                if (id.endsWith('.css')) { return '\0stylesheet'; }
            },
            load(id) { if (id === '\0stylesheet') { return ''; } },
        }],
    });
    try {
        const { output } = await bundle.generate({ format: 'esm' });
        ({ PermissionSummary, PermissionChangeReview, PermissionEditor } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`));
    } finally { await bundle.close(); }
});

const employee = { name: 'Test Collector', roleLabel: 'محصل', branchName: 'فرع الاختبار', lockedPermissions: ['عرض كل الفروع والتقارير'] };
const payments = sectionModel({ key: 'collections', label: 'الدفعات والحركات المالية', actions: [
    { action: 'view', permission: { id: 1, label: 'عرض السجل المالي' } },
    { action: 'record', permission: { id: 2, label: 'إضافة دفعة' } },
    { action: 'force_delete', permission: { id: 3, label: 'الحذف النهائي للحركة' } },
] });

test('the auditor editor allows individually assigned work and keeps copying permissions without role templates', () => {
    const auditor = { ...employee, id: 1, username: 'audit', role: 'financial_auditor', roleLabel: 'مدقق مالي', permissionIds: [999], auditSettings: { scope: 'selected', branch_ids: [1], actions: ['review_transfers'] } };
    const html = renderToStaticMarkup(createElement(PermissionEditor, { employee: auditor, sections: [payments], templates: [], copySources: [], scopedToOwnBranch: false, onDirtyChange() {}, auditOptions: { permissionId: 999, branches: [{ id: 1, name: 'فرع العمل' }], actions: [{ value: 'review_transfers', label: 'مراجعة الحوالات', hint: 'تسجيل مبلغ البنك' }] } }));

    assert.match(html, /عمل التدقيق المالي/);
    assert.doesNotMatch(html, /الصلاحيات التشغيلية مقفلة لدور المدقق/);
    assert.match(html, /فرع العمل/);
    assert.doesNotMatch(html, /مقفل لهذا الدور/);
    assert.match(html, /لا يملك عرض السجل أو إضافة دفعة/);
    assert.match(html, /نسخ من موظف/);
    assert.doesNotMatch(html, /تطبيق قالب/);
});

test('summary clearly limits its count to editable grants and identifies preserved rights', () => {
    const html = renderToStaticMarkup(createElement(PermissionSummary, { employee, sections: [payments], selected: [1, 2], template: { label: 'محصل', permissionIds: [1] }, scopedToOwnBranch: true }));
    assert.match(html, /المعروض هو ما يمكنك تعديله لموظفي فرعك/);
    assert.match(html, /صلاحية خارج نطاق إدارتك/);
    assert.match(html, /عرض كل الفروع والتقارير/);
    assert.match(html, /اختلاف عن قالب الدور/);
    assert.doesNotMatch(html, /%/);
});

test('full review names every removed and added action by section, with its consequences and risk', () => {
    const changes = individualChanges([payments], [1, 2], [1, 3]);
    const html = renderToStaticMarkup(createElement(PermissionChangeReview, { employee, changes }));
    assert.match(html, /إضافة دفعة/);
    assert.match(html, /الحذف النهائي للحركة/);
    assert.match(html, /الدفعات والحركات المالية/);
    assert.match(html, /سيُلغى/);
    assert.match(html, /سيُمنح/);
    assert.match(html, /خطير/);
    assert.match(html, /لا يحذف القراءة/);
    assert.match(html, /جميع تغييرات الصلاحيات/);
});
