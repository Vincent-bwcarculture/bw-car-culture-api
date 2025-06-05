// providers.js - All Service Provider Related APIs

export const handleProviders = async (req, res, db, path, searchParams, timestamp) => {
  // Only handle provider-related paths
  if (!path.includes('/providers') && !path.includes('/service-providers') && !path.includes('/services')) return null;

  console.log(`[${timestamp}] → PROVIDERS: ${path}`);

  // === CREATE SERVICE PROVIDER WITH FILE UPLOADS ===
  if (path === '/providers' && req.method === 'POST') {
    try {
      console.log(`[${timestamp}] → CREATE SERVICE PROVIDER WITH FILES`);
      
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);
      
      const contentType = req.headers['content-type'] || '';
      
      if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({
          success: false,
          message: 'Expected multipart/form-data'
        });
      }
      
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      if (!boundaryMatch) {
        return res.status(400).json({
          success: false,
          message: 'No boundary found in multipart data'
        });
      }
      
      const boundary = boundaryMatch[1];
      const bodyString = rawBody.toString('binary');
      const parts = bodyString.split(`--${boundary}`);
      
      let providerData = {};
      const files = {}; // Store uploaded files
      
      // Parse each part of the multipart data
      for (const part of parts) {
        if (part.includes('Content-Disposition: form-data')) {
          const nameMatch = part.match(/name="([^"]+)"/);
          if (!nameMatch) continue;
          
          const fieldName = nameMatch[1];
          const isFile = part.includes('filename=');
          
          if (isFile) {
            // Handle file upload
            const filenameMatch = part.match(/filename="([^"]+)"/);
            if (!filenameMatch || !filenameMatch[1]) continue;
            
            const filename = filenameMatch[1];
            const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
            const fileType = contentTypeMatch ? contentTypeMatch[1].trim() : 'image/jpeg';
            
            const dataStart = part.indexOf('\r\n\r\n');
            if (dataStart !== -1) {
              const fileData = part.substring(dataStart + 4);
              const cleanData = fileData.replace(/\r\n$/, '').replace(/\r\n--$/, '');
              const fileBuffer = Buffer.from(cleanData, 'binary');
              
              if (fileBuffer.length > 100) { // Skip very small files
                files[fieldName] = {
                  filename: filename,
                  buffer: fileBuffer,
                  mimetype: fileType,
                  size: fileBuffer.length
                };
                console.log(`[${timestamp}] Found file: ${fieldName} (${filename}, ${fileBuffer.length} bytes)`);
              }
            }
          } else {
            // Handle regular form field
            const dataStart = part.indexOf('\r\n\r\n');
            if (dataStart !== -1) {
              const fieldValue = part.substring(dataStart + 4).replace(/\r\n$/, '').trim();
              
              // Try to parse JSON fields
              if (['contact', 'location', 'profile', 'social'].includes(fieldName)) {
                try {
                  providerData[fieldName] = JSON.parse(fieldValue);
                } catch (e) {
                  providerData[fieldName] = fieldValue;
                }
              } else {
                providerData[fieldName] = fieldValue;
              }
            }
          }
        }
      }
      
      console.log(`[${timestamp}] Parsed data:`, {
        businessName: providerData.businessName,
        filesFound: Object.keys(files),
        totalFields: Object.keys(providerData).length
      });
      
      // Upload files to S3
      const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
      const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
      const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
      const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
      
      const uploadedImages = {};
      
      if (awsAccessKey && awsSecretKey) {
        // Real S3 uploads
        try {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          
          const s3Client = new S3Client({
            region: awsRegion,
            credentials: {
              accessKeyId: awsAccessKey,
              secretAccessKey: awsSecretKey,
            },
          });
          
          for (const [fieldName, file] of Object.entries(files)) {
            try {
              const timestamp_ms = Date.now();
              const randomString = Math.random().toString(36).substring(2, 8);
              const fileExtension = file.filename.split('.').pop() || 'jpg';
              const s3Filename = `images/providers/provider-${timestamp_ms}-${randomString}-${fieldName}.${fileExtension}`;
              
              const uploadCommand = new PutObjectCommand({
                Bucket: awsBucket,
                Key: s3Filename,
                Body: file.buffer,
                ContentType: file.mimetype,
              });
              
              await s3Client.send(uploadCommand);
              
              const imageUrl = `https://${awsBucket}.s3.amazonaws.com/${s3Filename}`;
              uploadedImages[fieldName] = imageUrl;
              
              console.log(`[${timestamp}] ✅ Uploaded ${fieldName}: ${imageUrl}`);
            } catch (fileError) {
              console.error(`[${timestamp}] Failed to upload ${fieldName}:`, fileError.message);
            }
          }
        } catch (s3Error) {
          console.error(`[${timestamp}] S3 setup error:`, s3Error.message);
        }
      } else {
        // Mock URLs for development
        for (const fieldName of Object.keys(files)) {
          uploadedImages[fieldName] = `https://${awsBucket}.s3.amazonaws.com/images/providers/mock-${fieldName}-${Date.now()}.jpg`;
        }
      }
      
      // Create provider with uploaded image URLs
      const providersCollection = db.collection('serviceproviders');
      const { ObjectId } = await import('mongodb');
      
      const newProvider = {
        _id: new ObjectId(),
        businessName: providerData.businessName || '',
        providerType: providerData.providerType || 'general',
        businessType: providerData.businessType || 'other',
        user: providerData.user ? (providerData.user.length === 24 ? new ObjectId(providerData.user) : providerData.user) : null,
        
        contact: {
          phone: providerData.contact?.phone || '',
          email: providerData.contact?.email || '',
          website: providerData.contact?.website || ''
        },
        
        location: {
          address: providerData.location?.address || '',
          city: providerData.location?.city || '',
          state: providerData.location?.state || '',
          country: providerData.location?.country || 'Botswana',
          postalCode: providerData.location?.postalCode || '',
          coordinates: {
            type: 'Point',
            coordinates: [0, 0]
          }
        },
        
        profile: {
          description: providerData.profile?.description || '',
          specialties: providerData.profile?.specialties || [],
          logo: uploadedImages.logo || '', // ← Set uploaded logo URL
          banner: uploadedImages.banner || '', // ← Set uploaded banner URL
          workingHours: providerData.profile?.workingHours || {
            monday: { open: '08:00', close: '17:00' },
            tuesday: { open: '08:00', close: '17:00' },
            wednesday: { open: '08:00', close: '17:00' },
            thursday: { open: '08:00', close: '17:00' },
            friday: { open: '08:00', close: '17:00' },
            saturday: { open: '09:00', close: '13:00' },
            sunday: { open: '', close: '' }
          }
        },
        
        social: {
          facebook: providerData.social?.facebook || '',
          instagram: providerData.social?.instagram || '',
          twitter: providerData.social?.twitter || '',
          whatsapp: providerData.social?.whatsapp || ''
        },
        
        carRental: {
          minimumRentalPeriod: 1,
          depositRequired: true,
          insuranceIncluded: true
        },
        
        trailerRental: {
          requiresVehicleInspection: true,
          towingCapacityRequirement: true,
          deliveryAvailable: false,
          deliveryFee: 0
        },
        
        publicTransport: {
          licensedOperator: true
        },
        
        workshop: {
          warrantyOffered: true,
          certifications: []
        },
        
        subscription: {
          features: {
            maxListings: 10,
            allowPhotography: true,
            allowReviews: false,
            allowPodcasts: false,
            allowVideos: false
          },
          tier: 'basic',
          status: 'active',
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          paymentHistory: []
        },
        
        verification: {
          status: 'pending',
          documents: [],
          verifiedAt: null,
          verifiedBy: null
        },
        
        status: providerData.status || 'active',
        
        metrics: {
          totalListings: 0,
          activeSales: 0,
          averageRating: 0,
          totalReviews: 0
        },
        
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0
      };
      
      const result = await providersCollection.insertOne(newProvider);
      
      console.log(`[${timestamp}] ✅ Service provider created with images: ${newProvider.businessName}`);
      console.log(`[${timestamp}] Images uploaded: ${Object.keys(uploadedImages).join(', ')}`);
      
      return res.status(201).json({
        success: true,
        message: 'Service provider created successfully with images',
        data: { ...newProvider, _id: result.insertedId },
        uploadedImages: uploadedImages
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Create service provider with files error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create service provider with files',
        error: error.message
      });
    }
  }

  // === UPDATE SERVICE PROVIDER ===
  if (path.match(/^\/providers\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
    const providerId = path.split('/').pop();
    console.log(`[${timestamp}] → UPDATE SERVICE PROVIDER ${providerId}`);
    
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
      
      const providersCollection = db.collection('serviceproviders');
      const { ObjectId } = await import('mongodb');
      
      const updateData = {
        ...body,
        updatedAt: new Date()
      };
      
      const result = await providersCollection.updateOne(
        { _id: new ObjectId(providerId) },
        { $set: updateData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Service provider not found'
        });
      }
      
      const updatedProvider = await providersCollection.findOne({ 
        _id: new ObjectId(providerId) 
      });
      
      console.log(`[${timestamp}] ✅ Service provider updated: ${providerId}`);
      
      return res.status(200).json({
        success: true,
        message: 'Service provider updated successfully',
        data: updatedProvider
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Update service provider error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update service provider',
        error: error.message
      });
    }
  }

  // === VERIFY SERVICE PROVIDER ===
  if (path.match(/^\/providers\/[a-fA-F0-9]{24}\/verify$/) && req.method === 'PUT') {
    const providerId = path.split('/')[2];
    console.log(`[${timestamp}] → VERIFY SERVICE PROVIDER ${providerId}`);
    
    try {
      const providersCollection = db.collection('serviceproviders');
      const { ObjectId } = await import('mongodb');
      
      const existingProvider = await providersCollection.findOne({ 
        _id: new ObjectId(providerId) 
      });
      
      if (!existingProvider) {
        return res.status(404).json({
          success: false,
          message: 'Service provider not found'
        });
      }
      
      const verificationData = {
        verification: {
          status: 'verified',
          verifiedAt: new Date(),
          verifiedBy: 'system', // You can change this to actual admin user ID
          documents: []
        },
        updatedAt: new Date()
      };
      
      const result = await providersCollection.updateOne(
        { _id: new ObjectId(providerId) },
        { $set: verificationData }
      );
      
      const updatedProvider = await providersCollection.findOne({ 
        _id: new ObjectId(providerId) 
      });
      
      console.log(`[${timestamp}] ✅ Service provider verified: ${existingProvider.businessName}`);
      
      return res.status(200).json({
        success: true,
        message: 'Service provider verified successfully',
        data: updatedProvider
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Verify service provider error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify service provider',
        error: error.message
      });
    }
  }

  // === DELETE SERVICE PROVIDER ===
  if (path.match(/^\/providers\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
    const providerId = path.split('/').pop();
    console.log(`[${timestamp}] → DELETE SERVICE PROVIDER ${providerId}`);
    
    try {
      const providersCollection = db.collection('serviceproviders');
      const { ObjectId } = await import('mongodb');
      
      // Validate provider ID
      if (!providerId || providerId.length !== 24) {
        return res.status(400).json({
          success: false,
          message: 'Invalid provider ID format',
          providerId: providerId
        });
      }
      
      // Check if provider exists first
      let existingProvider;
      try {
        existingProvider = await providersCollection.findOne({ 
          _id: new ObjectId(providerId) 
        });
      } catch (findError) {
        console.error(`[${timestamp}] Error finding provider:`, findError);
        return res.status(400).json({
          success: false,
          message: 'Invalid provider ID',
          error: findError.message
        });
      }
      
      if (!existingProvider) {
        console.log(`[${timestamp}] Provider not found for deletion: ${providerId}`);
        return res.status(404).json({
          success: false,
          message: 'Service provider not found',
          providerId: providerId
        });
      }
      
      console.log(`[${timestamp}] Found provider to delete: ${existingProvider.businessName}`);
      
      // Perform soft delete - mark as deleted
      const deleteData = {
        status: 'deleted',
        deletedAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await providersCollection.updateOne(
        { _id: new ObjectId(providerId) },
        { $set: deleteData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Service provider not found during update',
          providerId: providerId
        });
      }
      
      console.log(`[${timestamp}] ✅ Service provider deleted: ${existingProvider.businessName}`);
      
      return res.status(200).json({
        success: true,
        message: 'Service provider deleted successfully',
        data: { 
          id: providerId, 
          businessName: existingProvider.businessName,
          deletedAt: deleteData.deletedAt
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Delete service provider error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete service provider',
        error: error.message,
        providerId: providerId
      });
    }
  }

  // === UPDATE SERVICE PROVIDER STATUS ===
  if (path.match(/^\/providers\/[a-fA-F0-9]{24}\/status\/[a-zA-Z]+$/) && req.method === 'PUT') {
    const pathParts = path.split('/');
    const providerId = pathParts[2];
    const newStatus = pathParts[4]; // active, inactive, pending, suspended
    console.log(`[${timestamp}] → UPDATE PROVIDER STATUS: ${providerId} to ${newStatus}`);
    
    try {
      const providersCollection = db.collection('serviceproviders');
      const { ObjectId } = await import('mongodb');
      
      const existingProvider = await providersCollection.findOne({ 
        _id: new ObjectId(providerId) 
      });
      
      if (!existingProvider) {
        return res.status(404).json({
          success: false,
          message: 'Service provider not found'
        });
      }
      
      const result = await providersCollection.updateOne(
        { _id: new ObjectId(providerId) },
        { 
          $set: { 
            status: newStatus,
            updatedAt: new Date()
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ Provider status updated: ${existingProvider.businessName} → ${newStatus}`);
      
      return res.status(200).json({
        success: true,
        message: `Provider status updated to ${newStatus}`,
        data: {
          id: providerId,
          businessName: existingProvider.businessName,
          status: newStatus,
          updatedAt: new Date()
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Update provider status error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update provider status',
        error: error.message
      });
    }
  }

  // === GET SERVICE PROVIDERS ===
  if ((path === '/providers' || path === '/service-providers') && req.method === 'GET') {
    console.log(`[${timestamp}] → PROVIDERS (${path})`);
    
    try {
      const serviceProvidersCollection = db.collection('serviceproviders');
      
      let filter = {};
      
      // Handle status filter (from admin panel)
      if (searchParams.get('status') && searchParams.get('status') !== 'all') {
        filter.status = searchParams.get('status');
      }
      
      // Handle subscription status filter (from admin panel) 
      if (searchParams.get('subscriptionStatus') && searchParams.get('subscriptionStatus') !== 'all') {
        filter['subscription.status'] = searchParams.get('subscriptionStatus');
      }
      
      // Handle provider type filter
      if (searchParams.get('providerType')) {
        filter.providerType = searchParams.get('providerType');
      }
      
      // Handle business type filter
      if (searchParams.get('businessType') && searchParams.get('businessType') !== 'all') {
        filter.businessType = searchParams.get('businessType');
      }
      
      // Handle search filter
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { businessName: searchRegex },
          { 'profile.description': searchRegex },
          { 'profile.specialties': { $in: [searchRegex] } },
          { 'location.city': searchRegex }
        ];
      }
      
      // Handle city filter
      if (searchParams.get('city')) {
        filter['location.city'] = { $regex: searchParams.get('city'), $options: 'i' };
      }
      
      // Handle pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 12;
      const skip = (page - 1) * limit;
      
      // Handle sorting
      let sort = { businessName: 1 }; // default sort
      const sortParam = searchParams.get('sort') || searchParams.get('sortBy');
      
      if (sortParam) {
        switch (sortParam) {
          case 'newest':
          case '-createdAt':
            sort = { createdAt: -1 };
            break;
          case 'oldest':
          case 'createdAt':
            sort = { createdAt: 1 };
            break;
          case 'businessName':
            sort = { businessName: 1 };
            break;
          case 'subscriptionExpiry':
          case 'subscription.expiresAt':
            sort = { 'subscription.expiresAt': 1 };
            break;
          default:
            if (sortParam.startsWith('-')) {
              const field = sortParam.substring(1);
              sort = { [field]: -1 };
            } else {
              sort = { [sortParam]: 1 };
            }
        }
      }
      
      console.log(`[${timestamp}] PROVIDERS QUERY:`, {
        filter: filter,
        sort: sort,
        page: page,
        limit: limit
      });
      
      // Execute query
      const providers = await serviceProvidersCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      const total = await serviceProvidersCollection.countDocuments(filter);
      
      console.log(`[${timestamp}] Found ${providers.length} providers via ${path} (${total} total)`);
      
      return res.status(200).json({
        success: true,
        data: providers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `Found ${providers.length} providers (${total} total)`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Providers error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching providers',
        error: error.message
      });
    }
  }

  // === PROVIDERS/ALL (FRONTEND EXPECTS THIS) ===
  if (path === '/providers/all' && req.method === 'GET') {
    console.log(`[${timestamp}] → PROVIDERS/ALL (new endpoint)`);
    
    try {
      const serviceProvidersCollection = db.collection('serviceproviders');
      
      let filter = { status: 'active' };
      
      // Handle type filter for transport providers
      if (searchParams.get('type') === 'public_transport') {
        filter.providerType = { $in: ['public_transport', 'transport', 'bus', 'taxi'] };
      }
      
      const providers = await serviceProvidersCollection.find(filter)
        .sort({ businessName: 1 })
        .toArray();
      
      return res.status(200).json({
        success: true,
        providers: providers, // Frontend expects 'providers' not 'data'
        total: providers.length
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Providers/all error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching transport providers',
        error: error.message
      });
    }
  }

  // === PROVIDERS/PAGE (FRONTEND EXPECTS THIS PATH) ===
  if (path === '/providers/page' && req.method === 'GET') {
    console.log(`[${timestamp}] → PROVIDERS/PAGE (frontend alias)`);
    
    try {
      const serviceProvidersCollection = db.collection('serviceproviders');
      
      let filter = {};
      
      // Handle status filter (from admin panel)
      if (searchParams.get('status') && searchParams.get('status') !== 'all') {
        filter.status = searchParams.get('status');
      }
      
      // Handle subscription status filter (from admin panel) 
      if (searchParams.get('subscriptionStatus') && searchParams.get('subscriptionStatus') !== 'all') {
        filter['subscription.status'] = searchParams.get('subscriptionStatus');
      }
      
      // Handle provider type filter
      if (searchParams.get('providerType')) {
        filter.providerType = searchParams.get('providerType');
      }
      
      // Handle business type filter
      if (searchParams.get('businessType') && searchParams.get('businessType') !== 'all') {
        filter.businessType = searchParams.get('businessType');
      }
      
      // Handle search filter
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { businessName: searchRegex },
          { 'profile.description': searchRegex },
          { 'profile.specialties': { $in: [searchRegex] } },
          { 'location.city': searchRegex }
        ];
      }
      
      // Handle city filter
      if (searchParams.get('city')) {
        filter['location.city'] = { $regex: searchParams.get('city'), $options: 'i' };
      }
      
      // Handle pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 12;
      const skip = (page - 1) * limit;
      
      // Handle sorting
      let sort = { businessName: 1 }; // default sort
      const sortParam = searchParams.get('sort') || searchParams.get('sortBy');
      
      if (sortParam) {
        switch (sortParam) {
          case 'newest':
          case '-createdAt':
            sort = { createdAt: -1 };
            break;
          case 'oldest':
          case 'createdAt':
            sort = { createdAt: 1 };
            break;
          case 'businessName':
            sort = { businessName: 1 };
            break;
          case 'subscriptionExpiry':
          case 'subscription.expiresAt':
            sort = { 'subscription.expiresAt': 1 };
            break;
          default:
            if (sortParam.startsWith('-')) {
              const field = sortParam.substring(1);
              sort = { [field]: -1 };
            } else {
              sort = { [sortParam]: 1 };
            }
        }
      }
      
      // Execute query
      const providers = await serviceProvidersCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      const total = await serviceProvidersCollection.countDocuments(filter);
      
      console.log(`[${timestamp}] Found ${providers.length} providers via /providers/page alias (${total} total)`);
      
      return res.status(200).json({
        success: true,
        data: providers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `Found ${providers.length} providers (${total} total)`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Providers page error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching providers',
        error: error.message
      });
    }
  }

  // === SERVICES ALIAS ENDPOINTS (FOR ADMIN COMPATIBILITY) ===
  // GET all services (alias for providers)
  if (path === '/services' && req.method === 'GET') {
    console.log(`[${timestamp}] → SERVICES ALIAS: Get all service providers`);
    
    try {
      const serviceProvidersCollection = db.collection('serviceproviders');
      
      let filter = {};
      
      if (searchParams.get('providerType')) {
        filter.providerType = searchParams.get('providerType');
      }
      
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { businessName: searchRegex },
          { 'profile.description': searchRegex },
          { 'location.city': searchRegex }
        ];
      }
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 12;
      const skip = (page - 1) * limit;
      
      const providers = await serviceProvidersCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ businessName: 1 })
        .toArray();
      
      const total = await serviceProvidersCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: providers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `Found ${providers.length} service providers via /services alias`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Services alias error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching service providers',
        error: error.message
      });
    }
  }

  // GET service items (alias for individual provider)
  if (path.match(/^\/services\/[a-fA-F0-9]{24}\/items$/) && req.method === 'GET') {
    const serviceId = path.split('/')[2];
    console.log(`[${timestamp}] → SERVICES ALIAS: Get service items for ${serviceId}`);
    
    try {
      const serviceProvidersCollection = db.collection('serviceproviders');
      const { ObjectId } = await import('mongodb');
      
      const provider = await serviceProvidersCollection.findOne({ 
        _id: new ObjectId(serviceId) 
      });
      
      if (!provider) {
        return res.status(404).json({
          success: false,
          message: 'Service provider not found'
        });
      }
      
      // Return provider data in "items" format for admin compatibility
      return res.status(200).json({
        success: true,
        data: [provider], // Wrap in array as "items"
        total: 1,
        message: `Service provider details via /services alias`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Service items alias error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching service provider details',
        error: error.message
      });
    }
  }

  // GET individual service (alias for individual provider)
  if (path.match(/^\/services\/[a-fA-F0-9]{24}$/) && req.method === 'GET') {
    const serviceId = path.split('/')[2];
    console.log(`[${timestamp}] → SERVICES ALIAS: Get individual service ${serviceId}`);
    
    try {
      const serviceProvidersCollection = db.collection('serviceproviders');
      const { ObjectId } = await import('mongodb');
      
      const provider = await serviceProvidersCollection.findOne({ 
        _id: new ObjectId(serviceId) 
      });
      
      if (!provider) {
        return res.status(404).json({
          success: false,
          message: 'Service provider not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: provider,
        message: `Service provider via /services alias`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Individual service alias error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching service provider',
        error: error.message
      });
    }
  }

  // === INDIVIDUAL PROVIDER ===
  if (path.includes('/providers/') && path !== '/providers' && !path.includes('/providers/all') && !path.includes('/providers/page')) {
    const providerId = path.replace('/providers/', '').split('?')[0];
    console.log(`[${timestamp}] → INDIVIDUAL PROVIDER: ${providerId}`);
    
    try {
      const serviceProvidersCollection = db.collection('serviceproviders');
      const { ObjectId } = await import('mongodb');
      
      let provider = null;
      
      // Try as string first
      provider = await serviceProvidersCollection.findOne({ _id: providerId });
      
      // Try as ObjectId if string fails
      if (!provider && providerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(providerId)) {
        try {
          provider = await serviceProvidersCollection.findOne({ _id: new ObjectId(providerId) });
        } catch (objectIdError) {
          console.log(`[${timestamp}] Provider ObjectId creation failed:`, objectIdError.message);
        }
      }
      
      if (!provider) {
        return res.status(404).json({
          success: false,
          message: 'Service provider not found',
          providerId: providerId
        });
      }
      
      return res.status(200).json({
        success: true,
        data: provider,
        message: `Individual provider: ${provider.businessName || provider.name}`
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching service provider',
        error: error.message,
        providerId: providerId
      });
    }
  }

  // If no provider endpoint matched, return null
  return null;
};
