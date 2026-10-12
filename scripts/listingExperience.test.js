import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { listingProfileData, listingProfileUpdate } from '../utils/listingProfile.js';
import { attachSubmissionMetrics, incrementListingViews } from '../utils/listingMetrics.js';
import { submissionReviewChanges } from '../utils/userSubmission.js';

const source = await readFile(new URL('../api/index.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const userId = new ObjectId(), listingId = new ObjectId(), submissionId = new ObjectId();
async function block(start, end, dependencies) {
  assert.ok(source.indexOf(start) >= 0 && source.indexOf(end, source.indexOf(start)) >= 0, 'Route markers must exist');
  const code = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
    .replaceAll("await import('mongodb')", 'mongodb');
  return new AsyncFunction(...Object.keys(dependencies), code)(...Object.values(dependencies));
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('autofill reads nested Profile Settings fields and falls back to older records', () => {
  const data = listingProfileData({ name: 'Test Seller', email: 'seller@example.com', phone: 'old',
    profile: { phone: 'new-phone', firstName: 'Test', lastName: 'Seller', location: 'Gaborone',
      address: { street: 'Main Road' }, social: { youtube: 'channel' } } });
  assert.equal(data.contact.phone, 'new-phone');
  assert.equal(data.contact.location.city, 'Gaborone');
  assert.equal(data.contact.location.address, 'Main Road');
  assert.equal(data.privateSeller.lastName, 'Seller');
  assert.equal(data.social.youtube, 'channel');
  assert.equal(listingProfileData({ phone: 'legacy', city: 'Maun' }).contact.phone, 'legacy');
});

test('saving form details synchronizes profile settings without blanking optional social data', () => {
  const update = listingProfileUpdate({ contact: { phone: ' 123 ', whatsapp: '456', location: { city: 'Maun' } }, social: { facebook: '', instagram: 'instagram-link' } });
  assert.equal(update['profile.phone'], '123'); assert.equal(update.phone, '123');
  assert.equal(update['profile.location'], 'Maun'); assert.equal(update['profile.address.city'], 'Maun');
  assert.equal(update['profile.whatsapp'], '456');
  assert.ok(!('facebook' in update)); assert.ok(!('profile.social.facebook' in update));
});

test('real profile update route accepts streamed JSON and parsed bodies', async () => {
  for (const parsed of [false, true]) {
    let update;
    const body = { contact: { phone: '123', location: { city: 'Maun' } } };
    const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = 'PUT';
    if (parsed) req.body = body;
    const res = response();
    await block("if (path === '/api/user/profile/update-from-listing'", '// ==================== MARKET PRICES ENDPOINTS', {
      req, res, path: '/api/user/profile/update-from-listing', timestamp: 'test', mongodb: { ObjectId },
      listingProfileUpdate, verifyUserToken: async () => ({ success: true, user: { id: userId.toString() } }),
      db: { collection: () => ({ updateOne: async (_, operation) => { update = operation.$set; return { modifiedCount: 1 }; } }) }
    });
    assert.equal(res.code, 200); assert.equal(update['profile.phone'], '123');
  }
});

test('real autofill route returns the nested saved profile to the form', async () => {
  const req = { method: 'GET' }, res = response();
  await block("if (path === '/api/user/profile/form-data'", '// Also add endpoint to update user profile', {
    req, res, path: '/api/user/profile/form-data', timestamp: 'test', mongodb: { ObjectId }, listingProfileData,
    verifyUserToken: async () => ({ success: true, user: { id: userId.toString() } }),
    db: { collection: name => ({ findOne: async () => name === 'users'
      ? { name: 'Test Seller', profile: { phone: '123', location: 'Gaborone' } } : null }) }
  });
  assert.equal(res.body.data.contact.phone, '123'); assert.equal(res.body.data.contact.location.city, 'Gaborone');
});

test('admin stats use the published listing and retain approved legacy counters', async () => {
  let query;
  const db = { collection: () => ({ find: filter => { query = filter; return { toArray: async () => [
    { _id: listingId, submissionId, views: 125, saves: 8, inquiries: 3, price: 80000, listingQuality: 90 }
  ] }; } }) };
  const result = await attachSubmissionMetrics(db, [
    { _id: submissionId, listingId: listingId.toString(), status: 'pending_review', views: 0,
      editHistory: [{ editNote: 'New price' }], listingData: { pricing: { price: 70000 } } },
    { _id: new ObjectId(), status: 'approved', views: 12 },
    { _id: new ObjectId(), status: 'pending_review' }
  ]);
  assert.equal(result[0].listingStats.views, 125); assert.equal(result[0].listingStats.saves, 8);
  assert.equal(result[0].listingStats.inquiries, 3); assert.equal(result[0].listingStats.available, true);
  assert.equal(result[0].listingStats.listingQuality, 90);
  assert.ok(result[0].reviewChanges.some(change => change.field === 'Price (BWP)' && change.before === '80000' && change.after === '70000'));
  assert.equal(result[1].listingStats.views, 12); assert.equal(result[2].listingStats.available, false);
  assert.equal(query.$or[0]._id.$in.length, 1);
});

test('actual admin submission list includes published statistics and edit comparisons', async () => {
  const res = response();
  const submission = { _id: submissionId, listingId, status: 'pending_review', editHistory: [{ editNote: 'New price' }], listingData: { pricing: { price: 70000 } } };
  const cursor = { sort() { return this; }, skip() { return this; }, limit() { return this; }, toArray: async () => [submission] };
  const db = { collection: name => name === 'usersubmissions' ? {
    find: () => cursor, countDocuments: async () => 1, aggregate: () => ({ toArray: async () => [{ _id: 'pending_review', count: 1 }] })
  } : { find: () => ({ toArray: async () => [{ _id: listingId, views: 125, saves: 8, price: 80000 }] }) } };
  await block("if ((path === '/admin/user-listings' || path === '/api/admin/user-listings') && req.method === 'GET')", '// === RESTORE A REJECTED', {
    req: { method: 'GET', query: {} }, res, path: '/api/admin/user-listings', timestamp: 'test', mongodb: { ObjectId },
    db, attachSubmissionMetrics, verifyAdminToken: async () => ({ success: true })
  });
  assert.equal(res.code, 200); assert.equal(res.body.data[0].listingStats.views, 125);
  assert.ok(res.body.data[0].reviewChanges.length > 0);
});

test('profile address route updates the authenticated user and synchronizes autofill city', async () => {
  const req = Readable.from([Buffer.from(JSON.stringify({ city: 'Maun', street: 'Main Road' }))]); req.method = 'PUT';
  const res = response(); let query, update;
  await block("if (path === '/user/profile/address' && req.method === 'PUT')", '// Get user', {
    req, res, path: '/user/profile/address', mongodb: { ObjectId },
    verifyUserToken: async () => ({ success: true, user: { id: userId.toString() } }),
    db: { collection: () => ({ updateOne: async (filter, operation) => { query = filter; update = operation.$set; return { matchedCount: 1 }; } }) }
  });
  assert.equal(res.code, 200); assert.ok(query._id.equals(userId)); assert.equal(update['profile.location'], 'Maun');
});

function metricsDb({ linked = false, legacy = false, pending = false } = {}) {
  const listing = { _id: listingId, views: 15, title: 'Published listing' };
  const submission = { _id: submissionId, status: pending ? 'pending_review' : 'approved', views: 5,
    ...(linked ? { listingId } : {}), listingData: { title: 'Legacy listing' } };
  const docs = { listings: legacy ? [] : [listing], usersubmissions: [submission] };
  return { listing, submission, collection(name) { return {
    findOne: async filter => docs[name].find(doc => doc._id.equals(filter._id)) || null,
    updateOne: async (filter, update) => {
      const doc = docs[name].find(doc => doc._id.equals(filter._id));
      if (!doc || (filter.status && doc.status !== filter.status)) return { matchedCount: 0 };
      doc.views += update.$inc.views; return { matchedCount: 1 };
    }
  }; } };
}

test('views count for published private listings and older submission-ID links', async () => {
  const direct = metricsDb();
  assert.equal((await incrementListingViews(direct, listingId.toString())).views, 16);
  const linked = metricsDb({ linked: true, pending: true });
  assert.equal((await incrementListingViews(linked, submissionId.toString())).views, 16);
  assert.equal(linked.submission.views, 5);
});

test('approved legacy listings can count views; unpublished submissions cannot', async () => {
  const db = metricsDb({ legacy: true });
  assert.equal((await incrementListingViews(db, submissionId.toString())).views, 6);
  assert.equal(await incrementListingViews(metricsDb({ legacy: true, pending: true }), submissionId.toString()), null);
});

test('real view route accepts both URL forms and excludes administrators', async () => {
  for (const prefix of ['', '/api']) for (const admin of [false, true]) {
    const db = metricsDb(), res = response();
    await block('// === INCREMENT VIEW COUNT (NEW) ===', '// === BATCH DELETE LISTINGS (NEW) ===', {
      req: { method: 'POST' }, res, path: `${prefix}/listings/${listingId}/views`, timestamp: 'test',
      db, incrementListingViews, verifyUserToken: async () => ({ success: true, user: { role: admin ? 'admin' : 'user' } })
    });
    assert.equal(res.code, 200); assert.equal(db.listing.views, admin ? 15 : 16);
  }
});

test('review comparison identifies changed content without including seller ID documents', () => {
  const changes = submissionReviewChanges({ pricing: { price: 10 }, privateSeller: { idNumber: 'PRIVATE' }, title: 'New title' }, { price: 20, title: 'Old title' });
  assert.ok(changes.some(change => change.field === 'Title'));
  assert.ok(!JSON.stringify(changes).includes('PRIVATE'));
});
