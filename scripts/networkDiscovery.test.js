import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureNetworkReleaseNotification, engagementScore, networkRankingStages, recordNetworkVisit } from '../utils/networkDiscovery.js';

test('recent participation earns more than visits alone and contributions are capped', () => {
  assert.equal(engagementScore({ posts: 1, comments: 1, reviews: 1, visits: 1, reactions: 1 }), 12);
  assert.ok(engagementScore({ posts: 4, comments: 6, reviews: 2 }) > engagementScore({ visits: 30 }));
  assert.equal(engagementScore({ posts: 999, comments: 999, reviews: 999, visits: 999, reactions: 999 }), 170);
  assert.equal(engagementScore({ posts: -5 }), 0);
});

test('ranking uses a 30-day window and sorts engagement before photos', () => {
  const stages = networkRankingStages(new Date('2026-10-14T12:00:00Z'));
  assert.equal(stages[0].$lookup.pipeline[0].$match.createdAt.$gte.toISOString(), '2026-09-14T12:00:00.000Z');
  assert.deepEqual(Object.keys(stages.at(-1).$sort), ['engagementPriority', 'photoPriority', 'lastActive', '_id']);
});

test('visit recording uses authenticated account, server time and a 15-minute throttle', async () => {
  let captured;
  const now = new Date('2026-10-14T12:00:00Z');
  const db = { collection: name => {
    assert.equal(name, 'users');
    return { updateOne: async (...args) => { captured = args; return { modifiedCount: 1 }; } };
  } };
  assert.equal(await recordNetworkVisit(db, 'account-id', now), true);
  assert.equal(captured[0]._id, 'account-id');
  assert.equal(captured[0].$or[0]['activity.lastVisitAt'].$lt.toISOString(), '2026-10-14T11:45:00.000Z');
  const fields = captured[1][0].$set;
  assert.equal(fields['activity.lastActiveAt'], now);
  assert.equal(fields['activity.visitDays'].$slice[1], -30);
});

test('release update is generated once per account, including after dismissal', async () => {
  const receipts = new Set();
  const notifications = [];
  const db = { collection: name => name === 'notification_release_receipts' ? {
    updateOne: async ({ _id }) => {
      const exists = receipts.has(_id);
      receipts.add(_id);
      return { upsertedCount: exists ? 0 : 1 };
    }
  } : { insertOne: async notification => notifications.push(notification) } };
  await Promise.all([ensureNetworkReleaseNotification(db, 'user-a'), ensureNetworkReleaseNotification(db, 'user-a')]);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].link, '/profile?tab=network');
  notifications.length = 0;
  await ensureNetworkReleaseNotification(db, 'user-a');
  assert.equal(notifications.length, 0);
  await ensureNetworkReleaseNotification(db, 'user-b');
  assert.equal(notifications.length, 1);
});

test('failed notification creation releases its receipt so it can be retried', async () => {
  let removed = false;
  const db = { collection: name => name === 'notification_release_receipts' ? {
    updateOne: async () => ({ upsertedCount: 1 }),
    deleteOne: async () => { removed = true; }
  } : { insertOne: async () => { throw new Error('Database unavailable'); } } };
  await assert.rejects(ensureNetworkReleaseNotification(db, 'user-a'), /Database unavailable/);
  assert.equal(removed, true);
});
