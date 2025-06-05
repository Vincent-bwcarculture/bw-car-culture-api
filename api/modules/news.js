// news.js - All News Related APIs

export const handleNews = async (req, res, db, path, searchParams, timestamp) => {
  // Only handle news-related paths
  if (!path.includes('/news')) return null;

  console.log(`[${timestamp}] → NEWS: ${path}`);

  // === GET ALL NEWS ===
  if (path === '/news' && req.method === 'GET') {
    try {
      const newsCollection = db.collection('news');
      
      let filter = {};
      
      // Handle category filter
      if (searchParams.get('category') && searchParams.get('category') !== 'all') {
        filter.category = searchParams.get('category');
      }
      
      // Handle status filter
      if (searchParams.get('status') && searchParams.get('status') !== 'all') {
        filter.status = searchParams.get('status');
      } else {
        // Default to published articles
        filter.status = { $in: ['published', 'featured'] };
      }
      
      // Handle search filter
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { title: searchRegex },
          { content: searchRegex },
          { summary: searchRegex },
          { tags: { $in: [searchRegex] } }
        ];
      }
      
      // Handle author filter
      if (searchParams.get('author')) {
        filter.author = { $regex: searchParams.get('author'), $options: 'i' };
      }
      
      // Handle date range filter
      if (searchParams.get('fromDate') || searchParams.get('toDate')) {
        filter.publishedAt = {};
        if (searchParams.get('fromDate')) {
          filter.publishedAt.$gte = new Date(searchParams.get('fromDate'));
        }
        if (searchParams.get('toDate')) {
          filter.publishedAt.$lte = new Date(searchParams.get('toDate'));
        }
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      // Sorting
      let sort = { publishedAt: -1, createdAt: -1 }; // default: newest first
      const sortParam = searchParams.get('sort');
      
      if (sortParam) {
        switch (sortParam) {
          case 'title':
            sort = { title: 1 };
            break;
          case '-title':
            sort = { title: -1 };
            break;
          case 'publishedAt':
            sort = { publishedAt: 1 };
            break;
          case '-publishedAt':
            sort = { publishedAt: -1 };
            break;
          case 'views':
            sort = { views: -1 };
            break;
          case 'category':
            sort = { category: 1, publishedAt: -1 };
            break;
          default:
            // Keep default sorting
            break;
        }
      }
      
      console.log(`[${timestamp}] NEWS QUERY:`, {
        filter: filter,
        sort: sort,
        page: page,
        limit: limit
      });
      
      // Execute query
      const articles = await newsCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      const total = await newsCollection.countDocuments(filter);
      
      console.log(`[${timestamp}] Found ${articles.length} news articles (${total} total)`);
      
      return res.status(200).json({
        success: true,
        data: articles,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `Found ${articles.length} news articles`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] News fetch error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching news',
        error: error.message
      });
    }
  }

  // === CREATE NEWS ARTICLE ===
  if (path === '/news' && req.method === 'POST') {
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
      
      console.log(`[${timestamp}] Creating news article: ${body.title}`);
      
      const newsCollection = db.collection('news');
      const { ObjectId } = await import('mongodb');
      
      // Validate required fields
      const requiredFields = ['title', 'content'];
      const missingFields = requiredFields.filter(field => !body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }
      
      // Generate slug from title
      const generateSlug = (title) => {
        return title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') + '-' + Date.now();
      };
      
      const newArticle = {
        _id: new ObjectId(),
        title: body.title,
        slug: generateSlug(body.title),
        content: body.content,
        summary: body.summary || '',
        category: body.category || 'general',
        author: body.author || 'BW Car Culture',
        authorId: body.authorId || null,
        featuredImage: body.featuredImage || '',
        images: Array.isArray(body.images) ? body.images : [],
        tags: Array.isArray(body.tags) ? body.tags : [],
        status: body.status || 'draft',
        featured: Boolean(body.featured),
        views: 0,
        likes: 0,
        shares: 0,
        publishedAt: body.status === 'published' ? new Date() : null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await newsCollection.insertOne(newArticle);
      
      console.log(`[${timestamp}] ✅ News article created: ${newArticle.title} (ID: ${result.insertedId})`);
      
      return res.status(201).json({
        success: true,
        message: 'News article created successfully',
        data: {
          id: result.insertedId,
          title: newArticle.title,
          slug: newArticle.slug,
          status: newArticle.status,
          createdAt: newArticle.createdAt
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Create news article error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create news article',
        error: error.message
      });
    }
  }

  // === UPDATE NEWS ARTICLE ===
  if (path.match(/^\/news\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
    const articleId = path.split('/').pop();
    console.log(`[${timestamp}] → UPDATE NEWS ARTICLE ${articleId}`);
    
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
      
      const newsCollection = db.collection('news');
      const { ObjectId } = await import('mongodb');
      
      const updateData = {
        ...body,
        updatedAt: new Date()
      };
      
      // Update publishedAt if status is changed to published
      if (body.status === 'published' && !body.publishedAt) {
        updateData.publishedAt = new Date();
      }
      
      const result = await newsCollection.updateOne(
        { _id: new ObjectId(articleId) },
        { $set: updateData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'News article not found'
        });
      }
      
      const updatedArticle = await newsCollection.findOne({ 
        _id: new ObjectId(articleId) 
      });
      
      console.log(`[${timestamp}] ✅ News article updated: ${articleId}`);
      
      return res.status(200).json({
        success: true,
        message: 'News article updated successfully',
        data: updatedArticle
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Update news article error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update news article',
        error: error.message
      });
    }
  }

  // === DELETE NEWS ARTICLE ===
  if (path.match(/^\/news\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
    const articleId = path.split('/').pop();
    console.log(`[${timestamp}] → DELETE NEWS ARTICLE ${articleId}`);
    
    try {
      const newsCollection = db.collection('news');
      const { ObjectId } = await import('mongodb');
      
      // Check if article exists
      const existingArticle = await newsCollection.findOne({ 
        _id: new ObjectId(articleId) 
      });
      
      if (!existingArticle) {
        return res.status(404).json({
          success: false,
          message: 'News article not found'
        });
      }
      
      // Soft delete - mark as deleted
      const result = await newsCollection.updateOne(
        { _id: new ObjectId(articleId) },
        { 
          $set: { 
            status: 'deleted',
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ News article deleted: ${existingArticle.title}`);
      
      return res.status(200).json({
        success: true,
        message: 'News article deleted successfully',
        data: { 
          id: articleId, 
          title: existingArticle.title,
          deletedAt: new Date() 
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Delete news article error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete news article',
        error: error.message
      });
    }
  }

  // === INDIVIDUAL NEWS ARTICLE ===
  if (path.includes('/news/') && path !== '/news') {
    const articleId = path.replace('/news/', '').split('?')[0];
    console.log(`[${timestamp}] → INDIVIDUAL NEWS ARTICLE: "${articleId}"`);
    
    try {
      const newsCollection = db.collection('news');
      const { ObjectId } = await import('mongodb');
      
      let article = null;
      
      // Try to find by slug first (for SEO-friendly URLs)
      if (!articleId.match(/^[0-9a-fA-F]{24}$/)) {
        article = await newsCollection.findOne({ slug: articleId });
      }
      
      // Try to find by ObjectId if slug search fails
      if (!article && articleId.length === 24 && /^[0-9a-fA-F]{24}$/.test(articleId)) {
        try {
          article = await newsCollection.findOne({ _id: new ObjectId(articleId) });
        } catch (objectIdError) {
          console.log(`[${timestamp}] Article ObjectId lookup failed`);
        }
      }
      
      // Try to find by string ID as fallback
      if (!article) {
        try {
          article = await newsCollection.findOne({ _id: articleId });
        } catch (stringError) {
          console.log(`[${timestamp}] Article string lookup failed`);
        }
      }
      
      if (!article) {
        return res.status(404).json({
          success: false,
          message: 'News article not found',
          articleId: articleId
        });
      }
      
      // Increment view count
      try {
        await newsCollection.updateOne(
          { _id: article._id },
          { $inc: { views: 1 } }
        );
      } catch (viewError) {
        console.log(`[${timestamp}] Failed to increment view count:`, viewError.message);
      }
      
      return res.status(200).json({
        success: true,
        data: article,
        message: `Found news article: ${article.title}`
      });
      
    } catch (error) {
      console.error(`[${timestamp}] News article lookup error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching news article',
        error: error.message
      });
    }
  }

  // If no news endpoint matched, return null
  return null;
};
