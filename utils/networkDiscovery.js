// Rank actual uploaded images, rather than nonempty avatar objects.
const hasImage = field => ({
  $regexMatch: {
    input: { $convert: { input: { $ifNull: [`$${field}.url`, `$${field}`] }, to: 'string', onError: '', onNull: '' } },
    regex: '^(https?://|/)', options: 'i'
  }
});
export const engagementWeights = { posts: [5, 10], comments: [2, 20], reviews: [3, 10], visits: [1, 30], reactions: [1, 20] };
export const engagementScore = signals => Object.entries(engagementWeights).reduce(
  (score, [key, [weight, cap]]) => score + Math.min(cap, Math.max(0, Number(signals[key]) || 0)) * weight, 0
);
const recentCount = (input, dateField, since) => ({ $size: { $filter: {
  input: { $ifNull: [input, []] }, as: 'entry', cond: { $gte: [
    { $convert: { input: `$$entry.${dateField}`, to: 'date', onError: null, onNull: null } }, since
  ] }
} } });
export function networkRankingStages(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86400000);
  const lookup = (from, foreignKey, as, extra = []) => ({ $lookup: {
    from, let: { memberId: { $toString: '$_id' } }, pipeline: [
      { $match: { createdAt: { $gte: since }, $expr: { $eq: [`$${foreignKey}`, '$$memberId'] } } },
      { $group: { _id: null, count: { $sum: 1 }, ...Object.fromEntries(extra) } }
    ], as
  } });
  const total = (field, key = 'count') => ({ $ifNull: [{ $arrayElemAt: [`$${field}.${key}`, 0] }, 0] });
  const signals = {
    posts: total('_networkPosts'),
    comments: { $add: [total('_networkComments'), total('_networkEngagements')] },
    reviews: recentCount('$reviews.given', 'date', since),
    visits: { $size: { $filter: { input: { $ifNull: ['$activity.visitDays', []] }, as: 'day', cond: { $gte: ['$$day', since.toISOString().slice(0, 10)] } } } },
    reactions: total('_networkPosts', 'reactions')
  };
  return [
    lookup('feed_posts', 'userId', '_networkPosts', [['reactions', { $sum: { $min: [20, { $max: [0, { $ifNull: ['$likes', 0] }] }] } }]]),
    lookup('feed_comments', 'userId', '_networkComments'),
    lookup('user_engagements', 'authorId', '_networkEngagements'),
    { $addFields: {
      engagementPriority: { $add: Object.entries(engagementWeights).map(([key, [weight, cap]]) =>
        ({ $multiply: [weight, { $min: [cap, signals[key]] }] })) },
      photoPriority: { $add: [
        { $cond: [{ $or: [hasImage('avatar'), hasImage('profilePicture')] }, 1, 0] },
        { $cond: [hasImage('coverPicture'), 1, 0] }
      ] },
      lastActive: { $ifNull: ['$activity.lastActiveAt', { $ifNull: ['$lastLoginAt', '$createdAt'] }] }
    } },
    { $sort: { engagementPriority: -1, photoPriority: -1, lastActive: -1, _id: 1 } }
  ];
}

export async function recordNetworkVisit(db, userId, now = new Date()) {
  const result = await db.collection('users').updateOne({
    _id: userId, status: 'active', $or: [
      { 'activity.lastVisitAt': { $lt: new Date(now.getTime() - 15 * 60000) } },
      { 'activity.lastVisitAt': { $exists: false } }
    ]
  }, [{ $set: {
    'activity.lastActiveAt': now,
    'activity.lastVisitAt': now,
    'activity.visitDays': { $slice: [{ $concatArrays: [
      { $filter: { input: { $ifNull: ['$activity.visitDays', []] }, as: 'day', cond: { $ne: ['$$day', now.toISOString().slice(0, 10)] } } },
      [now.toISOString().slice(0, 10)]
    ] }, -30] }
  } }]);
  return result.modifiedCount > 0;
}

export const networkReleaseId = 'network-discovery-2026-10';
export async function ensureNetworkReleaseNotification(db, userId) {
  const receipt = await db.collection('notification_release_receipts').updateOne(
    { _id: `${networkReleaseId}:${userId}` },
    { $setOnInsert: { userId, createdAt: new Date() } }, { upsert: true }
  );
  if (!receipt.upsertedCount) return;
  try {
    await db.collection('notifications').insertOne({
      userId, releaseId: networkReleaseId, type: 'system_update', category: 'system',
      title: 'Discover your car community',
      message: 'Explore the new profile strip at the top of Feed and find Network directly below Feed. Network cards now fit mobile screens, and active community members appear first based on recent visits, posts, comments, reviews and reactions. Profile and cover photos help break ties.',
      link: '/profile?tab=network', icon: 'profile', isRead: false, createdAt: new Date()
    });
  } catch (error) {
    await db.collection('notification_release_receipts').deleteOne({ _id: `${networkReleaseId}:${userId}` });
    throw error;
  }
}
