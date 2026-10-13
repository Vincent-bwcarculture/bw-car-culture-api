import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Readable} from 'node:stream';import {ObjectId} from 'mongodb';import {publicListingData} from '../utils/listingPrivacy.js';
const source=await readFile(new URL('../api/index.js',import.meta.url),'utf8'),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const response=()=>({code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
async function execute(start,end,args){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);const values={console:{log(){},error(){}},timestamp:'test',...args};return new AsyncFunction(...Object.keys(values),source.slice(a,b))(...Object.values(values));}
test('listing write guard protects admin operations without blocking user submission routes',async()=>{
 const start="    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)",a=source.indexOf(start),b=source.indexOf('\n    }',a)+6,code=source.slice(a,b);
 for(const path of ['/listings','/api/listings','/listings/000000000000000000000000/status','/listings/000000000000000000000000']){
  const res=response();await new AsyncFunction('req','res','path','verifyAdminToken',code)({method:'PATCH'},res,path,async()=>({success:false,message:'No token provided'}));assert.equal(res.code,401);
 }
 const res=response();let called=false;await new AsyncFunction('req','res','path','verifyAdminToken',code)({method:'POST'},res,'/api/user-submissions',async()=>{called=true;return {success:false};});assert.equal(called,false);assert.equal(res.body,undefined);
});
test('public listing responses remove private records while preserving IDs, dates and normal data',()=>{
 const id=new ObjectId(),date=new Date(),data={data:[{_id:id,title:'Vehicle',createdAt:date,adminNotes:{supplierPrice:100},nested:{adminNotes:{notes:'Private'},city:'Gaborone'}}]};
 const result=publicListingData(data);assert.equal(result.data[0].adminNotes,undefined);assert.equal(result.data[0].nested.adminNotes,undefined);assert.equal(result.data[0]._id,id);assert.equal(result.data[0].createdAt,date);assert.ok(data.data[0].adminNotes);
});
test('actual edit route persists status, grouped features, quality zero, private records and a retained photo',async()=>{
 const id=new ObjectId();let updated;const existing={_id:id,title:'Vehicle',price:500,status:'active',dealer:{businessName:'Seller',contact:{phone:'old',email:'seller@example.test'}},images:[{url:'keep.jpg'}]};
 const payload={title:'Vehicle',price:500,status:'sold',category:'Truck',featured:false,listingQuality:0,safetyFeatures:['ABS'],adminNotes:{notes:'Private'},transit:{isInTransit:true},dealer:{contact:{phone:'new'}},priceOptions:{showSavings:false,originalPrice:1000},existingImages:[{url:'keep.jpg'}],primaryImageIndex:0};
 const req=Readable.from([Buffer.from(JSON.stringify({listingData:JSON.stringify(payload)}))]);req.method='PUT';const res=response();
 await execute('// === UPDATE LISTING (PUT method for full updates)','// === ENHANCED GENERAL LISTINGS ENDPOINT',{
  path:`/api/listings/${id}`,req,res,db:{collection:()=>({findOne:async()=>updated?{...existing,...updated}:existing,updateOne:async(_,op)=>{updated=op.$set;return {matchedCount:1,modifiedCount:1};}})}
 });assert.equal(res.code,200);assert.equal(updated.status,'sold');assert.equal(updated.listingQuality,0);assert.deepEqual(updated.safetyFeatures,['ABS']);assert.deepEqual(updated.adminNotes,{notes:'Private'});assert.equal(updated.dealer.businessName,'Seller');assert.equal(updated.dealer.contact.email,'seller@example.test');assert.equal(updated.dealer.contact.phone,'new');assert.equal(updated.priceOptions.showSavings,false);assert.equal(updated.images[0].isPrimary,true);
});
test('status route supports existing published status and reports missing listings instead of success',async()=>{
 for(const matchedCount of [1,0]){
  const req=Readable.from([Buffer.from(JSON.stringify({status:'published'}))]);req.method='PATCH';const res=response();let op;
  await execute('// === UPDATE LISTING STATUS (admin + regular listings)','// === UPDATE LISTING STATUS ENDPOINT',{
   path:'/api/listings/000000000000000000000000/status',req,res,connectDB:async()=>({collection:()=>({updateOne:async(_,update)=>{op=update;return {matchedCount};},findOne:async()=>null})})
  });assert.equal(res.code,matchedCount?200:404);assert.equal(op.$set.status,'published');
 }
});


test('actual status route handles text IDs, private submissions and linked legacy URLs', async () => {
 for (const mode of ['text-id', 'private', 'linked', 'unapproved', 'broken-link']) {
  const id = new ObjectId().toString(), linkedId = new ObjectId();
  let savedStatus, savedSubmission, updateCalls = 0;
  const submission = {_id: new ObjectId(id), status: mode === 'unapproved' ? 'pending_review' : 'approved',
   ...(mode === 'linked' || mode === 'broken-link' ? {listingId: linkedId} : {})};
  const matches = (query, value) => query._id.$in.some(candidate => typeof candidate === typeof value && String(candidate) === String(value));
  const listings = {
   updateOne: async (query, update) => {
    updateCalls++;
    const matched = (mode === 'text-id' && matches(query, id)) || (mode === 'linked' && matches(query, linkedId));
    if (matched) savedStatus = update.$set.status;
    return {matchedCount: matched ? 1 : 0};
   }
  };
  const submissions = {findOne: async () => mode === 'text-id' ? null : submission,
   updateOne: async (query, update) => {assert.equal(query.status, 'approved'); savedSubmission = update.$set; return {matchedCount:1};}};
  const req = Readable.from([]); req.method = 'PATCH'; req.body = {status: 'paused'}; const res = response();
  await execute('// === UPDATE LISTING STATUS (admin + regular listings)', '// === UPDATE LISTING STATUS ENDPOINT', {
   path: `/listings/${id}/status`, req, res, connectDB: async () => ({collection: name => name === 'listings' ? listings : submissions})
  });
  assert.equal(res.code, ['unapproved','broken-link'].includes(mode) ? 404 : 200, mode);
  if (mode === 'private') {assert.equal(savedSubmission.listingStatus,'paused');assert.equal(savedSubmission.status,undefined);}
  if (mode === 'text-id' || mode === 'linked') assert.equal(savedStatus,'paused');
  if (mode === 'unapproved' || mode === 'broken-link') assert.equal(savedSubmission,undefined);
 }
});

test('private listing status survives inventory refresh and respects status filters', async () => {
 const start=source.indexOf('const matchingSubmissions ='), end=source.indexOf('// Apply sorting to combined results',start);
 const code=source.slice(start,end)+'return allListings;';
 const run=new AsyncFunction('transformedSubmissions','regularListings','status','adminView',code);
 const vehicles=[{status:'active'},{status:'paused'},{status:'sold'}];
 assert.deepEqual(await run(vehicles,[],null,false),[{status:'active'}]);
 assert.deepEqual(await run(vehicles,[],'all',true),vehicles);
 assert.deepEqual(await run(vehicles,[],'paused',true),[{status:'paused'}]);
 assert.deepEqual(await run(vehicles,[],'active,published',false),[{status:'active'}]);
 assert.ok(source.includes("status: submission.listingStatus || 'active'"));
});
