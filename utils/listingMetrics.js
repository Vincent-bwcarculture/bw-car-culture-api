import { ObjectId } from 'mongodb';
import { submissionReviewChanges } from './userSubmission.js';

const count = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const key = value => value?.toString();
export const listingCounters = value => ({
  views: count(value?.views ?? value?.metrics?.views ?? value?.listingData?.views),
  saves: count(value?.saves ?? value?.metrics?.saves ?? value?.listingData?.saves),
  inquiries: count(value?.inquiries ?? value?.metrics?.inquiries ?? value?.listingData?.inquiries)
});

export async function attachSubmissionMetrics(db, submissions) {
  if (!submissions.length) return [];
  const ids = submissions.map(sub => sub.listingId).filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
  // Normal linked listings use the existing _id index. Only repair a missing
  // link by submissionId for records already marked as materialized.
  const submissionIds = submissions.filter(sub => !sub.listingId && sub.status === 'listing_created')
    .flatMap(sub => ObjectId.isValid(sub._id) ? [new ObjectId(sub._id), key(sub._id)] : [sub._id]);
  const filters = [{ _id: { $in: ids } }];
  if (submissionIds.length) filters.push({ submissionId: { $in: submissionIds } });
  const listings = ids.length || submissionIds.length ? await db.collection('listings').find({ $or: filters },
    { projection: { _id: 1, submissionId: 1, views: 1, saves: 1, inquiries: 1, listingQuality: 1,
    title: 1, description: 1, price: 1, condition: 1, specifications: 1, contact: 1, location: 1,
    features: 1, priceOptions: 1, availability: 1, transit: 1, additionalInfo: 1, images: 1 } }).toArray() : [];
  const byId = new Map(listings.map(listing => [key(listing._id), listing]));
  const bySubmission = new Map(listings.filter(listing => listing.submissionId).map(listing => [key(listing.submissionId), listing]));
  return submissions.map(sub => {
    const listing = byId.get(key(sub.listingId)) || bySubmission.get(key(sub._id));
    const available = !!listing || (!sub.listingId && sub.status === 'approved');
    return { ...sub, ...(sub.status === 'pending_review' && sub.editHistory?.length && listing
      ? { reviewChanges: submissionReviewChanges(sub.listingData, listing) } : {}),
      listingStats: { ...listingCounters(listing || sub), available,
      listingQuality: listing?.listingQuality ?? null,
      listingId: listing?._id || sub.listingId || null } };
  });
}

export async function incrementListingViews(db, id) {
  const listings = db.collection('listings');
  const submissions = db.collection('usersubmissions');
  let collection = listings;
  let filter = { _id: new ObjectId(id) };
  let result = await collection.updateOne(filter, { $inc: { views: 1 } });
  if (!result.matchedCount) {
    // Older marketplace URLs use a submission ID. Follow its link when a real
    // listing exists; otherwise count only an approved legacy submission.
    const submission = await submissions.findOne(filter);
    if (!submission) return null;
    if (ObjectId.isValid(submission.listingId)) filter = { _id: new ObjectId(submission.listingId) };
    else if (!submission.listingId && submission.status === 'approved') {
      collection = submissions;
      filter = { ...filter, status: 'approved', listingId: null };
    } else return null;
    result = await collection.updateOne(filter, { $inc: { views: 1 } });
    if (!result.matchedCount) return null;
  }
  const updated = await collection.findOne(filter);
  return { id, views: count(updated?.views), title: updated?.title || updated?.listingData?.title || '' };
}
