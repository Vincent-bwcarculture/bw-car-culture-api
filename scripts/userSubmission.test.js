import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { ObjectId } from 'mongodb';
import * as helpers from '../utils/userSubmission.js';
import { listingCounters } from '../utils/listingMetrics.js';

const source = await readFile(new URL('../api/index.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const submissionId = new ObjectId();
const userId = new ObjectId();
const listingId = new ObjectId();
const validData = () => ({
  title: 'Toyota Corolla for sale', description: 'Well maintained family vehicle',
  pricing: { price: 85000 }, specifications: { make: 'Toyota', model: 'Corolla', year: 2020 },
  contact: { sellerName: 'Seller', phone: '+26712345678' }, category: 'sedan',
  features: { safety: ['ABS'], comfort: ['Air Conditioning'] },
  transit: { isInTransit: true, destinationCountry: 'Botswana' },
  images: Array.from({ length: 15 }, (_, i) => ({ url: `https://images.example/${i}.jpg` })),
  privateSeller: { firstName: 'Seller', idNumber: 'PRIVATE-ID', canShowContactInfo: false },
  submissionSource: 'user_form'
});

// Execute the actual route blocks with in-memory storage and authentication.
async function route(kind, { data = validData(), status = 'pending_review', owner = userId, linked = false, failListing = false, auth = true, action = 'approve', selectedTier, verifyBoostPayment = false, stored = {} } = {}) {
  const markers = {
    create: ["if (path === '/api/user/submit-listing'", '// User Image Upload Endpoint'],
    edit: ['// === UPDATE SUBMISSION ===', '// === CLONE SUBMISSION'],
    review: ['// === COMPLETE ADMIN REVIEW ENDPOINT ===', '// ADMIN PAYMENT ENDPOINTS - CORRECTED PATHS']
  };
  const [start, end] = markers[kind];
  const block = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
    .replaceAll("await import('mongodb')", 'mongodb');
  const submission = { _id: submissionId, userId: owner, status, listingData: data, adminReview: null,
    ...(linked ? { listingId } : {}), ...(selectedTier ? { selectedTier } : {}), ...stored };
  const calls = { listings: [], usersubmissions: [] };
  const db = { collection(name) { return {
    async findOne(query) {
      if (name === 'users') return { _id: userId, name: 'Seller', email: 'seller@example.com' };
      if (query.userId && !query.userId.equals(owner)) return null;
      return submission;
    },
    async insertOne(doc) { calls[name]?.push({ insert: doc }); return { insertedId: listingId }; },
    async updateOne(query, update) {
      if (name === 'listings' && failListing) throw new Error('Storage unavailable');
      calls[name]?.push({ query, update }); return { matchedCount: 1, modifiedCount: 1 };
    }
  }; } };
  const path = kind === 'create' ? '/api/user/submit-listing' : kind === 'edit'
    ? `/api/user/submissions/${submissionId}` : `/api/admin/user-listings/${submissionId}/review`;
  const body = kind === 'review' ? { action, visibilityScore: 60, verifyBoostPayment } : { listingData: data };
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = kind === 'create' ? 'POST' : 'PUT';
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const dependencies = { ...helpers, listingCounters, req, res, path, db, mongodb: { ObjectId }, timestamp: 'test',
    verifyUserToken: async () => ({ success: auth, user: { id: userId.toString(), email: 'seller@example.com' } }),
    verifyAdminToken: async () => ({ success: auth, user: { id: userId.toString(), name: 'Admin' } }),
    connectDB: async () => db, normalizeCategoryValue: value => value,
    logVehicleRecord: async () => {} };
  await new AsyncFunction(...Object.keys(dependencies), block)(...Object.values(dependencies));
  return { res, calls };
}

test('new submission is free even when social promotion is requested', async () => {
  const data = validData();
  data.featuredBoost = { requested: true, proofUrl: 'https://images.example/proof.pdf' };
  const { res, calls } = await route('create', { data });
  assert.equal(res.code, 201);
  assert.equal(calls.usersubmissions[0].insert.selectedTier, 'free');
  assert.equal(calls.usersubmissions[0].insert.paymentRequired, false);
});

test('invalid submission and missing boost proof cause no database writes', async () => {
  const data = validData(); data.featuredBoost = { requested: true };
  const { res, calls } = await route('create', { data });
  assert.equal(res.code, 400); assert.equal(calls.usersubmissions.length, 0);
  assert.ok(helpers.validateUserListing({ ...validData(), pricing: { price: 'Infinity' } }).length);
});

test('live edits queue review without changing or duplicating the live listing', async () => {
  const { res, calls } = await route('edit', { status: 'listing_created', linked: true });
  assert.equal(res.code, 200); assert.equal(res.body.data.requiresReview, true);
  assert.equal(calls.usersubmissions[0].update.$set.status, 'pending_review');
  assert.equal(calls.listings.length, 0);
});

test('another user cannot edit a submission and unauthenticated creation is rejected', async () => {
  const { res, calls } = await route('edit', { owner: new ObjectId() });
  assert.equal(res.code, 404); assert.equal(calls.usersubmissions.length, 0);
  assert.equal((await route('create', { auth: false })).res.code, 401);
});

test('rejected resubmission clears automatic deletion timer', async () => {
  const { calls } = await route('edit', { status: 'rejected' });
  assert.deepEqual(calls.usersubmissions[0].update.$unset, { expiresAt: '', rejectedAt: '' });
});

test('approval preserves features, transit, privacy choice and 15 photos without publishing ID number', async () => {
  const { res, calls } = await route('review');
  assert.equal(res.code, 200);
  const listing = calls.listings[0].insert;
  assert.equal(listing.subscription.paymentRequired, false);
  assert.equal(listing.images.length, 15);
  assert.deepEqual(listing.features, ['ABS', 'Air Conditioning']);
  assert.equal(listing.transit.isInTransit, true);
  assert.equal(listing.dealer.privateSeller.canShowContactInfo, false);
  assert.ok(!JSON.stringify(listing).includes('PRIVATE-ID'));
});

test('reapproval updates existing content and resets review status without inserting a duplicate', async () => {
  const { res, calls } = await route('review', { linked: true });
  assert.equal(res.code, 200); assert.equal(calls.listings.length, 1);
  assert.equal(calls.listings[0].update.$set.price, 85000);
  assert.equal(calls.listings[0].update.$set.images.length, 15);
  assert.equal(calls.usersubmissions[0].update.$set.status, 'listing_created');
  assert.equal(calls.usersubmissions[0].update.$set.adminReview.action, 'approve');
});

test('failed live listing update does not report approval or change submission status', async () => {
  const { res, calls } = await route('review', { linked: true, failListing: true });
  assert.equal(res.code, 500); assert.equal(calls.usersubmissions.length, 0);
});

test('legacy explicit paid tiers keep their billing classification', () => {
  assert.equal(helpers.isFreeUserSubmission({ selectedTier: 'premium', paymentRequired: true }), false);
  assert.equal(helpers.isFreeUserSubmission({ source: 'user_form_production' }), true);
  assert.equal(helpers.isFreeUserSubmission({ paymentRequired: true }), false);
  assert.equal(helpers.isFreeUserSubmission({ paymentRequired: true, listingData: { selectedPlan: 'free' } }), false);
});

test('legacy paid submission approval keeps billing and promotion pending', async () => {
  const data = validData(); data.featuredBoost = { requested: true, proofUrl: 'https://images.example/proof.pdf' };
  const { res, calls } = await route('review', { data, selectedTier: 'premium' });
  assert.equal(res.code, 200);
  assert.equal(calls.listings[0].insert.subscription.paymentRequired, true);
  assert.equal(calls.listings[0].insert.subscription.boostPending, true);
});

test('rejecting a live edit retains the submission link and currently approved listing', async () => {
  const { res, calls } = await route('review', { linked: true, action: 'reject' });
  assert.equal(res.code, 200); assert.equal(calls.listings.length, 0);
  assert.equal(calls.usersubmissions[0].update.$set.status, 'rejected');
  assert.equal(calls.usersubmissions[0].update.$set.expiresAt, undefined);
  assert.deepEqual(calls.usersubmissions[0].update.$unset, { expiresAt: '' });
});

test('rejecting a new submission retains its existing ten-day expiry policy', async () => {
  const { calls } = await route('review', { action: 'reject' });
  assert.ok(calls.usersubmissions[0].update.$set.expiresAt instanceof Date);
});

test('user supplied boost verification and amount cannot mark a receipt as paid', async () => {
  const data = validData(); data.featuredBoost = { requested: true, status: 'verified', amount: 1, proofUrl: 'https://images.example/proof.pdf' };
  const { calls } = await route('create', { data });
  assert.equal(calls.usersubmissions[0].insert.listingData.featuredBoost.status, 'pending_verification');
  assert.equal(calls.usersubmissions[0].insert.listingData.featuredBoost.amount, 200);
});

test('admin can verify boost proof while approving a free listing', async () => {
  const data = validData(); data.featuredBoost = { requested: true, proofUrl: 'https://images.example/proof.pdf' };
  const { res, calls } = await route('review', { data, verifyBoostPayment: true });
  assert.equal(res.code, 200);
  assert.equal(calls.listings[0].insert.subscription.paymentRequired, false);
  assert.equal(calls.listings[0].insert.subscription.boostPending, false);
  assert.equal(calls.usersubmissions[0].update.$set.paymentProof.status, 'approved');
  assert.equal(calls.usersubmissions[0].update.$set['listingData.featuredBoost.status'], 'verified');
});

test('admin verification without a proof is rejected without changing listings', async () => {
  const { res, calls } = await route('review', { verifyBoostPayment: true });
  assert.equal(res.code, 400); assert.equal(calls.listings.length, 0);
});

test('boost verification on a live listing updates its existing subscription without replacement', async () => {
  const data = validData(); data.featuredBoost = { requested: true, proofUrl: 'https://images.example/proof.pdf' };
  const { calls } = await route('review', { data, linked: true, verifyBoostPayment: true });
  assert.equal(calls.listings[0].update.$set['subscription.boostPending'], false);
  assert.ok(!('subscription' in calls.listings[0].update.$set));
});

test('editing preserves verification for the same receipt and resets it for a replacement', async () => {
  const data = validData();
  data.featuredBoost = { requested: true, status: 'verified', proofUrl: 'https://images.example/proof.pdf' };
  const stored = { listingData: data, paymentProof: { submitted: true, status: 'approved' } };
  const unchanged = await route('edit', { data, stored });
  assert.equal(unchanged.calls.usersubmissions[0].update.$set.paymentProof.status, 'approved');
  assert.equal(unchanged.calls.usersubmissions[0].update.$set.listingData.featuredBoost.status, 'verified');
  const replacement = { ...data, featuredBoost: { ...data.featuredBoost, proofUrl: 'https://images.example/new-proof.pdf' } };
  const changed = await route('edit', { data: replacement, stored });
  assert.equal(changed.calls.usersubmissions[0].update.$set.paymentProof.status, 'pending');
  assert.equal(changed.calls.usersubmissions[0].update.$set.listingData.featuredBoost.status, 'pending_verification');
});
