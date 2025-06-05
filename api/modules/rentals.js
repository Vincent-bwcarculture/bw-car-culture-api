// rentals.js - All Rental Vehicle Related APIs

export const handleRentals = async (req, res, db, path, searchParams, timestamp) => {
  // Only handle rental-related paths
  if (!path.includes('/rentals')) return null;

  console.log(`[${timestamp}] → RENTALS: ${path}`);

  // === GET RENTAL VEHICLES ===
  if (path === '/rentals' && req.method === 'GET') {
    console.log(`[${timestamp}] → RENTALS`);
    
    try {
      const rentalsCollection = db.collection('rentalvehicles');
      
      let filter = {};
      
      // Handle status filter
      if (searchParams.get('status') && searchParams.get('status') !== 'all') {
        filter.status = searchParams.get('status');
      } else {
        // Default to available vehicles
        filter.status = { $in: ['available', 'reserved'] };
      }
      
      // Handle vehicle type filter
      if (searchParams.get('vehicleType') && searchParams.get('vehicleType') !== 'all') {
        filter.vehicleType = searchParams.get('vehicleType');
      }
      
      // Handle provider filter
      if (searchParams.get('provider')) {
        filter.provider = searchParams.get('provider');
      }
      
      // Handle location filter
      if (searchParams.get('location')) {
        const locationRegex = { $regex: searchParams.get('location'), $options: 'i' };
        filter.$or = [
          { 'location.city': locationRegex },
          { 'location.address': locationRegex },
          { 'pickupLocations.city': locationRegex }
        ];
      }
      
      // Handle search filter
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { make: searchRegex },
          { model: searchRegex },
          { description: searchRegex },
          { features: { $in: [searchRegex] } }
        ];
      }
      
      // Handle price range filter
      if (searchParams.get('minPrice') || searchParams.get('maxPrice')) {
        filter['pricing.dailyRate'] = {};
        if (searchParams.get('minPrice')) {
          filter['pricing.dailyRate'].$gte = Number(searchParams.get('minPrice'));
        }
        if (searchParams.get('maxPrice')) {
          filter['pricing.dailyRate'].$lte = Number(searchParams.get('maxPrice'));
        }
      }
      
      // Handle capacity filter
      if (searchParams.get('minSeats')) {
        filter.capacity = { $gte: Number(searchParams.get('minSeats')) };
      }
      
      // Handle transmission filter
      if (searchParams.get('transmission') && searchParams.get('transmission') !== 'all') {
        filter.transmission = searchParams.get('transmission');
      }
      
      // Handle fuel type filter
      if (searchParams.get('fuelType') && searchParams.get('fuelType') !== 'all') {
        filter.fuelType = searchParams.get('fuelType');
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 20;
      const skip = (page - 1) * limit;
      
      // Sorting
      let sort = { createdAt: -1 }; // default: newest first
      const sortParam = searchParams.get('sort');
      
      if (sortParam) {
        switch (sortParam) {
          case 'price_low':
            sort = { 'pricing.dailyRate': 1 };
            break;
          case 'price_high':
            sort = { 'pricing.dailyRate': -1 };
            break;
          case 'rating':
            sort = { 'rating.average': -1 };
            break;
          case 'capacity':
            sort = { capacity: -1 };
            break;
          case 'year':
            sort = { year: -1 };
            break;
          default:
            // Keep default sorting
            break;
        }
      }
      
      console.log(`[${timestamp}] RENTALS QUERY:`, {
        filter: filter,
        sort: sort,
        page: page,
        limit: limit
      });
      
      // Execute query
      const vehicles = await rentalsCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      const total = await rentalsCollection.countDocuments(filter);
      
      console.log(`[${timestamp}] Found ${vehicles.length} rental vehicles (${total} total)`);
      
      return res.status(200).json({
        success: true,
        data: vehicles,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `Found ${vehicles.length} rental vehicles`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Rentals fetch error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching rental vehicles',
        error: error.message
      });
    }
  }

  // === CREATE RENTAL VEHICLE ===
  if (path === '/rentals' && req.method === 'POST') {
    try {
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
      
      console.log(`[${timestamp}] Creating rental vehicle: ${body.make} ${body.model}`);
      
      const rentalsCollection = db.collection('rentalvehicles');
      const { ObjectId } = await import('mongodb');
      
      // Validate required fields
      const requiredFields = ['make', 'model', 'year', 'provider'];
      const missingFields = requiredFields.filter(field => !body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }
      
      const newVehicle = {
        _id: new ObjectId(),
        make: body.make,
        model: body.model,
        year: Number(body.year),
        vehicleType: body.vehicleType || 'car',
        category: body.category || 'economy',
        description: body.description || '',
        capacity: Number(body.capacity) || 5,
        doors: Number(body.doors) || 4,
        transmission: body.transmission || 'automatic',
        fuelType: body.fuelType || 'petrol',
        airConditioning: Boolean(body.airConditioning),
        
        // Provider information
        provider: body.provider,
        providerId: body.providerId ? (body.providerId.length === 24 ? new ObjectId(body.providerId) : body.providerId) : null,
        
        // Pricing
        pricing: {
          dailyRate: Number(body.pricing?.dailyRate) || 0,
          weeklyRate: Number(body.pricing?.weeklyRate) || 0,
          monthlyRate: Number(body.pricing?.monthlyRate) || 0,
          currency: body.pricing?.currency || 'BWP',
          deposit: Number(body.pricing?.deposit) || 0,
          mileageLimit: Number(body.pricing?.mileageLimit) || 200,
          extraMileageRate: Number(body.pricing?.extraMileageRate) || 2
        },
        
        // Location
        location: {
          address: body.location?.address || '',
          city: body.location?.city || '',
          state: body.location?.state || '',
          country: body.location?.country || 'Botswana',
          coordinates: body.location?.coordinates || { lat: 0, lng: 0 }
        },
        
        pickupLocations: Array.isArray(body.pickupLocations) ? body.pickupLocations : [],
        
        // Features and specifications
        features: Array.isArray(body.features) ? body.features : [],
        images: Array.isArray(body.images) ? body.images : [],
        
        // Terms and conditions
        terms: {
          minimumAge: Number(body.terms?.minimumAge) || 21,
          licenseRequired: body.terms?.licenseRequired || 'full',
          insuranceIncluded: Boolean(body.terms?.insuranceIncluded),
          cancellationPolicy: body.terms?.cancellationPolicy || 'standard'
        },
        
        // Availability and status
        status: body.status || 'available',
        availability: {
          available: Boolean(body.availability?.available !== false),
          availableFrom: body.availability?.availableFrom ? new Date(body.availability.availableFrom) : new Date(),
          availableUntil: body.availability?.availableUntil ? new Date(body.availability.availableUntil) : null
        },
        
        // Rating and reviews
        rating: {
          average: 0,
          totalReviews: 0
        },
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await rentalsCollection.insertOne(newVehicle);
      
      console.log(`[${timestamp}] ✅ Rental vehicle created: ${newVehicle.make} ${newVehicle.model} (ID: ${result.insertedId})`);
      
      return res.status(201).json({
        success: true,
        message: 'Rental vehicle created successfully',
        data: {
          id: result.insertedId,
          make: newVehicle.make,
          model: newVehicle.model,
          year: newVehicle.year,
          status: newVehicle.status,
          createdAt: newVehicle.createdAt
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Create rental vehicle error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create rental vehicle',
        error: error.message
      });
    }
  }

  // === UPDATE RENTAL VEHICLE ===
  if (path.match(/^\/rentals\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
    const vehicleId = path.split('/').pop();
    console.log(`[${timestamp}] → UPDATE RENTAL VEHICLE ${vehicleId}`);
    
    try {
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
      
      const rentalsCollection = db.collection('rentalvehicles');
      const { ObjectId } = await import('mongodb');
      
      const updateData = {
        ...body,
        updatedAt: new Date()
      };
      
      // Handle providerId conversion
      if (body.providerId && body.providerId.length === 24) {
        updateData.providerId = new ObjectId(body.providerId);
      }
      
      const result = await rentalsCollection.updateOne(
        { _id: new ObjectId(vehicleId) },
        { $set: updateData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Rental vehicle not found'
        });
      }
      
      const updatedVehicle = await rentalsCollection.findOne({ 
        _id: new ObjectId(vehicleId) 
      });
      
      console.log(`[${timestamp}] ✅ Rental vehicle updated: ${vehicleId}`);
      
      return res.status(200).json({
        success: true,
        message: 'Rental vehicle updated successfully',
        data: updatedVehicle
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Update rental vehicle error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update rental vehicle',
        error: error.message
      });
    }
  }

  // === DELETE RENTAL VEHICLE ===
  if (path.match(/^\/rentals\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
    const vehicleId = path.split('/').pop();
    console.log(`[${timestamp}] → DELETE RENTAL VEHICLE ${vehicleId}`);
    
    try {
      const rentalsCollection = db.collection('rentalvehicles');
      const { ObjectId } = await import('mongodb');
      
      // Check if vehicle exists
      const existingVehicle = await rentalsCollection.findOne({ 
        _id: new ObjectId(vehicleId) 
      });
      
      if (!existingVehicle) {
        return res.status(404).json({
          success: false,
          message: 'Rental vehicle not found'
        });
      }
      
      // Soft delete - mark as deleted
      const result = await rentalsCollection.updateOne(
        { _id: new ObjectId(vehicleId) },
        { 
          $set: { 
            status: 'deleted',
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ Rental vehicle deleted: ${existingVehicle.make} ${existingVehicle.model}`);
      
      return res.status(200).json({
        success: true,
        message: 'Rental vehicle deleted successfully',
        data: { 
          id: vehicleId, 
          vehicle: `${existingVehicle.make} ${existingVehicle.model}`,
          deletedAt: new Date() 
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Delete rental vehicle error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete rental vehicle',
        error: error.message
      });
    }
  }

  // === INDIVIDUAL RENTAL VEHICLE ===
  if (path.includes('/rentals/') && path !== '/rentals') {
    const vehicleId = path.replace('/rentals/', '').split('?')[0];
    console.log(`[${timestamp}] → INDIVIDUAL RENTAL: "${vehicleId}"`);
    
    try {
      const rentalsCollection = db.collection('rentalvehicles');
      const { ObjectId } = await import('mongodb');
      
      let vehicle = null;
      
      try {
        vehicle = await rentalsCollection.findOne({ _id: vehicleId });
      } catch (stringError) {
        console.log(`[${timestamp}] Rental string lookup failed`);
      }
      
      if (!vehicle && vehicleId.length === 24 && /^[0-9a-fA-F]{24}$/.test(vehicleId)) {
        try {
          vehicle = await rentalsCollection.findOne({ _id: new ObjectId(vehicleId) });
        } catch (objectIdError) {
          console.log(`[${timestamp}] Rental ObjectId lookup failed`);
        }
      }
      
      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: 'Rental vehicle not found',
          vehicleId: vehicleId
        });
      }
      
      return res.status(200).json({
        success: true,
        data: vehicle,
        message: `Found rental vehicle: ${vehicle.make} ${vehicle.model}`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Rental lookup error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching rental vehicle',
        error: error.message
      });
    }
  }

  // If no rental endpoint matched, return null
  return null;
};
