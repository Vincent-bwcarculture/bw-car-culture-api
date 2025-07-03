// server/middleware/upload.js
import multer from 'multer';
import path from 'path';
import { ErrorResponse } from '../utils/errorResponse.js';

// Configure multer for memory storage (for cloud uploads)
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new ErrorResponse('Only images and documents are allowed', 400));
  }
};

// Configure multer
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Max 10 files at once
  },
  fileFilter
});

// Single file upload middleware
export const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ErrorResponse('File too large. Maximum size is 10MB', 400));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new ErrorResponse('Too many files. Maximum is 10 files', 400));
        }
        return next(new ErrorResponse(err.message, 400));
      } else if (err) {
        return next(err);
      }
      next();
    });
  };
};

// Multiple file upload middleware
export const uploadMultiple = (fieldName, maxCount = 10) => {
  return (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ErrorResponse('File too large. Maximum size is 10MB', 400));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new ErrorResponse(`Too many files. Maximum is ${maxCount} files`, 400));
        }
        return next(new ErrorResponse(err.message, 400));
      } else if (err) {
        return next(err);
      }
      next();
    });
  };
};

// Field-specific upload middleware
export const uploadFields = (fields) => {
  return (req, res, next) => {
    upload.fields(fields)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ErrorResponse('File too large. Maximum size is 10MB', 400));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new ErrorResponse('Too many files uploaded', 400));
        }
        return next(new ErrorResponse(err.message, 400));
      } else if (err) {
        return next(err);
      }
      next();
    });
  };
};

export default upload;
