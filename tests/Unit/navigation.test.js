import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_LINKS, allowedLinks, isInsideAnyLink, settingsEntryLink } from '../../resources/js/lib/navigation.js';

test('the settings link opens the first settings page the user may open', () => {
    const links = allowedLinks(SETTINGS_LINKS, { viewTariffs: true, manageSettings: true });

    assert.deepEqual(settingsEntryLink(links), { href: '/tariffs', label: 'الإعدادات', icon: 'cog' });
});

test('there is no settings link when the user may open no settings page', () => {
    assert.equal(settingsEntryLink(allowedLinks(SETTINGS_LINKS, {})), null);
});

test('the settings link is current on any settings page, including its create and edit pages', () => {
    assert.equal(isInsideAnyLink(SETTINGS_LINKS, '/settings/permissions'), true);
    assert.equal(isInsideAnyLink(SETTINGS_LINKS, '/meter-boxes/4/edit?tab=boxes'), true);
    assert.equal(isInsideAnyLink(SETTINGS_LINKS, '/subscribers'), false);
    assert.equal(isInsideAnyLink(SETTINGS_LINKS, '/branch-performance'), false);
});
