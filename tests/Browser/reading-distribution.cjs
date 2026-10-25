const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

(async () => {
    const fixture = JSON.parse(readFileSync(`${process.env.OUT_DIR}/fixture.json`, 'utf8'));
    const browser = await chromium.launch({ headless: !process.env.HEADED,
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    const page = await browser.newPage({ baseURL: process.env.BASE_URL, viewport: { width: 1600, height: 1100 }, locale: 'ar' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const summary = () => page.getByRole('dialog', { name: 'ملخّص توزيع الفرع', exact: true });
    const actions = () => page.getByRole('dialog', { name: 'إجراء على الطبلونات المحددة', exact: true });
    const openSummary = async () => {
        await page.getByRole('button', { name: 'ملخّص توزيع الفرع', exact: true }).click();
        await summary().waitFor();
        await summary().evaluate((node) => Promise.all(node.parentElement.getAnimations().map((animation) => animation.finished)));
    };
    try {
        await page.goto('/login');
        await page.locator('#username').fill('owner');
        await page.locator('#password').fill('Strong-Pass-2026');
        await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
        await page.waitForURL((url) => !url.pathname.startsWith('/login'));
        await page.goto(`/reading-cycles/${fixture.cycleId}`);
        await openSummary();
        assert.match(await summary().getByText('إجمالي الطبلونات', { exact: true }).locator('..').innerText(), /100/);
        const khalil = summary().getByRole('article').filter({ has: page.getByRole('heading', { name: 'خليل', exact: true }) });
        assert.match(await khalil.innerText(), /30 طبلون/);
        assert.match(await khalil.innerText(), /10 من 20 طبلون/);
        assert.match(await khalil.innerText(), /السوق كاملة/);
        const geometry = await summary().evaluate((node) => { const r = node.getBoundingClientRect(); return { width: r.width, center: (r.left + r.right) / 2 }; });
        assert.ok(geometry.width >= 878 && geometry.width <= 880, JSON.stringify(geometry));
        assert.ok(Math.abs(geometry.center - 800) < 12);
        await page.screenshot({ path: `${process.env.OUT_DIR}/distribution-summary-desktop.png` });
        await page.keyboard.press('Escape');

        await page.getByRole('checkbox', { name: 'عرض منطقة المخيم', exact: true }).check();
        assert.equal(await page.getByRole('table', { name: 'توزيع الطبلونات حسب المنطقة' }).locator('tbody input').count(), 20);
        await openSummary();
        assert.match(await summary().getByText('إجمالي الطبلونات', { exact: true }).locator('..').innerText(), /100/);
        await page.keyboard.press('Escape');
        await page.getByRole('checkbox', { name: 'عرض منطقة أبو ذر', exact: true }).check();
        await page.getByRole('button', { name: 'إجراء على المناطق المختارة (40)', exact: true }).click();
        assert.match(await actions().innerText(), /40 طبلون/);
        await actions().getByRole('button', { name: 'متابعة التحديد', exact: true }).click();
        assert.match(await page.getByRole('region', { name: 'الطبلونات المحددة', exact: true }).innerText(), /40 طبلون/);
        await page.getByRole('button', { name: 'توزيع المحدد (40)', exact: true }).click();
        await page.keyboard.press('Escape');
        await page.getByRole('checkbox', { name: 'عرض منطقة أبو ذر', exact: true }).uncheck();
        await page.getByRole('button', { name: 'توزيع المحدد (40)', exact: true }).click();
        assert.match(await actions().innerText(), /20 طبلون خارج النتائج الظاهرة/);
        await actions().getByRole('button', { name: 'إلغاء تحديد المخفي', exact: true }).click();
        assert.match(await actions().innerText(), /20 طبلون/);
        assert.doesNotMatch(await actions().innerText(), /خارج النتائج الظاهرة/);
        await actions().getByLabel('القارئ المكلّف', { exact: true }).selectOption(`reader:${fixture.readerId}`);
        assert.match(await actions().innerText(), /بعد الحفظ: 40 طبلون/);
        await actions().getByRole('checkbox', { name: /حفظ هذا التوزيع للقراءات القادمة/ }).uncheck();
        await page.screenshot({ path: `${process.env.OUT_DIR}/distribution-action-desktop.png` });

        // A server validation failure must retain the selection and allow retry.
        const assignmentUrl = `**/reading-cycles/${fixture.cycleId}/assignments`;
        await page.route(assignmentUrl, async (route) => {
            const data = route.request().postDataJSON();
            await route.continue({ postData: JSON.stringify({ ...data, user_id: -1 }) });
        });
        await actions().getByRole('button', { name: 'حفظ التوزيع', exact: true }).click();
        await actions().locator('[data-input-error]').first().waitFor();
        await actions().getByRole('button', { name: 'حفظ التوزيع', exact: true }).waitFor();
        await page.unroute(assignmentUrl);
        assert.match(await actions().innerText(), /20 طبلون/);

        const savedRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith(`/reading-cycles/${fixture.cycleId}/assignments`));
        await actions().getByRole('button', { name: 'حفظ التوزيع', exact: true }).click();
        const payload = (await savedRequest).postDataJSON();
        assert.equal(payload.box_ids.length, 20);
        assert.equal(Object.keys(payload.versions).length, 20);
        assert.equal(payload.recurring, false);
        assert.equal(payload.publish, true);
        await summary().waitFor();
        const mohammad = summary().getByRole('article').filter({ has: page.getByRole('heading', { name: 'محمد', exact: true }) });
        assert.match(await mohammad.innerText(), /40 طبلون/);
        await summary().getByRole('button', { name: 'اعتماد كل الجاهز (10)', exact: true }).click();
        await summary().getByText(/· 0 بانتظار الاعتماد$/).waitFor();
        await page.reload();
        await openSummary();
        assert.match(await summary().getByRole('article').filter({ has: page.getByRole('heading', { name: 'محمد', exact: true }) }).innerText(), /40 طبلون/);
        const remaining = summary().getByRole('region', { name: 'الطبلونات المتبقية', exact: true });
        assert.match(await remaining.innerText(), /تم توزيع جميع الطبلونات/);

        await page.setViewportSize({ width: 390, height: 844 });
        await summary().getByRole('heading', { name: 'ملخّص توزيع الفرع', exact: true }).scrollIntoViewIfNeeded();
        const mobile = await summary().evaluate((node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, scroll: node.scrollWidth, width: node.clientWidth }; });
        assert.ok(mobile.left >= 0 && mobile.right <= 390 && mobile.scroll <= mobile.width + 1, JSON.stringify(mobile));
        await page.screenshot({ path: `${process.env.OUT_DIR}/distribution-summary-mobile.png` });
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await page.screenshot({ path: `${process.env.OUT_DIR}/distribution-summary-dark.png` });
        await page.evaluate(() => document.documentElement.classList.remove('dark'));
        await page.setViewportSize({ width: 1600, height: 1100 });
        await summary().getByRole('button', { name: 'تجهيز الطبلونات الورقية (10)', exact: true }).click();
        await actions().waitFor();
        await actions().getByRole('button', { name: 'إنشاء كشف للطباعة (10)', exact: true }).click();
        await page.waitForURL(/\/paper-sheets\/\d+$/);
        await page.goto(`/reading-cycles/${fixture.cycleId}`);
        await openSummary();
        assert.match(await summary().getByRole('region', { name: 'ملخّص الكشوف الورقية', exact: true }).innerText(), /1 كشف منشأ: 0 مطبوع، 1 لم يُطبع/);
        await page.keyboard.press('Escape');
        await page.getByRole('checkbox', { name: 'تحديد الطبلون 110301', exact: true }).check();
        await page.getByRole('button', { name: 'توزيع المحدد (1)', exact: true }).click();
        await actions().getByRole('radio', { name: 'إلغاء التخصيص', exact: true }).check();
        await actions().getByRole('checkbox', { name: /حفظ هذا التوزيع للقراءات القادمة/ }).uncheck();
        await actions().getByRole('button', { name: 'حفظ التوزيع', exact: true }).click();
        await actions().getByRole('button', { name: /أؤكد نقل الطبلونات التي نزّلها القارئ/ }).click();
        await summary().getByRole('button', { name: 'توزيع المتبقي (1)', exact: true }).click();
        await actions().getByText('بعد الحفظ: 11 طبلون · 11 مشترك', { exact: true }).waitFor();
        await actions().locator('summary').first().click();
        assert.match(await actions().getByRole('list', { name: 'طبلونات أبو ذر', exact: true }).innerText(), /أبو ذر 1 \(110301\)/);
        await actions().getByRole('button', { name: 'حفظ التوزيع', exact: true }).click();
        await summary().getByRole('button', { name: 'تجهيز الطبلونات الورقية (11)', exact: true }).waitFor();
        assert.deepEqual(errors, []);
        console.log('Passed: whole-branch summary, full/partial areas, 880px centering, multi-page selection, hidden selections, server validation/retry, persisted allocation/approval, paper-sheet preparation, downloaded-task conflict confirmation, unassignment, remaining-to-paper distribution, names/suffixes/numbers, mobile/dark layouts.');
    } catch (error) {
        await page.screenshot({ path: `${process.env.OUT_DIR}/distribution-failure.png`, fullPage: true }).catch(() => {});
        console.error(await page.locator('body').innerText().catch(() => ''));
        throw error;
    } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
