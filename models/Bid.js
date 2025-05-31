// server/models/Bid.js
import mongoose from 'mongoose';

const bidSchema = new mongoose.Schema({
  auction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction',
    required: true
  },
  bidder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'Please specify bid amount']
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'outbid', 'winner', 'rejected', 'cancelled'],
    default: 'pending'
  },
  notes: String,
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Index for efficient queries
bidSchema.index({ auction: 1, bidder: 1 });
bidSchema.index({ auction: 1, amount: -1 });
bidSchema.index({ bidder: 1, createdAt: -1 });

// Compound index for auction + status
bidSchema.index({ auction: 1, status: 1 });

// Static method to get highest bid for an auction
bidSchema.statics.getHighestBid = async function(auctionId) {
  const highestBid = await this.findOne({ 
    auction: auctionId 
  }).sort({ amount: -1 }).limit(1);
  
  return highestBid;
};

// Static method to get all bids for an auction sorted by amount descending
bidSchema.statics.getAuctionBids = async function(auctionId) {
  return this.find({ auction: auctionId })
    .populate('bidder', 'name email avatar')
    .sort({ amount: -1 });
};

// Static method to get bid history for a user
bidSchema.statics.getUserBidHistory = async function(userId) {
  return this.find({ bidder: userId })
    .populate({
      path: 'auction',
      select: 'title startingBid currentBid.amount endDate status'
    })
    .sort({ createdAt: -1 });
};

// Method to outbid this bid
bidSchema.methods.markAsOutbid = async function() {
  this.status = 'outbid';
  return this.save();
};

// Method to mark a bid as winner
bidSchema.methods.markAsWinner = async function() {
  this.status = 'winner';
  return this.save();
};

const Bid = mongoose.model('Bid', bidSchema);

export default Bid;