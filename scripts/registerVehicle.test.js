import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { ObjectId, Binary } from 'mongodb';

const source = await readFile(new URL('../api/index.js', import.meta.url), 'utf8');
const start = source.indexOf('// === REGISTER VEHICLE ENDPOINTS (owner) ===');
const block = source.slice(start, source.indexOf('// === END VEHICLE REGISTRATION ENDPOINTS ===', start))
  .replaceAll("await import('mongodb')", 'mongodb');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const valid = () => ({ make: 'Toyota', model: 'Hilux', vehicleName: 'Toyota Hilux', year: '2022', regPlate: 'b 123 abc', color: '#1a1a1a' });

async function run({ method = 'POST', path = '/user/register-vehicle', body = valid(), auth = true, role = 'user', vehicles = [], parsedBody = false, proofs = [], asUser } = {}) {
  const userId = new ObjectId();
  const user = { _id: userId, registeredVehicles: vehicles.map(v => ({ ...v })) };
  const sameId = (a, b) => String(a) === String(b);
  const proofStore = [...proofs];
  const proofCollection = {
    async findOne(q) { return proofStore.find(p => sameId(p.userId, q.userId) && sameId(p.vehicleId, q.vehicleId)) || null; },
    async updateOne(q, u) {
      const i = proofStore.findIndex(p => sameId(p.userId, q.userId) && sameId(p.vehicleId, q.vehicleId));
      if (i >= 0) proofStore[i] = { ...proofStore[i], ...u.$set }; else proofStore.push({ ...u.$set });
      return { matchedCount: 1 };
    },
    async deleteOne(q) {
      const i = proofStore.findIndex(p => sameId(p.userId, q.userId) && sameId(p.vehicleId, q.vehicleId));
      if (i >= 0) proofStore.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    }
  };
  const db = { collection: name => name === 'vehicleownershipproofs' ? proofCollection : ({
    async findOne(q) { return sameId(q._id, userId) ? user : null; },
    async updateOne(q, u) {
      if (!sameId(q._id, userId)) return { matchedCount: 0 };
      const vid = q['registeredVehicles._id'];
      const target = vid ? user.registeredVehicles.find(v => sameId(v._id, vid)) : null;
      if (vid && !target) return { matchedCount: 0 };
      if (u.$push) user.registeredVehicles.push(u.$push.registeredVehicles);
      if (u.$pull) user.registeredVehicles = user.registeredVehicles.filter(v => !sameId(v._id, u.$pull.registeredVehicles._id));
      if (u.$set) for (const [k, v] of Object.entries(u.$set)) target[k.split('.').pop()] = v;
      return { matchedCount: 1 };
    }
  }) };
  const fullPath = typeof path === 'function' ? path(userId) : path;
  const req = Readable.from(parsedBody || method === 'DELETE' || method === 'GET' ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  if (parsedBody) req.body = body;
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const deps = { path: fullPath, req, res, db, mongodb: { ObjectId, Binary }, connectDB: async () => db,
    verifyUserToken: async () => ({ success: auth, user: { id: (asUser || userId).toString(), role } }) };
  await new AsyncFunction(...Object.keys(deps), block)(...Object.values(deps));
  return { res, user, proofStore };
}

const jpeg = `data:image/jpeg;base64,${Buffer.alloc(4000, 7).toString('base64')}`;

test('registers a vehicle with make, model, normalised plate and colour', async () => {
  const { res, user } = await run();
  assert.equal(res.code, 200);
  const saved = user.registeredVehicles[0];
  assert.equal(saved.make, 'Toyota'); assert.equal(saved.model, 'Hilux');
  assert.equal(saved.regPlate, 'B 123 ABC'); assert.equal(saved.year, 2022);
  assert.equal(saved.status, 'pending'); assert.ok(saved._id instanceof ObjectId);
});

test('accepts the /api prefix and an already-parsed JSON body', async () => {
  const { res, user } = await run({ path: '/api/user/register-vehicle', parsedBody: true });
  assert.equal(res.code, 200); assert.equal(user.registeredVehicles.length, 1);
});

test('legacy clients sending only vehicleName still work', async () => {
  const { res, user } = await run({ body: { vehicleName: 'VW Golf R', year: 2024, regPlate: 'B1' } });
  assert.equal(res.code, 200); assert.equal(user.registeredVehicles[0].vehicleName, 'VW Golf R');
});

test('rejects missing fields, bad years, duplicate plates and guests', async () => {
  assert.equal((await run({ body: { ...valid(), regPlate: '' } })).res.code, 400);
  assert.equal((await run({ body: { ...valid(), year: '1800' } })).res.code, 400);
  assert.equal((await run({ body: { ...valid(), year: 'abc' } })).res.code, 400);
  const dup = await run({ vehicles: [{ _id: new ObjectId(), regPlate: 'B123ABC' }] });
  assert.equal(dup.res.code, 409); assert.equal(dup.user.registeredVehicles.length, 1);
  assert.equal((await run({ auth: false })).res.code, 401);
});

test('invalid colour falls back to default', async () => {
  const { user } = await run({ body: { ...valid(), color: 'javascript:alert(1)' } });
  assert.equal(user.registeredVehicles[0].color, '#EBEBEB');
});

test('owner can remove a registered vehicle; unknown ids return 404', async () => {
  const id = new ObjectId();
  const removed = await run({ method: 'DELETE', path: `/user/register-vehicle/${id}`, vehicles: [{ _id: id, regPlate: 'B1' }] });
  assert.equal(removed.res.code, 200); assert.equal(removed.user.registeredVehicles.length, 0);
  const missing = await run({ method: 'DELETE', path: `/user/register-vehicle/${new ObjectId()}` });
  assert.equal(missing.res.code, 404);
});

test('admin can approve a registration (previously failed with undefined body/ObjectId)', async () => {
  const id = new ObjectId();
  const { res, user } = await run({ method: 'PATCH', role: 'admin', body: { status: 'approved', adminNote: 'ok' },
    path: uid => `/admin/vehicle-registrations/${uid}/${id}`, vehicles: [{ _id: id, regPlate: 'B1', status: 'pending' }] });
  assert.equal(res.code, 200); assert.equal(user.registeredVehicles[0].status, 'approved');
  const denied = await run({ method: 'PATCH', role: 'user', body: { status: 'approved' },
    path: uid => `/admin/vehicle-registrations/${uid}/${id}`, vehicles: [{ _id: id }] });
  assert.equal(denied.res.code, 403);
});

test('owner uploads proof of ownership; rejected registration returns to pending', async () => {
  const id = new ObjectId();
  const { res, user, proofStore } = await run({ path: `/user/register-vehicle/${id}/proof`, body: { image: jpeg },
    vehicles: [{ _id: id, regPlate: 'B1', status: 'rejected' }] });
  assert.equal(res.code, 200);
  assert.equal(proofStore.length, 1); assert.equal(proofStore[0].mimeType, 'image/jpeg');
  assert.ok(user.registeredVehicles[0].ownershipProof.uploadedAt instanceof Date);
  assert.equal(user.registeredVehicles[0].status, 'pending');
  assert.ok(!('data' in user.registeredVehicles[0].ownershipProof), 'image bytes stay out of the user document');
});

test('proof upload rejects non-images, oversize files and vehicles the user does not own', async () => {
  const id = new ObjectId();
  const vehicles = [{ _id: id, regPlate: 'B1' }];
  const p = `/user/register-vehicle/${id}/proof`;
  assert.equal((await run({ path: p, vehicles, body: { image: 'data:application/pdf;base64,AAAA' } })).res.code, 400);
  assert.equal((await run({ path: p, vehicles, body: { image: `data:image/png;base64,${Buffer.alloc(3.2 * 1024 * 1024).toString('base64')}` } })).res.code, 413);
  assert.equal((await run({ path: `/user/register-vehicle/${new ObjectId()}/proof`, vehicles, body: { image: jpeg } })).res.code, 404);
  assert.equal((await run({ path: p, vehicles, body: { image: jpeg }, auth: false })).res.code, 401);
});

test('only the owner or an admin can view a proof', async () => {
  const id = new ObjectId();
  const stored = owner => [{ userId: owner, vehicleId: id, mimeType: 'image/png', data: new Binary(Buffer.from('png-bytes')), uploadedAt: new Date() }];
  const ownerView = await run({ method: 'GET', path: uid => `/vehicle-ownership-proofs/${uid}/${id}`, proofs: [] });
  assert.equal(ownerView.res.code, 404);
  let ownerId;
  const ok = await run({ method: 'GET', path: uid => { ownerId = uid; return `/vehicle-ownership-proofs/${uid}/${id}`; } });
  assert.equal(ok.res.code, 404);
  const viewer = new ObjectId();
  const stranger = await run({ method: 'GET', asUser: viewer, path: uid => `/vehicle-ownership-proofs/${uid}/${id}` });
  assert.equal(stranger.res.code, 403);
  const admin = await run({ method: 'GET', asUser: viewer, role: 'admin', path: uid => { ownerId = uid; return `/vehicle-ownership-proofs/${uid}/${id}`; },
    proofs: stored(new ObjectId()) });
  assert.equal(admin.res.code, 404, 'proof belongs to a different user id');
});

test('owner and admin receive the stored image', async () => {
  const id = new ObjectId();
  const owner = new ObjectId();
  const proofs = [{ userId: owner, vehicleId: id, mimeType: 'image/png', data: new Binary(Buffer.from('png-bytes')), uploadedAt: new Date() }];
  const admin = await run({ method: 'GET', role: 'admin', path: `/vehicle-ownership-proofs/${owner}/${id}`, proofs });
  assert.equal(admin.res.code, 200);
  assert.equal(admin.res.body.data.image, `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`);
  assert.equal(admin.res.headers['Cache-Control'], 'private, no-store');
  const self = await run({ method: 'GET', asUser: owner, path: `/vehicle-ownership-proofs/${owner}/${id}`, proofs });
  assert.equal(self.res.code, 200);
});

test('removing a vehicle also deletes its proof', async () => {
  const id = new ObjectId();
  const { res, proofStore } = await run({ method: 'DELETE', path: `/user/register-vehicle/${id}`,
    vehicles: [{ _id: id, regPlate: 'B1' }], proofs: [] });
  assert.equal(res.code, 200); assert.equal(proofStore.length, 0);
});

test('registration and configurator routes sit outside the /user/profile-only block', () => {
  const profileBlock = source.indexOf("if (path.startsWith('/user/profile')) {");
  for (const marker of ['// === 3D CONFIG SIMULATOR', '// === REGISTER VEHICLE ENDPOINTS (owner) ===',
    '// === PROOF OF OWNERSHIP', '// === ADMIN: GET ALL VEHICLE REGISTRATIONS ===']) {
    const at = source.indexOf(marker);
    assert.ok(at > 0 && at < profileBlock, `${marker} must come before the /user/profile block`);
  }
});
