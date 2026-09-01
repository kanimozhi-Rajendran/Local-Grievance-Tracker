const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    department: {
      type: String,
      default: 'Municipal Administration',
    },
    area: {
      type: String,
      default: 'Central Ward',
    },
  },
  {
    timestamps: true,
  }
);

adminSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.passwordHash);
};

module.exports = mongoose.model('Admin', adminSchema);
