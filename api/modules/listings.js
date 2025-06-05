// listings.js - All Listings Related APIs

export const handleListings = async (req, res, db, path, searchParams, timestamp) => {
  // Only handle listings-related paths
  if (!path.includes('/listings')) return null;

  console.log(`[${timestamp}] → LISTINGS: ${path}`);

  // === CREATE LISTING (FRONTEND ENDPOINT) - FIXED WITH SLUG GENERATION ===
  if (path === '/listings' && req.method === 'POST') {
    try {
      console.log(`[${timestamp}] → FRONTEND: Create Listing`);
      
      let body = {};
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const rawBody = Buffer.concat(chunks).toString();
        if (rawBody) body = JSON.parse(rawBody);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request body format'
        });
      }
      
      console.log(`[${timestamp}] Creating listing: ${body.title || 'Untitled'}`);
      
      const listingsCollection = db.collection('listings');
      const { ObjectId } = await import('mongodb');
      
      // SLUG GENERATION FUNCTION
      const generateSlug = (title) => {
        if (!title) {
          return `listing-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        }
        
        const baseSlug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        
        // Add timestamp to ensure uniqueness
        return `${baseSlug}-${Date.now()}`;
      };
      
      // VALIDATE REQUIRED FIELDS
      if (!body.title) {
        return res.status(400).json({
          success: false,
          message: 'Title is required for listing creation'
        });
      }
      
      if (!body.dealerId) {
        return res.status(400).json({
          success: false,
          message: 'Dealer ID is required for listing creation'
        });
      }
      
      // CREATE NEW LISTING OBJECT WITH SLUG
      const newListing = {
        _id: new ObjectId(),
        
        // Basic Information
        title: body.title || '',
        slug: generateSlug(body.title), // FIXED: Generate unique slug
        description: body.description || '',
        shortDescription: body.shortDescription || '',
        category: body.category || '',
        condition: body.condition || 'used',
        status: body.status || 'active',
        featured: Boolean(body.featured),
        
        // Dealer Information
        dealerId: body.dealerId.length === 24 ? new ObjectId(body.dealerId) : body.dealerId,
        dealer: body.dealer || null,
        
        // Pricing Information
        price: Number(body.price) || 0,
        priceType: body.priceType || 'fixed',
        priceOptions: {
          includesVAT: Boolean(body.priceOptions?.includesVAT),
          showPriceAsPOA: Boolean(body.priceOptions?.showPriceAsPOA),
          financeAvailable: Boolean(body.priceOptions?.financeAvailable),
          leaseAvailable: Boolean(body.priceOptions?.leaseAvailable),
          monthlyPayment: body.priceOptions?.monthlyPayment ? Number(body.priceOptions.monthlyPayment) : null,
          
          // Savings options
          originalPrice: body.priceOptions?.originalPrice ? Number(body.priceOptions.originalPrice) : null,
          savingsAmount: body.priceOptions?.savingsAmount ? Number(body.priceOptions.savingsAmount) : null,
          savingsPercentage: body.priceOptions?.savingsPercentage ? Number(body.priceOptions.savingsPercentage) : null,
          dealerDiscount: body.priceOptions?.dealerDiscount ? Number(body.priceOptions.dealerDiscount) : null,
          showSavings: Boolean(body.priceOptions?.showSavings),
          savingsDescription: body.priceOptions?.savingsDescription || null,
          exclusiveDeal: Boolean(body.priceOptions?.exclusiveDeal),
          savingsValidUntil: body.priceOptions?.savingsValidUntil ? new Date(body.priceOptions.savingsValidUntil) : null
        },
        
        // Features
        safetyFeatures: Array.isArray(body.safetyFeatures) ? body.safetyFeatures : [],
        comfortFeatures: Array.isArray(body.comfortFeatures) ? body.comfortFeatures : [],
        performanceFeatures: Array.isArray(body.performanceFeatures) ? body.performanceFeatures : [],
        entertainmentFeatures: Array.isArray(body.entertainmentFeatures) ? body.entertainmentFeatures : [],
        features: Array.isArray(body.features) ? body.features : [],
        
        // Vehicle Specifications
        specifications: {
          make: body.specifications?.make || '',
          model: body.specifications?.model || '',
          year: Number(body.specifications?.year) || new Date().getFullYear(),
          mileage: Number(body.specifications?.mileage) || 0,
          transmission: body.specifications?.transmission || '',
          fuelType: body.specifications?.fuelType || '',
          engineSize: body.specifications?.engineSize || '',
          power: body.specifications?.power || '',
          torque: body.specifications?.torque || '',
          drivetrain: body.specifications?.drivetrain || '',
          exteriorColor: body.specifications?.exteriorColor || '',
          interiorColor: body.specifications?.interiorColor || '',
          vin: body.specifications?.vin || ''
        },
        
        // Location Information
        location: {
          address: body.location?.address || '',
          city: body.location?.city || '',
          state: body.location?.state || '',
          country: body.location?.country || 'Botswana',
          postalCode: body.location?.postalCode || ''
        },
        
        // SEO Information
        seo: {
          metaTitle: body.seo?.metaTitle || body.title || '',
          metaDescription: body.seo?.metaDescription || body.shortDescription || '',
          keywords: Array.isArray(body.seo?.keywords) ? body.seo.keywords : []
        },
        
        // Service History
        serviceHistory: body.serviceHistory?.hasServiceHistory ? {
          hasServiceHistory: true,
          records: Array.isArray(body.serviceHistory.records) ? body.serviceHistory.records : []
        } : {
          hasServiceHistory: false,
          records: []
        },
        
        // Images (should be simple URL strings now)
        images: Array.isArray(body.images) ? body.images : [],
        primaryImageIndex: Number(body.primaryImageIndex) || 0,
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date(),
        
        // View and engagement metrics
        views: 0,
        saves: 0,
        contacts: 0,
        
        // Moderation and verification
        isVerified: false,
        moderationStatus: 'pending'
      };
      
      console.log(`[${timestamp}] Attempting to insert listing with slug: ${newListing.slug}`);
      
      // CHECK FOR DUPLICATE SLUG (extra safety)
      const existingListing = await listingsCollection.findOne({ slug: newListing.slug });
      if (existingListing) {
        // If somehow slug exists, add more uniqueness
        newListing.slug = `${newListing.slug}-${Math.random().toString(36).substring(2, 6)}`;
        console.log(`[${timestamp}] Slug collision detected, using: ${newListing.slug}`);
      }
      
      // INSERT LISTING INTO DATABASE
      const result = await listingsCollection.insertOne(newListing);
      
      console.log(`[${timestamp}] ✅ Listing created successfully: ${newListing.title} (ID: ${result.insertedId}, Slug: ${newListing.slug})`);
      
      // RETURN SUCCESS RESPONSE
      return res.status(201).json({
        success: true,
        message: 'Listing created successfully',
        data: {
          _id: result.insertedId,
          title: newListing.title,
          slug: newListing.slug,
          status: newListing.status,
          price: newListing.price,
          images: newListing.images,
          dealer: newListing.dealer,
          createdAt: newListing.createdAt,
          specifications: newListing.specifications
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Create listing error:`, error);
      
      // Handle specific MongoDB errors
      if (error.code === 11000) {
        // Duplicate key error
        const duplicateField = Object.keys(error.keyPattern || {})[0] || 'unknown';
        return res.status(400).json({
          success: false,
          message: `Duplicate ${duplicateField} - please use a different value`,
          error: 'DUPLICATE_KEY'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to create listing',
        error: error.message
      });
    }
  }

  // === GET ALL LISTINGS ===
  if (path === '/listings' && req.method === 'GET') {
    console.log(`[${timestamp}] → LISTINGS`);
    
    try {
      const listingsCollection = db.collection('listings');
      
      let filter = {};
      
      // Handle section filter
      const section = searchParams.get('section');
      if (section) {
        switch (section) {
          case 'premium':
            filter.$or = [
              { category: { $in: ['Luxury', 'Sports Car', 'Electric'] } },
              { price: { $gte: 500000 } },
              { 'specifications.make': { $in: ['BMW', 'Mercedes-Benz', 'Audi', 'Lexus', 'Porsche'] } }
            ];
            break;
          case 'savings':
            filter['priceOptions.showSavings'] = true;
            filter['priceOptions.savingsAmount'] = { $gt: 0 };
            break;
          case 'private':
            filter['dealer.sellerType'] = 'private';
            break;
        }
      }
      
      // Handle status filter
      if (searchParams.get('status') && searchParams.get('status') !== 'all') {
        filter.status = searchParams.get('status');
      } else {
        // Default to active listings
        filter.status = { $in: ['active', 'featured'] };
      }
      
      // Handle category filter
      if (searchParams.get('category') && searchParams.get('category') !== 'all') {
        filter.category = searchParams.get('category');
      }
      
      // Handle make filter
      if (searchParams.get('make') && searchParams.get('make') !== 'all') {
        filter['specifications.make'] = searchParams.get('make');
      }
      
      // Handle condition filter
      if (searchParams.get('condition') && searchParams.get('condition') !== 'all') {
        filter.condition = searchParams.get('condition');
      }
      
      // Handle search filter
      if (searchParams.get('search')) {
        const searchTerm = searchParams.get('search');
        const searchRegex = { $regex: searchTerm, $options: 'i' };
        filter.$or = [
          { title: searchRegex },
          { description: searchRegex },
          { 'specifications.make': searchRegex },
          { 'specifications.model': searchRegex },
          { category: searchRegex }
        ];
      }
      
      // Handle price range filter
      if (searchParams.get('minPrice') || searchParams.get('maxPrice')) {
        filter.price = {};
        if (searchParams.get('minPrice')) {
          filter.price.$gte = Number(searchParams.get('minPrice'));
        }
        if (searchParams.get('maxPrice')) {
          filter.price.$lte = Number(searchParams.get('maxPrice'));
        }
      }
      
      // Handle year range filter
      if (searchParams.get('minYear') || searchParams.get('maxYear')) {
        filter['specifications.year'] = {};
        if (searchParams.get('minYear')) {
          filter['specifications.year'].$gte = Number(searchParams.get('minYear'));
        }
        if (searchParams.get('maxYear')) {
          filter['specifications.year'].$lte = Number(searchParams.get('maxYear'));
        }
      }
      
      // Handle mileage filter
      if (searchParams.get('maxMileage')) {
        filter['specifications.mileage'] = { $lte: Number(searchParams.get('maxMileage')) };
      }
      
      // Handle transmission filter
      if (searchParams.get('transmission') && searchParams.get('transmission') !== 'all') {
        filter['specifications.transmission'] = searchParams.get('transmission');
      }
      
      // Handle fuel type filter
      if (searchParams.get('fuelType') && searchParams.get('fuelType') !== 'all') {
        filter['specifications.fuelType'] = searchParams.get('fuelType');
      }
      
      // Handle dealer filter
      if (searchParams.get('dealerId')) {
        const dealerId = searchParams.get('dealerId');
        if (dealerId.length === 24) {
          const { ObjectId } = await import('mongodb');
          filter.dealerId = new ObjectId(dealerId);
        } else {
          filter.dealerId = dealerId;
        }
      }
      
      // Handle featured filter
      if (searchParams.get('featured') === 'true') {
        filter.featured = true;
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      // Sorting
      let sort = { createdAt: -1 }; // default: newest first
      const sortParam = searchParams.get('sort');
      
      if (sortParam) {
        switch (sortParam) {
          case 'price_low':
            sort = { price: 1 };
            break;
          case 'price_high':
            sort = { price: -1 };
            break;
          case 'year_new':
            sort = { 'specifications.year': -1 };
            break;
          case 'year_old':
            sort = { 'specifications.year': 1 };
            break;
          case 'mileage_low':
            sort = { 'specifications.mileage': 1 };
            break;
          case 'mileage_high':
            sort = { 'specifications.mileage': -1 };
            break;
          case 'title':
            sort = { title: 1 };
            break;
          case 'featured':
            sort = { featured: -1, createdAt: -1 };
            break;
          default:
            // Keep default sorting
            break;
        }
      }
      
      console.log(`[${timestamp}] LISTINGS QUERY:`, {
        filter: filter,
        sort: sort,
        page: page,
        limit: limit
      });
      
      // Execute query
      const listings = await listingsCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      const total = await listingsCollection.countDocuments(filter);
      
      console.log(`[${timestamp}] Found ${listings.length} listings (${total} total)`);
      
      return res.status(200).json({
        success: true,
        data: listings,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        section: section || 'all',
        message: `Found ${listings.length} listings`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Listings fetch error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching listings',
        error: error.message
      });
    }
  }

  // === FEATURED LISTINGS ===
  if (path === '/listings/featured' && req.method === 'GET') {
    console.log(`[${timestamp}] → FEATURED LISTINGS`);
    
    try {
      const listingsCollection = db.collection('listings');
      
      const limit = parseInt(searchParams.get('limit')) || 6;
      
      let featuredListings = await listingsCollection.find({ 
        featured: true,
        status: 'active'
      }).limit(limit).sort({ createdAt: -1 }).toArray();
      
      if (featuredListings.length === 0) {
        featuredListings = await listingsCollection.find({
          $or: [
            { price: { $gte: 300000 } },
            { 'priceOptions.showSavings': true }
          ],
          status: 'active'
        }).limit(limit).sort({ price: -1, createdAt: -1 }).toArray();
      }
      
      return res.status(200).json({
        success: true,
        count: featuredListings.length,
        data: featuredListings,
        message: `Found ${featuredListings.length} featured listings`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Featured listings error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching featured listings',
        error: error.message
      });
    }
  }

  // === BUSINESS CARD DEALER LISTINGS ===
  if (path.includes('/listings/dealer/')) {
    const dealerId = path.replace('/listings/dealer/', '').split('?')[0];
    const callId = Math.random().toString(36).substr(2, 9);
    console.log(`[${timestamp}] [CALL-${callId}] → BUSINESS CARD LISTINGS: "${dealerId}"`);
    
    try {
      const listingsCollection = db.collection('listings');
      const { ObjectId } = await import('mongodb');
      
      let foundListings = [];
      let successStrategy = null;
      
      if (dealerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(dealerId)) {
        try {
          const dealerObjectId = new ObjectId(dealerId);
          const objectIdListings = await listingsCollection.find({ 
            dealerId: dealerObjectId 
          }).toArray();
          
          if (objectIdListings.length > 0) {
            foundListings = objectIdListings;
            successStrategy = 'objectId_direct';
          }
        } catch (objectIdError) {
          console.log(`[${timestamp}] [CALL-${callId}] ObjectId conversion failed: ${objectIdError.message}`);
        }
      }
      
      if (foundListings.length === 0) {
        try {
          const stringListings = await listingsCollection.find({ dealerId: dealerId }).toArray();
          if (stringListings.length > 0) {
            foundListings = stringListings;
            successStrategy = 'string_direct';
          }
        } catch (stringError) {
          console.log(`[${timestamp}] [CALL-${callId}] String match failed: ${stringError.message}`);
        }
      }
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const paginatedListings = foundListings.slice(skip, skip + limit);
      const total = foundListings.length;
      
      return res.status(200).json({
        success: true,
        data: paginatedListings,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        dealerId: dealerId,
        debug: {
          callId: callId,
          timestamp: timestamp,
          totalFound: total,
          successStrategy: successStrategy
        },
        message: `Business card: ${paginatedListings.length} listings found for dealer`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] [CALL-${callId}] Business card error:`, error);
      return res.status(200).json({
        success: true,
        data: [],
        pagination: { currentPage: 1, totalPages: 0, total: 0 },
        dealerId: dealerId,
        error: error.message,
        message: 'Error occurred while fetching dealer listings'
      });
    }
  }

  // === UPDATE LISTING STATUS ===
  if (path.match(/^\/listings\/[a-fA-F0-9]{24}\/status\/[a-zA-Z]+$/) && req.method === 'PUT') {
    const pathParts = path.split('/');
    const listingId = pathParts[2];
    const newStatus = pathParts[4]; // active, inactive, pending, sold, deleted
    console.log(`[${timestamp}] → UPDATE LISTING STATUS: ${listingId} to ${newStatus}`);
    
    try {
      const listingsCollection = db.collection('listings');
      const { ObjectId } = await import('mongodb');
      
      const existingListing = await listingsCollection.findOne({ 
        _id: new ObjectId(listingId) 
      });
      
      if (!existingListing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found'
        });
      }
      
      const result = await listingsCollection.updateOne(
        { _id: new ObjectId(listingId) },
        { 
          $set: { 
            status: newStatus,
            updatedAt: new Date()
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ Listing status updated: ${existingListing.title} → ${newStatus}`);
      
      return res.status(200).json({
        success: true,
        message: `Listing status updated to ${newStatus}`,
        data: {
          id: listingId,
          title: existingListing.title,
          status: newStatus,
          updatedAt: new Date()
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Update listing status error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update listing status',
        error: error.message
      });
    }
  }

  // === TOGGLE LISTING FEATURED ===
  if (path.match(/^\/listings\/[a-fA-F0-9]{24}\/featured\/[a-zA-Z]+$/) && req.method === 'PUT') {
    const pathParts = path.split('/');
    const listingId = pathParts[2];
    const featuredStatus = pathParts[4] === 'true' || pathParts[4] === 'on'; // true/false
    console.log(`[${timestamp}] → TOGGLE LISTING FEATURED: ${listingId} to ${featuredStatus}`);
    
    try {
      const listingsCollection = db.collection('listings');
      const { ObjectId } = await import('mongodb');
      
      const existingListing = await listingsCollection.findOne({ 
        _id: new ObjectId(listingId) 
      });
      
      if (!existingListing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found'
        });
      }
      
      const result = await listingsCollection.updateOne(
        { _id: new ObjectId(listingId) },
        { 
          $set: { 
            featured: featuredStatus,
            updatedAt: new Date()
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ Listing featured updated: ${existingListing.title} → ${featuredStatus}`);
      
      return res.status(200).json({
        success: true,
        message: `Listing ${featuredStatus ? 'featured' : 'unfeatured'} successfully`,
        data: {
          id: listingId,
          title: existingListing.title,
          featured: featuredStatus,
          updatedAt: new Date()
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Toggle listing featured error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to toggle listing featured status',
        error: error.message
      });
    }
  }

  // === INDIVIDUAL LISTING ===
  if (path.includes('/listings/') && !path.includes('/listings/dealer/') && !path.includes('/listings/featured') && path !== '/listings') {
    const listingId = path.replace('/listings/', '');
    console.log(`[${timestamp}] → INDIVIDUAL LISTING: "${listingId}"`);
    
    try {
      const listingsCollection = db.collection('listings');
      const { ObjectId } = await import('mongodb');
      
      let listing = null;
      
      // Try to find by slug first (for SEO-friendly URLs)
      if (!listingId.match(/^[0-9a-fA-F]{24}$/)) {
        listing = await listingsCollection.findOne({ slug: listingId });
      }
      
      // Try to find by string ID
      if (!listing) {
        listing = await listingsCollection.findOne({ _id: listingId });
      }
      
      // Try to find by ObjectId if string search fails
      if (!listing && listingId.length === 24) {
        try {
          listing = await listingsCollection.findOne({ _id: new ObjectId(listingId) });
        } catch (oidError) {
          console.log(`[${timestamp}] Listing ObjectId failed: ${oidError.message}`);
        }
      }
      
      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found',
          listingId: listingId
        });
      }
      
      // Increment view count
      try {
        await listingsCollection.updateOne(
          { _id: listing._id },
          { $inc: { views: 1 } }
        );
      } catch (viewError) {
        console.log(`[${timestamp}] Failed to increment view count:`, viewError.message);
      }
      
      return res.status(200).json({
        success: true,
        data: listing,
        message: `Found listing: ${listing.title}`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Listing lookup failed:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching listing',
        error: error.message
      });
    }
  }

  // If no listing endpoint matched, return null
  return null;
};
