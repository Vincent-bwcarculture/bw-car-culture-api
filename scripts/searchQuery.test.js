import test from 'node:test';
import assert from 'node:assert/strict';
import { searchTermClauses } from '../utils/searchQuery.js';

// Evaluate the generated Mongo clauses the way $regex would, against plain documents.
const matches = (doc, clauses) => clauses.every(({ $or }) => $or.some(cond => {
  const [field, { $regex, $options }] = Object.entries(cond)[0];
  const value = field.split('.').reduce((v, k) => v?.[k], doc);
  const values = Array.isArray(value) ? value : [value];
  return values.some(v => typeof v === 'string' && new RegExp($regex, $options).test(v));
}));

const fields = ['title', 'specifications.make', 'specifications.model'];
const listings = [
  { title: '2025 Volkswagen Golf 8.5R', specifications: { make: 'Volkswagen', model: 'Golf 8.5 R' } },
  { title: '2025 Volkswagen Golf 8.5 R Line', specifications: { make: 'Volkswagen', model: 'Golf 8.5 R Line' } },
  { title: '2005 VW GOLF 5 GTI', specifications: { make: 'VW', model: 'Golf 5 GTI' } },
  { title: 'Golf 6 GTI', specifications: { make: 'Volkswagen', model: 'Golf' } },
  { title: 'Toyota Corolla Cross', specifications: { make: 'Toyota', model: 'Corolla Cross' } }
];
const search = q => listings.filter(l => matches(l, searchTermClauses(q, fields))).map(l => l.title);

test('"golf r" finds Golf R listings written as 8.5R or 8.5 R, not GTIs', () => {
  assert.deepEqual(search('golf r'), ['2025 Volkswagen Golf 8.5R', '2025 Volkswagen Golf 8.5 R Line']);
  assert.deepEqual(search('GOLF R'), search('golf r'));
});

test('words match in any order and across fields', () => {
  assert.deepEqual(search('volkswagen gti'), ['Golf 6 GTI']);
  assert.deepEqual(search('gti golf').length, 2);
});

test('single words keep working, including partial words', () => {
  assert.equal(search('golf').length, 4);
  assert.deepEqual(search('corol'), ['Toyota Corolla Cross']);
});

test('special characters are literal, not regex', () => {
  assert.deepEqual(search('8.5'), ['2025 Volkswagen Golf 8.5R', '2025 Volkswagen Golf 8.5 R Line']);
  assert.deepEqual(search('8x5'), []);
  assert.doesNotThrow(() => search('golf ('));
  assert.deepEqual(searchTermClauses('   ', fields), []);
});
