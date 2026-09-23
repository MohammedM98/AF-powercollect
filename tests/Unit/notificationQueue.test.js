import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationQueue } from '../../resources/js/lib/notificationQueue.js';

test('repeated actions stack and each message expires after its own three seconds', (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    let visible = [];
    const queue = createNotificationQueue((messages) => { visible = messages; });
    queue.push('Saved');
    context.mock.timers.tick(1000);
    queue.push('Saved');
    assert.equal(visible.length, 2);
    assert.notEqual(visible[0].id, visible[1].id);
    context.mock.timers.tick(1999);
    assert.equal(visible.length, 2);
    context.mock.timers.tick(1);
    assert.equal(visible.length, 1);
    context.mock.timers.tick(1000);
    assert.deepEqual(visible, []);
    queue.dispose();
});

test('manual dismissal leaves other messages intact and disposal clears pending timers', (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    let visible = [];
    let updates = 0;
    const queue = createNotificationQueue((messages) => { visible = messages; updates++; });
    queue.push('Saved');
    queue.push('Failed', 'error');
    queue.dismiss(visible[0].id);
    assert.deepEqual(visible.map(({ message, type }) => ({ message, type })), [{ message: 'Failed', type: 'error' }]);
    queue.dispose();
    const before = updates;
    context.mock.timers.tick(3000);
    assert.equal(updates, before);
});
