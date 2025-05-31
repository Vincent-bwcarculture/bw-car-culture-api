// server/middleware/advancedResults.js

export const advancedResults = (model, populate) => async (req, res, next) => {
    let query;
  
    // Copy req.query
    const reqQuery = { ...req.query };
  
    // Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit', 'search'];
  
    // Remove excluded fields from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);
  
    // Create operators ($gt, $gte, etc)
    let queryStr = JSON.stringify(reqQuery);
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);
  
    // Finding resource
    query = model.find(JSON.parse(queryStr));
  
    // Handle text search
    if (req.query.search) {
      query = query.find({ $text: { $search: req.query.search } });
    }
  
    // Select Fields
    if (req.query.select) {
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }
  
    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }
  
    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await model.countDocuments(JSON.parse(queryStr));
  
    query = query.skip(startIndex).limit(limit);
  
    // Populate
    if (populate) {
      query = query.populate(populate);
    }
  
    // Execute query
    const results = await query;
  
    // Pagination result
    const pagination = {};
  
    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit
      };
    }
  
    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit
      };
    }
  
    // Add geospatial filtering if coordinates are provided
    if (req.query.lat && req.query.lng && req.query.distance) {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const distance = parseFloat(req.query.distance);
  
      // Calculate radius in radians (distance in km / Earth's radius)
      const radius = distance / 6378.1;
  
      results = await model.find({
        'location.coordinates': {
          $geoWithin: {
            $centerSphere: [[lng, lat], radius]
          }
        }
      });
    }
  
    // Add price range filtering
    if (req.query.minPrice || req.query.maxPrice) {
      const priceFilter = {};
      
      if (req.query.minPrice) {
        priceFilter.$gte = parseFloat(req.query.minPrice);
      }
      
      if (req.query.maxPrice) {
        priceFilter.$lte = parseFloat(req.query.maxPrice);
      }
      
      query = query.find({ price: priceFilter });
    }
  
    // Add year range filtering
    if (req.query.minYear || req.query.maxYear) {
      const yearFilter = {};
      
      if (req.query.minYear) {
        yearFilter.$gte = parseInt(req.query.minYear);
      }
      
      if (req.query.maxYear) {
        yearFilter.$lte = parseInt(req.query.maxYear);
      }
      
      query = query.find({ 'specifications.year': yearFilter });
    }
  
    res.advancedResults = {
      success: true,
      count: results.length,
      pagination,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      data: results
    };
  
    next();
  };