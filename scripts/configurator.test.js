import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleConfiguratorRoute, partPrice, partsForVehicleModel } from '../utils/configurator.js';
import { CONFIGURATOR_MOCK_PARTS } from '../utils/configuratorMockParts.js';

const call = async ({ path = '/api/configurator/parts', query = 'vehicleModel=vw-golf-8-5-r', role = 'admin', auth = true, method = 'GET' } = {}) => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const handled = await handleConfiguratorRoute({
    path, req: { method }, res, searchParams: new URLSearchParams(query),
    verifyUserToken: async () => ({ success: auth, user: { id: 'u1', role } })
  });
  return { handled, res };
};

test('admins get the parts that fit the Golf 8.5 R', async () => {
  const { handled, res } = await call();
  assert.equal(handled, true); assert.equal(res.code, 200);
  assert.equal(res.body.data.length, CONFIGURATOR_MOCK_PARTS.length);
  assert.equal(res.body.mock, true);
});

test('server enforces access: guests 401, non-admin users 403', async () => {
  assert.equal((await call({ auth: false })).res.code, 401);
  assert.equal((await call({ role: 'user' })).res.code, 403);
});

test('cost, delivery, designer fee and margin never reach the client', async () => {
  const { res } = await call();
  for (const part of res.body.data) {
    assert.equal(part.pricing, undefined);
    assert.ok(Number.isInteger(part.price) && part.price > 0);
    assert.ok(['supplier', 'designer'].includes(part.source));
  }
});

test('price = (cost + delivery + designer fee) x (1 + margin)', () => {
  assert.equal(partPrice({ cost: 1000, delivery: 100, designerFee: 0, marginPct: 10 }), 1210);
  assert.equal(partPrice({ cost: 2900, delivery: 400, designerFee: 850, marginPct: 15 }), 4773);
});

test('other vehicles get no parts; bad or missing ids are rejected; unrelated paths pass through', async () => {
  assert.deepEqual(partsForVehicleModel('toyota-hilux'), []);
  assert.equal((await call({ query: '' })).res.code, 400);
  assert.equal((await call({ query: 'vehicleModel=../../etc' })).res.code, 400);
  assert.equal((await call({ path: '/api/configurator/unknown' })).res.code, 404);
  assert.equal((await call({ path: '/api/listings' })).handled, false);
});

test('every mock part points at meshes that exist in the display model', async () => {
  const glb = await readFile(new URL('../../carculturewebsite/client/public/models/hero-golf.glb', import.meta.url)).catch(() => null);
  if (!glb) return; // model lives in the client repo; skip when it is not checked out alongside
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const names = json.nodes.map(n => n.name || '');
  for (const part of CONFIGURATOR_MOCK_PARTS) {
    assert.ok(part.meshMatch.some(m => names.some(n => n.includes(m))), `${part.id} matches no mesh`);
  }
});
