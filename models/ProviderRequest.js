// server/models/ProviderRequest.js
import mongoose from 'mongoose';

const ProviderRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  businessName: {
    type: String,
    required: [true, 'Please add a business name'],
    trim: true
  },
  providerType: {
    type: String,
    enum: ['dealership', 'car_rental', 'trailer_rental', 'public_transport', 'workshop'],
    required: [true, 'Please specify provider type']
  },
  businessType: {
    type: String,
    enum: ['independent', 'franchise', 'certified', 'authorized'],
    required: [true, 'Please specify business type']
  },
  contact: {
    phone: String,
    email: String,
    website: String
  },
  location: {
    address: String,
    city: String,
    state: String,
    country: String
  },
  documents: [{
    filename: String,
    path: String,
    url: String,
    key: String,
    mimetype: String,
    size: Number
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewNotes: String,
  reviewedAt: Date
}, {
  timestamps: true
});

export default mongoose.model('ProviderRequest', ProviderRequestSchema);