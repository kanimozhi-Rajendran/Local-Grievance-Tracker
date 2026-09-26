require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Complaint = require('../models/Complaint');
const connectDB = require('../config/db');

const seedData = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    console.log('[Seed] Clearing existing collections...');
    await User.deleteMany({});
    await Admin.deleteMany({});
    await Complaint.deleteMany({});

    // 1. Create Default Admin & Officers
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('admin123', salt);

    const admin = await Admin.create({
      name: 'Dr. K. Rajasekaran (Municipal Commissioner)',
      email: 'admin@panchayat.gov',
      passwordHash,
      department: 'Civic Grievance Cell & Public Works',
      area: 'Central Zone - Ward 1 to 20',
    });
    console.log('[Seed] Admin account created: admin@panchayat.gov / admin123');

    // 2. Create Sample Citizens
    const citizens = await User.insertMany([
      { name: 'Ramesh Kumar', phone: '9876543210', area: 'Ward 4 (North Bazar)' },
      { name: 'Priya Sundaram', phone: '9876543211', area: 'Ward 12 (Gandhi Road)' },
      { name: 'Arun Sharma', phone: '9876543212', area: 'Ward 7 (Railway Border)' },
      { name: 'Kavitha Nathan', phone: '9876543213', area: 'Ward 18 (Lakeview Colony)' },
      { name: 'M. Selvam', phone: '9876543214', area: 'Ward 2 (Market Road)' },
    ]);
    console.log(`[Seed] Created ${citizens.length} citizen profiles.`);

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // 3. Create Realistic Complaints
    const complaintsData = [
      {
        userId: citizens[0]._id,
        category: 'road',
        description: 'Dangerous large pothole on Main Road near City Bus Terminus causing traffic bottleneck and scooter accidents during night time.',
        photoUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800&auto=format&fit=crop&q=80',
        photos: [
          'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1578885136359-16c8bd4d3a8e?w=800&auto=format&fit=crop&q=80',
        ],
        location: {
          lat: 13.0837,
          lng: 80.2707,
          address: 'Bus Stand Junction, Main Road, Ward 4',
        },
        status: 'acknowledged',
        statusTimeline: [
          {
            status: 'submitted',
            changedBy: { id: citizens[0]._id, name: 'Ramesh Kumar', role: 'citizen' },
            timestamp: new Date(now - 2 * oneDay),
            note: 'Grievance submitted by citizen with GPS photo evidence.',
          },
          {
            status: 'acknowledged',
            changedBy: { id: admin._id, name: 'Ward Inspector Rajesh', role: 'officer' },
            timestamp: new Date(now - 1.5 * oneDay),
            note: 'Inspected by Ward 4 road engineering division. Assigned to contractor.',
          },
        ],
        upvotes: [citizens[0]._id, citizens[1]._id, citizens[2]._id, citizens[3]._id, citizens[4]._id],
        upvoteCount: 5,
        dueDate: new Date(now + 13 * oneDay), // 13 days remaining on 15-day SLA
        escalationLevel: 1,
        isEscalated: false,
      },
      {
        userId: citizens[1]._id,
        category: 'water',
        description: 'Main underground potable drinking water pipeline ruptured. Clean drinking water has been gushing onto the street for past 18 hours.',
        photoUrl: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=800&auto=format&fit=crop&q=80',
        photos: ['https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=800&auto=format&fit=crop&q=80'],
        location: {
          lat: 13.0878,
          lng: 80.2785,
          address: '4th Cross Street, Gandhi Road, Ward 12',
        },
        status: 'in_progress',
        statusTimeline: [
          {
            status: 'submitted',
            changedBy: { id: citizens[1]._id, name: 'Priya Sundaram', role: 'citizen' },
            timestamp: new Date(now - 1 * oneDay),
            note: 'Grievance submitted by citizen.',
          },
          {
            status: 'acknowledged',
            changedBy: { id: admin._id, name: 'Metro Water Line Officer', role: 'officer' },
            timestamp: new Date(now - 0.8 * oneDay),
            note: 'Emergency pipeline crew alerted.',
          },
          {
            status: 'in_progress',
            changedBy: { id: admin._id, name: 'Junior Engineer Anand', role: 'officer' },
            timestamp: new Date(now - 0.4 * oneDay),
            note: 'Plumbing inspection team dispatched with repair machinery. Replacement pipe section arriving by noon.',
          },
        ],
        resolutionNote: 'Plumbing inspection team dispatched with repair machinery. Replacement pipe section arriving by noon.',
        upvotes: [citizens[0]._id, citizens[1]._id, citizens[2]._id, citizens[3]._id],
        upvoteCount: 4,
        dueDate: new Date(now + 2 * oneDay),
        escalationLevel: 1,
        isEscalated: false,
      },
      {
        userId: citizens[2]._id,
        category: 'garbage',
        description: 'Community garbage dumper overflowing for 4 days. Stench is unbearable, stray animals scattering waste across the road, high dengue risk.',
        photoUrl: 'https://images.unsplash.com/photo-1605600659873-d808a13e4d2a?w=800&auto=format&fit=crop&q=80',
        photos: ['https://images.unsplash.com/photo-1605600659873-d808a13e4d2a?w=800&auto=format&fit=crop&q=80'],
        location: {
          lat: 13.0792,
          lng: 80.2641,
          address: 'Near Old Vegetable Market, Ward 7',
        },
        status: 'in_progress',
        statusTimeline: [
          {
            status: 'submitted',
            changedBy: { id: citizens[2]._id, name: 'Arun Sharma', role: 'citizen' },
            timestamp: new Date(now - 4 * oneDay),
            note: 'Grievance submitted by citizen.',
          },
          {
            status: 'in_progress',
            changedBy: { name: 'SLA Auto-Escalation Engine', role: 'system' },
            timestamp: new Date(now - 1 * oneDay),
            note: 'Auto-escalated to Level 2 (Assistant Executive Engineer): Overdue by 2 days past 2-day Garbage SLA.',
          },
        ],
        upvotes: [citizens[2]._id, citizens[3]._id, citizens[4]._id],
        upvoteCount: 3,
        dueDate: new Date(now - 2 * oneDay), // Overdue!
        escalationLevel: 2,
        isEscalated: true,
        escalationHistory: [
          {
            level: 2,
            levelTitle: 'Assistant Executive Engineer / Ward Officer',
            escalatedAt: new Date(now - 1 * oneDay),
            reason: 'Resolution SLA Overdue: 2 days overdue past 2-day Garbage SLA target.',
          },
        ],
      },
      {
        userId: citizens[3]._id,
        category: 'streetlight',
        description: 'Three consecutive streetlights on the Lakeview park lane have been broken for 2 weeks. Total darkness poses safety danger for women and pedestrians.',
        photoUrl: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=800&auto=format&fit=crop&q=80',
        photos: ['https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=800&auto=format&fit=crop&q=80'],
        location: {
          lat: 13.0912,
          lng: 80.2811,
          address: 'School Avenue & Lakeview Colony, Ward 18',
        },
        status: 'resolved',
        statusTimeline: [
          {
            status: 'submitted',
            changedBy: { id: citizens[3]._id, name: 'Kavitha Nathan', role: 'citizen' },
            timestamp: new Date(now - 3 * oneDay),
            note: 'Grievance submitted by citizen.',
          },
          {
            status: 'acknowledged',
            changedBy: { id: admin._id, name: 'Electrical Wing Officer', role: 'officer' },
            timestamp: new Date(now - 2.5 * oneDay),
            note: 'Streetlight pole defect scheduled for replacement.',
          },
          {
            status: 'in_progress',
            changedBy: { id: admin._id, name: 'Lineman Senthil', role: 'officer' },
            timestamp: new Date(now - 1.5 * oneDay),
            note: 'Ladder vehicle and LED fixtures dispatched.',
          },
          {
            status: 'resolved',
            changedBy: { id: admin._id, name: 'Ward Inspector Rajesh', role: 'officer' },
            timestamp: new Date(now - 0.5 * oneDay),
            note: 'New energy-saving LED luminaires installed and tested by Municipal electrical wing. Now fully operational.',
          },
        ],
        upvotes: [citizens[3]._id, citizens[4]._id],
        upvoteCount: 2,
        resolvedAt: new Date(now - 0.5 * oneDay),
        resolutionPhotoUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=800&auto=format&fit=crop&q=80',
        resolutionNote: 'New energy-saving LED luminaires installed and tested by Municipal electrical wing. Now fully operational.',
        dueDate: new Date(now + 2 * oneDay),
        escalationLevel: 1,
        isEscalated: false,
        citizenFeedback: {
          confirmed: true,
          confirmedAt: new Date(now - 0.2 * oneDay),
          comment: 'Lights are working very well now! Thank you for the quick repair.',
          rating: 5,
        },
      },
      {
        userId: citizens[4]._id,
        category: 'road',
        description: 'Gravel and mud dumped after cable laying work was left unlevelled. Causes 2-wheelers to skid repeatedly.',
        photoUrl: 'https://images.unsplash.com/photo-1578885136359-16c8bd4d3a8e?w=800&auto=format&fit=crop&q=80',
        photos: ['https://images.unsplash.com/photo-1578885136359-16c8bd4d3a8e?w=800&auto=format&fit=crop&q=80'],
        location: {
          lat: 13.0851,
          lng: 80.2678,
          address: '2nd Avenue, Ward 2',
        },
        status: 'submitted',
        statusTimeline: [
          {
            status: 'submitted',
            changedBy: { id: citizens[4]._id, name: 'M. Selvam', role: 'citizen' },
            timestamp: new Date(now - 0.2 * oneDay),
            note: 'Grievance submitted by citizen with GPS location.',
          },
        ],
        upvotes: [citizens[4]._id],
        upvoteCount: 1,
        dueDate: new Date(now + 14 * oneDay),
        escalationLevel: 1,
        isEscalated: false,
      },
    ];

    await Complaint.insertMany(complaintsData);
    console.log(`[Seed] Seeded ${complaintsData.length} civic complaints with status audit timelines, SLAs, and escalation history.`);
    console.log('[Seed] Completed successfully.');
  } catch (err) {
    console.error('[Seed Error]', err);
  }
};

// If run directly via node seeds/seed.js
if (require.main === module) {
  seedData().then(() => mongoose.disconnect());
}

module.exports = seedData;
