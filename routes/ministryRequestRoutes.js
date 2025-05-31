// server/routes/ministryRequestRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import { uploadMultipleToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteMultipleFromS3 } from '../utils/s3Delete.js';

const router = express.Router();

// Configure multer for S3 uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept documents and images
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image and PDF files are allowed!'), false);
    }
  }
});

// Simple controller functions - these would be moved to their own controller file in a full implementation
const createMinistryRequest = asyncHandler(async (req, res, next) => {
  try {
    // Parse request data
    const requestData = JSON.parse(req.body.requestData || '{}');
    
    // Handle file uploads with S3
    let documents = [];
    if (req.files?.length > 0) {
      console.log('Uploading ministry request documents to S3...');
      
      const uploadResults = await uploadMultipleToS3(req.files, 'ministry-requests', {
        params: {
          ACL: 'private' // Documents should not be public
        }
      });
      
      documents = uploadResults.map(result => ({
        filename: req.files.find(f => f.originalname === result.originalname)?.originalname || result.filename,
        path: result.url,
        url: result.url,
        key: result.key,
        mimetype: result.mimetype,
        size: result.size
      }));
    }
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'Ministry access request submitted successfully.',
      data: {
        id: 'mr_' + Date.now(),
        ...requestData,
        documents,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error creating ministry request:', error);
    
    // Clean up uploaded files from S3 if there was an error
    if (req.files && req.files.length > 0) {
      try {
        const uploadedUrls = req.files.map(file => file.s3Url).filter(Boolean);
        if (uploadedUrls.length > 0) {
          await deleteMultipleFromS3(uploadedUrls);
        }
      } catch (cleanupError) {
        console.error('Error during S3 cleanup:', cleanupError);
      }
    }
    
    return next(new ErrorResponse('Failed to submit ministry request', 500));
  }
});

const getMinistryRequests = asyncHandler(async (req, res, next) => {
  // For now, return mock data
  res.status(200).json({
    success: true,
    data: [
      {
        _id: 'mr1',
        user: {
          _id: 'user2',
          name: 'Jane Smith',
          email: 'jane@example.com'
        },
        ministryName: 'Ministry of Transport',
        department: 'Road Safety',
        role: 'Director of Public Transportation',
        contactDetails: {
          phone: '+123456789',
          email: 'jane@ministry.gov.bw',
          officeAddress: 'Government Enclave, Block B'
        },
        reason: 'Need access to monitor public transport safety metrics and review public feedback.',
        documents: [
          {
            filename: 'ministry_id.jpg',
            url: '/ministry-requests/mock-ministry-id.jpg',
            mimetype: 'image/jpeg'
          },
          {
            filename: 'appointment_letter.pdf',
            url: '/ministry-requests/mock-appointment-letter.pdf',
            mimetype: 'application/pdf'
          }
        ],
        status: 'pending',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    ]
  });
});

const getMinistryRequest = asyncHandler(async (req, res, next) => {
  res.status(200).json({
    success: true,
    data: {
      _id: req.params.id,
      user: {
        _id: 'user2',
        name: 'Jane Smith',
        email: 'jane@example.com'
      },
      ministryName: 'Ministry of Transport',
      department: 'Road Safety',
      role: 'Director of Public Transportation',
      contactDetails: {
        phone: '+123456789',
        email: 'jane@ministry.gov.bw',
        officeAddress: 'Government Enclave, Block B'
      },
      reason: 'Need access to monitor public transport safety metrics and review public feedback.',
      documents: [
        {
          filename: 'ministry_id.jpg',
          url: '/ministry-requests/mock-ministry-id.jpg',
          mimetype: 'image/jpeg'
        },
        {
          filename: 'appointment_letter.pdf',
          url: '/ministry-requests/mock-appointment-letter.pdf',
          mimetype: 'application/pdf'
        }
      ],
      status: 'pending',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    }
  });
});

const updateMinistryRequestStatus = asyncHandler(async (req, res, next) => {
  const { status, notes } = req.body;
  
  if (!['approved', 'rejected'].includes(status)) {
    return next(new ErrorResponse('Invalid status value', 400));
  }
  
  res.status(200).json({
    success: true,
    message: `Request ${status} successfully`,
    data: {
      _id: req.params.id,
      status,
      reviewNotes: notes,
      reviewedBy: req.user.id,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  });
});

const deleteMinistryRequest = asyncHandler(async (req, res, next) => {
  // In a real implementation, you'd delete from database and S3
  res.status(200).json({
    success: true,
    message: 'Ministry request deleted successfully',
    data: {}
  });
});

// Routes
router.post('/', protect, upload.array('documents', 5), createMinistryRequest);
router.get('/', protect, authorize('admin'), getMinistryRequests);
router.get('/:id', protect, authorize('admin'), getMinistryRequest);
router.put('/:id/status', protect, authorize('admin'), updateMinistryRequestStatus);
router.delete('/:id', protect, authorize('admin'), deleteMinistryRequest);

export default router;