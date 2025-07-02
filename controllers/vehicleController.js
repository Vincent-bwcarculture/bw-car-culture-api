// server/controllers/vehicleController.js
import Vehicle from '../models/Vehicle.js';
import User from '../models/User.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';

// @desc    Get user's vehicles
// @route   GET /api/user/profile/vehicles
// @access  Private
export const getUserVehicles = asyncHandler(async (req, res, next) => {
  const vehicles = await Vehicle.findByOwner(req.user.id, {
    includeInactive: req.query.includeInactive === 'true'
  });

  res.status(200).json({
    success: true,
    count: vehicles.length,
    data: vehicles
  });
});

// @desc    Get single vehicle
// @route   GET /api/user/profile/vehicles/:id
// @access  Private
export const getVehicle = asyncHandler(async (req, res, next) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
    isDeleted: false
  }).populate('serviceHistory.workshopId', 'businessName location.city contact.phone');

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  res.status(200).json({
    success: true,
    data: vehicle
  });
});

// @desc    Add new vehicle
// @route   POST /api/user/profile/vehicles
// @access  Private
export const addVehicle = asyncHandler(async (req, res, next) => {
  const {
    make, model, year, color, bodyType, fuelType, transmission,
    vin, licensePlate, engineNumber, ownershipStatus, purchaseDate,
    purchasePrice, mileage, condition, location, lastServiceDate,
    nextServiceDue, preferredWorkshop, serviceReminders, forSale,
    askingPrice, sellingReason, negotiable, trackPerformance,
    allowListingByOthers, insuranceCompany, insuranceExpiryDate,
    licenseExpiryDate, description, specialFeatures, notifications
  } = req.body;

  // Validate required fields
  if (!make || !model || !year) {
    return next(new ErrorResponse('Make, model, and year are required', 400));
  }

  // Check if license plate already exists (if provided)
  if (licensePlate) {
    const existingVehicle = await Vehicle.findOne({ 
      licensePlate: licensePlate.toUpperCase(),
      isDeleted: false 
    });
    
    if (existingVehicle && existingVehicle.ownerId.toString() !== req.user.id) {
      return next(new ErrorResponse('A vehicle with this license plate is already registered', 400));
    }
  }

  const vehicleData = {
    ownerId: req.user.id,
    make: make.trim(),
    model: model.trim(),
    year: parseInt(year),
    color: color?.trim(),
    bodyType,
    fuelType,
    transmission,
    vin: vin?.trim().toUpperCase(),
    licensePlate: licensePlate?.trim().toUpperCase(),
    engineNumber: engineNumber?.trim(),
    ownershipStatus,
    purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
    purchasePrice: purchasePrice ? parseFloat(purchasePrice) : undefined,
    mileage: mileage ? parseInt(mileage) : undefined,
    condition,
    location,
    lastServiceDate: lastServiceDate ? new Date(lastServiceDate) : undefined,
    nextServiceDue: nextServiceDue ? new Date(nextServiceDue) : undefined,
    preferredWorkshop: preferredWorkshop?.trim(),
    serviceReminders: serviceReminders !== false,
    forSale: forSale === true,
    askingPrice: askingPrice ? parseFloat(askingPrice) : undefined,
    sellingReason: sellingReason?.trim(),
    negotiable: negotiable !== false,
    trackPerformance: trackPerformance !== false,
    allowListingByOthers: allowListingByOthers === true,
    insuranceCompany: insuranceCompany?.trim(),
    insuranceExpiryDate: insuranceExpiryDate ? new Date(insuranceExpiryDate) : undefined,
    licenseExpiryDate: licenseExpiryDate ? new Date(licenseExpiryDate) : undefined,
    description: description?.trim(),
    specialFeatures: specialFeatures || [],
    notifications: {
      serviceReminders: notifications?.serviceReminders !== false,
      insuranceReminders: notifications?.insuranceReminders !== false,
      licenseReminders: notifications?.licenseReminders !== false,
      listingUpdates: notifications?.listingUpdates !== false
    }
  };

  const vehicle = await Vehicle.create(vehicleData);

  res.status(201).json({
    success: true,
    data: vehicle
  });
});

