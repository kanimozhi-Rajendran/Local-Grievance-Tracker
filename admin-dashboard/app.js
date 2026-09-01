// Admin Dashboard Client Logic
const API_BASE = window.location.origin.includes(':5000') 
  ? window.location.origin + '/api' 
  : 'http://localhost:5000/api';

let adminToken = localStorage.getItem('adminToken');
let adminUser = JSON.parse(localStorage.getItem('adminUser') || 'null');
let currentCategory = 'all';
let currentStatus = 'all';
let complaintsData = [];
let leafletMap = null;
let markersLayer = null;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupAuth();
  setupFilters();
  setupStatusModal();

  if (adminToken) {
    loadDashboardData();
  } else {
    showLoginModal();
  }
});

// Setup Leaflet Map
function initMap() {
  const mapElement = document.getElementById('complaintsMap');
  if (!mapElement) return;

  // Center around default municipal zone
  leafletMap = L.map('complaintsMap').setView([13.0837, 80.2707], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors | Civic Grievance Tracker',
  }).addTo(leafletMap);

  markersLayer = L.layerGroup().addTo(leafletMap);
}

// Setup Auth Flow
function setupAuth() {
  const loginForm = document.getElementById('adminLoginForm');
  const loginModal = document.getElementById('loginModal');
  const headerAuth = document.getElementById('headerAuthSection');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    const errorBox = document.getElementById('loginError');
    const submitBtn = document.getElementById('loginBtn');

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Signing in...';
    errorBox.classList.add('hidden');

    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Login failed');
      }

      adminToken = data.token;
      adminUser = data.admin;
      localStorage.setItem('adminToken', adminToken);
      localStorage.setItem('adminUser', JSON.stringify(adminUser));

      loginModal.classList.add('hidden');
      renderHeaderAuth();
      showToast('Logged In', `Welcome back, ${adminUser.name}!`);
      loadDashboardData();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Sign In to Dashboard</span>';
    }
  });

  renderHeaderAuth();
}

function renderHeaderAuth() {
  const headerAuth = document.getElementById('headerAuthSection');
  if (adminToken && adminUser) {
    headerAuth.innerHTML = `
      <div class="admin-badge">
        <span>👨‍💼 ${adminUser.name}</span>
        <button id="logoutBtn" class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;">Logout</button>
      </div>
    `;
    document.getElementById('logoutBtn').addEventListener('click', logout);
  } else {
    headerAuth.innerHTML = `
      <button id="openLoginBtn" class="btn btn-primary">Staff Login</button>
    `;
    document.getElementById('openLoginBtn').addEventListener('click', showLoginModal);
  }
}

function showLoginModal() {
  document.getElementById('loginModal').classList.remove('hidden');
}

function logout() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
  adminToken = null;
  adminUser = null;
  renderHeaderAuth();
  showLoginModal();
}

// Setup Filters
function setupFilters() {
  const categoryButtons = document.querySelectorAll('#categoryChips .chip');
  categoryButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      categoryButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      loadComplaints();
    });
  });

  const statusSelect = document.getElementById('statusFilterSelect');
  statusSelect.addEventListener('change', (e) => {
    currentStatus = e.target.value;
    loadComplaints();
  });
}

// Load All Dashboard Data
async function loadDashboardData() {
  loadStats();
  loadComplaints();
}

