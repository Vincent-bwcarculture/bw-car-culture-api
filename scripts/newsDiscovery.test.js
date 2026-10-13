import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newsQuery, recordNewsEngagement } from '../utils/newsDiscovery.js';

test('public filters normalize reviews/features and never expose draft articles', () => {
  const result = newsQuery(new URLSearchParams('category=reviews&status=all&sort=popular&page=-1&limit=999'));
  assert.deepEqual(result.filter.category, { $in: ['review', 'reviews'] });
  assert.equal(result.filter.status, 'published');assert.equal(result.sort['metadata.views'], -1);
  assert.equal(result.page, 1);assert.equal(result.limit,100);
  assert.deepEqual(newsQuery(new URLSearchParams('category=features')).filter.category,{$in:['feature','features']});
});
test('featured and videos are actual predicates; search is literal and includes tags', () => {
  assert.equal(newsQuery(new URLSearchParams('category=featured')).filter.featured,true);
  assert.ok(newsQuery(new URLSearchParams('hasVideo=true')).filter.$and[0].$or.length);
  const search=newsQuery(new URLSearchParams('search=S-Class+%28new%29')).filter.$and[0].$or;
  assert.ok(search.some(row=>row.tags));assert.equal(search[0].title.$regex,'S-Class \\(new\\)');
});
test('authorized admin filters include requested unpublished submissions and paginate accurately', () => {
  assert.equal(newsQuery(new URLSearchParams('status=draft'),true).filter.status,'draft');
  const query=newsQuery(new URLSearchParams('status=all&page=3&limit=12'),true);
  assert.equal(query.filter.status,undefined);assert.equal(query.skip,24);
});
function database(status='published') {
 const article={_id:'article',status,metadata:{views:12,likes:0,shares:0}}, records=new Map();
 return { article, records, collection(name) {
  if(name==='news')return {
   findOne:async query=>query.status&&query.status!==article.status?null:structuredClone(article),
   updateOne:async(query,op)=>{for(const [path,delta] of Object.entries(op.$inc)){const field=path.split('.')[1];if(query[path]?.$gt!==undefined&&article.metadata[field]<=query[path].$gt)continue;article.metadata[field]+=delta;}}
  };
  return {
   updateOne:async(query,op)=>{const record=records.get(query._id);if(record&&query.lastAt&&record.lastAt>=query.lastAt.$lt)throw Object.assign(new Error('duplicate'),{code:11000});
    if(record&&!op.$set)return {upsertedCount:0,modifiedCount:0};
    records.set(query._id,{...(record||op.$setOnInsert),...op.$set});return {upsertedCount:record?0:1,modifiedCount:record?1:0};},
   deleteOne:async query=>({deletedCount:records.delete(query._id)?1:0})
  };
 }};
}
const visitorId='visitor-browser-12345678';
test('views are deduplicated per visitor/article for 30 minutes and return persisted counters',async()=>{
 const db=database(),now=new Date('2026-10-13T00:00:00Z'),payload={action:'view',visitorId};
 assert.equal((await recordNewsEngagement(db,'article',payload,now)).metadata.views,13);
 assert.equal((await recordNewsEngagement(db,'article',payload,new Date(+now+1000))).metadata.views,13);
 assert.equal((await recordNewsEngagement(db,'article',payload,new Date(+now+31*60000))).metadata.views,14);
 assert.equal(db.records.size,1);
});
test('likes and unlikes are idempotent and never decrement below zero',async()=>{
 const db=database();for(const liked of [true,true])await recordNewsEngagement(db,'article',{action:'like',visitorId,liked});
 assert.equal(db.article.metadata.likes,1);
 for(const liked of [false,false])await recordNewsEngagement(db,'article',{action:'like',visitorId,liked});
 assert.equal(db.article.metadata.likes,0);
});
test('completed shares are stored with duplicate protection, and unpublished/invalid events are rejected',async()=>{
 const db=database();await recordNewsEngagement(db,'article',{action:'share',visitorId});await recordNewsEngagement(db,'article',{action:'share',visitorId});
 assert.equal(db.article.metadata.shares,1);
 assert.equal(await recordNewsEngagement(database('draft'),'article',{action:'view',visitorId}),null);
 await assert.rejects(recordNewsEngagement(db,'article',{action:'like',visitorId}),/Like state/);
 await assert.rejects(recordNewsEngagement(db,'article',{action:'view',visitorId:'bad'}),/visitor/);
});
