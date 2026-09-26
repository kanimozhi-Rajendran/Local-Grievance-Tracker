const mongoose = require('mongoose');

const statusTimelineSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['submitted', 'pending', 'acknowledged', 'in_progress', 'resolved', 'rejected', 'reopened'],
      required: true,
    },
    changedBy: {
      id: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String, default: 'System' },
      role: { type: String, enum: ['citizen', 'officer', 'admin', 'system'], default: 'officer' },
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    note: {
      type: String,
      default: '',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const escalationHistorySchema = new mongoose.Schema(
  {
    level: {
      type: Number,
      required: true,
    },
    levelTitle: {
      type: String,
      default: 'Ward Officer',
    },
    escalatedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      default: 'Resolution SLA Overdue',
    },
  },
  { _id: false }
);

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
    photos: [
      {
        type: String,
      },
    ],
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
      enum: ['submitted', 'pending', 'acknowledged', 'in_progress', 'resolved', 'rejected', 'reopened'],
      default: 'submitted',
      lowercase: true,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    statusTimeline: [statusTimelineSchema],
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
    dueDate: {
      type: Date,
      default: null,
      index: true,
    },
    isEscalated: {
      type: Boolean,
      default: false,
      index: true,
    },
    escalationLevel: {
      type: Number,
      default: 1,
      min: 1,
      max: 3,
    },
    escalationHistory: [escalationHistorySchema],
    assignedOfficer: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
      },
      name: {
        type: String,
        default: '',
      },
      department: {
        type: String,
        default: '',
      },
      designation: {
        type: String,
        default: 'Ward Inspector',
      },
    },
    citizenFeedback: {
      confirmed: {
        type: Boolean,
        default: null, // null: waiting for citizen review, true: confirmed resolved, false: rejected / incomplete
      },
      confirmedAt: {
        type: Date,
        default: null,
      },
      comment: {
        type: String,
        default: '',
      },
      rating: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to ensure upvoteCount matches upvotes array length and sync photos/photoUrl
complaintSchema.pre('save', function (next) {
  if (this.upvotes) {
    this.upvoteCount = this.upvotes.length;
  }
  if (this.photoUrl && (!this.photos || this.photos.length === 0)) {
    this.photos = [this.photoUrl];
  } else if (this.photos && this.photos.length > 0 && !this.photoUrl) {
    this.photoUrl = this.photos[0];
  }
  next();
});

module.exports = mongoose.model('Complaint', complaintSchema);

