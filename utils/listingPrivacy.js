export function publicListingData(value) {
  if (Array.isArray(value)) return value.map(publicListingData);
  if (!value || typeof value !== 'object' || value.constructor !== Object) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'adminNotes').map(([key, item]) => [key, publicListingData(item)]));
}
