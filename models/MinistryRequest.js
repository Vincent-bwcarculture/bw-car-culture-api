// server/models/MinistryRequest.js
import mongoose from 'mongoose';

const MinistryRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ministryName: {
    type: String,
    required: [true, 'Please add a ministry name'],
    trim: true
  },
  department: {
    type: String,
    required: [true, 'Please add a department'],
    trim: true
  },
  role: {
    type: String,
    required: [true, 'Please add your role'],
    trim: true
  },
  contactDetails: {
    phone: String,
    email: String,
    officeAddress: String
  },
  reason: {
    type: String,
    required: [true, 'Please explain the reason for your request']
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

export default mongoose.model('MinistryRequest', MinistryRequestSchema);