// @desc    Update vehicle
// @route   PUT /api/user/profile/vehicles/:id
// @access  Private
export const updateVehicle = asyncHandler(async (req, res, next) => {
  let vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
    isDeleted: false
  });

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  // Check if license plate already exists (if being updated)
  if (req.body.licensePlate && req.body.licensePlate !== vehicle.licensePlate) {
    const existingVehicle = await Vehicle.findOne({ 
      licensePlate: req.body.licensePlate.toUpperCase(),
      isDeleted: false,
      _id: { $ne: req.params.id }
    });
    
    if (existingVehicle && existingVehicle.ownerId.toString() !== req.user.id) {
      return next(new ErrorResponse('A vehicle with this license plate is already registered', 400));
    }
  }

  // Process update data
  const updateData = { ...req.body };
  
  // Handle special fields
  if (updateData.licensePlate) {
    updateData.licensePlate = updateData.licensePlate.toUpperCase();
  }
  if (updateData.vin) {
    updateData.vin = updateData.vin.toUpperCase();
  }
  
  // Handle date fields
  ['purchaseDate', 'lastServiceDate', 'nextServiceDue', 'insuranceExpiryDate', 'licenseExpiryDate'].forEach(field => {
    if (updateData[field]) {
      updateData[field] = new Date(updateData[field]);
    }
  });

  vehicle = await Vehicle.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: vehicle
  });
});

// @desc    Delete vehicle
// @route   DELETE /api/user/profile/vehicles/:id
// @access  Private
export const deleteVehicle = asyncHandler(async (req, res, next) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
    isDeleted: false
  });

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  // Soft delete
  vehicle.isDeleted = true;
  vehicle.isActive = false;
  await vehicle.save();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Upload vehicle images
// @route   POST /api/user/profile/vehicles/:id/images
// @access  Private
export const uploadVehicleImages = asyncHandler(async (req, res, next) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
    isDeleted: false
  });

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  if (!req.files || req.files.length === 0) {
    return next(new ErrorResponse('Please select images to upload', 400));
  }

  const uploadedImages = [];

  try {
    for (const file of req.files) {
      const result = await uploadImage(file, 'vehicles');
      uploadedImages.push({
        url: result.url,
        key: result.key,
        filename: file.originalname,
        isPrimary: vehicle.images.length === 0 && uploadedImages.length === 0
      });
    }

    vehicle.images.push(...uploadedImages);
    await vehicle.save();

    res.status(200).json({
      success: true,
      data: uploadedImages
    });
  } catch (error) {
    // Clean up any uploaded images on error
    for (const image of uploadedImages) {
      try {
        await deleteImage(image.key);
      } catch (deleteError) {
        console.error('Error deleting image after upload failure:', deleteError);
      }
    }
    return next(new ErrorResponse('Error uploading images', 500));
  }
});

// @desc    Delete vehicle image
// @route   DELETE /api/user/profile/vehicles/:id/images/:imageIndex
// @access  Private
export const deleteVehicleImage = asyncHandler(async (req, res, next) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
    isDeleted: false
  });

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  const imageIndex = parseInt(req.params.imageIndex);
  if (imageIndex < 0 || imageIndex >= vehicle.images.length) {
    return next(new ErrorResponse('Image not found', 404));
  }

  const imageToDelete = vehicle.images[imageIndex];

  try {
    // Delete from cloud storage
    await deleteImage(imageToDelete.key);
    
    // Remove from vehicle
    vehicle.images.splice(imageIndex, 1);
    
    // If deleted image was primary and there are other images, make the first one primary
    if (imageToDelete.isPrimary && vehicle.images.length > 0) {
      vehicle.images[0].isPrimary = true;
    }
    
    await vehicle.save();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    return next(new ErrorResponse('Error deleting image', 500));
  }
});

// @desc    Set primary image
// @route   PUT /api/user/profile/vehicles/:id/images/:imageIndex/primary
// @access  Private
export const setPrimaryImage = asyncHandler(async (req, res, next) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
    isDeleted: false
  });

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  const imageIndex = parseInt(req.params.imageIndex);
  if (imageIndex < 0 || imageIndex >= vehicle.images.length) {
    return next(new ErrorResponse('Image not found', 404));
  }

  // Remove primary status from all images
  vehicle.images.forEach(image => { image.isPrimary = false; });
  
  // Set new primary image
  vehicle.images[imageIndex].isPrimary = true;
  
  await vehicle.save();

  res.status(200).json({
    success: true,
    data: vehicle.images
  });
});

