const firstText = (...values) => values.find(value => typeof value === 'string' && value.trim()) || '';

export function listingProfileData(user = {}, dealer = null) {
  const profile = user.profile || {};
  const address = typeof profile.address === 'object' ? profile.address : {};
  const firstName = firstText(profile.firstName, user.firstName, dealer?.privateSeller?.firstName, user.name?.split(' ')[0]);
  const lastName = firstText(profile.lastName, user.lastName, dealer?.privateSeller?.lastName, user.name?.split(' ').slice(1).join(' '));
  const contact = {
    phone: firstText(profile.phone, user.phone, user.contact?.phone, dealer?.contact?.phone),
    email: firstText(user.email, dealer?.contact?.email),
    whatsapp: firstText(profile.whatsapp, user.whatsapp, user.contact?.whatsapp, dealer?.contact?.whatsapp),
    location: {
      city: firstText(profile.location, address.city, user.city, user.contact?.location?.city, dealer?.location?.city),
      state: firstText(address.state, user.state, user.contact?.location?.state, dealer?.location?.state),
      address: firstText(address.street, address.address, user.address, user.contact?.location?.address, dealer?.location?.address),
      country: firstText(address.country, user.country, dealer?.location?.country) || 'Botswana'
    }
  };
  const social = Object.fromEntries(['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok']
    .map(key => [key, firstText(profile.social?.[key], user.social?.[key], user[key], dealer?.social?.[key])]));
  const picture = profile.avatar || user.profilePicture || user.avatar || '';
  return {
    sellerName: firstText(user.name, `${firstName} ${lastName}`.trim(), dealer?.businessName),
    email: contact.email, contact, social,
    profilePicture: typeof picture === 'string' ? picture : picture?.url || '',
    sellerType: dealer?.sellerType || user.sellerType || 'private',
    businessInfo: dealer ? Object.fromEntries(['businessName', 'businessType', 'registrationNumber', 'vatNumber', 'businessAddress', 'businessPhone', 'businessEmail']
      .map(key => [key, dealer[key] || ''])) : null,
    privateSeller: { firstName, lastName, idNumber: dealer?.privateSeller?.idNumber || '' },
    userAccountType: user.role || 'user', hasVerifiedEmail: user.emailVerified || false,
    hasVerifiedPhone: user.phoneVerified || false, memberSince: user.createdAt || null,
    profileCompletion: { basicInfo: !!(firstName && contact.email), contactInfo: !!contact.phone,
      locationInfo: !!contact.location.city, profilePicture: !!picture }
  };
}

// Profile Settings uses profile.phone/location; keep legacy fields in sync as well.
// Empty optional form fields must not erase profile values.
export function listingProfileUpdate(data = {}) {
  const update = { updatedAt: new Date() };
  const setText = (value, ...paths) => {
    if (typeof value === 'string' && value.trim()) paths.forEach(path => { update[path] = value.trim(); });
  };
  setText(data.contact?.phone, 'phone', 'profile.phone');
  setText(data.contact?.whatsapp, 'whatsapp', 'profile.whatsapp');
  setText(data.contact?.location?.city, 'city', 'profile.location', 'profile.address.city');
  setText(data.contact?.location?.state, 'state', 'profile.address.state');
  setText(data.contact?.location?.address, 'address', 'profile.address.address', 'profile.address.street');
  setText(data.profilePicture, 'profilePicture');
  for (const key of ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok']) setText(data.social?.[key], key, `profile.social.${key}`);
  return update;
}
