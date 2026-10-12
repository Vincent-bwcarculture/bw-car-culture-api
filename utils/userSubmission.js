export const editableSubmissionStatuses = ['pending_review', 'rejected', 'approved', 'listing_created'];

export function submissionBoost(incoming, previous = null) {
  if (!incoming?.requested) return null;
  if (previous?.proofUrl && previous.proofUrl === incoming.proofUrl) return { ...previous, requested: true };
  return { requested: true, amount: 200, currency: 'BWP', proofUrl: incoming.proofUrl,
    status: 'pending_verification', requestedAt: new Date() };
}

export function validateUserListing(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['Listing data is required'];
  const errors = [];
  const text = value => typeof value === 'string' && value.trim().length > 0;
  if (!text(data.title) || data.title.trim().length < 10) errors.push('Title must be at least 10 characters');
  if (!text(data.description) || data.description.trim().length < 10) errors.push('Description must be at least 10 characters');
  if (!text(data.specifications?.make)) errors.push('Vehicle make is required');
  if (!text(data.specifications?.model)) errors.push('Vehicle model is required');
  const year = Number(data.specifications?.year);
  if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 2) errors.push('Valid year is required');
  const price = Number(data.pricing?.price);
  if (!Number.isFinite(price) || price <= 0) errors.push('Valid price is required');
  if (!text(data.contact?.sellerName)) errors.push('Seller name is required');
  if (!text(data.contact?.phone)) errors.push('Phone number is required');
  if (data.images != null && (!Array.isArray(data.images) || data.images.length > 15)) errors.push('Maximum 15 images');
  if (data.featuredBoost?.requested && !text(data.featuredBoost.proofUrl)) errors.push('Boost proof of payment is required');
  return errors;
}

export function isFreeUserSubmission(submission) {
  const tier = submission.selectedTier;
  if (tier) return tier === 'free';
  if (typeof submission.paymentRequired === 'boolean') return !submission.paymentRequired;
  if (submission.listingData?.selectedPlan) return submission.listingData.selectedPlan === 'free';
  // The current form submits free listings; social promotion is a separate purchase.
  return submission.source === 'user_form_production' || submission.listingData?.submissionSource === 'user_form';
}

// Copy only public listing content, never workflow fields or seller identity documents.
export function publicSubmissionDetails(data = {}) {
  const fields = ['title', 'description', 'specifications', 'contact', 'location', 'condition',
    'sellerType', 'priceOptions', 'additionalInfo', 'availability', 'transit', 'social'];
  const details = Object.fromEntries(fields.filter(key => data[key] != null).map(key => [key, data[key]]));
  details.price = Number(data.pricing?.price ?? data.price ?? 0);
  if (data.features != null) {
    const grouped = Array.isArray(data.features) ? null : data.features;
    details.features = [...new Set((grouped ? Object.values(grouped).filter(Array.isArray).flat() : data.features).filter(value => typeof value === 'string'))];
    if (grouped) {
      details.safetyFeatures = grouped.safety || [];
      details.comfortFeatures = grouped.comfort || [];
      details.performanceFeatures = grouped.performance || [];
      details.entertainmentFeatures = grouped.technology || [];
      details.exteriorFeatures = grouped.exterior || [];
      details.interiorFeatures = grouped.interior || [];
    }
  }
  if (data.privateSeller) {
    details.privateSeller = Object.fromEntries(['firstName', 'lastName', 'preferredContactMethod', 'canShowContactInfo']
      .filter(key => data.privateSeller[key] != null).map(key => [key, data.privateSeller[key]]));
  }
  if (data.privateSeller === null) details.privateSeller = null;
  if (data.businessInfo) {
    details.businessInfo = Object.fromEntries(['businessName', 'businessType', 'businessAddress', 'businessPhone', 'businessEmail']
      .filter(key => data.businessInfo[key] != null).map(key => [key, data.businessInfo[key]]));
  }
  return details;
}

export function submissionReviewChanges(data, published) {
  if (!published) return [];
  const edited = { ...publicSubmissionDetails(data), images: data.images || [] };
  const display = value => {
    if (value == null) return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map(display).join(', ');
    if (typeof value === 'object') return Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${key}: ${display(item)}`).join('; ');
    return String(value);
  };
  const labels = { title: 'Title', description: 'Description', price: 'Price (BWP)', condition: 'Condition',
    specifications: 'Vehicle specifications', contact: 'Seller contact', location: 'Location', features: 'Features',
    priceOptions: 'Pricing options', availability: 'Availability', transit: 'Transit details', additionalInfo: 'Additional information' };
  const changes = Object.entries(labels).flatMap(([key, field]) => {
    const before = display(published[key]), after = display(edited[key]);
    return before === after ? [] : [{ field, before, after }];
  });
  const urls = images => (images || []).map(img => typeof img === 'string' ? img : img.url).join('|');
  if (urls(published.images) !== urls(edited.images)) changes.push({ field: 'Photos',
    before: `${published.images?.length || 0} photos`, after: `${edited.images.length} photos (selection or order changed)` });
  return changes;
}
