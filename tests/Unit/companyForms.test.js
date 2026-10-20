import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rolldown } from 'rolldown';
import { formDimensions, formFields, formText, moveFormItem, printPageRules } from '../../resources/js/lib/companyForms.js';
import { companyFormOfflineHtml } from '../../resources/js/lib/companyFormOffline.js';
import { sectionModel, sectionExtras, withSectionLevel } from '../../resources/js/lib/permissions.js';

let CompanyFormPaper;
before(async () => {
    const bundle = await rolldown({
        input: path.resolve(import.meta.dirname, '../../resources/js/Pages/CompanyForms/CompanyFormPaper.jsx'),
        platform: 'node', transform: { jsx: 'react-jsx' },
        resolve: { alias: { '@': path.resolve(import.meta.dirname, '../../resources/js') } },
        plugins: [{ name: 'company-paper', resolveId(id) {
            if (/^react(?:-dom)?(?:\/|$)/.test(id)) return { id: import.meta.resolve(id), external: true };
            if (id.endsWith('.css')) return '\0css';
        }, load(id) { if (id === '\0css') return ''; } }],
    });
    try {
        const { output } = await bundle.generate({ format: 'esm' });
        ({ default: CompanyFormPaper } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`));
    } finally { await bundle.close(); }
});

const layout = {
    paper: 'A4', orientation: 'portrait', fontSize: 15, margin: 16,
    header: { enabled: true, company: 'الشركة' }, watermark: { enabled: false }, footer: 'توقيع',
    pages: [{ id: 'p1', blocks: [
        { id: 'intro', type: 'paragraph', text: 'طلب {subscriber_name}', align: 'right' },
        { id: 'fields', type: 'fields', fields: [{ key: 'subscriber_name', label: 'الاسم' }, { key: 'previous_reading', label: 'القراءة' }] },
    ] }],
    overlays: [{ id: 'note', page: 1, key: 'custom_note', label: 'ملاحظة', x: 10, y: 20, width: 30, fontSize: 15 }],
};

test('blank printing suppresses personal data in text, fields and imported overlays', () => {
    const html = renderToStaticMarkup(createElement(CompanyFormPaper, { layout, page: layout.pages[0], blank: true, values: { subscriber_name: 'اسم خاص', previous_reading: '900', custom_note: 'ملاحظة خاصة' } }));
    assert.doesNotMatch(html, /اسم خاص|900|ملاحظة خاصة/);
    assert.match(html, /________________/);
    assert.match(html, /cf-fill-line/);
});

test('filled forms preserve zero readings and escape values in all content surfaces', () => {
    const html = renderToStaticMarkup(createElement(CompanyFormPaper, { layout, page: layout.pages[0], values: { subscriber_name: '<script>unsafe</script>', previous_reading: '0', custom_note: '<img onerror=unsafe>' } }));
    assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
    assert.match(html, /<bdi>0<\/bdi>/);
    assert.doesNotMatch(html, /<script>|<img onerror/);
});

test('template fields are collected once from blocks, tokens and PDF overlays', () => {
    assert.deepEqual(formFields(layout), [{ key: 'subscriber_name', label: 'الاسم' }, { key: 'previous_reading', label: 'القراءة' }, { key: 'custom_note', label: 'ملاحظة' }]);
    assert.equal(formText('{previous_reading} {missing}', { previous_reading: 0 }), '0 ________________');
});

test('page sizes honor orientation and imported pages retain their individual print sizes', () => {
    assert.deepEqual(formDimensions({ paper: 'A5', orientation: 'landscape' }), [210, 148]);
    assert.equal(printPageRules([{ width: 210, height: 297 }, { width: 297, height: 210 }]), '@page cf_page_0 { size: 210mm 297mm; margin: 0; }\n@page cf_page_1 { size: 297mm 210mm; margin: 0; }');
    const items = ['title', 'fields', 'signature'];
    assert.deepEqual(moveFormItem(items, 1, -1), ['fields', 'title', 'signature']);
    assert.deepEqual(items, ['title', 'fields', 'signature']);
    assert.equal(moveFormItem(items, 0, -1), items);
});

test('offline copies escape titles and include printable pages without external scripts', () => {
    const html = companyFormOfflineHtml('</title><script>unsafe</script>', '<article>نموذج</article>', '.cf-paper{color:black}', '@page{size:A4}');
    assert.match(html, /&lt;\/title&gt;&lt;script&gt;unsafe&lt;\/script&gt;/);
    assert.match(html, /<article>نموذج<\/article>/);
    assert.match(html, /@page\{size:A4\}/);
    assert.doesNotMatch(html, /<script|https?:\/\//);
});

test('issuing company forms is an independent permission shown alongside template management', () => {
    const section = sectionModel({ key: 'print_templates', label: 'قوالب الطباعة', actions: [
        { action: 'manage', permission: { id: 1, label: 'إدارة القوالب' } },
        { action: 'print_company_forms', permission: { id: 2, label: 'طباعة وأرشفة نماذج الشركة' } },
    ] });
    assert.deepEqual(withSectionLevel(section, [], 1), [1]);
    const print = sectionExtras(section).flatMap(group => group.items).find(item => item.id === 2);
    assert.equal(print.label, 'طباعة وأرشفة نماذج الشركة');
    assert.equal(print.needs, 0);
});
