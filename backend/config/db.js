const mongoose = require('mongoose');

let mongod = null;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/grievance_tracker';
  
  try {
    // Attempt standard connection with 3-second timeout
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log(`[Database] Connected to MongoDB at: ${uri}`);
  } catch (err) {
    console.warn(`[Database] Local MongoDB unreachable at ${uri} (${err.message}).`);
    console.log('[Database] Initializing in-memory MongoDB for local zero-config run...');
    
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mongod = await MongoMemoryServer.create();
      const memUri = mongod.getUri();
      await mongoose.connect(memUri);
      console.log(`[Database] In-memory MongoDB running successfully at: ${memUri}`);
    } catch (memErr) {
      console.error('[Database] Failed to start in-memory MongoDB:', memErr.message);
      process.exit(1);
    }
  }
};

module.exports = connectDB;
