const restricted = ['private', 'friends', 'limited'];
export const publicProfileQuery = {
  status: 'active',
  'profile.privacy.profileVisibility': { $nin: restricted },
  profileVisibility: { $nin: restricted },
  'security.privacySettings.profileVisibility': { $nin: restricted }
};
export const publicProfileProjection = {
  name: 1, role: 1, avatar: 1, profilePicture: 1, coverPicture: 1, bio: 1,
  city: 1, createdAt: 1, emailVerified: 1, followers: 1, following: 1, 'profile.bio': 1
};
const imageUrl = image => {
  const url = typeof image === 'string' ? image : image?.url;
  return typeof url === 'string' && /^(https?:\/\/|\/)/i.test(url.trim()) ? url.trim() : null;
};
export function publicProfileData(user, viewerId) {
  const followers = (user.followers || []).map(String);
  const following = (user.following || []).map(String);
  return {
    _id: String(user._id), name: user.name || 'Community member', role: user.role || 'user',
    avatar: imageUrl(user.avatar), profilePicture: imageUrl(user.profilePicture),
    coverPicture: imageUrl(user.coverPicture), bio: user.bio || user.profile?.bio || '',
    city: user.city || '', createdAt: user.createdAt, emailVerified: Boolean(user.emailVerified),
    followerCount: followers.length, followingCount: following.length,
    associateCount: following.filter(id => followers.includes(id)).length,
    isFollowedByCurrentUser: Boolean(viewerId && followers.includes(String(viewerId)))
  };
}
export async function getPublicProfile(db, accountId, viewerId) {
  const user = await db.collection('users').findOne(
    { ...publicProfileQuery, _id: accountId }, { projection: publicProfileProjection }
  );
  if (!user) return null;
  const query = { userId: String(accountId), status: { $nin: ['hidden', 'removed', 'deleted', 'rejected'] } };
  const posts = db.collection('feed_posts');
  const [recentPosts, postCount] = await Promise.all([
    posts.find(query, { projection: { content: 1, createdAt: 1, likes: 1, commentCount: 1 } })
      .sort({ createdAt: -1, _id: -1 }).limit(6).toArray(),
    posts.countDocuments(query)
  ]);
  return { ...publicProfileData(user, viewerId), recentPosts, postCount };
}

// Only fetch our public image bucket; stored external URLs remain browser fallbacks.
export async function profileImageThumbnail(user, kind = 'avatar', fetchImage = fetch, resize) {
  const signal = AbortSignal.timeout(15000);
  const candidates = [...new Set((kind === 'cover'
    ? [imageUrl(user.coverPicture)] : [imageUrl(user.avatar), imageUrl(user.profilePicture)]).filter(Boolean))];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' || url.hostname !== 'i3wcarculture-images.s3.us-east-1.amazonaws.com') continue;
      const response = await fetchImage(url.href, { redirect: 'error', signal });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) continue;
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) throw new Error('Image too large');
        chunks.push(Buffer.from(chunk));
      }
      const processImage = resize || (await import('sharp')).default;
      return await processImage(Buffer.concat(chunks), { limitInputPixels: 40e6 })
        .rotate().resize(kind === 'cover' ? 1280 : 128, kind === 'cover' ? 480 : 128, { fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 78 }).toBuffer();
    } catch { /* Try the alternate uploaded profile photo. */ }
  }
  return null;
}
