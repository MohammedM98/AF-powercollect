import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rolldown } from 'rolldown';

let SubscriberForm;
let subscriberFormData;

before(async () => {
    const bundle = await rolldown({
        input: path.resolve(import.meta.dirname, '../../resources/js/Pages/Subscribers/SubscriberForm.jsx'),
        platform: 'node',
        transform: { jsx: 'react-jsx' },
        resolve: { alias: { '@': path.resolve(import.meta.dirname, '../../resources/js') } },
        plugins: [{
            name: 'use-installed-react',
            resolveId(id) {
                if (/^react(?:-dom)?(?:\/|$)/.test(id)) {
                    return { id: import.meta.resolve(id), external: true };
                }
            },
        }],
    });

    try {
        const { output } = await bundle.generate({ format: 'esm' });
        const component = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
        SubscriberForm = component.default;
        subscriberFormData = component.subscriberFormData;
    } finally {
        await bundle.close();
    }
});

function renderForm(data, options = {}) {
    return renderToStaticMarkup(createElement(SubscriberForm, {
        data,
        setData() {},
        errors: {},
        branches: [],
        meterBoxes: [],
        tariffs: [],
        circuitBreakers: [],
        subAreas: [],
        canChooseBranch: false,
        canEditMinimumCharge: false,
        ...options,
    }));
}

test('the new subscriber form renders its editable name and phone without crashing', () => {
    const html = renderForm(subscriberFormData(null));

    assert.match(html, /id="full_name"/);
    assert.match(html, /id="phone"/);
});

test('adding a subscription prefills editable name and phone while retaining its shared identity', () => {
    const data = subscriberFormData(null, {
        id: 12,
        full_name: 'Mohammed Hamdan',
        display_name: 'Mohammed Hamdan',
        national_id: '012345678',
        phone: '0591234567',
        contact_phone: '0561234567',
    });
    const html = renderForm(data, { sharedPersonalDetails: true });

    const nameInput = html.match(/<input(?=[^>]*id="subscription_name")[^>]*>/)[0];
    const phoneInput = html.match(/<input(?=[^>]*id="subscription_phone")[^>]*>/)[0];
    assert.match(nameInput, /value="Mohammed Hamdan"/);
    assert.match(phoneInput, /value="0561234567"/);
    assert.doesNotMatch(nameInput, /readonly/i);
    assert.doesNotMatch(phoneInput, /readonly/i);
    assert.match(html, /<input(?=[^>]*id="national_id")[^>]*readonly=""/i);
    assert.equal(data.source_subscriber_id, 12);
    assert.equal(data.tariff_id, '');
});

test('editing a subscription prefills editable name and phone even before it has custom values', () => {
    const html = renderForm(subscriberFormData({
        full_name: 'Mohammed Hamdan',
        subscription_name: null,
        phone: '0591234567',
        subscription_phone: null,
        status: 'active',
    }), { isEdit: true });

    assert.match(html, /<input(?=[^>]*id="subscription_name")[^>]*value="Mohammed Hamdan"/);
    assert.match(html, /<input(?=[^>]*id="subscription_phone")[^>]*value="0591234567"/);
    assert.doesNotMatch(html, /<input(?=[^>]*id="subscription_name")[^>]*readonly/i);
    assert.doesNotMatch(html, /<input(?=[^>]*id="subscription_phone")[^>]*readonly/i);
});

test('editing a named subscription renders its own name and phone in the preview', () => {
    const html = renderForm(subscriberFormData({
        full_name: 'Mohammed Hamdan',
        subscription_name: 'Mohammed Hamdan house',
        phone: '0591234567',
        subscription_phone: '0567654321',
        status: 'active',
    }), { subscriptionCount: 2, isEdit: true });

    assert.match(html, /Mohammed Hamdan house/);
    assert.match(html, /0567654321/);
    assert.match(html, /id="subscription_name"/);
});
