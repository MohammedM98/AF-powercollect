import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rolldown } from 'rolldown';

let SubscriberDetailsModal;
let AccountTab;

before(async () => {
    const bundle = await rolldown({
        input: path.resolve(import.meta.dirname, '../../resources/js/Pages/Subscribers/SubscriberDetailsModal.jsx'),
        platform: 'node',
        transform: { jsx: 'react-jsx' },
        resolve: { alias: { '@': path.resolve(import.meta.dirname, '../../resources/js') } },
        plugins: [{
            name: 'render-profile-without-browser-portal',
            resolveId(id) {
                if (/^react(?:-dom)?(?:\/|$)/.test(id) || id === '@inertiajs/react') {
                    return { id: import.meta.resolve(id), external: true };
                }
                if (id === '@/Components/Modal') {
                    return '\0inline-modal';
                }
                if (id.endsWith('.css')) {
                    return '\0stylesheet';
                }
            },
            load(id) {
                if (id === '\0inline-modal') {
                    return 'export default function Modal({ show, children }) { return show ? children : null; }';
                }
                if (id === '\0stylesheet') {
                    return '';
                }
            },
        }],
    });

    try {
        const { output } = await bundle.generate({ format: 'esm' });
        const component = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
        SubscriberDetailsModal = component.default;
        AccountTab = component.AccountTab;
    } finally {
        await bundle.close();
    }
});

function renderProfile(subscriber = {}, options = {}) {
    return renderToStaticMarkup(createElement(SubscriberDetailsModal, {
        subscriber: {
            id: 1, display_name: 'اشتراك المتجر', full_name: 'صاحب المتجر', subscriber_number: '000041',
            account_number: '202600041', status: 'active', statusLabel: 'نشط', outstandingBalance: '0.00',
            initial_reading: 0, lastReading: 0, meterReadings: [], ...subscriber,
        },
        onClose() {}, onEdit() {}, onEditPersonal() {}, onOpenStatement() {}, onLoadStatement() {}, onOpenReadings() {},
        ...options,
    }));
}

test('profile preserves separate personal and subscription identities and displays a zero reading', () => {
    const html = renderProfile({ phone: '0591111111', subscription_phone: '0562222222', contact_phone: '0562222222' });

    assert.match(html, /اشتراك المتجر/);
    assert.match(html, /صاحب المتجر/);
    assert.match(html, /000041/);
    assert.match(html, /202600041/);
    assert.match(html, /رقم الجوال<\/dt><dd[^>]*><span[^>]*>0591111111<\/span>/);
    assert.match(html, /جوال الاشتراك<\/dt><dd[^>]*><span[^>]*>0562222222<\/span>/);
    assert.match(html, /القراءة الأولى<\/dt><dd[^>]*><span[^>]*>0<\/span>/);
    assert.match(html, /لا توجد قراءات مسجلة بعد/);
});

test('profile hides unavailable actions and disables navigation at list boundaries', () => {
    const html = renderProfile();

    assert.doesNotMatch(html, /تسجيل دفعة|تعديل البيانات|إرسال SMS/);
    assert.doesNotMatch(html, /aria-label="تسجيل قراءة"/);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="المشترك السابق"/);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="المشترك التالي"/);
});

test('profile offers permitted actions but disables a reading already recorded this week', () => {
    const html = renderProfile({
        canRecordPayment: true, canRecordReading: true,
        meterReadings: [{ weekStart: '2026-09-25', weekEnd: '2026-10-01', consumption: 0, discountAmount: 0, amountDue: 0 }],
    }, {
        canUpdate: true, onSendMessage() {}, onNext() {}, readingWeekOptions: [{ value: '2026-09-25' }],
    });

    assert.match(html, /تسجيل دفعة/);
    assert.match(html, /تعديل البيانات/);
    assert.match(html, /aria-label="إرسال SMS"/);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="تم إدخال قراءة هذا الأسبوع"/);
    assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*aria-label="المشترك التالي"/);
});

