const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: 'Anonymous Citizen',
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
    },
    area: {
      type: String,
      trim: true,
      default: 'General Ward',
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

module.exports = mongoose.model('User', userSchema);
