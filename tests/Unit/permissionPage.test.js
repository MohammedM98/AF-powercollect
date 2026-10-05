import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rolldown } from 'rolldown';
import { individualChanges, sectionModel } from '../../resources/js/lib/permissions.js';

let PermissionSummary;
let PermissionChangeReview;

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
        ({ PermissionSummary, PermissionChangeReview } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`));
    } finally { await bundle.close(); }
});

const employee = { name: 'Test Collector', roleLabel: 'محصل', branchName: 'فرع الاختبار', lockedPermissions: ['عرض كل الفروع والتقارير'] };
const payments = sectionModel({ key: 'collections', label: 'الدفعات والحركات المالية', actions: [
    { action: 'view', permission: { id: 1, label: 'عرض السجل المالي' } },
    { action: 'record', permission: { id: 2, label: 'إضافة دفعة' } },
    { action: 'force_delete', permission: { id: 3, label: 'الحذف النهائي للحركة' } },
] });

test('summary clearly limits its count to editable grants and identifies preserved rights', () => {
    const html = renderToStaticMarkup(createElement(PermissionSummary, { employee, sections: [payments], selected: [1, 2], template: { label: 'محصل', permissionIds: [1] }, scopedToOwnBranch: true }));
    assert.match(html, /المعروض هو ما يمكنك تعديله لموظفي فرعك/);
    assert.match(html, /صلاحية خارج نطاق إدارتك/);
    assert.match(html, /عرض كل الفروع والتقارير/);
    assert.match(html, /اختلاف عن قالب الدور/);
    assert.doesNotMatch(html, /%/);
});

test('full review names every removed and added action, including its deletion consequences', () => {
    const changes = individualChanges([payments], [1, 2], [1, 3]);
    const html = renderToStaticMarkup(createElement(PermissionChangeReview, { employee, changes }));
    assert.match(html, /إضافة دفعة/);
    assert.match(html, /الحذف النهائي للحركة/);
    assert.match(html, /ممنوح ← سيُلغى/);
    assert.match(html, /غير ممنوح ← سيُمنح/);
    assert.match(html, /لا يحذف القراءة/);
    assert.match(html, /جميع تغييرات الصلاحيات/);
});
