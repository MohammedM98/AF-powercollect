import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_LINKS, SETTINGS_LINKS, allowedNavigationGroups, isActiveLink, isInsideAnyLink } from '../../resources/js/lib/navigation.js';

test('the settings group counts as current on any settings page, including its create and edit pages', () => {
    assert.equal(isInsideAnyLink(SETTINGS_LINKS, '/settings/permissions'), true);
    assert.equal(isInsideAnyLink(SETTINGS_LINKS, '/meter-boxes/4/edit?tab=boxes'), true);
    assert.equal(isInsideAnyLink(SETTINGS_LINKS, '/subscriptions'), false);
    assert.equal(isInsideAnyLink(SETTINGS_LINKS, '/branch-performance'), false);
});

test('regrouping keeps every permitted destination exactly once', () => {
    const allLinks = [...MAIN_LINKS, ...SETTINGS_LINKS];
    const can = Object.fromEntries(allLinks.filter((link) => link.can).map((link) => [link.can, true]));

    const links = allowedNavigationGroups(can).flatMap((group) => group.links);

    assert.deepEqual(links.map((link) => link.href).sort(), allLinks.filter((link) => link.href !== '/dashboard').map((link) => link.href).sort());
});

test('users see only permitted links and no empty groups', () => {
    const groups = allowedNavigationGroups({ viewSubscriptions: true, viewTariffs: true });

    assert.deepEqual(groups.map((group) => ({ id: group.id, hrefs: group.links.map((link) => link.href) })), [
        { id: 'daily', hrefs: ['/subscriptions'] },
        { id: 'administration', hrefs: ['/tariffs'] },
    ]);
    assert.deepEqual(allowedNavigationGroups(), []);
    assert.deepEqual(allowedNavigationGroups({ viewSubscriptions: false }), []);
});

test('nested and query-string pages identify their task group without matching a similar prefix', () => {
    const groups = allowedNavigationGroups({ viewMeterBoxes: true, manageSettings: true });
    const infrastructure = groups.find((group) => group.id === 'infrastructure');
    const administration = groups.find((group) => group.id === 'administration');

    assert.equal(isInsideAnyLink(infrastructure.links, '/meter-boxes/4/edit?tab=boxes'), true);
    assert.equal(isInsideAnyLink(administration.links, '/settings/permissions?tab=roles'), true);
    assert.equal(isActiveLink(infrastructure.links[0], '/meter-boxes-archive'), false);
});
