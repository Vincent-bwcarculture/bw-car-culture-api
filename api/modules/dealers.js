// dealers.js - All Dealer Related APIs

import { verifyAdminToken } from './auth.js';

export const handleDealers = async (req, res, db, path, searchParams, timestamp) => {
  // Handle traditional API dealers endpoints
  if (path.includes('/api/dealers')) {
    console.log(`[${timestamp}] → TRADITIONAL API DEALERS: ${path}`);
    
    // === CREATE DEALER (TRADITIONAL ENDPOINT) ===
    if (path === '/api/dealers' && req.method === 'POST') {
      try {
        console.log(`[${timestamp}] → TRADITIONAL API: Create Dealer`);
        
        // Check if user is authenticated (optional, or verify JWT)
        const authHeader = req.headers.authorization;
        let adminUser = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const authResult = await verifyAdminToken(req);
          if (authResult.success) {
            adminUser = authResult.user;
            console.log(`[${timestamp}] Authenticated user: ${adminUser.name}`);
          }
        }
        
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
        
        console.log(`[${timestamp}] Creating dealer via traditional API:`, body);
        
        const dealersCollection = db.collection('dealers');
        const { ObjectId } = await import('mongodb');
        
        // Check if dealer already exists
        if (body.businessName) {
          const existingDealer = await dealersCollection.findOne({ 
            businessName: body.businessName 
          });
          
          if (existingDealer) {
            return res.status(400).json({
              success: false,
              message: 'Dealer with this business name already exists'
            });
          }
        }
        
        // Create new dealer object (matching traditional structure)
        const newDealer = {
          _id: new ObjectId(),
          businessName: body.businessName,
          businessType: body.businessType || 'independent',
          sellerType: body.sellerType || 'dealership',
          status: body.status || 'active',
          user: body.user ? (body.user.length === 24 ? new ObjectId(body.user) : body.user) : null,
          
          // Handle contact data
          contact: {
            phone: body.contact?.phone || body.phone,
            email: body.contact?.email || body.email,
            website: body.contact?.website || body.website
          },
          
          // Handle location data  
          location: {
            address: body.location?.address || body.address,
            city: body.location?.city || body.city,
            state: body.location?.state || body.state,
            country: body.location?.country || 'Botswana'
          },
          
          // Handle profile data
          profile: {
            logo: body.profile?.logo || '/images/placeholders/dealer-logo.jpg',
            banner: body.profile?.banner || '/images/placeholders/dealer-banner.jpg',
            description: body.profile?.description || '',
            specialties: body.profile?.specialties || [],
            workingHours: body.profile?.workingHours || {}
          },
          
          // Handle subscription data
          subscription: {
            tier: body.subscription?.tier || body.subscription?.plan || 'basic',
            status: body.subscription?.status || 'active',
            startDate: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
          },
          
          // Handle private seller data
          privateSeller: body.privateSeller || null,
          
          // Verification
          verification: {
            status: 'pending',
            verifiedAt: null
          },
          
          // Metrics
          metrics: {
            totalListings: 0,
            activeSales: 0,
            averageRating: 0,
            totalReviews: 0
          },
          
          // Timestamps
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Add created by info if admin user exists
        if (adminUser) {
          newDealer.createdBy = {
            userId: adminUser.id,
            userEmail: adminUser.email,
            userName: adminUser.name
          };
        }
        
        // Insert dealer
        const result = await dealersCollection.insertOne(newDealer);
        
        console.log(`[${timestamp}] ✅ Dealer created via traditional API: ${newDealer.businessName} (ID: ${result.insertedId})`);
        
        // Return response in format expected by frontend
        return res.status(201).json({
          success: true,
          data: {
            ...newDealer,
            _id: result.insertedId
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Traditional API create dealer error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to create dealer',
          error: error.message
        });
      }
    }

    // === GET ALL DEALERS (TRADITIONAL ENDPOINT) ===
    if (path === '/api/dealers' && req.method === 'GET') {
      console.log(`[${timestamp}] → TRADITIONAL API: Get All Dealers`);
      
      try {
        const dealersCollection = db.collection('dealers');
        
        // Build filter based on query parameters
        let filter = {};
        
        if (searchParams.get('status') && searchParams.get('status') !== 'all') {
          filter.status = searchParams.get('status');
        }
        
        if (searchParams.get('sellerType') && searchParams.get('sellerType') !== 'all') {
          filter.sellerType = searchParams.get('sellerType');
        }
        
        if (searchParams.get('businessType') && searchParams.get('businessType') !== 'all') {
          filter.businessType = searchParams.get('businessType');
        }
        
        if (searchParams.get('search')) {
          const searchTerm = searchParams.get('search');
          filter.$or = [
            { businessName: { $regex: searchTerm, $options: 'i' } },
            { 'contact.email': { $regex: searchTerm, $options: 'i' } },
            { 'location.city': { $regex: searchTerm, $options: 'i' } }
          ];
        }
        
        // Pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 10;
        const skip = (page - 1) * limit;
        
        // Get total count
        const total = await dealersCollection.countDocuments(filter);
        
        // Get dealers
        const dealers = await dealersCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .toArray();
        
        // Return response in traditional format
        return res.status(200).json({
          success: true,
          data: dealers,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Traditional API get dealers error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to get dealers',
          error: error.message
        });
      }
    }

    // === GET DEALERS FOR DROPDOWN (TRADITIONAL ENDPOINT) ===
    if (path === '/api/dealers/all' && req.method === 'GET') {
      console.log(`[${timestamp}] → TRADITIONAL API: Get Dealers for Dropdown`);
      
      try {
        const dealersCollection = db.collection('dealers');
        
        // Get active dealers for dropdown
        const dealers = await dealersCollection.find({ 
          status: 'active' 
        })
        .project({
          businessName: 1,
          'profile.logo': 1,
          'verification.status': 1,
          sellerType: 1,
          businessType: 1,
          privateSeller: 1
        })
        .sort({ businessName: 1 })
        .toArray();
        
        // Map to format expected by dropdown
        const dealersForDropdown = dealers.map(dealer => ({
          _id: dealer._id,
          businessName: dealer.businessName,
          name: dealer.businessName,
          logo: dealer.profile?.logo,
          sellerType: dealer.sellerType || 'dealership',
          businessType: dealer.businessType,
          privateSeller: dealer.privateSeller,
          verification: {
            isVerified: dealer.verification?.status === 'verified'
          },
          displayName: dealer.sellerType === 'private' && dealer.privateSeller
            ? `${dealer.privateSeller.firstName} ${dealer.privateSeller.lastName}`
            : dealer.businessName
        }));
        
        return res.status(200).json({
          success: true,
          count: dealersForDropdown.length,
          data: dealersForDropdown
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Traditional API get dealers dropdown error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to get dealers for dropdown',
          error: error.message
        });
      }
    }

    // Traditional API endpoints handled above
    return null;
  }

  // Handle main dealers endpoints
  if (!path.includes('/dealers')) return null;

  console.log(`[${timestamp}] → DEALERS: ${path}`);

  // === CREATE DEALER (FRONTEND ENDPOINT) - FIXED FORMDATA PARSING ===
  if (path === '/dealers' && req.method === 'POST') {
    try {
      console.log(`[${timestamp}] → FRONTEND DEALERS: Create Dealer`);
      
      // Check authentication (dealerService sends Bearer token)
      const authHeader = req.headers.authorization;
      let adminUser = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const authResult = await verifyAdminToken(req);
        if (authResult.success) {
          adminUser = authResult.user;
          console.log(`[${timestamp}] Authenticated admin: ${adminUser.name}`);
        } else {
          console.log(`[${timestamp}] Auth failed: ${authResult.message}`);
        }
      }
      
      // Parse request body - handle both JSON and FormData
      let dealerData = {};
      let body = {};
      
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const rawBody = Buffer.concat(chunks).toString();
        
        console.log(`[${timestamp}] Request Content-Type: ${req.headers['content-type']}`);
        console.log(`[${timestamp}] Raw body preview: ${rawBody.substring(0, 200)}...`);
        
        // Check if it's JSON or FormData
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('application/json')) {
          // Handle JSON request
          console.log(`[${timestamp}] Parsing as JSON`);
          body = JSON.parse(rawBody);
          dealerData = body;
        } else if (contentType.includes('multipart/form-data') || rawBody.includes('Content-Disposition')) {
          // Handle FormData request
          console.log(`[${timestamp}] Parsing as FormData`);
          
          // Simple FormData parser for dealerData field
          const dealerDataMatch = rawBody.match(/name="dealerData"[^]*?\r\n\r\n([^]*?)\r\n--/);
          if (dealerDataMatch) {
            try {
              dealerData = JSON.parse(dealerDataMatch[1]);
              console.log(`[${timestamp}] Extracted dealerData from FormData:`, Object.keys(dealerData));
            } catch (jsonError) {
              console.log(`[${timestamp}] Failed to parse dealerData JSON:`, jsonError.message);
            }
          }
          
          // Extract individual fields as fallback
          const extractField = (fieldName) => {
            const regex = new RegExp(`name="${fieldName}"[^]*?\\r\\n\\r\\n([^\\r\\n]+)`);
            const match = rawBody.match(regex);
            return match ? match[1].trim() : null;
          };
          
          // Fallback field extraction
          if (!dealerData.businessName) dealerData.businessName = extractField('businessName');
          if (!dealerData.businessType) dealerData.businessType = extractField('businessType');
          if (!dealerData.sellerType) dealerData.sellerType = extractField('sellerType');
          if (!dealerData.status) dealerData.status = extractField('status') || 'active';
          if (!dealerData.user) dealerData.user = extractField('user');
          
          // Parse JSON fields from FormData
          const jsonFields = ['contact', 'location', 'profile', 'subscription', 'privateSeller'];
          jsonFields.forEach(fieldName => {
            if (!dealerData[fieldName]) {
              const fieldValue = extractField(fieldName);
              if (fieldValue) {
                try {
                  dealerData[fieldName] = JSON.parse(fieldValue);
                } catch (parseError) {
                  console.log(`[${timestamp}] Failed to parse ${fieldName}:`, parseError.message);
                }
              }
            }
          });
          
        } else {
          // Try JSON as fallback
          console.log(`[${timestamp}] Unknown content type, trying JSON fallback`);
          try {
            body = JSON.parse(rawBody);
            dealerData = body;
          } catch (jsonError) {
            console.log(`[${timestamp}] JSON fallback failed:`, jsonError.message);
            // If everything fails, return error with more info
            return res.status(400).json({
              success: false,
              message: 'Invalid request body format',
              debug: {
                contentType: contentType,
                bodyPreview: rawBody.substring(0, 100),
                suggestion: 'Expected JSON or multipart/form-data'
              }
            });
          }
        }
        
      } catch (parseError) {
        console.error(`[${timestamp}] Body parsing error:`, parseError);
        return res.status(400).json({
          success: false,
          message: 'Failed to parse request body',
          error: parseError.message
        });
      }
      
      console.log(`[${timestamp}] Final parsed dealer data:`, {
        businessName: dealerData.businessName,
        sellerType: dealerData.sellerType,
        hasContact: !!dealerData.contact,
        hasLocation: !!dealerData.location,
        hasProfile: !!dealerData.profile,
        user: dealerData.user
      });
      
      const dealersCollection = db.collection('dealers');
      const { ObjectId } = await import('mongodb');
      
      // Validate required fields
      if (!dealerData.businessName) {
        return res.status(400).json({
          success: false,
          message: 'Business name is required',
          receivedData: Object.keys(dealerData)
        });
      }
      
      // Check for existing dealer
      const existingDealer = await dealersCollection.findOne({ 
        businessName: dealerData.businessName 
      });
      
      if (existingDealer) {
        return res.status(400).json({
          success: false,
          message: 'Dealer with this business name already exists'
        });
      }
      
      // Create dealer object with proper defaults
      const newDealer = {
        _id: new ObjectId(),
        businessName: dealerData.businessName,
        businessType: dealerData.businessType || 'independent',
        sellerType: dealerData.sellerType || 'dealership',
        status: dealerData.status || 'active',
        user: dealerData.user ? (dealerData.user.length === 24 ? new ObjectId(dealerData.user) : dealerData.user) : null,
        
        // Contact data with defaults
        contact: {
          phone: dealerData.contact?.phone || '',
          email: dealerData.contact?.email || '',
          website: dealerData.contact?.website || ''
        },
        
        // Location data with defaults
        location: {
          address: dealerData.location?.address || '',
          city: dealerData.location?.city || '',
          state: dealerData.location?.state || '',
          country: dealerData.location?.country || 'Botswana'
        },
        
        // Profile data with defaults
        profile: {
          logo: dealerData.profile?.logo || '/images/placeholders/dealer-logo.jpg',
          banner: dealerData.profile?.banner || '/images/placeholders/dealer-banner.jpg',
          description: dealerData.profile?.description || '',
          specialties: dealerData.profile?.specialties || [],
          workingHours: dealerData.profile?.workingHours || {}
        },
        
        // Subscription data with defaults
        subscription: {
          tier: dealerData.subscription?.tier || 'basic',
          status: dealerData.subscription?.status || 'active',
          startDate: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        },
        
        // Private seller data
        privateSeller: dealerData.privateSeller || null,
        
        // Verification
        verification: {
          status: 'pending',
          verifiedAt: null
        },
        
        // Metrics
        metrics: {
          totalListings: 0,
          activeSales: 0,
          averageRating: 0,
          totalReviews: 0
        },
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Add created by info if admin user exists
      if (adminUser) {
        newDealer.createdBy = {
          userId: adminUser.id,
          userEmail: adminUser.email,
          userName: adminUser.name
        };
      }
      
      // Insert dealer into database
      const result = await dealersCollection.insertOne(newDealer);
      
      console.log(`[${timestamp}] ✅ Dealer created successfully via /dealers endpoint: ${newDealer.businessName} (ID: ${result.insertedId})`);
      
      // Return response in format expected by dealerService
      return res.status(201).json({
        success: true,
        message: 'Dealer created successfully',
        data: {
          ...newDealer,
          _id: result.insertedId
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] /dealers create error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create dealer',
        error: error.message,
        stack: error.stack
      });
    }
  }

  // === GET DEALERS (FRONTEND ENDPOINT) - FIXED PAGINATION ===
  if (path === '/dealers' && req.method === 'GET') {
    console.log(`[${timestamp}] → FRONTEND DEALERS: Get Dealers`);
    
    try {
      const dealersCollection = db.collection('dealers');
      
      // Build filter based on query parameters
      let filter = {};
      
      // Don't filter by status unless explicitly requested
      if (searchParams.get('status') && searchParams.get('status') !== 'all') {
        filter.status = searchParams.get('status');
      } else {
        // Include active and verified dealers by default
        filter.status = { $in: ['active', 'verified', 'pending'] };
      }
      
      if (searchParams.get('sellerType') && searchParams.get('sellerType') !== 'all') {
        filter.sellerType = searchParams.get('sellerType');
      }
      
      if (searchParams.get('businessType') && searchParams.get('businessType') !== 'all') {
        filter.businessType = searchParams.get('businessType');
      }
      
      if (searchParams.get('search')) {
        const searchTerm = searchParams.get('search');
        filter.$or = [
          { businessName: { $regex: searchTerm, $options: 'i' } },
          { 'contact.email': { $regex: searchTerm, $options: 'i' } },
          { 'location.city': { $regex: searchTerm, $options: 'i' } }
        ];
      }
      
      // FIXED: Increase default pagination limit
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 50; // ← INCREASED from 10 to 50
      const skip = (page - 1) * limit;
      
      // Sorting
      let sort = { createdAt: -1 };
      if (searchParams.get('sort')) {
        const sortParam = searchParams.get('sort');
        if (sortParam.startsWith('-')) {
          sort = { [sortParam.substring(1)]: -1 };
        } else {
          sort = { [sortParam]: 1 };
        }
      }
      
      console.log(`[${timestamp}] DEALERS QUERY:`, {
        filter: filter,
        page: page,
        limit: limit,
        skip: skip
      });
      
      // Get total count
      const total = await dealersCollection.countDocuments(filter);
      console.log(`[${timestamp}] DEALERS TOTAL COUNT: ${total}`);
      
      // Get dealers
      const dealers = await dealersCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      console.log(`[${timestamp}] DEALERS RETURNED: ${dealers.length} of ${total} total`);
      
      // Return response in format expected by dealerService
      return res.status(200).json({
        success: true,
        data: dealers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        debug: {
          filter: filter,
          totalInDatabase: total,
          returned: dealers.length,
          limit: limit,
          page: page
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] /dealers get error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get dealers',
        error: error.message
      });
    }
  }

  // === UPDATE DEALER (FRONTEND ENDPOINT) - COMPLETE FIX ===
  if (path.match(/^\/dealers\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
    const dealerId = path.split('/').pop();
    console.log(`[${timestamp}] → FRONTEND DEALERS: Update Dealer ${dealerId}`);
    
    try {
      // Check authentication
      const authHeader = req.headers.authorization;
      let adminUser = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const authResult = await verifyAdminToken(req);
        if (authResult.success) {
          adminUser = authResult.user;
          console.log(`[${timestamp}] Update authenticated by: ${adminUser.name}`);
        } else {
          console.log(`[${timestamp}] Update auth failed: ${authResult.message}`);
        }
      }
      
      // Enhanced request body parsing with detailed logging
      let dealerData = {};
      let rawBody = '';
      
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        rawBody = Buffer.concat(chunks).toString();
        
        console.log(`[${timestamp}] UPDATE - Content-Type: ${req.headers['content-type']}`);
        console.log(`[${timestamp}] UPDATE - Body size: ${rawBody.length} bytes`);
        console.log(`[${timestamp}] UPDATE - Body preview: ${rawBody.substring(0, 200)}...`);
        
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('application/json')) {
          // Handle JSON request
          console.log(`[${timestamp}] UPDATE - Parsing as JSON`);
          dealerData = JSON.parse(rawBody);
          console.log(`[${timestamp}] UPDATE - JSON parsed successfully:`, Object.keys(dealerData));
          
        } else if (contentType.includes('multipart/form-data') || rawBody.includes('Content-Disposition')) {
          // Handle FormData request with enhanced parsing
          console.log(`[${timestamp}] UPDATE - Parsing as FormData`);
          
          // Extract dealerData JSON field
          const dealerDataPattern = /name="dealerData"[^]*?\r\n\r\n([^]*?)\r\n--/;
          const dealerDataMatch = rawBody.match(dealerDataPattern);
          
          if (dealerDataMatch) {
            try {
              const dealerDataJSON = dealerDataMatch[1].trim();
              dealerData = JSON.parse(dealerDataJSON);
              console.log(`[${timestamp}] UPDATE - FormData dealerData parsed:`, Object.keys(dealerData));
            } catch (jsonParseError) {
              console.error(`[${timestamp}] UPDATE - Failed to parse dealerData JSON:`, jsonParseError.message);
              console.log(`[${timestamp}] UPDATE - Raw dealerData content:`, dealerDataMatch[1]);
              
              // Fallback: try to extract individual fields
              dealerData = {};
            }
          }
          
          // Enhanced field extraction function
          const extractFormField = (fieldName) => {
            const patterns = [
              new RegExp(`name="${fieldName}"[^]*?\\r\\n\\r\\n([^\\r\\n]+)`, 'g'),
              new RegExp(`name="${fieldName}"[^]*?\\n\\n([^\\n]+)`, 'g'),
              new RegExp(`name="${fieldName}".*?\\r\\n\\r\\n([^\\r\\n--]+)`, 'g')
            ];
            
            for (const pattern of patterns) {
              const match = pattern.exec(rawBody);
              if (match && match[1]) {
                return match[1].trim();
              }
            }
            return null;
          };
          
          // Extract and parse complex fields
          const complexFields = ['contact', 'location', 'profile', 'subscription', 'verification', 'privateSeller'];
          complexFields.forEach(fieldName => {
            if (!dealerData[fieldName]) {
              const fieldValue = extractFormField(fieldName);
              if (fieldValue && fieldValue !== 'undefined' && fieldValue !== 'null') {
                try {
                  dealerData[fieldName] = JSON.parse(fieldValue);
                  console.log(`[${timestamp}] UPDATE - Parsed ${fieldName} from FormData`);
                } catch (parseError) {
                  console.log(`[${timestamp}] UPDATE - Failed to parse ${fieldName}:`, parseError.message);
                }
              }
            }
          });
          
          // Extract simple fields as fallback
          const simpleFields = ['businessName', 'businessType', 'sellerType', 'status', 'user'];
          simpleFields.forEach(fieldName => {
            if (!dealerData[fieldName]) {
              const fieldValue = extractFormField(fieldName);
              if (fieldValue && fieldValue !== 'undefined' && fieldValue !== 'null') {
                dealerData[fieldName] = fieldValue;
                console.log(`[${timestamp}] UPDATE - Extracted ${fieldName}: ${fieldValue}`);
              }
            }
          });
          
        } else {
          // Try JSON fallback
          console.log(`[${timestamp}] UPDATE - Unknown content type, trying JSON fallback`);
          try {
            dealerData = JSON.parse(rawBody);
            console.log(`[${timestamp}] UPDATE - JSON fallback successful`);
          } catch (jsonFallbackError) {
            console.error(`[${timestamp}] UPDATE - All parsing methods failed`);
            return res.status(400).json({
              success: false,
              message: 'Unable to parse request body',
              debug: {
                contentType: contentType,
                bodySize: rawBody.length,
                bodyPreview: rawBody.substring(0, 100),
                error: jsonFallbackError.message
              }
            });
          }
        }
        
      } catch (bodyParseError) {
        console.error(`[${timestamp}] UPDATE - Body parsing error:`, bodyParseError.message);
        return res.status(400).json({
          success: false,
          message: 'Failed to parse request body',
          error: bodyParseError.message,
          debug: {
            bodySize: rawBody.length,
            hasContent: rawBody.length > 0
          }
        });
      }
      
      console.log(`[${timestamp}] UPDATE - Final parsed data structure:`, {
        hasBusinessName: !!dealerData.businessName,
        hasContact: !!dealerData.contact,
        hasLocation: !!dealerData.location,
        hasProfile: !!dealerData.profile,
        hasSubscription: !!dealerData.subscription,
        totalFields: Object.keys(dealerData).length
      });
      
      // Database operations with enhanced error handling
      const dealersCollection = db.collection('dealers');
      const { ObjectId } = await import('mongodb');
      
      // Validate dealer ID
      if (!dealerId || dealerId.length !== 24) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dealer ID format',
          dealerId: dealerId
        });
      }
      
      // Find existing dealer
      let existingDealer;
      try {
        existingDealer = await dealersCollection.findOne({ 
          _id: new ObjectId(dealerId) 
        });
      } catch (dbLookupError) {
        console.error(`[${timestamp}] UPDATE - Database lookup error:`, dbLookupError.message);
        return res.status(500).json({
          success: false,
          message: 'Database lookup failed',
          error: dbLookupError.message,
          dealerId: dealerId
        });
      }
      
      if (!existingDealer) {
        console.log(`[${timestamp}] UPDATE - Dealer not found: ${dealerId}`);
        return res.status(404).json({
          success: false,
          message: 'Dealer not found',
          dealerId: dealerId
        });
      }
      
      console.log(`[${timestamp}] UPDATE - Found existing dealer: ${existingDealer.businessName}`);
      
      // Prepare update data with safe merging
      const updateData = {
        updatedAt: new Date()
      };
      
      // Safely merge fields
      const fieldsToUpdate = ['businessName', 'businessType', 'sellerType', 'status', 'user'];
      fieldsToUpdate.forEach(field => {
        if (dealerData[field] !== undefined && dealerData[field] !== null) {
          updateData[field] = dealerData[field];
        }
      });
      
      // Handle complex objects with safe merging
      if (dealerData.contact && typeof dealerData.contact === 'object') {
        updateData.contact = {
          ...existingDealer.contact,
          ...dealerData.contact
        };
      }
      
      if (dealerData.location && typeof dealerData.location === 'object') {
        updateData.location = {
          ...existingDealer.location,
          ...dealerData.location
        };
      }
      
      if (dealerData.profile && typeof dealerData.profile === 'object') {
        updateData.profile = {
          ...existingDealer.profile,
          ...dealerData.profile
        };
      }
      
      if (dealerData.subscription && typeof dealerData.subscription === 'object') {
        updateData.subscription = {
          ...existingDealer.subscription,
          ...dealerData.subscription
        };
      }
      
      if (dealerData.verification && typeof dealerData.verification === 'object') {
        updateData.verification = {
          ...existingDealer.verification,
          ...dealerData.verification
        };
      }
      
      if (dealerData.privateSeller) {
        updateData.privateSeller = dealerData.privateSeller;
      }
      
      // Add admin user info if available
      if (adminUser) {
        updateData.lastUpdatedBy = {
          userId: adminUser.id,
          userEmail: adminUser.email,
          userName: adminUser.name,
          timestamp: new Date()
        };
      }
      
      console.log(`[${timestamp}] UPDATE - Prepared update data:`, {
        fieldsToUpdate: Object.keys(updateData),
        hasContact: !!updateData.contact,
        hasProfile: !!updateData.profile
      });
      
      // Perform database update
      let updateResult;
      try {
        updateResult = await dealersCollection.updateOne(
          { _id: new ObjectId(dealerId) },
          { $set: updateData }
        );
      } catch (dbUpdateError) {
        console.error(`[${timestamp}] UPDATE - Database update error:`, dbUpdateError.message);
        return res.status(500).json({
          success: false,
          message: 'Database update failed',
          error: dbUpdateError.message,
          dealerId: dealerId
        });
      }
      
      if (updateResult.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Dealer not found during update',
          dealerId: dealerId
        });
      }
      
      // Fetch updated dealer
      let updatedDealer;
      try {
        updatedDealer = await dealersCollection.findOne({ 
          _id: new ObjectId(dealerId) 
        });
      } catch (dbFetchError) {
        console.error(`[${timestamp}] UPDATE - Failed to fetch updated dealer:`, dbFetchError.message);
        // Return success anyway since update succeeded
        updatedDealer = { ...existingDealer, ...updateData, _id: new ObjectId(dealerId) };
      }
      
      console.log(`[${timestamp}] ✅ UPDATE - Dealer updated successfully: ${existingDealer.businessName}`);
      
      return res.status(200).json({
        success: true,
        message: 'Dealer updated successfully',
        data: updatedDealer,
        debug: {
          dealerId: dealerId,
          fieldsUpdated: Object.keys(updateData),
          updateTimestamp: updateData.updatedAt
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] UPDATE - Unexpected error:`, error.message);
      console.error(`[${timestamp}] UPDATE - Error stack:`, error.stack);
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error during dealer update',
        error: error.message,
        dealerId: dealerId,
        timestamp: timestamp,
        debug: {
          errorType: error.constructor.name,
          hasStack: !!error.stack
        }
      });
    }
  }

  // === DELETE DEALER (FRONTEND ENDPOINT) ===
  if (path.match(/^\/dealers\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
    const dealerId = path.split('/').pop();
    console.log(`[${timestamp}] → FRONTEND DEALERS: Delete Dealer ${dealerId}`);
    
    try {
      // Check authentication
      const authHeader = req.headers.authorization;
      let adminUser = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const authResult = await verifyAdminToken(req);
        if (authResult.success) {
          adminUser = authResult.user;
        }
      }
      
      const dealersCollection = db.collection('dealers');
      const { ObjectId } = await import('mongodb');
      
      // Find existing dealer
      const existingDealer = await dealersCollection.findOne({ 
        _id: new ObjectId(dealerId) 
      });
      
      if (!existingDealer) {
        return res.status(404).json({
          success: false,
          message: 'Dealer not found'
        });
      }
      
      // Soft delete - mark as deleted
      const result = await dealersCollection.updateOne(
        { _id: new ObjectId(dealerId) },
        { 
          $set: { 
            status: 'deleted',
            deletedAt: new Date(),
            ...(adminUser && {
              deletedBy: {
                userId: adminUser.id,
                userEmail: adminUser.email,
                userName: adminUser.name,
                timestamp: new Date()
              }
            })
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ Dealer deleted via /dealers endpoint: ${existingDealer.businessName}`);
      
      return res.status(200).json({
        success: true,
        message: 'Dealer deleted successfully',
        data: {
          id: dealerId,
          businessName: existingDealer.businessName,
          deletedAt: new Date()
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] /dealers delete error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete dealer',
        error: error.message
      });
    }
  }

  // === GET DEALERS FOR DROPDOWN (FRONTEND ENDPOINT) ===
  if (path === '/dealers/all' && req.method === 'GET') {
    console.log(`[${timestamp}] → FRONTEND DEALERS: Get All Dealers for Dropdown`);
    
    try {
      const dealersCollection = db.collection('dealers');
      
      // Get active dealers for dropdown
      const dealers = await dealersCollection.find({ 
        status: 'active' 
      })
      .project({
        businessName: 1,
        'profile.logo': 1,
        'verification.status': 1,
        sellerType: 1,
        businessType: 1,
        privateSeller: 1
      })
      .sort({ businessName: 1 })
      .toArray();
      
      // Map to format expected by frontend
      const dealersForDropdown = dealers.map(dealer => ({
        _id: dealer._id,
        businessName: dealer.businessName,
        name: dealer.businessName,
        logo: dealer.profile?.logo,
        sellerType: dealer.sellerType || 'dealership',
        businessType: dealer.businessType,
        privateSeller: dealer.privateSeller,
        verification: {
          isVerified: dealer.verification?.status === 'verified'
        },
        displayName: dealer.sellerType === 'private' && dealer.privateSeller
          ? `${dealer.privateSeller.firstName} ${dealer.privateSeller.lastName}`
          : dealer.businessName
      }));
      
      return res.status(200).json({
        success: true,
        count: dealersForDropdown.length,
        data: dealersForDropdown
      });
      
    } catch (error) {
      console.error(`[${timestamp}] /dealers/all error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get dealers for dropdown',
        error: error.message
      });
    }
  }

  // === UPDATE DEALER STATUS ===
  if (path.match(/^\/dealers\/[a-fA-F0-9]{24}\/status\/[a-zA-Z]+$/) && req.method === 'PUT') {
    const pathParts = path.split('/');
    const dealerId = pathParts[2];
    const newStatus = pathParts[4]; // active, inactive, pending, suspended
    console.log(`[${timestamp}] → UPDATE DEALER STATUS: ${dealerId} to ${newStatus}`);
    
    try {
      const dealersCollection = db.collection('dealers');
      const { ObjectId } = await import('mongodb');
      
      const existingDealer = await dealersCollection.findOne({ 
        _id: new ObjectId(dealerId) 
      });
      
      if (!existingDealer) {
        return res.status(404).json({
          success: false,
          message: 'Dealer not found'
        });
      }
      
      const result = await dealersCollection.updateOne(
        { _id: new ObjectId(dealerId) },
        { 
          $set: { 
            status: newStatus,
            updatedAt: new Date()
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ Dealer status updated: ${existingDealer.businessName} → ${newStatus}`);
      
      return res.status(200).json({
        success: true,
        message: `Dealer status updated to ${newStatus}`,
        data: {
          id: dealerId,
          businessName: existingDealer.businessName,
          status: newStatus,
          updatedAt: new Date()
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Update dealer status error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update dealer status',
        error: error.message
      });
    }
  }

  // === DEBUG: VERIFY DEALER WITH UNDEFINED HANDLING ===
  if (path.match(/^\/dealers\/undefined\/verify$/) && req.method === 'PUT') {
    console.log(`[${timestamp}] ⚠️ Dealer verification called with undefined ID`);
    return res.status(400).json({
      success: false,
      message: 'Dealer ID is missing or undefined',
      debug: {
        receivedPath: path,
        issue: 'Frontend is passing undefined as dealer ID',
        solution: 'Check frontend JavaScript - dealer ID extraction might be failing'
      }
    });
  }

  // === VERIFY DEALER (FRONTEND PATH) ===
  if (path.match(/^\/dealers\/[a-fA-F0-9]{24}\/verify$/) && req.method === 'PUT') {
    const dealerId = path.split('/')[2]; // Extract dealer ID from /dealers/{id}/verify
    console.log(`[${timestamp}] → VERIFY DEALER (frontend path): "${dealerId}"`);
    
    // Check if admin token provided (optional for backward compatibility)
    const authHeader = req.headers.authorization;
    let adminUser = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const authResult = await verifyAdminToken(req);
      if (authResult.success) {
        adminUser = authResult.user;
        console.log(`[${timestamp}] Admin verification by: ${adminUser.name}`);
      }
    }
    
    try {
      const dealersCollection = db.collection('dealers');
      const { ObjectId } = await import('mongodb');
      
      // Find existing dealer
      const existingDealer = await dealersCollection.findOne({ 
        _id: new ObjectId(dealerId) 
      });
      
      if (!existingDealer) {
        console.log(`[${timestamp}] Dealer not found for verification: ${dealerId}`);
        return res.status(404).json({
          success: false,
          message: 'Dealer not found'
        });
      }
      
      // Update dealer with verification info
      const verificationData = {
        status: 'verified',
        verification: {
          status: 'verified',
          verifiedAt: new Date(),
          verifiedBy: adminUser ? adminUser.id : 'system',
          verifierName: adminUser ? adminUser.name : 'System'
        },
        updatedAt: new Date()
      };
      
      if (adminUser) {
        verificationData.lastUpdatedBy = {
          userId: adminUser.id,
          userEmail: adminUser.email,
          userName: adminUser.name,
          timestamp: new Date(),
          action: 'verification'
        };
      }
      
      const result = await dealersCollection.updateOne(
        { _id: new ObjectId(dealerId) },
        { $set: verificationData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Dealer not found'
        });
      }
      
      console.log(`[${timestamp}] ✅ Dealer verified: ${existingDealer.businessName} by ${adminUser ? adminUser.name : 'system'}`);
      
      return res.status(200).json({
        success: true,
        message: 'Dealer verified successfully',
        data: {
          id: dealerId,
          businessName: existingDealer.businessName,
          status: 'verified',
          verifiedAt: verificationData.verification.verifiedAt,
          verifiedBy: adminUser ? adminUser.name : 'System'
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Verify dealer error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify dealer',
        error: error.message
      });
    }
  }

  // === INDIVIDUAL DEALER ===
  if (path.includes('/dealers/') && path !== '/dealers' && !path.includes('/dealers/all') && !path.includes('/dealers/undefined')) {
    const dealerId = path.replace('/dealers/', '').split('?')[0];
    console.log(`[${timestamp}] → INDIVIDUAL DEALER: "${dealerId}"`);
    
    try {
      const dealersCollection = db.collection('dealers');
      const { ObjectId } = await import('mongodb');
      
      let dealer = null;
      
      try {
        dealer = await dealersCollection.findOne({ _id: dealerId });
        if (dealer) {
          console.log(`[${timestamp}] ✅ Found dealer with string ID: ${dealer.businessName}`);
        }
      } catch (stringError) {
        console.log(`[${timestamp}] String lookup failed: ${stringError.message}`);
      }
      
      if (!dealer && dealerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(dealerId)) {
        try {
          dealer = await dealersCollection.findOne({ _id: new ObjectId(dealerId) });
          if (dealer) {
            console.log(`[${timestamp}] ✅ Found dealer with ObjectId: ${dealer.businessName}`);
          }
        } catch (objectIdError) {
          console.log(`[${timestamp}] ObjectId lookup failed: ${objectIdError.message}`);
        }
      }
      
      if (!dealer) {
        return res.status(404).json({
          success: false,
          message: 'Dealer not found',
          dealerId: dealerId
        });
      }
      
      return res.status(200).json({
        success: true,
        data: dealer,
        message: `Found dealer: ${dealer.businessName}`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Dealer lookup error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching dealer',
        error: error.message
      });
    }
  }

  // If no dealer endpoint matched, return null
  return null;
};