test('profile shows actual credit and status without inventing disconnection reasons', () => {
    const html = renderProfile({ status: 'disconnected', statusLabel: 'مفصول', outstandingBalance: '-25.50' });

    assert.match(html, /25\.50 ₪/);
    assert.match(html, /<em>له<\/em>/);
    assert.match(html, /الاشتراك مفصول/);
    assert.doesNotMatch(html, /تأخر بالدفع|14 يوم|377/);
});

test('profile escapes subscriber-entered text', () => {
    const html = renderProfile({ display_name: '<script>alert(1)</script>', notes: '<img src=x onerror=alert(1)>' });

    assert.doesNotMatch(html, /<script>|<img src=x/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('account shows foreign currency amounts and server-provided running balances without recalculating them', () => {
    const html = renderToStaticMarkup(createElement(AccountTab, {
        statement: {
            summary: { balance: '60.00', charged: '100.00', paid: '40.00', discounted: '0.00' },
            entries: [
                { id: 1, date: '2026-09-01 12:00', type: 'subscription_fee', typeLabel: 'رسوم', description: 'رسوم الاشتراك', isCredit: false, amount: '100', currencyLabel: 'شيكل', balance: '100.00' },
                { id: 2, date: '2026-09-02 12:00', type: 'payment', typeLabel: 'دفعة', description: 'دفعة بالدولار', isCredit: true, amount: '10', currencyLabel: 'دولار', balance: '60.00' },
            ],
        },
    }));

    assert.match(html, /\+10 دولار/);
    assert.match(html, /60\.00 ₪/);
    assert.match(html, /100\.00 ₪/);
    assert.ok(html.indexOf('دفعة بالدولار') < html.indexOf('رسوم الاشتراك'));
});

test('account distinguishes loading, failed loading and a genuinely empty account', () => {
    const loading = renderToStaticMarkup(createElement(AccountTab, { loading: true }));
    const failed = renderToStaticMarkup(createElement(AccountTab, { loading: false }));
    const empty = renderToStaticMarkup(createElement(AccountTab, {
        statement: { summary: { balance: 0, charged: 0, paid: 0, discounted: 0 }, entries: [] },
    }));

    assert.match(loading, /جارٍ تحميل الحساب/);
    assert.doesNotMatch(loading, /تعذر تحميل الحساب/);
    assert.match(failed, /إعادة المحاولة/);
    assert.match(empty, /لا توجد حركات لهذا النوع/);
    assert.doesNotMatch(empty, /تعذر تحميل الحساب/);
});

test('account opens compact, leaving out a cancelled line and its reversal, and offers every line', () => {
    const html = renderToStaticMarkup(createElement(AccountTab, {
        statement: {
            summary: { balance: '80.00', charged: '80.00', paid: '0.00', discounted: '0.00' },
            entries: [
                { id: 1, date: '2026-09-01 12:00', type: 'meter_reading', typeLabel: 'قراءة', description: 'القراءة الخاطئة', isCredit: false, amount: '100', currencyLabel: 'شيكل', balance: '100.00', cancellation: { wasCorrected: true, reasonLabel: 'خطأ', correctionId: 3 } },
                { id: 2, date: '2026-09-02 12:00', type: 'reversal', typeLabel: 'قيد عكسي', description: 'عكس القراءة', isCredit: true, amount: '100', currencyLabel: 'شيكل', balance: '0.00', reverses: { id: 1 } },
                { id: 3, date: '2026-09-02 12:00', type: 'meter_reading', typeLabel: 'قراءة', description: 'القراءة الصحيحة', isCredit: false, amount: '80', currencyLabel: 'شيكل', balance: '80.00', isCorrection: true },
            ],
        },
    }));

    assert.match(html, /القراءة الصحيحة/);
    assert.doesNotMatch(html, /القراءة الخاطئة|عكس القراءة/);
    assert.match(html, /صُحّحت · 2 حركات سابقة/);
    assert.match(html, /أُخفيت 2 حركة ملغاة/);
    assert.match(html, /aria-pressed="true"[^>]*>عرض مختصر/);
    assert.match(html, /كل الحركات/);
});
