// server/controllers/newsController.js
import News from '../models/News.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';

// @desc    Get single article
// @route   GET /api/news/:id
// @access  Public
export const getArticle = asyncHandler(async (req, res, next) => {
  const identifier = req.params.id;
  
  console.log(`Attempting to fetch article with identifier: ${identifier}`);
  
  try {
    let article = null;
    
    // First, try to find by ID if it looks like a MongoDB ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
      console.log('Searching by ObjectId...');
      try {
        article = await News.findById(identifier).populate('author', 'name avatar');
        
        if (article) {
          console.log(`Article found by ID: ${article.title}`);
        } else {
          console.log(`No article found with ID: ${identifier}`);
        }
      } catch (dbError) {
        console.error('Database error while searching by ID:', dbError);
      }
    }
    
    // If not found by ID and doesn't look like an ObjectId, try slug as fallback
    if (!article && !/^[0-9a-fA-F]{24}$/.test(identifier)) {
      console.log('Identifier is not an ObjectId, searching by slug...');
      try {
        article = await News.findOne({ slug: identifier }).populate('author', 'name avatar');
        
        if (article) {
          console.log(`Article found by slug: ${article.title}`);
        }
      } catch (dbError) {
        console.error('Database error while searching by slug:', dbError);
      }
    }
    
    if (!article) {
      console.log(`Article not found with identifier: ${identifier}`);
      
      // Log some debugging info
      const count = await News.countDocuments();
      console.log(`Total articles in database: ${count}`);
      
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    console.log(`Article found: ${article.title} (ID: ${article._id})`);

    // In development, show all articles. In production, check status
    if (process.env.NODE_ENV === 'production') {
      if (article.status !== 'published' && 
          (!req.user || !['admin', 'editor'].includes(req.user.role))) {
        return res.status(404).json({
          success: false,
          message: 'Article not found'
        });
      }
    }

    // Fix: Increment view count without triggering validation errors
    try {
      // Use updateOne to avoid validation issues
      await News.updateOne(
        { _id: article._id },
        { $inc: { 'metadata.views': 1 } }
      );
      
      // Update the article object in memory
      article.metadata.views = (article.metadata.views || 0) + 1;
    } catch (updateError) {
      console.error('Error updating view count:', updateError);
      // Continue even if view count update fails
    }

    // Get related articles
    const relatedQuery = process.env.NODE_ENV === 'production' 
      ? { 
          _id: { $ne: article._id },
          category: article.category,
          status: 'published',
          publishDate: { $lte: new Date() }
        }
      : { 
          _id: { $ne: article._id },
          category: article.category
        };

    const related = await News.find(relatedQuery)
      .limit(3)
      .select('title slug featuredImage category publishDate _id');

    // Return the complete article object
    res.status(200).json({
      success: true,
      data: article.toObject(), // Convert to plain object
      related
    });
  } catch (error) {
    console.error('Unexpected error in getArticle:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving article',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Get all articles with filtering
// @route   GET /api/news
// @access  Public
export const getArticles = asyncHandler(async (req, res, next) => {
  let query = {};

  // Category filter
  if (req.query.category && req.query.category !== 'all') {
    query.category = req.query.category;
  }

  // Status filter - allow all in development
  if (req.query.status && req.query.status !== 'all') {
    query.status = req.query.status;
  } else if (process.env.NODE_ENV === 'production' && (!req.user || !['admin', 'editor'].includes(req.user?.role))) {
    query.status = 'published';
    query.publishDate = { $lte: new Date() };
  }

  // Text search
  if (req.query.search) {
    query.$text = { $search: req.query.search };
  }

  // Date range
  if (req.query.startDate || req.query.endDate) {
    query.publishDate = {};
    if (req.query.startDate) {
      query.publishDate.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      query.publishDate.$lte = new Date(req.query.endDate);
    }
  }

  // Tags filter
  if (req.query.tags) {
    const tags = req.query.tags.split(',').map(tag => tag.trim());
    query.tags = { $in: tags };
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  // Log the query for debugging
  console.log('MongoDB Query:', JSON.stringify(query));
  
  const total = await News.countDocuments(query);
  console.log(`Found ${total} total documents matching query`);

  // Build query
  let result = News.find(query)
    .populate({
      path: 'author', 
      select: 'name avatar',
      options: { strictPopulate: false }
    })
    .skip(startIndex)
    .limit(limit);

  // Sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    result = result.sort(sortBy);
  } else {
    result = result.sort('-publishDate -createdAt');
  }

  // Select specific fields
  if (req.query.select) {
    const fields = req.query.select.split(',').join(' ');
    result = result.select(fields);
  }

  const articles = await result;
  console.log(`Query returned ${articles.length} articles`);

  // Pagination result
  const pagination = {};
  if (endIndex < total) {
    pagination.next = { page: page + 1, limit };
  }
  if (startIndex > 0) {
    pagination.prev = { page: page - 1, limit };
  }

  res.status(200).json({
    success: true,
    count: articles.length,
    pagination,
    total,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    data: articles
  });
});

// @desc    Create news article
// @route   POST /api/news
// @access  Private/Editor
export const createArticle = asyncHandler(async (req, res, next) => {
  try {
    // Validate required fields
    if (!req.body.title) {
      return next(new ErrorResponse('Title is required', 400));
    }
    
    if (!req.body.content) {
      return next(new ErrorResponse('Content is required', 400));
    }

    // Add author to body
    req.body.author = req.user.id;
    req.body.authorName = req.user.name || "Car Culture News Desk";

    // Generate slug from title if not provided
    if (!req.body.slug && req.body.title) {
      req.body.slug = req.body.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 150); // Limit slug length
    }

    // Handle different content formats
    if (req.body.content) {
      if (typeof req.body.content === 'string') {
        try {
          if (req.body.content.startsWith('{') || req.body.content.startsWith('[')) {
            const contentObj = JSON.parse(req.body.content);
            if (typeof contentObj === 'object') {
              req.body.content = JSON.stringify(contentObj);
            }
            const wordCount = Object.values(contentObj).join(' ').trim().split(/\s+/).length;
            const readTime = Math.ceil(wordCount / 200) || 3;
            req.body.metadata = {
              views: 0,
              likes: 0,
              comments: 0,
              readTime
            };
          }
        } catch (parseError) {
          const wordCount = req.body.content.trim().split(/\s+/).length;
          const readTime = Math.ceil(wordCount / 200) || 3;
          req.body.metadata = {
            views: 0,
            likes: 0,
            comments: 0,
            readTime
          };
        }
      } else if (typeof req.body.content === 'object') {
        const contentText = Object.values(req.body.content).join(' ');
        const wordCount = contentText.trim().split(/\s+/).length;
        const readTime = Math.ceil(wordCount / 200) || 3;
        req.body.content = JSON.stringify(req.body.content);
        req.body.metadata = {
          views: 0,
          likes: 0,
          comments: 0,
          readTime
        };
      }
    }

    // Handle image uploads
    if (req.files) {
      // Featured image
      if (req.files.featuredImage) {
        const result = await uploadImage(req.files.featuredImage[0], 'news');
        req.body.featuredImage = {
          url: result.url,
          key: result.key,
          size: result.size,
          mimetype: result.mimetype,
          caption: req.body.imageCaption || '',
          credit: req.body.imageCredit || ''
        };
      }

      // Gallery images
      if (req.files.gallery && req.files.gallery.length > 0) {
        const galleryPromises = req.files.gallery.map(async (file) => {
          const result = await uploadImage(file, 'news/gallery');
          return {
            url: result.url,
            key: result.key,
            size: result.size,
            mimetype: result.mimetype,
            caption: ''
          };
        });

        req.body.gallery = await Promise.all(galleryPromises);
      }
    }

    // Parse JSON fields from form data
    ['seo', 'ratings'].forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        try {
          if (req.body[field].startsWith('{') || req.body[field].startsWith('[')) {
            req.body[field] = JSON.parse(req.body[field]);
          }
        } catch (error) {
          console.error(`Error parsing ${field}:`, error);
        }
      }
    });

    // Handle tags field
    if (req.body.tags && typeof req.body.tags === 'string') {
      if (req.body.tags.startsWith('[')) {
        try {
          req.body.tags = JSON.parse(req.body.tags);
        } catch (e) {
          req.body.tags = req.body.tags.split(',').map(tag => tag.trim());
        }
      } else {
        req.body.tags = req.body.tags.split(',').map(tag => tag.trim());
      }
    }

    // Set initial status
    if (!req.body.status) {
      req.body.status = 'draft';
    }

    // Set publish date if status is published and no date is provided
    if (req.body.status === 'published' && !req.body.publishDate) {
      req.body.publishDate = new Date();
    }

    // Create the article
    const article = await News.create(req.body);

    // Populate author information for response
    const populatedArticle = await News.findById(article._id).populate('author', 'name avatar');

    res.status(201).json({
      success: true,
      data: populatedArticle
    });
  } catch (error) {
    console.error('Create article error:', error);
    next(new ErrorResponse(error.message, 500));
  }
});

