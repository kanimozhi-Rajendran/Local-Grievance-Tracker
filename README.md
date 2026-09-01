# 🏛️ Local Grievance Tracker

> A complete fullstack civic complaint reporting and tracking system for municipal and panchayat issues (road damage, water leaks, garbage collection, and streetlight faults).

---

## 🌟 Features Overview

### 📱 Citizen Mobile App (React Native Expo)
- **Phone Number + OTP Login**: Fast login/signup with OTP verification, profile creation with citizen name and ward/locality.
- **Home Screen**:
  - Search bar to filter past grievances.
  - 2-Column Category Grid: Road Damage, Water Leak, Garbage Pickup, Streetlight Issue (tappable, pre-fills category).
  - Primary "Report New Civic Grievance" action button.
  - Recent complaints list with color-coded status badges.
- **Create Grievance Screen**:
  - Photo upload from camera or device gallery.
  - Category selector.
  - Device GPS auto-detection with reverse-geocoding to human-readable address (editable).
  - Detailed description text area with submission feedback.
- **My Complaints Screen**:
  - Filter tabs: **All** | **Pending** | **In Progress** | **Resolved**.
  - Complaint cards showing category, location address, status badge, and upvotes.
- **Complaint Detail Screen**:
  - Full photo, category, full description, and GPS coordinates with address.
  - Interactive Status Timeline (**Pending** → **In Progress** → **Resolved**) with timestamps and corporation update notes.
  - Upvote button allowing neighbors to upvote the same issue to increase resolution priority.
- **Citizen Profile Screen**:
  - Citizen details, registered ward, total filed complaints count, resolved ratio, and sign out.

---

### 🖥️ Municipal Admin Web Dashboard
- **Staff Authentication**: Secure portal sign in (`admin@panchayat.gov` / `admin123`).
- **Real-Time Stat Cards**: Total Grievances, Pending Action, In Progress / Dispatched, Resolved Count.
- **Interactive OpenStreetMap / Leaflet Map**: Visualizes grievance pins across wards color-coded by status (🔴 Red = Pending, 🟡 Amber = In Progress, 🟢 Green = Resolved).
- **Priority Dispatch Table**: Sorted by citizen upvote count (highest community impact first).
- **Instant Status Management**: Municipal staff can update complaint status (`pending`, `in_progress`, `resolved`), attach action notes, and trigger instant citizen notification alerts.

---

### ⚙️ Backend REST API (Node.js + Express + Mongoose + Cloudinary)
- **Database Resilience**: Auto-connects to local or MongoDB Atlas, with an embedded in-memory MongoDB fallback so it runs out-of-the-box with zero configuration.
- **Auto-Seeding**: Seeds initial realistic municipal grievances with GPS coordinates, photos, and upvotes on first launch.
- **Photo Uploads**: Integrated with Cloudinary, with local storage fallback when API keys are not provided.
- **Authentication**: JWT token verification for citizens (Phone/OTP) and municipal staff.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+)
- npm

---

### 1. Start the Backend API & Admin Dashboard
Open a terminal in the project root:

```bash
cd backend
npm install
npm start
```

The backend will start on **`http://localhost:5000`**:
- **API Base**: `http://localhost:5000/api`
- **Admin Dashboard**: `http://localhost:5000/admin`
- **Health Check**: `http://localhost:5000/api/health`

#### Demo Admin Credentials:
- **Email**: `admin@panchayat.gov`
- **Password**: `admin123`

#### Demo Citizen Phone & OTP:
- **Phone**: `9876543210` (or any 10-digit number)
- **OTP**: Automatically displayed in the console / response (master passcode: `123456`)

---

### 2. Start the Citizen Mobile App (Expo)
Open a new terminal window:

```bash
cd citizen-app
npx expo start
```

- Press **`w`** to open in web browser.
- Press **`a`** to run on Android Emulator.
- Scan the QR code using the **Expo Go** app on your iOS or Android phone!

> **Note for physical mobile testing**: Ensure your phone is on the same Wi-Fi network as your computer, and set `getBaseUrl()` in `src/services/api.js` to your computer's local LAN IP (e.g., `http://192.168.1.100:5000/api`).

---

## 📡 REST API Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/send-otp` | Generate & send 6-digit OTP | Public |
| `POST` | `/api/auth/verify-otp` | Verify OTP & issue citizen token | Public |
| `GET` | `/api/auth/me` | Current citizen profile | Citizen JWT |
| `POST` | `/api/complaints` | Lodges new civic complaint with photo & GPS | Citizen JWT |
| `GET` | `/api/complaints` | List complaints (filters: category, status, area, search) | Optional JWT |
| `GET` | `/api/complaints/my` | Citizen's filed complaints | Citizen JWT |
| `GET` | `/api/complaints/:id` | Full complaint details & upvote status | Optional JWT |
| `PATCH` | `/api/complaints/:id/upvote` | Toggle citizen upvote (+1 priority) | Citizen JWT |
| `PATCH` | `/api/complaints/:id/status` | Update status (`pending`, `in_progress`, `resolved`) | Admin JWT |
| `POST` | `/api/admin/login` | Municipal staff sign in | Public |
| `GET` | `/api/admin/stats` | Summary statistics and counters | Admin JWT |

---

## 🗄️ Database Models

### `User`
```json
{
  "_id": "ObjectId",
  "name": "Ramesh Kumar",
  "phone": "9876543210",
  "area": "Ward 4 (North Bazar)",
  "createdAt": "2026-08-31T05:00:00.000Z"
}
```

### `Complaint`
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (ref User)",
  "category": "road",
  "description": "Dangerous large pothole on Main Road near Bus Terminus",
  "photoUrl": "https://images.unsplash.com/...",
  "location": {
    "lat": 13.0837,
    "lng": 80.2707,
    "address": "Bus Stand Junction, Main Road, Ward 4"
  },
  "status": "pending",
  "upvotes": ["ObjectId..."],
  "upvoteCount": 5,
  "createdAt": "2026-08-31T05:00:00.000Z",
  "updatedAt": "2026-08-31T05:00:00.000Z",
  "resolvedAt": null,
  "resolutionNote": ""
}
```

### `Admin`
```json
{
  "_id": "ObjectId",
  "name": "Dr. K. Rajasekaran (Municipal Commissioner)",
  "email": "admin@panchayat.gov",
  "passwordHash": "$2a$10$...",
  "department": "Civic Grievance Cell & Public Works",
  "area": "Central Zone - Ward 1 to 20"
}
```

---

## 🎨 Design Guidelines Implemented
- Clean, minimal UI with white background and **12px rounded cards**.
- Cohesive status color tokens:
  - **Pending**: Red tint (`#EF4444`, bg: `#FEF2F2`)
  - **In Progress**: Amber tint (`#F59E0B`, bg: `#FFFBEB`)
  - **Resolved**: Green tint (`#10B981`, bg: `#ECFDF5`)
- Bottom tab navigation: **Home**, **My Grievances**, **Profile**.
"# Local-Grievance-Tracker" 
