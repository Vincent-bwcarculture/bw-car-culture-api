// images.js - All Image Upload Related APIs

export const handleImages = async (req, res, db, path, searchParams, timestamp) => {
  // Only handle image-related paths
  if (!path.includes('/images')) return null;

  console.log(`[${timestamp}] → IMAGES: ${path}`);

  // === MULTIPLE IMAGE UPLOAD ENDPOINT FOR CAR LISTINGS ===
  if (path === '/images/upload/multiple' && req.method === 'POST') {
    try {
      console.log(`[${timestamp}] → MULTIPLE S3 IMAGE UPLOAD: Starting`);
      
      // Parse multipart form data for multiple file uploads
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);
      
      console.log(`[${timestamp}] MULTIPLE UPLOAD - Received ${rawBody.length} bytes`);
      
      // Check payload size (Vercel limit is ~4.5MB)
      if (rawBody.length > 4400000) { // 4.4MB
        return res.status(413).json({
          success: false,
          message: 'Payload too large. Maximum total size is 4.4MB for all images combined.',
          receivedSize: rawBody.length,
          maxSize: 4400000
        });
      }
      
      // Extract boundary from content-type
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      
      if (!boundaryMatch) {
        console.log(`[${timestamp}] MULTIPLE UPLOAD - No boundary found`);
        return res.status(400).json({
          success: false,
          message: 'Invalid multipart request - no boundary found'
        });
      }
      
      const boundary = boundaryMatch[1];
      console.log(`[${timestamp}] MULTIPLE UPLOAD - Using boundary: ${boundary}`);
      
      // Parse multipart data to extract multiple files
      const bodyString = rawBody.toString('binary');
      const parts = bodyString.split(`--${boundary}`);
      
      const files = [];
      
      for (const part of parts) {
        if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
          // Extract filename
          const filenameMatch = part.match(/filename="([^"]+)"/);
          if (!filenameMatch) continue;
          
          const filename = filenameMatch[1];
          
          // Skip empty filenames
          if (!filename || filename === '""') continue;
          
          // Extract content type
          let fileType = 'image/jpeg'; // default
          const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
          if (contentTypeMatch) {
            fileType = contentTypeMatch[1].trim();
          }
          
          // Extract file data (after double CRLF)
          const dataStart = part.indexOf('\r\n\r\n');
          if (dataStart !== -1) {
            const fileData = part.substring(dataStart + 4);
            // Remove trailing boundary and whitespace
            const cleanData = fileData.replace(/\r\n$/, '').replace(/\r\n--$/, '');
            const fileBuffer = Buffer.from(cleanData, 'binary');
            
            // Skip very small files (likely empty)
            if (fileBuffer.length < 100) continue;
            
            files.push({
              filename: filename,
              fileType: fileType,
              buffer: fileBuffer,
              size: fileBuffer.length
            });
            
            console.log(`[${timestamp}] MULTIPLE UPLOAD - File parsed: ${filename} (${fileBuffer.length} bytes, ${fileType})`);
          }
        }
      }
      
      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid image files found in upload request'
        });
      }
      
      console.log(`[${timestamp}] MULTIPLE UPLOAD - Found ${files.length} files to upload`);
      
      // Check environment variables for S3
      const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
      const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
      const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
      const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
      
      let uploadedImages = []; // FIXED: Declare at function scope
      
      if (!awsAccessKey || !awsSecretKey) {
        console.log(`[${timestamp}] MULTIPLE UPLOAD - Missing AWS credentials, using mock URLs`);
        
        // Return mock URLs for each file - FIXED FORMAT
        for (const file of files) {
          const mockUrl = `https://${awsBucket}.s3.amazonaws.com/images/listing-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${file.filename}`;
          uploadedImages.push({
            url: mockUrl,
            key: `images/listing-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${file.filename}`,
            size: file.size,
            mimetype: file.fileType,
            thumbnail: mockUrl,
            isPrimary: uploadedImages.length === 0,
            mock: true
          });
        }
        
        return res.status(200).json({
          success: true,
          message: `Multiple image upload simulated (AWS credentials missing)`,
          uploadedCount: files.length,
          images: uploadedImages, // FIXED: Return 'images' array with objects
          urls: uploadedImages.map(img => img.url), // Keep URLs for backward compatibility
          note: 'Configure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel environment variables'
        });
      }
      
      // Real S3 uploads
      try {
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        
        // Create S3 client
        const s3Client = new S3Client({
          region: awsRegion,
          credentials: {
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
          },
        });
        
        console.log(`[${timestamp}] MULTIPLE UPLOAD - S3 client created, uploading ${files.length} files`);
        
        // Upload each file to S3
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          
          try {
            // Generate unique filename for S3 - FIXED PATH
            const timestamp_ms = Date.now();
            const randomString = Math.random().toString(36).substring(2, 8);
            const fileExtension = file.filename.split('.').pop() || 'jpg';
            const s3Filename = `images/listing-${timestamp_ms}-${randomString}-${i}.${fileExtension}`;
            
            console.log(`[${timestamp}] MULTIPLE UPLOAD - Uploading file ${i + 1}/${files.length}: ${s3Filename}`);
            
            // Upload to S3
            const uploadCommand = new PutObjectCommand({
              Bucket: awsBucket,
              Key: s3Filename,
              Body: file.buffer,
              ContentType: file.fileType,
            });
            
            const uploadResult = await s3Client.send(uploadCommand);
            
            // Generate public URL - FIXED FORMAT TO MATCH OLD WORKING IMAGES
            const imageUrl = `https://${awsBucket}.s3.amazonaws.com/${s3Filename}`;
            
            // FIXED: Push object in format frontend expects
            uploadedImages.push({
              url: imageUrl,
              key: s3Filename,
              size: file.size,
              mimetype: file.fileType,
              thumbnail: imageUrl, // For now, same as main image
              isPrimary: i === 0
            });
            
            console.log(`[${timestamp}] MULTIPLE UPLOAD - Success ${i + 1}/${files.length}: ${imageUrl}`);
            
          } catch (fileUploadError) {
            console.error(`[${timestamp}] MULTIPLE UPLOAD - File ${i + 1} failed:`, fileUploadError.message);
            // Don't add failed uploads to the images array
          }
        }
        
        console.log(`[${timestamp}] ✅ MULTIPLE UPLOAD COMPLETE: ${uploadedImages.length} successful, ${files.length - uploadedImages.length} failed`);
        
        return res.status(200).json({
          success: uploadedImages.length > 0,
          message: `Multiple image upload complete: ${uploadedImages.length}/${files.length} successful`,
          uploadedCount: uploadedImages.length,
          images: uploadedImages, // FIXED: Return 'images' array with objects
          urls: uploadedImages.map(img => img.url), // Keep URLs for backward compatibility
          data: {
            totalFiles: files.length,
            successfulUploads: uploadedImages.length,
            failedUploads: files.length - uploadedImages.length,
            uploadedAt: new Date().toISOString(),
            bucket: awsBucket,
            region: awsRegion
          }
        });
        
      } catch (s3ClientError) {
        console.error(`[${timestamp}] MULTIPLE UPLOAD - S3 client error:`, s3ClientError.message);
        
        // Fall back to mock URLs if S3 completely fails - FIXED FORMAT
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const mockFilename = `images/listing-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${i}.jpg`;
          const mockUrl = `https://${awsBucket}.s3.amazonaws.com/${mockFilename}`;
          
          uploadedImages.push({
            url: mockUrl,
            key: mockFilename,
            size: file.size,
            mimetype: file.fileType,
            thumbnail: mockUrl,
            isPrimary: i === 0,
            mock: true,
            s3Error: s3ClientError.message
          });
        }
        
        return res.status(200).json({
          success: true,
          message: `S3 upload failed, using mock URLs for ${files.length} files`,
          uploadedCount: files.length,
          images: uploadedImages, // FIXED: Return 'images' array with objects
          urls: uploadedImages.map(img => img.url), // Keep URLs for backward compatibility
          error: s3ClientError.message,
          note: 'S3 upload failed - check AWS credentials and bucket permissions'
        });
      }
      
    } catch (error) {
      console.error(`[${timestamp}] MULTIPLE UPLOAD ERROR:`, error.message);
      return res.status(500).json({
        success: false,
        message: 'Multiple image upload failed',
        error: error.message,
        timestamp: timestamp
      });
    }
  }

  // === SINGLE IMAGE UPLOAD ENDPOINT ===
  if (path === '/images/upload' && req.method === 'POST') {
    try {
      console.log(`[${timestamp}] → S3 IMAGE UPLOAD: Starting real upload`);
      
      // Parse multipart form data for file upload
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);
      
      console.log(`[${timestamp}] S3 UPLOAD - Received ${rawBody.length} bytes`);
      
      // Extract boundary from content-type
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      
      if (!boundaryMatch) {
        console.log(`[${timestamp}] S3 UPLOAD - No boundary found in content-type`);
        return res.status(400).json({
          success: false,
          message: 'Invalid multipart request - no boundary found'
        });
      }
      
      const boundary = boundaryMatch[1];
      const boundaryBuffer = Buffer.from(`--${boundary}`);
      
      // Simple file extraction from multipart data
      const bodyString = rawBody.toString('binary');
      const parts = bodyString.split(`--${boundary}`);
      
      let fileBuffer = null;
      let filename = null;
      let fileType = null;
      
      for (const part of parts) {
        if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
          // Extract filename
          const filenameMatch = part.match(/filename="([^"]+)"/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
          
          // Extract content type
          const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
          if (contentTypeMatch) {
            fileType = contentTypeMatch[1].trim();
          }
          
          // Extract file data (after double CRLF)
          const dataStart = part.indexOf('\r\n\r\n');
          if (dataStart !== -1) {
            const fileData = part.substring(dataStart + 4);
            // Remove trailing boundary if present
            const cleanData = fileData.replace(/\r\n$/, '');
            fileBuffer = Buffer.from(cleanData, 'binary');
            break;
          }
        }
      }
      
      if (!fileBuffer || !filename) {
        console.log(`[${timestamp}] S3 UPLOAD - No file found in multipart data`);
        return res.status(400).json({
          success: false,
          message: 'No file found in upload request'
        });
      }
      
      console.log(`[${timestamp}] S3 UPLOAD - File extracted: ${filename} (${fileBuffer.length} bytes, type: ${fileType})`);
      
      // Check environment variables
      const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
      const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
      const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
      const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
      
      if (!awsAccessKey || !awsSecretKey) {
        console.log(`[${timestamp}] S3 UPLOAD - Missing AWS credentials`);
        
        // Return mock URL for now but log the issue
        const mockImageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/dealers/dealer-${Date.now()}-${filename}`;
        
        return res.status(200).json({
          success: true,
          message: 'Image upload simulated (AWS credentials missing)',
          imageUrl: mockImageUrl,
          data: {
            url: mockImageUrl,
            filename: filename,
            size: fileBuffer.length,
            uploadedAt: new Date().toISOString(),
            note: 'Configure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel environment variables'
          }
        });
      }
      
      // Try AWS S3 upload
      try {
        // Import AWS SDK for S3 upload
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        
        // Create S3 client
        const s3Client = new S3Client({
          region: awsRegion,
          credentials: {
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
          },
        });
        
        // Generate unique filename
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const fileExtension = filename.split('.').pop() || 'jpg';
        const s3Filename = `dealers/dealer-${timestamp}-${randomString}.${fileExtension}`;
        
        console.log(`[${timestamp}] S3 UPLOAD - Uploading to: ${s3Filename}`);
        
        // Upload to S3
        const uploadCommand = new PutObjectCommand({
          Bucket: awsBucket,
          Key: s3Filename,
          Body: fileBuffer,
          ContentType: fileType || 'image/jpeg',
        });
        
        const uploadResult = await s3Client.send(uploadCommand);
        
        // Generate public URL
        const imageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Filename}`;
        
        console.log(`[${timestamp}] ✅ S3 UPLOAD SUCCESS: ${imageUrl}`);
        
        return res.status(200).json({
          success: true,
          message: 'Image uploaded successfully to S3',
          imageUrl: imageUrl,
          data: {
            url: imageUrl,
            filename: s3Filename,
            size: fileBuffer.length,
            uploadedAt: new Date().toISOString(),
            etag: uploadResult.ETag,
            bucket: awsBucket,
            region: awsRegion
          }
        });
        
      } catch (s3Error) {
        console.error(`[${timestamp}] S3 UPLOAD ERROR:`, s3Error.message);
        
        // If S3 upload fails, fall back to mock URL
        const mockImageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/dealers/dealer-${Date.now()}-${filename}`;
        
        return res.status(200).json({
          success: true,
          message: 'S3 upload failed, using mock URL',
          imageUrl: mockImageUrl,
          data: {
            url: mockImageUrl,
            filename: filename,
            size: fileBuffer.length,
            uploadedAt: new Date().toISOString(),
            error: s3Error.message,
            note: 'S3 upload failed - check AWS credentials and bucket permissions'
          }
        });
      }
      
    } catch (error) {
      console.error(`[${timestamp}] IMAGE UPLOAD ERROR:`, error.message);
      return res.status(500).json({
        success: false,
        message: 'Image upload failed',
        error: error.message
      });
    }
  }

  // If no image endpoint matched, return null
  return null;
};