// @desc    Update article
// @route   PUT /api/news/:id
// @access  Private/Editor
export const updateArticle = asyncHandler(async (req, res, next) => {
  let article = await News.findById(req.params.id);

  if (!article) {
    return next(new ErrorResponse('Article not found', 404));
  }

  // Check ownership or admin rights
  if (article.author.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to update this article', 403));
  }

  // Update slug if title changes
  if (req.body.title && req.body.title !== article.title) {
    req.body.slug = req.body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 150); // Limit slug length
  }

  // Handle content format
  if (req.body.content) {
    if (typeof req.body.content === 'object') {
      req.body.content = JSON.stringify(req.body.content);
    } else if (typeof req.body.content === 'string') {
      try {
        if (req.body.content.startsWith('{') || req.body.content.startsWith('[')) {
          const contentObj = JSON.parse(req.body.content);
          if (typeof contentObj === 'object') {
            req.body.content = JSON.stringify(contentObj);
          }
        }
      } catch (e) {
        // If parsing fails, keep it as is
      }
    }
  }

  // Handle image uploads
  if (req.files) {
    // Featured image
    if (req.files.featuredImage) {
      // Delete old image if it exists
      if (article.featuredImage?.key) {
        await deleteImage(article.featuredImage.key);
      }

      const result = await uploadImage(req.files.featuredImage[0], 'news');
      req.body.featuredImage = {
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype,
        caption: req.body.imageCaption || article.featuredImage?.caption || '',
        credit: req.body.imageCredit || article.featuredImage?.credit || ''
      };
    }

    // Gallery images
    if (req.files.gallery && req.files.gallery.length > 0) {
      // Delete old gallery images if requested to replace them
      if (req.body.replaceGallery === 'true' && article.gallery?.length > 0) {
        const deletePromises = article.gallery.map(img => deleteImage(img.key || img.url));
        await Promise.all(deletePromises);
        
        // Create new gallery
        const galleryPromises = req.files.gallery.map(async (file) => {
          const result = await uploadImage(file, 'news/gallery');
          return {
            url: result.url,
            key: result.key,
            size: result.size,
            mimetype: result.mimetype,
            caption: ''
          };
        });

        req.body.gallery = await Promise.all(galleryPromises);
      } else {
        // Add to existing gallery
        const newImages = await Promise.all(
          req.files.gallery.map(async (file) => {
            const result = await uploadImage(file, 'news/gallery');
            return {
              url: result.url,
              key: result.key,
              size: result.size,
              mimetype: result.mimetype,
              caption: ''
            };
          })
        );
        
        req.body.gallery = [...(article.gallery || []), ...newImages];
      }
    }
  }

  // Parse JSON fields from form data
  ['seo', 'ratings'].forEach(field => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      try {
        if (req.body[field].startsWith('{') || req.body[field].startsWith('[')) {
          req.body[field] = JSON.parse(req.body[field]);
        }
      } catch (error) {
        console.error(`Error parsing ${field}:`, error);
      }
    }
  });

  // Handle tags field
  if (req.body.tags && typeof req.body.tags === 'string') {
    if (req.body.tags.startsWith('[')) {
      try {
        req.body.tags = JSON.parse(req.body.tags);
      } catch (e) {
        req.body.tags = req.body.tags.split(',').map(tag => tag.trim());
      }
    } else {
      req.body.tags = req.body.tags.split(',').map(tag => tag.trim());
    }
  }

  // Update readTime if content changed
  if (req.body.content) {
    let wordCount = 0;
    if (typeof req.body.content === 'string') {
      wordCount = req.body.content.trim().split(/\s+/).length;
    } else if (typeof req.body.content === 'object') {
      const contentText = Object.values(req.body.content).join(' ');
      wordCount = contentText.trim().split(/\s+/).length;
    }
    
    const wordsPerMinute = 200;
    const readTime = Math.ceil(wordCount / wordsPerMinute) || 3;
    
    if (!req.body.metadata) {
      req.body.metadata = article.metadata || {};
    }
    req.body.metadata.readTime = readTime;
  }

  // If status changed to published but no publish date, set it to now
  if (req.body.status === 'published' && !article.publishDate && !req.body.publishDate) {
    req.body.publishDate = new Date();
  }

  // Update the article
  article = await News.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  }).populate('author', 'name avatar');

  res.status(200).json({
    success: true,
    data: article
  });
});