// @desc    Add service record
// @route   POST /api/user/profile/vehicles/:id/service
// @access  Private
export const addServiceRecord = asyncHandler(async (req, res, next) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
    isDeleted: false
  });

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  const { workshopName, serviceType, description, cost, mileageAtService, receipts } = req.body;

  if (!workshopName || !serviceType) {
    return next(new ErrorResponse('Workshop name and service type are required', 400));
  }

  const serviceData = {
    workshopName: workshopName.trim(),
    serviceType: serviceType.trim(),
    description: description?.trim(),
    cost: cost ? parseFloat(cost) : undefined,
    mileageAtService: mileageAtService ? parseInt(mileageAtService) : vehicle.mileage,
    receipts: receipts || []
  };

  await vehicle.addServiceRecord(serviceData);

  res.status(201).json({
    success: true,
    data: vehicle.serviceHistory[vehicle.serviceHistory.length - 1]
  });
});

// @desc    Get vehicle analytics
// @route   GET /api/user/profile/vehicles/:id/analytics
// @access  Private
export const getVehicleAnalytics = asyncHandler(async (req, res, next) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
    isDeleted: false
  });

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  // Get basic analytics
  const analytics = {
    performanceMetrics: vehicle.performanceMetrics,
    serviceHistory: {
      totalServices: vehicle.serviceHistory.length,
      lastServiceDate: vehicle.lastServiceDate,
      totalServiceCost: vehicle.serviceHistory.reduce((sum, service) => sum + (service.cost || 0), 0),
      averageServiceCost: vehicle.serviceHistory.length > 0 
        ? vehicle.serviceHistory.reduce((sum, service) => sum + (service.cost || 0), 0) / vehicle.serviceHistory.length 
        : 0
    },
    marketValue: {
      estimatedValue: vehicle.askingPrice,
      marketInterest: vehicle.performanceMetrics.views + vehicle.performanceMetrics.inquiries
    },
    maintenanceAlerts: {
      serviceDue: vehicle.isServiceDue,
      expiryWarnings: vehicle.expiryWarnings
    }
  };

  res.status(200).json({
    success: true,
    data: analytics
  });
});

// @desc    Update vehicle performance metrics
// @route   PUT /api/user/profile/vehicles/:id/metrics
// @access  Private (internal use)
export const updateVehicleMetrics = asyncHandler(async (req, res, next) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  const { metricType, increment = 1 } = req.body;

  await vehicle.updatePerformanceMetrics(metricType, increment);

  res.status(200).json({
    success: true,
    data: vehicle.performanceMetrics
  });
});

// @desc    Get vehicles due for service
// @route   GET /api/user/profile/vehicles/service-due
// @access  Private
export const getVehiclesDueForService = asyncHandler(async (req, res, next) => {
  const vehicles = await Vehicle.find({
    ownerId: req.user.id,
    isActive: true,
    isDeleted: false,
    serviceReminders: true,
    $or: [
      { nextServiceDue: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }, // Next 30 days
      { 
        insuranceExpiryDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        'notifications.insuranceReminders': true
      },
      { 
        licenseExpiryDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        'notifications.licenseReminders': true
      }
    ]
  });

  res.status(200).json({
    success: true,
    count: vehicles.length,
    data: vehicles
  });
});

// @desc    Get user vehicle ownership statistics
// @route   GET /api/user/profile/vehicles/stats
// @access  Private
export const getVehicleStats = asyncHandler(async (req, res, next) => {
  const stats = await Vehicle.getOwnershipStats(req.user.id);

  res.status(200).json({
    success: true,
    data: stats[0] || {
      totalVehicles: 0,
      forSaleCount: 0,
      totalValue: 0,
      avgYear: 0,
      makeBreakdown: []
    }
  });
});

// @desc    Link vehicle to listing
// @route   POST /api/user/profile/vehicles/:id/link-listing
// @access  Private (internal use)
export const linkVehicleToListing = asyncHandler(async (req, res, next) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
    isDeleted: false
  });

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  const { listingId, listingType } = req.body;

  if (!listingId || !listingType) {
    return next(new ErrorResponse('Listing ID and type are required', 400));
  }

  await vehicle.linkListing(listingId, listingType);

  res.status(200).json({
    success: true,
    data: vehicle.linkedListings
  });
});

// @desc    Unlink vehicle from listing
// @route   DELETE /api/user/profile/vehicles/:id/unlink-listing/:listingId
// @access  Private (internal use)
export const unlinkVehicleFromListing = asyncHandler(async (req, res, next) => {
  const vehicle = await Vehicle.findOne({
    _id: req.params.id,
    ownerId: req.user.id,
    isDeleted: false
  });

  if (!vehicle) {
    return next(new ErrorResponse('Vehicle not found', 404));
  }

  await vehicle.unlinkListing(req.params.listingId);

  res.status(200).json({
    success: true,
    data: vehicle.linkedListings
  });
});
