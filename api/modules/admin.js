// admin.js - All Admin CRUD Related APIs

import { verifyAdminToken } from './auth.js';

export const handleAdmin = async (req, res, db, path, searchParams, timestamp) => {
  // Only handle admin-related paths
  if (!path.includes('/admin')) return null;

  console.log(`[${timestamp}] → ADMIN: ${path}`);
  
  // Verify admin access for all admin endpoints
  const authResult = await verifyAdminToken(req);
  if (!authResult.success) {
    return res.status(401).json({
      success: false,
      message: authResult.message
    });
  }
  
  const adminUser = authResult.user;
  console.log(`[${timestamp}] Admin access granted to: ${adminUser.name} (${adminUser.role})`);
  
  // === CREATE NEW LISTING ===
  if (path === '/admin/listings' && req.method === 'POST') {
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
      
      console.log(`[${timestamp}] Creating new listing by admin: ${adminUser.name}`);
      
      const listingsCollection = db.collection('listings');
      const { ObjectId } = await import('mongodb');
      
      // Required fields validation
      const requiredFields = ['title', 'price', 'dealerId'];
      const missingFields = requiredFields.filter(field => !body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }
      
      // Create new listing object
      const newListing = {
        _id: new ObjectId(),
        ...body,
        dealerId: body.dealerId.length === 24 ? new ObjectId(body.dealerId) : body.dealerId,
        status: body.status || 'active',
        featured: body.featured || false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: {
          userId: adminUser.id,
          userEmail: adminUser.email,
          userName: adminUser.name
        }
      };
      
      // Insert listing
      const result = await listingsCollection.insertOne(newListing);
      
      console.log(`[${timestamp}] ✅ New listing created: ${newListing.title} (ID: ${result.insertedId})`);
      
      return res.status(201).json({
        success: true,
        message: 'Listing created successfully',
        data: {
          id: result.insertedId,
          title: newListing.title,
          price: newListing.price,
          status: newListing.status,
          createdAt: newListing.createdAt
        },
        createdBy: adminUser.name
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Create listing error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create listing',
        error: error.message
      });
    }
  }
  
  // === UPDATE EXISTING LISTING ===
  if (path.match(/^\/admin\/listings\/[a-fA-F0-9]{24}$/) && (req.method === 'PUT' || req.method === 'PATCH')) {
    try {
      const listingId = path.split('/').pop();
      
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
      
      console.log(`[${timestamp}] Updating listing ${listingId} by admin: ${adminUser.name}`);
      
      const listingsCollection = db.collection('listings');
      const { ObjectId } = await import('mongodb');
      
      // Find existing listing
      const existingListing = await listingsCollection.findOne({ 
        _id: new ObjectId(listingId) 
      });
      
      if (!existingListing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found'
        });
      }
      
      // Prepare update data
      const updateData = {
        ...body,
        updatedAt: new Date(),
        lastUpdatedBy: {
          userId: adminUser.id,
          userEmail: adminUser.email,
          userName: adminUser.name,
          timestamp: new Date()
        }
      };
      
      // Handle dealerId conversion
      if (body.dealerId && body.dealerId.length === 24) {
        updateData.dealerId = new ObjectId(body.dealerId);
      }
      
      // Update listing
      const result = await listingsCollection.updateOne(
        { _id: new ObjectId(listingId) },
        { $set: updateData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found'
        });
      }
      
      console.log(`[${timestamp}] ✅ Listing updated: ${existingListing.title} by ${adminUser.name}`);
      
      return res.status(200).json({
        success: true,
        message: 'Listing updated successfully',
        data: {
          id: listingId,
          title: updateData.title || existingListing.title,
          updatedFields: Object.keys(body),
          updatedAt: updateData.updatedAt
        },
        updatedBy: adminUser.name
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Update listing error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update listing',
        error: error.message
      });
    }
  }
  
  // === DELETE LISTING ===
  if (path.match(/^\/admin\/listings\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
    try {
      const listingId = path.split('/').pop();
      
      console.log(`[${timestamp}] Deleting listing ${listingId} by admin: ${adminUser.name}`);
      
      const listingsCollection = db.collection('listings');
      const { ObjectId } = await import('mongodb');
      
      // Find existing listing
      const existingListing = await listingsCollection.findOne({ 
        _id: new ObjectId(listingId) 
      });
      
      if (!existingListing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found'
        });
      }
      
      // Soft delete - mark as deleted instead of removing
      const result = await listingsCollection.updateOne(
        { _id: new ObjectId(listingId) },
        { 
          $set: { 
            status: 'deleted',
            deletedAt: new Date(),
            deletedBy: {
              userId: adminUser.id,
              userEmail: adminUser.email,
              userName: adminUser.name,
              timestamp: new Date()
            }
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ Listing deleted: ${existingListing.title} by ${adminUser.name}`);
      
      return res.status(200).json({
        success: true,
        message: 'Listing deleted successfully',
        data: {
          id: listingId,
          title: existingListing.title,
          deletedAt: new Date()
        },
        deletedBy: adminUser.name
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Delete listing error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete listing',
        error: error.message
      });
    }
  }
  
  // === CREATE NEW DEALER ===
  if (path === '/admin/dealers' && req.method === 'POST') {
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
      
      console.log(`[${timestamp}] Creating new dealer by admin: ${adminUser.name}`);
      
      const dealersCollection = db.collection('dealers');
      const { ObjectId } = await import('mongodb');
      
      // Required fields validation
      const requiredFields = ['businessName', 'email'];
      const missingFields = requiredFields.filter(field => !body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }
      
      // Check if dealer email already exists
      const existingDealer = await dealersCollection.findOne({ 
        email: body.email.toLowerCase() 
      });
      
      if (existingDealer) {
        return res.status(400).json({
          success: false,
          message: 'Dealer with this email already exists'
        });
      }
      
      // Create new dealer object
      const newDealer = {
        _id: new ObjectId(),
        ...body,
        email: body.email.toLowerCase(),
        status: body.status || 'active',
        businessType: body.businessType || 'dealer',
        metrics: {
          totalListings: 0,
          activeSales: 0,
          completedSales: 0,
          averageRating: 0,
          totalReviews: 0
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: {
          userId: adminUser.id,
          userEmail: adminUser.email,
          userName: adminUser.name
        }
      };
      
      // Insert dealer
      const result = await dealersCollection.insertOne(newDealer);
      
      console.log(`[${timestamp}] ✅ New dealer created: ${newDealer.businessName} (ID: ${result.insertedId})`);
      
      return res.status(201).json({
        success: true,
        message: 'Dealer created successfully',
        data: {
          id: result.insertedId,
          businessName: newDealer.businessName,
          email: newDealer.email,
          status: newDealer.status,
          createdAt: newDealer.createdAt
        },
        createdBy: adminUser.name
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Create dealer error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create dealer',
        error: error.message
      });
    }
  }
  
  // === UPDATE EXISTING DEALER ===
  if (path.match(/^\/admin\/dealers\/[a-fA-F0-9]{24}$/) && (req.method === 'PUT' || req.method === 'PATCH')) {
    try {
      const dealerId = path.split('/').pop();
      
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
      
      console.log(`[${timestamp}] Updating dealer ${dealerId} by admin: ${adminUser.name}`);
      
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
      
      // Prepare update data
      const updateData = {
        ...body,
        updatedAt: new Date(),
        lastUpdatedBy: {
          userId: adminUser.id,
          userEmail: adminUser.email,
          userName: adminUser.name,
          timestamp: new Date()
        }
      };
      
      // Handle email normalization
      if (body.email) {
        updateData.email = body.email.toLowerCase();
      }
      
      // Update dealer
      const result = await dealersCollection.updateOne(
        { _id: new ObjectId(dealerId) },
        { $set: updateData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Dealer not found'
        });
      }
      
      console.log(`[${timestamp}] ✅ Dealer updated: ${existingDealer.businessName} by ${adminUser.name}`);
      
      return res.status(200).json({
        success: true,
        message: 'Dealer updated successfully',
        data: {
          id: dealerId,
          businessName: updateData.businessName || existingDealer.businessName,
          updatedFields: Object.keys(body),
          updatedAt: updateData.updatedAt
        },
        updatedBy: adminUser.name
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Update dealer error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update dealer',
        error: error.message
      });
    }
  }
  
  // === VERIFY DEALER ===
  if (path.match(/^\/admin\/dealers\/[a-fA-F0-9]{24}\/verify$/) && req.method === 'POST') {
    try {
      const dealerId = path.split('/')[3]; // Extract dealer ID from path
      
      console.log(`[${timestamp}] Verifying dealer ${dealerId} by admin: ${adminUser.name}`);
      
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
      
      // Update dealer with verification info
      const verificationData = {
        status: 'verified',
        verification: {
          status: 'verified',
          verifiedAt: new Date(),
          verifiedBy: adminUser.id,
          verifierName: adminUser.name
        },
        updatedAt: new Date(),
        lastUpdatedBy: {
          userId: adminUser.id,
          userEmail: adminUser.email,
          userName: adminUser.name,
          timestamp: new Date(),
          action: 'verification'
        }
      };
      
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
      
      console.log(`[${timestamp}] ✅ Dealer verified: ${existingDealer.businessName} by ${adminUser.name}`);
      
      return res.status(200).json({
        success: true,
        message: 'Dealer verified successfully',
        data: {
          id: dealerId,
          businessName: existingDealer.businessName,
          status: 'verified',
          verifiedAt: verificationData.verification.verifiedAt,
          verifiedBy: adminUser.name
        },
        verifiedBy: adminUser.name
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
  
  // === DELETE DEALER ===
  if (path.match(/^\/admin\/dealers\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
    try {
      const dealerId = path.split('/').pop();
      
      console.log(`[${timestamp}] Deleting dealer ${dealerId} by admin: ${adminUser.name}`);
      
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
      
      // Soft delete - mark as deleted instead of removing
      const result = await dealersCollection.updateOne(
        { _id: new ObjectId(dealerId) },
        { 
          $set: { 
            status: 'deleted',
            deletedAt: new Date(),
            deletedBy: {
              userId: adminUser.id,
              userEmail: adminUser.email,
              userName: adminUser.name,
              timestamp: new Date()
            }
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ Dealer deleted: ${existingDealer.businessName} by ${adminUser.name}`);
      
      return res.status(200).json({
        success: true,
        message: 'Dealer deleted successfully',
        data: {
          id: dealerId,
          businessName: existingDealer.businessName,
          deletedAt: new Date()
        },
        deletedBy: adminUser.name
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Delete dealer error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete dealer',
        error: error.message
      });
    }
  }
  
  return res.status(404).json({
    success: false,
    message: `Admin endpoint not found: ${path}`,
    availableAdminEndpoints: [
      'POST /admin/listings - Create new listing',
      'PUT /admin/listings/{id} - Update listing', 
      'DELETE /admin/listings/{id} - Delete listing',
      'POST /admin/dealers - Create new dealer',
      'PUT /admin/dealers/{id} - Update dealer',
      'DELETE /admin/dealers/{id} - Delete dealer',
      'POST /admin/dealers/{id}/verify - Verify dealer'
    ]
  });
};
