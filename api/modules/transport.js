// transport.js - All Transport Route Related APIs
// Separated from main index.js for better organization

export const handleTransportRoutes = async (req, res, db, path, searchParams, timestamp) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  
  // === CREATE TRANSPORT ROUTE (ENHANCED - HANDLES BOTH JSON AND IMAGES) ===
  if (path === '/transport' && req.method === 'POST') {
    try {
      console.log(`[${timestamp}] → CREATE TRANSPORT ROUTE`);
      
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);
      
      const contentType = req.headers['content-type'] || '';
      let routeData = {};
      const uploadedImages = [];
      
      // Handle both JSON and FormData requests
      if (contentType.includes('application/json')) {
        // Handle JSON request (no images)
        console.log(`[${timestamp}] Processing JSON request`);
        try {
          const rawBodyString = rawBody.toString();
          if (rawBodyString) routeData = JSON.parse(rawBodyString);
        } catch (parseError) {
          return res.status(400).json({
            success: false,
            message: 'Invalid JSON format'
          });
        }
        
      } else if (contentType.includes('multipart/form-data')) {
        // Handle FormData request (with images)
        console.log(`[${timestamp}] Processing FormData request with potential images`);
        
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
        
        const files = {};
        
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
                
                if (fileBuffer.length > 100) {
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
                if (['origin', 'destination', 'stops', 'schedule', 'pricing', 'accessibility', 'contact'].includes(fieldName)) {
                  try {
                    routeData[fieldName] = JSON.parse(fieldValue);
                  } catch (e) {
                    routeData[fieldName] = fieldValue;
                  }
                } else {
                  routeData[fieldName] = fieldValue;
                }
              }
            }
          }
        }
        
        // Upload files to S3 if any
        if (Object.keys(files).length > 0) {
          const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
          const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
          const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
          const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
          
          if (awsAccessKey && awsSecretKey) {
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
                  const s3Filename = `images/transport/${timestamp_ms}-${randomString}-${fieldName}.${fileExtension}`;
                  
                  const uploadCommand = new PutObjectCommand({
                    Bucket: awsBucket,
                    Key: s3Filename,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                  });
                  
                  await s3Client.send(uploadCommand);
                  
                  const imageUrl = `https://${awsBucket}.s3.amazonaws.com/${s3Filename}`;
                  
                  uploadedImages.push({
                    url: imageUrl,
                    key: s3Filename,
                    size: file.size,
                    mimetype: file.mimetype,
                    isPrimary: uploadedImages.length === 0
                  });
                  
                  console.log(`[${timestamp}] ✅ Uploaded image: ${imageUrl}`);
                } catch (fileError) {
                  console.error(`[${timestamp}] Failed to upload ${fieldName}:`, fileError.message);
                }
              }
            } catch (s3Error) {
              console.error(`[${timestamp}] S3 setup error:`, s3Error.message);
            }
          } else {
            // Mock URLs for development
            for (const [fieldName, file] of Object.entries(files)) {
              uploadedImages.push({
                url: `https://${awsBucket}.s3.amazonaws.com/images/transport/mock-${fieldName}-${Date.now()}.jpg`,
                key: `images/transport/mock-${fieldName}-${Date.now()}.jpg`,
                size: file.size,
                mimetype: file.mimetype,
                isPrimary: uploadedImages.length === 0
              });
            }
          }
        }
        
      } else {
        return res.status(400).json({
          success: false,
          message: 'Content-Type must be application/json or multipart/form-data'
        });
      }
      
      // Validate required fields
      if (!routeData.routeName) {
        return res.status(400).json({
          success: false,
          message: 'Route name is required'
        });
      }
      
      if (!routeData.operatorName) {
        return res.status(400).json({
          success: false,
          message: 'Operator name is required'
        });
      }
      
      // Generate unique slug
      const generateSlug = (routeName, routeNumber) => {
        let baseSlug = routeName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        
        if (routeNumber) {
          baseSlug = `${routeNumber.toLowerCase()}-${baseSlug}`;
        }
        
        return `${baseSlug}-${Date.now()}`;
      };
      
      const slug = generateSlug(routeData.routeName, routeData.routeNumber);
      
      // Create transport route
      const transportCollection = db.collection('transportroutes');
      const { ObjectId } = await import('mongodb');
      
      const newRoute = {
        _id: new ObjectId(),
        routeName: routeData.routeName,
        routeNumber: routeData.routeNumber || '',
        slug: slug,
        operatorName: routeData.operatorName,
        operatorType: routeData.operatorType || 'public_transport',
        
        origin: {
          name: routeData.origin?.name || '',
          address: routeData.origin?.address || '',
          coordinates: routeData.origin?.coordinates || { lat: 0, lng: 0 }
        },
        
        destination: {
          name: routeData.destination?.name || '',
          address: routeData.destination?.address || '',
          coordinates: routeData.destination?.coordinates || { lat: 0, lng: 0 }
        },
        
        stops: Array.isArray(routeData.stops) ? routeData.stops.map(stop => ({
          name: stop.name || '',
          address: stop.address || '',
          coordinates: stop.coordinates || { lat: 0, lng: 0 },
          estimatedTime: stop.estimatedTime || '',
          order: stop.order || 0
        })) : [],
        
        schedule: {
          startTime: routeData.schedule?.startTime || '06:00',
          endTime: routeData.schedule?.endTime || '22:00',
          frequency: routeData.schedule?.frequency || '30',
          operatingDays: routeData.schedule?.operatingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          specialSchedule: routeData.schedule?.specialSchedule || {}
        },
        
        pricing: {
          baseFare: Number(routeData.pricing?.baseFare) || 0,
          currency: routeData.pricing?.currency || 'BWP',
          discounts: routeData.pricing?.discounts || {},
          paymentMethods: routeData.pricing?.paymentMethods || ['cash']
        },
        
        // Add uploaded images (empty array if no images)
        images: uploadedImages,
        
        distance: Number(routeData.distance) || 0,
        estimatedDuration: routeData.estimatedDuration || '',
        routeType: routeData.routeType || 'urban',
        vehicleType: routeData.vehicleType || 'bus',
        
        accessibility: {
          wheelchairAccessible: Boolean(routeData.accessibility?.wheelchairAccessible),
          lowFloor: Boolean(routeData.accessibility?.lowFloor),
          audioAnnouncements: Boolean(routeData.accessibility?.audioAnnouncements)
        },
        
        contact: {
          phone: routeData.contact?.phone || '',
          email: routeData.contact?.email || '',
          website: routeData.contact?.website || ''
        },
        
        serviceProvider: routeData.serviceProvider ? 
          (routeData.serviceProvider.length === 24 ? new ObjectId(routeData.serviceProvider) : routeData.serviceProvider) : null,
        
        status: routeData.status || 'active',
        operationalStatus: 'active',
        
        verification: {
          status: 'pending',
          verifiedAt: null,
          verifiedBy: null
        },
        
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0
      };
      
      const result = await transportCollection.insertOne(newRoute);
      
      console.log(`[${timestamp}] ✅ Transport route created: ${newRoute.routeName} (${uploadedImages.length} images)`);
      
      return res.status(201).json({
        success: true,
        message: `Transport route created successfully${uploadedImages.length > 0 ? ` with ${uploadedImages.length} images` : ''}`,
        data: { ...newRoute, _id: result.insertedId }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Create transport route error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create transport route',
        error: error.message
      });
    }
  }

  // === GET ALL TRANSPORT ROUTES ===
  if (path === '/transport' && req.method === 'GET') {
    console.log(`[${timestamp}] → TRANSPORT`);
    try {
      let transportCollection;
      try {
        transportCollection = db.collection('transportroutes');
      } catch (error) {
        transportCollection = db.collection('transportnodes');
      }
      
      let filter = {};
      
      // Handle query parameters
      if (searchParams.get('status') && searchParams.get('status') !== 'all') {
        filter.status = searchParams.get('status');
      } else {
        filter.status = { $in: ['active', 'seasonal'] };
      }
      
      if (searchParams.get('routeType') && searchParams.get('routeType') !== 'all') {
        filter.routeType = searchParams.get('routeType');
      }
      
      if (searchParams.get('serviceType') && searchParams.get('serviceType') !== 'all') {
        filter.serviceType = searchParams.get('serviceType');
      }
      
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { routeName: searchRegex },
          { operatorName: searchRegex },
          { origin: searchRegex },
          { destination: searchRegex },
          { title: searchRegex }
        ];
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 20;
      const skip = (page - 1) * limit;
      
      // Sorting
      let sort = { createdAt: -1 };
      const sortParam = searchParams.get('sort');
      if (sortParam) {
        switch (sortParam) {
          case '-createdAt':
            sort = { createdAt: -1 };
            break;
          case 'createdAt':
            sort = { createdAt: 1 };
            break;
          case 'fare':
            sort = { fare: 1 };
            break;
          case '-fare':
            sort = { fare: -1 };
            break;
        }
      }
      
      const routes = await transportCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      const total = await transportCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: routes,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `Found ${routes.length} transport routes`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Transport error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching transport routes',
        error: error.message
      });
    }
  }

  // === UPDATE TRANSPORT ROUTE ===
  if (path.match(/^\/transport\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
    const routeId = path.split('/').pop();
    console.log(`[${timestamp}] → UPDATE TRANSPORT ROUTE ${routeId}`);
    
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
      
      const transportCollection = db.collection('transportroutes');
      const { ObjectId } = await import('mongodb');
      
      const updateData = {
        ...body,
        updatedAt: new Date()
      };
      
      // Handle serviceProvider ObjectId conversion
      if (body.serviceProvider && body.serviceProvider.length === 24) {
        updateData.serviceProvider = new ObjectId(body.serviceProvider);
      }
      
      const result = await transportCollection.updateOne(
        { _id: new ObjectId(routeId) },
        { $set: updateData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Transport route not found'
        });
      }
      
      const updatedRoute = await transportCollection.findOne({ 
        _id: new ObjectId(routeId) 
      });
      
      console.log(`[${timestamp}] ✅ Transport route updated: ${routeId}`);
      
      return res.status(200).json({
        success: true,
        message: 'Transport route updated successfully',
        data: updatedRoute
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Update transport route error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update transport route',
        error: error.message
      });
    }
  }

  // === DELETE TRANSPORT ROUTE ===
  if (path.match(/^\/transport\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
    const routeId = path.split('/').pop();
    console.log(`[${timestamp}] → DELETE TRANSPORT ROUTE ${routeId}`);
    
    try {
      const transportCollection = db.collection('transportroutes');
      const { ObjectId } = await import('mongodb');
      
      // Check if route exists
      const existingRoute = await transportCollection.findOne({ 
        _id: new ObjectId(routeId) 
      });
      
      if (!existingRoute) {
        return res.status(404).json({
          success: false,
          message: 'Transport route not found'
        });
      }
      
      // Soft delete - mark as deleted
      const result = await transportCollection.updateOne(
        { _id: new ObjectId(routeId) },
        { 
          $set: { 
            status: 'deleted',
            deletedAt: new Date()
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ Transport route deleted: ${existingRoute.routeName}`);
      
      return res.status(200).json({
        success: true,
        message: 'Transport route deleted successfully',
        data: { 
          id: routeId, 
          routeName: existingRoute.routeName,
          deletedAt: new Date() 
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Delete transport route error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete transport route',
        error: error.message
      });
    }
  }

  // === GET TRANSPORT ROUTES BY PROVIDER (HANDLE MIXED DATA FORMATS) ===
  if (path.includes('/transport/provider/') && req.method === 'GET') {
    const providerId = path.split('/provider/')[1];
    console.log(`[${timestamp}] → TRANSPORT BY PROVIDER: ${providerId}`);
    
    try {
      const transportCollection = db.collection('transportroutes');
      const { ObjectId } = await import('mongodb');
      
      let filter = {};
      
      // Handle BOTH providerId AND serviceProvider fields (mixed data formats)
      if (providerId && providerId.length === 24) {
        try {
          const objectId = new ObjectId(providerId);
          filter.$or = [
            { providerId: providerId },           // String version
            { providerId: objectId },             // ObjectId version  
            { serviceProvider: providerId },      // String version (newer format)
            { serviceProvider: objectId }         // ObjectId version (newer format)
          ];
        } catch (e) {
          filter.$or = [
            { providerId: providerId },
            { serviceProvider: providerId }
          ];
        }
      } else {
        filter.$or = [
          { providerId: providerId },
          { serviceProvider: providerId }
        ];
      }
      
      // Handle BOTH status AND operationalStatus fields
      filter.$and = [
        filter,
        {
          $or: [
            { status: { $in: ['active', 'seasonal'] } },           // Old format
            { operationalStatus: { $in: ['active', 'seasonal'] } }  // New format
          ]
        }
      ];
      
      console.log(`[${timestamp}] Mixed format filter:`, JSON.stringify(filter, null, 2));
      
      const routes = await transportCollection.find(filter).toArray();
      
      console.log(`[${timestamp}] Found ${routes.length} routes for provider ${providerId}`);
      
      return res.status(200).json({
        success: true,
        data: routes,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          total: routes.length
        },
        message: `Found ${routes.length} routes for provider`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Transport by provider error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching routes by provider',
        error: error.message
      });
    }
  }

  // === UPDATE TRANSPORT ROUTE STATUS ===
  if (path.match(/^\/transport\/[a-fA-F0-9]{24}\/status$/) && req.method === 'PATCH') {
    const routeId = path.split('/')[2];
    
    try {
      let body = {};
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString();
      if (rawBody) body = JSON.parse(rawBody);
      
      const transportCollection = db.collection('transportroutes');
      const { ObjectId } = await import('mongodb');
      
      const result = await transportCollection.updateOne(
        { _id: new ObjectId(routeId) },
        { $set: { status: body.status, updatedAt: new Date() } }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: 'Route not found' });
      }
      
      const updatedRoute = await transportCollection.findOne({ _id: new ObjectId(routeId) });
      
      return res.status(200).json({
        success: true,
        data: updatedRoute
      });
      
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update status',
        error: error.message
      });
    }
  }

  // === BULK UPLOAD TRANSPORT ROUTES ===
  if (path === '/transport/bulk-upload' && req.method === 'POST') {
    try {
      console.log(`[${timestamp}] → BULK UPLOAD TRANSPORT ROUTES`);
      
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
      
      const { routes } = body;
      
      if (!Array.isArray(routes) || routes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Routes array is required'
        });
      }
      
      const transportCollection = db.collection('transportroutes');
      const { ObjectId } = await import('mongodb');
      
      // SLUG GENERATION FUNCTION
      const generateSlug = (routeName, routeNumber, index) => {
        let baseSlug = routeName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        
        if (routeNumber) {
          baseSlug = `${routeNumber.toLowerCase()}-${baseSlug}`;
        }
        
        // Add timestamp and index to ensure uniqueness
        return `${baseSlug}-${Date.now()}-${index}`;
      };
      
      const results = {
        inserted: [],
        errors: [],
        duplicates: []
      };
      
      // Process routes one by one
      for (let i = 0; i < routes.length; i++) {
        const routeData = routes[i];
        
        try {
          // Validate required fields
          if (!routeData.routeName || !routeData.operatorName) {
            results.errors.push({
              index: i,
              route: routeData.routeName || 'Unknown',
              error: 'Missing required fields: routeName and operatorName'
            });
            continue;
          }
          
          // Generate unique slug
          const slug = generateSlug(routeData.routeName, routeData.routeNumber, i);
          
          // Check for existing route with same slug (shouldn't happen with timestamps, but safety first)
          const existingSlug = await transportCollection.findOne({ slug: slug });
          let finalSlug = slug;
          if (existingSlug) {
            finalSlug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
          }
          
          // Create route object with slug
          const newRoute = {
            _id: new ObjectId(),
            routeName: routeData.routeName,
            routeNumber: routeData.routeNumber || '',
            slug: finalSlug,
            operatorName: routeData.operatorName,
            operatorType: routeData.operatorType || 'public_transport',
            
            origin: routeData.origin || { name: '', address: '', coordinates: { lat: 0, lng: 0 } },
            destination: routeData.destination || { name: '', address: '', coordinates: { lat: 0, lng: 0 } },
            stops: routeData.stops || [],
            
            schedule: {
              startTime: routeData.schedule?.startTime || '06:00',
              endTime: routeData.schedule?.endTime || '22:00',
              frequency: routeData.schedule?.frequency || '30',
              operatingDays: routeData.schedule?.operatingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
              specialSchedule: routeData.schedule?.specialSchedule || {}
            },
            
            pricing: {
              baseFare: Number(routeData.pricing?.baseFare) || 0,
              currency: routeData.pricing?.currency || 'BWP',
              discounts: routeData.pricing?.discounts || {},
              paymentMethods: routeData.pricing?.paymentMethods || ['cash']
            },
            
            distance: Number(routeData.distance) || 0,
            estimatedDuration: routeData.estimatedDuration || '',
            routeType: routeData.routeType || 'urban',
            vehicleType: routeData.vehicleType || 'bus',
            
            accessibility: {
              wheelchairAccessible: Boolean(routeData.accessibility?.wheelchairAccessible),
              lowFloor: Boolean(routeData.accessibility?.lowFloor),
              audioAnnouncements: Boolean(routeData.accessibility?.audioAnnouncements)
            },
            
            contact: routeData.contact || { phone: '', email: '', website: '' },
            
            serviceProvider: routeData.serviceProvider ? 
              (routeData.serviceProvider.length === 24 ? new ObjectId(routeData.serviceProvider) : routeData.serviceProvider) : null,
            
            status: routeData.status || 'active',
            verification: {
              status: 'pending',
              verifiedAt: null,
              verifiedBy: null
            },
            
            createdAt: new Date(),
            updatedAt: new Date(),
            __v: 0
          };
          
          // Insert individual route
          const insertResult = await transportCollection.insertOne(newRoute);
          
          results.inserted.push({
            index: i,
            route: routeData.routeName,
            operator: routeData.operatorName,
            id: insertResult.insertedId,
            slug: finalSlug
          });
          
        } catch (routeError) {
          console.error(`[${timestamp}] Error processing route ${i}:`, routeError);
          
          results.errors.push({
            index: i,
            route: routeData.routeName || 'Unknown',
            error: routeError.message
          });
        }
      }
      
      console.log(`[${timestamp}] ✅ Bulk upload complete: ${results.inserted.length} inserted, ${results.duplicates.length} duplicates, ${results.errors.length} errors`);
      
      return res.status(200).json({
        success: true,
        message: `Bulk upload complete: ${results.inserted.length} routes created`,
        data: {
          totalRequested: routes.length,
          inserted: results.inserted.length,
          duplicates: results.duplicates.length,
          errors: results.errors.length
        },
        results: results
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Bulk upload transport routes error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to bulk upload transport routes',
        error: error.message
      });
    }
  }

  // === TRANSPORT-ROUTES (FRONTEND ALIAS) ===
  if (path === '/transport-routes' && req.method === 'GET') {
    console.log(`[${timestamp}] → TRANSPORT-ROUTES (frontend endpoint)`);
    
    try {
      const transportCollection = db.collection('transportroutes');
      
      let filter = {};
      
      // Handle query parameters that your frontend sends
      if (searchParams.get('status') && searchParams.get('status') !== 'all') {
        filter.status = searchParams.get('status');
      } else {
        // Default to active routes
        filter.status = { $in: ['active', 'scheduled'] };
      }
      
      if (searchParams.get('operationalStatus')) {
        filter.operationalStatus = searchParams.get('operationalStatus');
      }
      
      if (searchParams.get('routeType')) {
        filter.routeType = searchParams.get('routeType');
      }
      
      if (searchParams.get('transportType')) {
        filter.serviceType = searchParams.get('transportType');
      }
      
      if (searchParams.get('destination')) {
        const destination = searchParams.get('destination');
        filter.$or = [
          { destination: { $regex: destination, $options: 'i' } },
          { 'destination.name': { $regex: destination, $options: 'i' } },
          { 'stops.name': { $regex: destination, $options: 'i' } }
        ];
      }
      
      // Enhanced search functionality (matches your frontend logic)
      if (searchParams.get('search')) {
        const searchTerm = searchParams.get('search');
        const searchRegex = { $regex: searchTerm, $options: 'i' };
        
        filter.$or = [
          { routeName: searchRegex },
          { title: searchRegex },
          { operatorName: searchRegex },
          { origin: searchRegex },
          { destination: searchRegex },
          { 'origin.name': searchRegex },
          { 'destination.name': searchRegex },
          { 'stops.name': searchRegex },
          { description: searchRegex }
        ];
      }
      
      // Search by stops (frontend sends this)
      if (searchParams.get('stop')) {
        const stopName = searchParams.get('stop');
        const stopRegex = { $regex: stopName, $options: 'i' };
        
        filter.$or = [
          ...(filter.$or || []),
          { 'stops.name': stopRegex },
          { origin: stopRegex },
          { destination: stopRegex },
          { 'origin.name': stopRegex },
          { 'destination.name': stopRegex }
        ];
      }
      
      // Location filter
      if (searchParams.get('city')) {
        const city = searchParams.get('city');
        const cityRegex = { $regex: city, $options: 'i' };
        
        filter.$or = [
          ...(filter.$or || []),
          { 'origin.name': cityRegex },
          { 'destination.name': cityRegex },
          { 'stops.name': cityRegex }
        ];
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 20;
      const skip = (page - 1) * limit;
      
      console.log(`[${timestamp}] TRANSPORT-ROUTES QUERY:`, {
        filter: filter,
        page: page,
        limit: limit
      });
      
      const routes = await transportCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();
      
      const total = await transportCollection.countDocuments(filter);
      
      console.log(`[${timestamp}] Found ${routes.length} transport routes (${total} total)`);
      
      return res.status(200).json({
        success: true,
        data: routes,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `Found ${routes.length} transport routes`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Transport routes error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching transport routes',
        error: error.message
      });
    }
  }

  // === INDIVIDUAL TRANSPORT ROUTE ===
  if (path.includes('/transport/') && path !== '/transport' && !path.includes('/transport/provider/') && !path.includes('/transport/bulk-upload')) {
    const routeId = path.replace('/transport/', '').split('?')[0];
    console.log(`[${timestamp}] → INDIVIDUAL TRANSPORT ROUTE: "${routeId}"`);
    
    try {
      let transportCollection;
      try {
        transportCollection = db.collection('transportroutes');
      } catch (error) {
        transportCollection = db.collection('transportnodes');
      }
      
      const { ObjectId } = await import('mongodb');
      let route = null;
      
      try {
        route = await transportCollection.findOne({ _id: routeId });
      } catch (stringError) {
        console.log(`[${timestamp}] Route string lookup failed`);
      }
      
      if (!route && routeId.length === 24 && /^[0-9a-fA-F]{24}$/.test(routeId)) {
        try {
          route = await transportCollection.findOne({ _id: new ObjectId(routeId) });
        } catch (objectIdError) {
          console.log(`[${timestamp}] Route ObjectId lookup failed`);
        }
      }
      
      if (!route) {
        return res.status(404).json({
          success: false,
          message: 'Transport route not found',
          routeId: routeId
        });
      }
      
      return res.status(200).json({
        success: true,
        data: route,
        message: `Found transport route`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Transport route lookup error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching transport route',
        error: error.message
      });
    }
  }

  // If no transport route matched, return null to let main handler continue
  return null;
};
