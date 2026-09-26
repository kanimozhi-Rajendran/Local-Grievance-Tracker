// Admin Dashboard Client Logic
const API_BASE = window.location.origin.includes(':5000') 
  ? window.location.origin + '/api' 
  : 'http://localhost:5000/api';

let adminToken = localStorage.getItem('adminToken');
let adminUser = JSON.parse(localStorage.getItem('adminUser') || 'null');
let currentCategory = 'all';
let currentStatus = 'all';
let currentWard = 'all';
let currentSortBy = 'priority';
let complaintsData = [];
let leafletMap = null;
let markersLayer = null;
let categoryChartInstance = null;
let statusChartInstance = null;
let timelineChartInstance = null;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupAuth();
  setupFilters();
  setupStatusModal();
  setupViewTabs();

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

  leafletMap = L.map('complaintsMap').setView([13.0837, 80.2707], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors | Civic Grievance Cell',
  }).addTo(leafletMap);

  markersLayer = L.layerGroup().addTo(leafletMap);
}

// Setup Auth Flow
function setupAuth() {
  const loginForm = document.getElementById('adminLoginForm');
  const loginModal = document.getElementById('loginModal');

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
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      currentStatus = e.target.value;
      loadComplaints();
    });
  }

  const wardSelect = document.getElementById('wardFilterSelect');
  if (wardSelect) {
    wardSelect.addEventListener('change', (e) => {
      currentWard = e.target.value;
      loadComplaints();
    });
  }

  const sortBySelect = document.getElementById('sortBySelect');
  if (sortBySelect) {
    sortBySelect.addEventListener('change', (e) => {
      currentSortBy = e.target.value;
      loadComplaints();
    });
  }
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
      if (document.getElementById('statEscalated')) {
        document.getElementById('statEscalated').textContent = data.stats.escalated || 0;
      }
      if (document.getElementById('statAvgSpeed')) {
        document.getElementById('statAvgSpeed').textContent = data.stats.avgResolutionDays || '2.1 days';
      }
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
    let url = `${API_BASE}/complaints?sortBy=${currentSortBy}`;
    if (currentCategory !== 'all') url += `&category=${currentCategory}`;
    if (currentStatus !== 'all') url += `&status=${currentStatus}`;
    if (currentWard !== 'all') url += `&area=${encodeURIComponent(currentWard)}`;

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
      const isHighPriority = (item.upvoteCount || 1) >= 3;
      const formattedDate = new Date(item.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      // SLA deadline calculation
      const isOverdue = item.status !== 'resolved' && item.status !== 'rejected' && item.dueDate && new Date() > new Date(item.dueDate);
      const formattedDueDate = item.dueDate
        ? new Date(item.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'In 3 Days';

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
            ${isOverdue || item.isEscalated
              ? `<span class="sla-badge sla-overdue">🚨 L${item.escalationLevel || 2} OVERDUE (${formattedDueDate})</span>`
              : `<span class="sla-badge sla-ontrack">⏱️ ${formattedDueDate}</span>`}
          </td>
          <td>
            <div style="font-weight: 600;">${item.userId?.name || 'Citizen'}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">${item.userId?.phone || ''}</div>
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

// Render Map Markers with 5-color status codes
function renderMapMarkers(items) {
  if (!leafletMap || !markersLayer) return;

  markersLayer.clearLayers();
  const bounds = [];

  items.forEach((item) => {
    const lat = item.location?.lat;
    const lng = item.location?.lng;

    if (!lat || !lng) return;

    bounds.push([lat, lng]);

    let markerColor = '#ef4444'; // submitted / pending (red)
    if (item.status === 'acknowledged') markerColor = '#0284c7'; // blue
    if (item.status === 'in_progress') markerColor = '#f59e0b'; // yellow
    if (item.status === 'resolved') markerColor = '#10b981'; // green
    if (item.status === 'rejected') markerColor = '#991b1b'; // dark red
    if (item.isEscalated && item.status !== 'resolved') markerColor = '#9333ea'; // purple

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
          Status: ${item.status.replace('_', ' ')} (${item.upvoteCount || 1} Upvotes)
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
  const newStatusSelect = document.getElementById('newStatusSelect');
  const rejectionGroup = document.getElementById('rejectionReasonGroup');

  if (newStatusSelect && rejectionGroup) {
    newStatusSelect.addEventListener('change', () => {
      if (newStatusSelect.value === 'rejected') {
        rejectionGroup.style.display = 'block';
      } else {
        rejectionGroup.style.display = 'none';
      }
    });
  }

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
    const resolutionPhotoUrl = document.getElementById('resolutionPhotoInput').value;
    const rejectionReason = document.getElementById('rejectionReasonInput') ? document.getElementById('rejectionReasonInput').value : '';
    const saveBtn = document.getElementById('saveStatusBtn');

    if (newStatus === 'rejected' && (!rejectionReason || !rejectionReason.trim())) {
      alert('A rejection reason is mandatory when marking status as Rejected.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Updating & Notifying...';

    try {
      const res = await fetch(`${API_BASE}/complaints/${complaintId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          status: newStatus,
          resolutionNote,
          resolutionPhotoUrl,
          rejectionReason,
          officerName: adminUser ? adminUser.name : 'Ward Officer',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Status update failed');
      }

      modal.classList.add('hidden');
      showToast(
        'Citizen Notified',
        `Grievance status changed to ${newStatus.toUpperCase()}. Citizen notification sent via Push & SMS!`
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
  document.getElementById('newStatusSelect').value = complaint.status === 'submitted' ? 'acknowledged' : complaint.status;
  document.getElementById('resolutionNoteInput').value = complaint.resolutionNote || '';
  document.getElementById('resolutionPhotoInput').value = complaint.resolutionPhotoUrl || '';
  
  const rejectionGroup = document.getElementById('rejectionReasonGroup');
  if (rejectionGroup) {
    rejectionGroup.style.display = complaint.status === 'rejected' ? 'block' : 'none';
    if (document.getElementById('rejectionReasonInput')) {
      document.getElementById('rejectionReasonInput').value = complaint.rejectionReason || '';
    }
  }

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

// Setup View Tabs (Dispatch vs Analytics)
function setupViewTabs() {
  const btnDispatch = document.getElementById('tabViewDispatch');
  const btnAnalytics = document.getElementById('tabViewAnalytics');
  const viewDispatch = document.getElementById('viewDispatchSection');
  const viewAnalytics = document.getElementById('viewAnalyticsSection');

  if (!btnDispatch || !btnAnalytics) return;

  btnDispatch.addEventListener('click', () => {
    btnDispatch.classList.add('active');
    btnAnalytics.classList.remove('active');
    viewDispatch.classList.remove('hidden');
    viewAnalytics.classList.add('hidden');
    if (leafletMap) leafletMap.invalidateSize();
  });

  btnAnalytics.addEventListener('click', () => {
    btnAnalytics.classList.add('active');
    btnDispatch.classList.remove('active');
    viewAnalytics.classList.remove('hidden');
    viewDispatch.classList.add('hidden');
    loadAnalytics();
  });
}

// Load & Render Analytics Data
async function loadAnalytics() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE}/admin/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.analytics) {
      renderCharts(data.analytics);
    }
  } catch (err) {
    console.error('Error loading analytics:', err);
  }
}

// Render Chart.js Analytics
function renderCharts(analytics) {
  // 1. Category Bar Chart
  const categoryCtx = document.getElementById('categoryChart')?.getContext('2d');
  if (categoryCtx) {
    if (categoryChartInstance) categoryChartInstance.destroy();
    categoryChartInstance = new Chart(categoryCtx, {
      type: 'bar',
      data: {
        labels: analytics.categories.labels,
        datasets: [
          {
            label: 'Total Reports',
            data: analytics.categories.data,
            backgroundColor: ['#2563eb', '#0284c7', '#16a34a', '#d97706', '#64748b'],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });
  }

  // 2. Status Breakdown Donut Chart
  const statusCtx = document.getElementById('statusChart')?.getContext('2d');
  if (statusCtx) {
    if (statusChartInstance) statusChartInstance.destroy();
    statusChartInstance = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: analytics.statusBreakdown.labels,
        datasets: [
          {
            data: analytics.statusBreakdown.data,
            backgroundColor: ['#d97706', '#2563eb', '#16a34a', '#dc2626'],
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  // 3. 30-Day Timeline Line Chart
  const timelineCtx = document.getElementById('timelineChart')?.getContext('2d');
  if (timelineCtx) {
    if (timelineChartInstance) timelineChartInstance.destroy();
    timelineChartInstance = new Chart(timelineCtx, {
      type: 'line',
      data: {
        labels: analytics.timeline.map((d) => d.displayDate),
        datasets: [
          {
            label: 'Daily Grievances',
            data: analytics.timeline.map((d) => d.count),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });
  }
}