// Load Stats
async function loadStats() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.stats) {
      document.getElementById('statTotal').textContent = data.stats.total;
      document.getElementById('statPending').textContent = data.stats.pending;
      document.getElementById('statProgress').textContent = data.stats.inProgress;
      document.getElementById('statResolved').textContent = data.stats.resolved;
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// Load Complaints List
async function loadComplaints() {
  const tableBody = document.getElementById('complaintsTableBody');
  tableBody.innerHTML = `<tr><td colspan="7" class="loading-cell">Loading priority grievances...</td></tr>`;

  try {
    let url = `${API_BASE}/complaints?sortBy=priority`;
    if (currentCategory !== 'all') url += `&category=${currentCategory}`;
    if (currentStatus !== 'all') url += `&status=${currentStatus}`;

    const headers = {};
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

    const res = await fetch(url, { headers });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch complaints');
    }

    complaintsData = data.complaints || [];
    renderComplaintsTable(complaintsData);
    renderMapMarkers(complaintsData);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="7" style="color: var(--pending-color); text-align: center; padding: 20px;">${err.message}</td></tr>`;
  }
}

// Render Table
function renderComplaintsTable(items) {
  const tableBody = document.getElementById('complaintsTableBody');
  if (items.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-secondary);">No grievances found matching the selected filter criteria.</td></tr>`;
    return;
  }

  tableBody.innerHTML = items
    .map((item) => {
      const isHighPriority = item.upvoteCount >= 4;
      const formattedDate = new Date(item.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const categoryIcons = {
        road: '🛣️ Road Damage',
        water: '💧 Water Leak',
        garbage: '🗑️ Garbage',
        streetlight: '💡 Streetlight',
        other: '📌 Other',
      };

      return `
        <tr data-id="${item._id}">
          <td>
            <div class="upvote-badge ${isHighPriority ? 'high-priority' : ''}">
              <span>▲</span>
              <span>${item.upvoteCount || 1}</span>
            </div>
          </td>
          <td>
            <span class="category-tag">${categoryIcons[item.category] || item.category}</span>
          </td>
          <td>
            <div class="complaint-meta-cell">
              <img src="${item.photoUrl}" alt="Photo" class="complaint-thumb" onerror="this.src='https://via.placeholder.com/48?text=Civic'">
              <div>
                <strong>${item.description.slice(0, 70)}${item.description.length > 70 ? '...' : ''}</strong>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">📍 ${item.location?.address || 'Unknown'}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight: 600;">${item.userId?.name || 'Citizen'}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">${item.userId?.phone || ''}</div>
          </td>
          <td>
            <span style="font-size: 13px; color: var(--text-secondary);">${formattedDate}</span>
          </td>
          <td>
            <span class="status-badge ${item.status}">
              <span class="badge-dot"></span>
              ${item.status.replace('_', ' ')}
            </span>
          </td>
          <td>
            <button class="btn btn-secondary action-update-btn" data-id="${item._id}" style="padding: 6px 12px; font-size: 13px;">
              Update Status ▾
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  // Attach button click listeners
  document.querySelectorAll('.action-update-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const complaint = complaintsData.find((c) => c._id === id);
      if (complaint) openStatusModal(complaint);
    });
  });
}

// Render Map Markers
function renderMapMarkers(items) {
  if (!leafletMap || !markersLayer) return;

  markersLayer.clearLayers();
  const bounds = [];

  items.forEach((item) => {
    const lat = item.location?.lat;
    const lng = item.location?.lng;

    if (!lat || !lng) return;

    bounds.push([lat, lng]);

    let markerColor = '#ef4444'; // pending
    if (item.status === 'in_progress') markerColor = '#f59e0b';
    if (item.status === 'resolved') markerColor = '#10b981';

    const circleMarker = L.circleMarker([lat, lng], {
      radius: 9,
      fillColor: markerColor,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
    });

    const popupHtml = `
      <div style="font-family: sans-serif; font-size: 13px; max-width: 220px;">
        <img src="${item.photoUrl}" style="width: 100%; height: 90px; object-fit: cover; border-radius: 6px; margin-bottom: 6px;" onerror="this.style.display='none'">
        <strong style="text-transform: capitalize; color: #1e293b;">${item.category} Issue</strong>
        <p style="margin: 4px 0 8px 0; color: #475569; font-size: 12px;">${item.description.slice(0, 60)}...</p>
        <div style="font-size: 11px; color: #64748b;">📍 ${item.location?.address}</div>
        <div style="margin-top: 6px; font-weight: bold; color: ${markerColor}; text-transform: uppercase; font-size: 11px;">
          Status: ${item.status.replace('_', ' ')} (${item.upvoteCount} Upvotes)
        </div>
      </div>
    `;

    circleMarker.bindPopup(popupHtml);
    markersLayer.addLayer(circleMarker);
  });

  if (bounds.length > 0) {
    leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }
}

// Status Update Modal Logic
function setupStatusModal() {
  const modal = document.getElementById('statusUpdateModal');
  const form = document.getElementById('statusUpdateForm');
  const cancelBtn = document.getElementById('cancelModalBtn');

  cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!adminToken) {
      showToast('Authentication Error', 'Please sign in as admin first.');
      return;
    }

    const complaintId = document.getElementById('modalComplaintId').value;
    const newStatus = document.getElementById('newStatusSelect').value;
    const resolutionNote = document.getElementById('resolutionNoteInput').value;
    const saveBtn = document.getElementById('saveStatusBtn');

    saveBtn.disabled = true;
    saveBtn.textContent = 'Updating & Notifying...';

    try {
      const res = await fetch(`${API_BASE}/complaints/${complaintId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: newStatus, resolutionNote }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Status update failed');
      }

      modal.classList.add('hidden');
      showToast(
        'Citizen Notified',
        `Grievance status changed to ${newStatus.toUpperCase()}. Citizen notification sent!`
      );

      // Refresh data
      loadDashboardData();
    } catch (err) {
      alert('Error updating status: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save & Notify Citizen';
    }
  });
}

function openStatusModal(complaint) {
  const modal = document.getElementById('statusUpdateModal');
  document.getElementById('modalComplaintId').value = complaint._id;
  document.getElementById('modalComplaintTitle').textContent = `Grievance #${complaint._id.slice(-6)} - ${complaint.category.toUpperCase()}`;
  document.getElementById('modalComplaintDesc').textContent = complaint.description;
  document.getElementById('newStatusSelect').value = complaint.status;
  document.getElementById('resolutionNoteInput').value = complaint.resolutionNote || '';

  modal.classList.remove('hidden');
}

// Toast helper
function showToast(title, message) {
  const toast = document.getElementById('toastNotification');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent = message;

  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4500);
}
