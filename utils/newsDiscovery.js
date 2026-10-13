import { createHash } from 'node:crypto';

export const normalizeNewsCategory = value => ({ reviews: 'review', features: 'feature', comparisons: 'comparison' }[String(value || '').toLowerCase()] || String(value || '').toLowerCase());
const literal = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function newsQuery(params, admin = false) {
  const filter = {}, and = [];
  const category = normalizeNewsCategory(params.get('category'));
  if (category && !['all', 'featured', 'videos'].includes(category)) {
    const aliases = [category, ...Object.keys({ reviews: 'review', features: 'feature', comparisons: 'comparison' }).filter(key => normalizeNewsCategory(key) === category)];
    filter.category = { $in: aliases };
  }
  if (category === 'featured' || params.get('featured') === 'true') filter.featured = true;
  if (category === 'videos' || params.get('hasVideo') === 'true') and.push({ $or: [
    { video: { $nin: [null, '', false], $exists: true } }, { youtubeUrl: { $nin: [null, ''], $exists: true } },
    { content: { $regex: 'youtube\\.com|youtu\\.be', $options: 'i' } }
  ] });
  const search = params.get('search')?.trim();
  if (search) and.push({ $or: ['title', 'subtitle', 'content', 'summary', 'tags'].map(field => ({ [field]: { $regex: literal(search), $options: 'i' } })) });
  if (params.get('tag')) filter.tags = params.get('tag');
  if (params.get('author')) filter.author = params.get('author');
  const status = params.get('status');
  if (admin && status === 'all') { /* Admin management includes unpublished submissions. */ }
  else filter.status = admin && ['draft', 'pending', 'rejected', 'published'].includes(status) ? status : 'published';
  if (and.length) filter.$and = and;
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
  const limit = Math.max(1, Math.min(100, Math.floor(Number(params.get('limit')) || 10)));
  const popular = ['popular', 'trending', '-views', '-metadata.views'].includes(params.get('sort') || params.get('sortBy'));
  return { filter, page, limit, skip: (page - 1) * limit, sort: popular ? { 'metadata.views': -1, publishDate: -1, createdAt: -1, _id: -1 } : { publishDate: -1, createdAt: -1, _id: -1 } };
}

// A browser's repeated reads/previews are not new views. Each visitor/article/action
// keeps one record, with a 30-minute window for views and completed shares.
export async function recordNewsEngagement(db, articleId, payload, now = new Date()) {
  if (!['view', 'like', 'share'].includes(payload.action)) throw new Error('Invalid engagement action');
  if (typeof payload.visitorId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(payload.visitorId)) throw new Error('Invalid visitor identifier');
  if (payload.action === 'like' && typeof payload.liked !== 'boolean') throw new Error('Like state is required');
  const article = await db.collection('news').findOne({ _id: articleId, status: 'published' });
  if (!article) return null;
  const visitor = createHash('sha256').update(payload.visitorId).digest('hex');
  const events = db.collection('news_engagements');
  const eventId = `${articleId}:${payload.action}:${visitor}`;
  let delta = 0;
  if (payload.action === 'like') {
    if (payload.liked) {
      try {
        const result = await events.updateOne({ _id: eventId }, { $setOnInsert: { articleId, createdAt: now } }, { upsert: true });
        delta = result.upsertedCount ? 1 : 0;
      } catch (error) { if (error.code !== 11000) throw error; }
    } else delta = -(await events.deleteOne({ _id: eventId })).deletedCount;
  } else {
    try {
      const result = await events.updateOne({ _id: eventId, lastAt: { $lt: new Date(now.getTime() - 30 * 60 * 1000) } },
        { $set: { lastAt: now }, $setOnInsert: { articleId } }, { upsert: true });
      delta = result.upsertedCount || result.modifiedCount ? 1 : 0;
    } catch (error) { if (error.code !== 11000) throw error; }
  }
  const field = { view: 'views', like: 'likes', share: 'shares' }[payload.action];
  if (delta) await db.collection('news').updateOne({ _id: articleId, ...(delta < 0 ? { [`metadata.${field}`]: { $gt: 0 } } : {}) }, { $inc: { [`metadata.${field}`]: delta } });
  const updated = await db.collection('news').findOne({ _id: articleId });
  return { metadata: updated.metadata || {}, ...(payload.action === 'like' ? { liked: payload.liked } : {}) };
}
