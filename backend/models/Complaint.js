const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: String,
      enum: ['road', 'water', 'garbage', 'streetlight', 'other'],
      required: [true, 'Category is required'],
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    photoUrl: {
      type: String,
      default: '',
    },
    location: {
      lat: {
        type: Number,
        default: 0,
      },
      lng: {
        type: Number,
        default: 0,
      },
      address: {
        type: String,
        default: 'Location not specified',
      },
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'resolved'],
      default: 'pending',
      lowercase: true,
    },
    upvotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    upvoteCount: {
      type: Number,
      default: 0,
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolutionPhotoUrl: {
      type: String,
      default: '',
    },
    resolutionNote: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to ensure upvoteCount matches upvotes array length
complaintSchema.pre('save', function (next) {
  if (this.upvotes) {
    this.upvoteCount = this.upvotes.length;
  }
  next();
});

module.exports = mongoose.model('Complaint', complaintSchema);
