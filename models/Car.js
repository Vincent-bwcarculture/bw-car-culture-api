// server/models/Car.js
import mongoose from 'mongoose';

const carSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    index: true
  },
  price: {
    type: Number,
    required: true
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
    required: true
  },
  images: [{
    url: String,
    isMain: Boolean
  }],
  specifications: {
    make: String,
    model: String,
    year: Number,
    mileage: Number,
    transmission: String,
    fuelType: String,
    engineSize: String,
    power: String,
    drivetrain: String
  },
  features: [String],
  description: String,
  condition: {
    type: String,
    enum: ['new', 'used', 'certified'],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'sold', 'archived'],
    default: 'draft'
  },
  views: {
    type: Number,
    default: 0
  },
  slug: {
    type: String,
    unique: true
  }
}, {
  timestamps: true
});

// Add text search index
carSchema.index({
  title: 'text',
  'specifications.make': 'text',
  'specifications.model': 'text',
  description: 'text'
});

const Car = mongoose.model('Car', carSchema);
export default Car;