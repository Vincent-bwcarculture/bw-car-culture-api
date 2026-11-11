import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { ObjectId } from 'mongodb';

const source = await readFile(new URL('../api/index.js', import.meta.url), 'utf8');
const start = source.indexOf('// === USER LISTING ACTIONS');
const block = source.slice(start, source.indexOf('// === GET SINGLE SUBMISSION FOR EDITING ===', start))
  .replaceAll("await import('mongodb')", 'mongodb');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const matches = (doc, query) => Object.entries(query).every(([key, cond]) => {
  const value = doc[key];
  const same = (a, b) => String(a) === String(b);
  if (cond && typeof cond === 'object' && !(cond instanceof ObjectId)) {
    if ('$in' in cond) return cond.$in.some(c => same(c, value));
    if ('$ne' in cond) return !same(cond.$ne, value);
  }
  return same(cond, value);
});

async function run({ method = 'PUT', status, owner, submission = {}, linked = true, auth = true, parsedBody = false } = {}) {
  const userId = new ObjectId();
  const listing = { _id: new ObjectId(), status: 'active', title: 'Golf' };
  const sub = { _id: new ObjectId(), userId: owner ?? userId, status: 'listing_created',
    listingData: { title: 'Golf' }, ...(linked ? { listingId: listing._id } : {}), ...submission };
  const stores = { usersubmissions: [sub], listings: [listing] };
  const records = [];
  const db = { collection: name => ({
    async findOne(q) { return stores[name].find(d => matches(d, q)) || null; },
    async updateOne(q, u) {
      const doc = stores[name].find(d => matches(d, q));
      if (doc) Object.assign(doc, u.$set);
      return { matchedCount: doc ? 1 : 0 };
    }
  }) };
  const path = method === 'DELETE' ? `/api/user/my-garage/${sub._id}` : `/api/user/my-garage/${sub._id}/status`;
  const req = Readable.from(method === 'DELETE' || parsedBody ? [] : [Buffer.from(JSON.stringify({ status }))]);
  req.method = method;
  if (parsedBody) req.body = { status };
  const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const deps = { path, req, res, db, mongodb: { ObjectId },
    verifyUserToken: async () => ({ success: auth, user: { id: userId.toString(), name: 'Seller' } }),
    logVehicleRecord: async (_db, l, type) => { records.push(type); } };
  await new AsyncFunction(...Object.keys(deps), block)(...Object.values(deps));
  return { res, sub, listing, records };
}

for (const status of ['sold', 'paused', 'archived']) {
  test(`owner can mark a live listing ${status}; marketplace listing follows`, async () => {
    const { res, sub, listing } = await run({ status });
    assert.equal(res.code, 200);
    assert.equal(sub.listingStatus, status);
    assert.equal(sub.status, 'listing_created', 'review status must be kept');
    assert.equal(listing.status, status);
  });
}

test('sold records soldAt and a vehicle history event', async () => {
  const { sub, listing, records } = await run({ status: 'sold' });
  assert.ok(sub.soldAt instanceof Date); assert.ok(listing.soldAt instanceof Date);
  assert.deepEqual(records, ['sold']);
});

test('paused listing can be reactivated', async () => {
  const { res, sub, listing } = await run({ status: 'active', submission: { listingStatus: 'paused' } });
  assert.equal(res.code, 200); assert.equal(sub.listingStatus, 'active'); assert.equal(listing.status, 'active');
});

test('works when the platform has already parsed the JSON body', async () => {
  const { res, listing } = await run({ status: 'sold', parsedBody: true });
  assert.equal(res.code, 200); assert.equal(listing.status, 'sold');
});

test('approved submission without a linked listing only changes listingStatus', async () => {
  const { res, sub } = await run({ status: 'paused', linked: false, submission: { status: 'approved' } });
  assert.equal(res.code, 200); assert.equal(sub.listingStatus, 'paused'); assert.equal(sub.status, 'approved');
});

test('delete soft-deletes the submission and removes the marketplace listing', async () => {
  const { res, sub, listing, records } = await run({ method: 'DELETE' });
  assert.equal(res.code, 200);
  assert.equal(sub.status, 'deleted'); assert.equal(sub.statusBeforeDelete, 'listing_created');
  assert.equal(listing.status, 'deleted'); assert.deepEqual(records, ['deleted']);
});

test('pending submission can be deleted but not marked sold', async () => {
  assert.equal((await run({ status: 'sold', submission: { status: 'pending_review' } })).res.code, 400);
  const { res, sub } = await run({ method: 'DELETE', linked: false, submission: { status: 'pending_review' } });
  assert.equal(res.code, 200); assert.equal(sub.status, 'deleted');
});

test('another user cannot change or delete the listing', async () => {
  for (const opts of [{ status: 'sold' }, { method: 'DELETE' }]) {
    const { res, listing } = await run({ ...opts, owner: new ObjectId() });
    assert.equal(res.code, 404); assert.equal(listing.status, 'active');
  }
});

test('unauthenticated and invalid statuses are rejected without writes', async () => {
  assert.equal((await run({ status: 'sold', auth: false })).res.code, 401);
  const { res, listing } = await run({ status: 'deleted' });
  assert.equal(res.code, 400); assert.equal(listing.status, 'active');
});

test('already deleted listing cannot be changed again', async () => {
  const { res } = await run({ status: 'active', submission: { status: 'deleted' } });
  assert.equal(res.code, 404);
});
