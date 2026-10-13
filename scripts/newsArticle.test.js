import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { ObjectId } from 'mongodb';
import { S3Client } from '@aws-sdk/client-s3';
import { readNewsRequest, uploadNewsImages, slugifyNewsTitle, newsSlug, newsGallery, publicNewsArticle } from '../utils/newsArticle.js';
import { newsQuery } from '../utils/newsDiscovery.js';
const userId = new ObjectId(), articleId = new ObjectId();
const source = await readFile(new URL('../api/index.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function request(data, method = 'POST') {
 const req = Readable.from([Buffer.from(JSON.stringify(data))]);
 req.headers = { 'content-type': 'application/json', authorization: 'Bearer fixture' }; req.method = method; return req;
}
function multipart(field = 'gallery', title = 'Caf\u00e9 launch \u2014 Botswana', count = 1) {
 const binary = Buffer.from([0, 255, 128, 13, 10, 3]);
 const parts = [Buffer.from(`--test-boundary\r\nContent-Disposition: form-data; name="title"\r\n\r\n${title}\r\n`)];
 for (let index=0;index<count;index++) parts.push(Buffer.from(`--test-boundary\r\nContent-Disposition: form-data; name="${field}"; filename="photo-${index}.png"\r\nContent-Type: image/png\r\n\r\n`),binary,Buffer.from('\r\n'));
 parts.push(Buffer.from('--test-boundary--\r\n'));const body=Buffer.concat(parts);
 const req = Readable.from([body]); req.method = 'POST'; req.headers = { authorization: 'Bearer fixture', 'content-type': 'multipart/form-data; boundary="test-boundary"' }; return { req, binary };
}
async function route(start, end, deps) {
 const begin = source.indexOf(start), finish = source.indexOf(end, begin + start.length);
 assert.ok(begin >= 0 && finish > begin);
 const code = source.slice(begin, finish).replaceAll("await import('mongodb')", 'mongodb').replaceAll("await import('jsonwebtoken')", 'jwtModule');
 const args = { readNewsRequest, uploadNewsImages, slugifyNewsTitle, newsSlug, newsGallery, publicNewsArticle, newsQuery,
  mongodb: { ObjectId }, jwtModule: { default: { verify: () => ({ userId: String(userId) }) } }, console: { log() {}, error() {} }, ...deps };
 return new AsyncFunction(...Object.keys(args), code)(...Object.values(args));
}
for (const field of ['gallery', 'galleryImages', 'galleryImages[]', 'images']) {
 test(`multipart ${field} preserves every binary byte and UTF-8 text, including small valid photos`, async () => {
  const { req, binary } = multipart(field); const { data, files } = await readNewsRequest(req);
  assert.equal(data.title, 'Caf\u00e9 launch \u2014 Botswana'); assert.deepEqual(files.galleryImages[0].buffer, binary);
 });
}
test('JSON and parsed JSON requests preserve gallery references', async () => {
 const data = { title: 'Test', gallery: ['https://example.test/a.jpg'] };
 assert.deepEqual((await readNewsRequest(request(data))).data, data);
 const req = request(data); req.body = data; assert.deepEqual((await readNewsRequest(req)).data, data);
});
test('invalid multipart uploads fail instead of silently discarding photos', async () => {
 await assert.rejects(readNewsRequest(multipart('unknownFile').req), /Unsupported article image field/);
});

test('already-buffered multipart requests preserve photos and text', async () => {
 const { req, binary } = multipart();
 const chunks = []; for await (const chunk of req) chunks.push(chunk);
 req.body = Buffer.concat(chunks);
 const result = await readNewsRequest(req);
 assert.deepEqual(result.files.galleryImages[0].buffer, binary);
 assert.equal(result.data.title, 'Caf\u00e9 launch \u2014 Botswana');
});
test('legacy articles get stable readable unique slugs and galleries combine supported shapes', () => {
 const article = { _id: articleId, title: 'Caf\u00e9 launch!', gallery: ['a'], images: [{url:'b'}, {url:'a'}] };
 assert.equal(slugifyNewsTitle(article.title), 'cafe-launch');
 assert.equal(newsSlug(article), `cafe-launch-${articleId}`);
 assert.equal(publicNewsArticle({...article, slug:'old-url'}).slug, 'old-url');
 assert.equal(newsGallery(article).length, 2);
});
test('real create route stores legacy gallery uploads and generates distinct slugs for duplicate titles', async () => {
 const uploads = []; const send = mock.method(S3Client.prototype, 'send', async command => { uploads.push(command.input); return {}; });
 try {
 const saved = [];
 for (let run = 0; run < 2; run++) {
  const { req, binary } = multipart('gallery', 'Multiple photos', 3);
  // Add required fields to the parsed request without replacing its uploaded files.
  const res = response(); let stored;
  await route("if (path === '/api/news/user' && req.method === 'POST')", "if (path === '/api/news/user/my-articles'", {
   req, res, path: '/api/news/user',
   readNewsRequest: async input => { const parsed = await readNewsRequest(input); parsed.data.content = 'Article content'; parsed.data.category = 'news'; parsed.data.status = 'published'; return parsed; },
   db: { collection: name => name === 'users' ? { findOne: async () => ({ _id:userId, name:'Editor', role:'admin' }) } : {
    insertOne: async doc => { stored=doc; return {insertedId:doc._id}; }, findOne: async () => stored
   } }
  });
  assert.equal(res.code, 201); assert.equal(stored.gallery.length, 3); assert.equal(new Set(stored.gallery).size,3); assert.equal(stored.title, 'Multiple photos');
  assert.deepEqual(uploads.at(-1).Body, binary); saved.push(stored);
  const detail=response();
  await route('// GET SINGLE ARTICLE (PUBLIC) - Supports both ID and slug','// === NEWS ===',{
   path:`/api/news/${stored.slug}`,req:{method:'GET'},res:detail,
   db:{collection:()=>({findOne:async()=>stored})}
  });
  assert.equal(detail.code,200);assert.deepEqual(detail.body.data.gallery,stored.gallery);
 }
 assert.notEqual(saved[0].slug, saved[1].slug);
 } finally { send.mock.restore(); }
});
const updateStart = "if (/^\\/api\\/news\\/(?:user\\/)?[^/]+$/.test(path) && req.method === 'PUT')";
async function update(data, extra = {}) {
 let operation; const res = response();
 const existing = { _id:articleId, author:userId, title:'Original', slug:'stable-original', content:'Body', gallery:['https://example.test/keep.jpg'], status:'published', ...extra.existing };
 await route(updateStart, "if (path.includes('/api/news/user/') && !path.includes('/my-articles') && req.method === 'DELETE')", {
  req: extra.req || request(data,'PUT'), res, path: extra.path || `/api/news/${articleId}`, timestamp:'test',
  db: { collection: name => name === 'users' ? { findOne: async () => ({ _id:userId, name:'Editor', role:extra.role || 'admin' }) } : {
   findOne: async () => existing, updateOne: async (_,op) => { operation=op.$set; Object.assign(existing,operation); return {modifiedCount:1}; }
  } }, ...extra.dependencies
 }); return { res, operation };
}
test('real admin and owner update routes accept JSON and keep stable slugs and gallery', async () => {
 for (const path of [`/api/news/${articleId}`, `/api/news/user/${articleId}`]) {
  const {res,operation}=await update({title:'Updated',author:'attack',slug:'changed',_id:'attack'},{path});
  assert.equal(res.code,200); assert.equal(operation.title,'Updated'); assert.equal(operation.slug,undefined); assert.equal(operation.author,undefined); assert.equal(operation.gallery,undefined);
 }
});
test('real multipart edit appends new photos and retains old gallery photos', async () => {
 const send=mock.method(S3Client.prototype,'send',async()=>({}));
 try { const {res,operation}=await update({}, {req: Object.assign(multipart('galleryImages').req,{method:'PUT'})});
  assert.equal(res.code,200); assert.equal(operation.gallery.length,2); assert.equal(operation.gallery[0],'https://example.test/keep.jpg');
 } finally {send.mock.restore();}
});
test('explicit gallery removals work and missing legacy slug is generated on edit', async () => {
 const {res,operation}=await update({gallery:[]},{existing:{slug:undefined}});
 assert.equal(res.code,200); assert.deepEqual(operation.gallery,[]); assert.match(operation.slug, /^original-/);
});
test('another user cannot change an article or upload its gallery', async () => {
 const {res,operation}=await update({title:'Changed'}, {role:'user',existing:{author:new ObjectId()}});
 assert.equal(res.code,403); assert.equal(operation,undefined);
});
test('public detail route resolves a generated legacy slug without rewriting the document', async () => {
 const article={_id:articleId,title:'Legacy story',gallery:['a'],status:'published'}; const slug=newsSlug(article); const res=response();let viewUpdates=0;
 await route('// GET SINGLE ARTICLE (PUBLIC) - Supports both ID and slug', '// === NEWS ===', {
  path:`/api/news/${slug}`, req:{method:'GET'},res,
  db:{collection:()=>({findOne:async query=>query._id?article:null,updateOne:async(_,op)=>{assert.deepEqual(op,{$inc:{'metadata.views':1}});viewUpdates++;}})}
 }); assert.equal(res.code,200);assert.equal(res.body.data.slug,slug);assert.equal(viewUpdates,0);
});

test('real list route applies public category/search/popularity filters and server pagination', async()=>{
 const res=response();let filter,sort,skip,limit;
 const cursor={sort(value){sort=value;return this;},skip(value){skip=value;return this;},limit(value){limit=value;return this;},async toArray(){return [{_id:articleId,title:'Review',category:'review',status:'published'}];}};
 await route('// === NEWS ===','// === STATS ===',{
  path:'/api/news',req:{method:'GET',headers:{}},res,timestamp:'test',searchParams:new URLSearchParams('category=reviews&search=car&sort=popular&page=2&limit=3&status=all'),
  db:{collection:()=>({find(value){filter=value;return cursor;},async countDocuments(){return 8;}})}
 });
 assert.equal(res.code,200);assert.equal(filter.status,'published');assert.deepEqual(filter.category,{$in:['review','reviews']});
 assert.equal(sort['metadata.views'],-1);assert.equal(skip,3);assert.equal(limit,3);assert.equal(res.body.pagination.totalPages,3);assert.equal(res.body.pagination.total,8);
});

test('unpublished detail pages require an owner or admin preview token',async()=>{
 for(const role of ['public','owner','admin']){
  const stored={_id:articleId,author:userId,title:'Draft',status:'draft'},res=response();
  await route('// GET SINGLE ARTICLE (PUBLIC) - Supports both ID and slug','// === NEWS ===',{
   path:`/api/news/${articleId}`,req:{method:'GET',headers:role==='public'?{}:{authorization:'Bearer fixture'}},res,
   db:{collection:name=>name==='users'?{findOne:async()=>({_id:role==='owner'?userId:new ObjectId(),role:role==='admin'?'admin':'user'})}:{findOne:async()=>stored}}
  });assert.equal(res.code,role==='public'?404:200);
 }
});
