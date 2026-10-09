import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rolldown } from 'rolldown';

let balance;

before(async () => {
    const bundle = await rolldown({
        input: path.resolve(import.meta.dirname, '../../resources/js/Components/FinancialBalance.jsx'),
        platform: 'node',
        transform: { jsx: 'react-jsx' },
        resolve: { alias: { '@': path.resolve(import.meta.dirname, '../../resources/js') } },
        plugins: [{
            name: 'keep-react-external',
            resolveId(id) {
                if (/^react(?:-dom)?(?:\/|$)/.test(id)) {
                    return { id: import.meta.resolve(id), external: true };
                }
            },
        }],
    });

    try {
        const { output } = await bundle.generate({ format: 'esm' });
        balance = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
    } finally {
        await bundle.close();
    }
});

function render(value) {
    return renderToStaticMarkup(createElement(balance.default, { value }));
}

test('what a subscription owes is amber and is owed to the company', () => {
    const html = render('150.00');

    assert.match(html, /text-amber-700/);
    assert.match(html, /title="مستحق للشركة"/);
    assert.doesNotMatch(html, /emerald|text-red/);
});

test('credit in the subscriber\'s favour is blue, never the red of a problem', () => {
    const html = render('-40.00');

    assert.match(html, /text-blue-600/);
    assert.match(html, /title="رصيد للمشترك"/);
    assert.doesNotMatch(html, /emerald|text-red/);
});

test('a settled account is neutral', () => {
    const html = render('0.00');

    assert.match(html, /text-gray-700/);
    assert.match(html, /title="مسدّد"/);
    assert.doesNotMatch(html, /amber|blue|emerald|text-red/);
});

test('a row shows the amount alone, with the wording only for hover and screen readers', () => {
    for (const [value, words] of [['150.00', 'مستحق للشركة'], ['-40.00', 'رصيد للمشترك'], ['0.00', 'مسدّد']]) {
        const html = render(value);
        const visible = html.replace(/<span class="sr-only">.*?<\/span>/, '').replace(/<[^>]+>/g, '');

        assert.doesNotMatch(visible, new RegExp(words));
        assert.match(html, new RegExp(`<span class="sr-only">${words}</span>`));
    }
});

test('a balance in the subscriber\'s favour carries a minus sign, so color is not the only cue', () => {
    assert.match(render('150.00'), />150 ₪</);
    assert.match(render('-40.00'), />-40 ₪</);
    assert.match(render('0.00'), />0 ₪</);
});

test('the amount is set at the start of its cell, as the column header is, not stacked in a flex column', () => {
    assert.doesNotMatch(render('150.00'), /flex-col|inline-flex/);
});

test('green is kept for money received, and red for money paid back out', () => {
    assert.match(balance.transactionMoneyClass({ type: 'payment' }), /emerald/);
    assert.match(balance.transactionMoneyClass({ type: 'refund' }), /text-red/);
    assert.match(balance.cashAmountClass('25.00'), /emerald/);
    assert.match(balance.cashAmountClass('-25.00'), /red/);
});

test('a cancelled payment or a reversal is not painted as money in or out', () => {
    assert.equal(balance.transactionMoneyClass({ type: 'payment', isCancelled: true }), balance.BALANCE_TEXT.settled);
    assert.equal(balance.transactionMoneyClass({ type: 'reversal', isReversal: true }), balance.BALANCE_TEXT.settled);
});

test('the same three tones are given for text, chips and the dark panel', () => {
    for (const colors of [balance.BALANCE_TEXT, balance.BALANCE_CHIPS, balance.BALANCE_DARK]) {
        assert.deepEqual(Object.keys(colors).sort(), ['credit', 'owes', 'settled']);
    }
    assert.match(balance.BALANCE_DARK.owes, /amber/);
    assert.match(balance.BALANCE_DARK.credit, /sky/);
});