// @desc    Delete article
// @route   DELETE /api/news/:id
// @access  Private/Editor
export const deleteArticle = asyncHandler(async (req, res, next) => {
  const article = await News.findById(req.params.id);

  if (!article) {
    return next(new ErrorResponse('Article not found', 404));
  }

  // Check ownership or admin rights
  if (article.author.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to delete this article', 403));
  }

  // Delete associated images from S3
  if (article.featuredImage?.key) {
    await deleteImage(article.featuredImage.key);
  }

  if (article.gallery?.length > 0) {
    const deletePromises = article.gallery.map(img => deleteImage(img.key || img.url));
    await Promise.all(deletePromises);
  }

  await article.remove();

  res.status(200).json({
    success: true,
    message: 'Article deleted successfully'
  });
});

// @desc    Get featured articles
// @route   GET /api/news/featured
// @access  Public
export const getFeaturedArticles = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 5;
  
  const query = process.env.NODE_ENV === 'production' 
    ? { featured: true, status: 'published', publishDate: { $lte: new Date() } }
    : { featured: true };
  
  console.log('Featured articles query:', JSON.stringify(query));
  
  const articles = await News.find(query)
    .populate({
      path: 'author', 
      select: 'name avatar',
      options: { strictPopulate: false }
    })
    .sort('-publishDate -createdAt')
    .limit(limit);
  
  console.log(`Found ${articles.length} featured articles`);

  // If no featured articles, try getting any articles
  if (articles.length === 0) {
    console.log('No featured articles found, attempting to find any articles');
    
    const anyArticles = await News.find({})
      .populate({
        path: 'author', 
        select: 'name avatar',
        options: { strictPopulate: false }
      })
      .sort('-publishDate -createdAt')
      .limit(limit);
    
    console.log(`Found ${anyArticles.length} articles as fallback`);
    
    if (anyArticles.length > 0) {
      return res.status(200).json({
        success: true,
        count: anyArticles.length,
        data: anyArticles
      });
    }
  }

  res.status(200).json({
    success: true,
    count: articles.length,
    data: articles
  });
});

