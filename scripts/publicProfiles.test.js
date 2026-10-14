import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicProfileData, publicProfileQuery, getPublicProfile, profileImageThumbnail } from '../utils/publicProfiles.js';

test('public data excludes email, phone, follower identities and security fields', () => {
  const result = publicProfileData({ _id: 'person', name: 'Member', email: 'private@example.test', phone: '123',
    password: 'secret', security: { token: 'secret' }, followers: ['a', 'b'], following: ['b', 'c'],
    avatar: { url: 'https://images.test/avatar.jpg', key: 'private-key' } }, 'b');
  assert.equal(result.associateCount, 1);
  assert.equal(result.isFollowedByCurrentUser, true);
  assert.equal(result.avatar, 'https://images.test/avatar.jpg');
  for (const field of ['email', 'phone', 'password', 'security', 'followers', 'following']) assert.equal(field in result, false);
});

test('every supported privacy setting excludes restricted profiles from public queries', () => {
  for (const field of ['profileVisibility', 'profile.privacy.profileVisibility', 'security.privacySettings.profileVisibility']) {
    assert.deepEqual(publicProfileQuery[field].$nin, ['private', 'friends', 'limited']);
  }
});

test('unavailable profiles never fetch or disclose their posts', async () => {
  const db = { collection: name => {
    assert.equal(name, 'users');
    return { findOne: async query => { assert.equal(query._id, 'private-user'); return null; } };
  } };
  assert.equal(await getPublicProfile(db, 'private-user'), null);
});

test('profile returns only safe recent Feed fields and their total', async () => {
  const db = { collection: name => name === 'users' ? { findOne: async () => ({ _id: 'member', name: 'Member' }) } : {
    find: (query, options) => {
      assert.equal(query.userId, 'member');
      assert.ok(query.status.$nin.includes('hidden'));
      assert.equal(options.projection.content, 1);
      assert.equal(options.projection.likedBy, undefined);
      return { sort: () => ({ limit: count => { assert.equal(count, 6); return { toArray: async () => [{ _id: 'post', content: 'Hello' }] }; } }) };
    }, countDocuments: async () => 7
  } };
  const result = await getPublicProfile(db, 'member');
  assert.equal(result.postCount, 7);
  assert.equal(result.recentPosts[0].content, 'Hello');
});

test('thumbnail retries the alternate image and resizes without fetching external hosts', async () => {
  const calls = [], sizes = [];
  const fetchImage = async url => {
    calls.push(url);
    if (url.endsWith('broken.jpg')) return { ok: false };
    return { ok: true, headers: new Headers({ 'content-type': 'image/jpeg' }), body: [Buffer.from('fixture')] };
  };
  const resize = () => {
    const chain = { rotate: () => chain, resize: (...args) => { sizes.push(args); return chain; },
      webp: () => chain, toBuffer: async () => Buffer.from('small webp') };
    return chain;
  };
  const bucket = 'https://i3wcarculture-images.s3.us-east-1.amazonaws.com/';
  const result = await profileImageThumbnail({ avatar: bucket + 'broken.jpg', profilePicture: bucket + 'good.jpg' }, 'avatar', fetchImage, resize);
  assert.equal(result.toString(), 'small webp');
  assert.equal(calls.length, 2);
  assert.deepEqual(sizes[0].slice(0, 2), [128, 128]);
  assert.equal(await profileImageThumbnail({ avatar: 'https://untrusted.test/image.jpg' }, 'avatar', fetchImage, resize), null);
  assert.equal(calls.length, 2);
});