// @desc    Get latest articles
// @route   GET /api/news/latest
// @access  Public
export const getLatestArticles = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 6;
  
  const query = process.env.NODE_ENV === 'production'
    ? { status: 'published', publishDate: { $lte: new Date() } }
    : {};
  
  console.log('Latest articles query:', JSON.stringify(query));
  
  const articles = await News.find(query)
    .populate({
      path: 'author', 
      select: 'name avatar',
      options: { strictPopulate: false }
    })
    .sort('-publishDate -createdAt')
    .limit(limit);
  
  console.log(`Found ${articles.length} latest articles`);

  res.status(200).json({
    success: true,
    count: articles.length,
    data: articles
  });
});

// @desc    Get trending articles (most viewed)
// @route   GET /api/news/trending
// @access  Public
export const getTrendingArticles = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 5;
  
  const articles = await News.find({
    status: 'published',
    publishDate: { $lte: new Date() }
  })
    .populate('author', 'name avatar')
    .sort('-metadata.views')
    .limit(limit);

  res.status(200).json({
    success: true,
    count: articles.length,
    data: articles
  });
});

// @desc    Toggle like on article
// @route   PUT /api/news/:id/like
// @access  Private
export const toggleLike = asyncHandler(async (req, res, next) => {
  const article = await News.findById(req.params.id);

  if (!article) {
    return next(new ErrorResponse('Article not found', 404));
  }

  // In a real app, you'd check if user has already liked and toggle
  // For simplicity, we'll just increment the likes count
  article.metadata.likes += 1;
  await article.save();

  res.status(200).json({
    success: true,
    likes: article.metadata.likes
  });
});

// @desc    Get articles by category
// @route   GET /api/news/category/:category
// @access  Public
export const getArticlesByCategory = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  
  const articles = await News.find({
    category: req.params.category,
    status: 'published',
    publishDate: { $lte: new Date() }
  })
    .populate('author', 'name avatar')
    .sort('-publishDate')
    .limit(limit);

  res.status(200).json({
    success: true,
    count: articles.length,
    data: articles
  });
});

// @desc    Get articles by tag
// @route   GET /api/news/tags/:tag
// @access  Public
export const getArticlesByTag = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  
  const articles = await News.find({
    tags: req.params.tag,
    status: 'published',
    publishDate: { $lte: new Date() }
  })
    .populate('author', 'name avatar')
    .sort('-publishDate')
    .limit(limit);

  res.status(200).json({
    success: true,
    count: articles.length,
    data: articles
  });
});

// @desc    Get similar articles
// @route   GET /api/news/:id/similar
// @access  Public
export const getSimilarArticles = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 3;
  
  // First, get the article to find similar ones
  const article = await News.findById(req.params.id);
  
  if (!article) {
    return next(new ErrorResponse('Article not found', 404));
  }
  
  // Find similar articles based on category and tags
  const similarArticles = await News.find({
    _id: { $ne: article._id },
    $or: [
      { category: article.category },
      { tags: { $in: article.tags } }
    ],
    status: 'published',
    publishDate: { $lte: new Date() }
  })
    .populate('author', 'name avatar')
    .sort('-publishDate')
    .limit(limit);
  
  res.status(200).json({
    success: true,
    count: similarArticles.length,
    data: similarArticles
  });
});

// @desc    Toggle featured status
// @route   PATCH /api/news/:id/featured
// @access  Private/Admin
export const toggleFeatured = asyncHandler(async (req, res, next) => {
  const article = await News.findById(req.params.id);

  if (!article) {
    return next(new ErrorResponse('Article not found', 404));
  }

  article.featured = !article.featured;
  await article.save();

  res.status(200).json({
    success: true,
    data: article
  });
});