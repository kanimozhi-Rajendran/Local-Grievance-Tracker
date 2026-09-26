const http = require('http');

async function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING LOCAL GRIEVANCE TRACKER API VERIFICATION ---');

  // 1. Health
  const health = await request({ hostname: 'localhost', port: 5000, path: '/api/health', method: 'GET' });
  console.log('1. Health Check:', health.status === 200 && health.data.status === 'ok' ? 'PASSED ✅' : 'FAILED ❌', health.data);

  // 2. Citizen OTP Send
  const sendOtp = await request(
    { hostname: 'localhost', port: 5000, path: '/api/auth/send-otp', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { phone: '9876543210' }
  );
  console.log('2. Citizen Send OTP:', sendOtp.status === 200 && sendOtp.data.success ? 'PASSED ✅' : 'FAILED ❌', `OTP: ${sendOtp.data.otp}`);

  // 3. Citizen Verify OTP
  const verifyOtp = await request(
    { hostname: 'localhost', port: 5000, path: '/api/auth/verify-otp', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { phone: '9876543210', otp: sendOtp.data.otp || '123456', name: 'Ramesh Kumar', area: 'Ward 4' }
  );
  const citizenToken = verifyOtp.data.token;
  console.log('3. Citizen Verify OTP & Token:', citizenToken ? 'PASSED ✅' : 'FAILED ❌', `Citizen: ${verifyOtp.data.user?.name}`);

  // 4. Admin Login
  const adminLogin = await request(
    { hostname: 'localhost', port: 5000, path: '/api/admin/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { email: 'admin@panchayat.gov', password: 'admin123' }
  );
  const adminToken = adminLogin.data.token;
  console.log('4. Admin Login:', adminToken ? 'PASSED ✅' : 'FAILED ❌', `Admin: ${adminLogin.data.admin?.name}`);

  // 5. Duplicate Detection (within 100m of active open road complaint at 13.0851, 80.2678)
  const dupCheck = await request(
    { hostname: 'localhost', port: 5000, path: '/api/complaints/check-duplicate', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { category: 'road', lat: 13.08512, lng: 80.26782, radiusMeters: 100 }
  );
  console.log('5. Duplicate Detection:', dupCheck.data.isDuplicate && dupCheck.data.duplicates?.length > 0 ? 'PASSED ✅' : 'FAILED ❌', `Found ${dupCheck.data.duplicates?.length} nearby within 100m`);

  // 6. SLA Auto-Escalation
  const autoEscalate = await request(
    { hostname: 'localhost', port: 5000, path: '/api/complaints/auto-escalate', method: 'POST' }
  );
  console.log('6. SLA Auto-Escalation Endpoint:', autoEscalate.data.success ? 'PASSED ✅' : 'FAILED ❌', autoEscalate.data.message);

  // 7. Complaints List & Sort by Priority
  const complaints = await request({ hostname: 'localhost', port: 5000, path: '/api/complaints?sortBy=priority', method: 'GET' });
  console.log('7. Complaints List (Sorted by Priority):', complaints.data.success && complaints.data.complaints?.length > 0 ? 'PASSED ✅' : 'FAILED ❌', `Total complaints: ${complaints.data.count}`);

  const sampleId = complaints.data.complaints[0]._id;

  // 8. Complaint Detail with Timeline
  const detail = await request({ hostname: 'localhost', port: 5000, path: `/api/complaints/${sampleId}`, method: 'GET' });
  console.log('8. Complaint Detail & Timeline:', detail.data.success && detail.data.complaint.statusTimeline?.length > 0 ? 'PASSED ✅' : 'FAILED ❌', `Timeline events: ${detail.data.complaint.statusTimeline?.length}`);

  // 9. Upvote Toggle
  const upvote = await request(
    { hostname: 'localhost', port: 5000, path: `/api/complaints/${sampleId}/upvote`, method: 'PATCH', headers: { Authorization: `Bearer ${citizenToken}` } }
  );
  console.log('9. Citizen Upvote Toggle:', upvote.data.success ? 'PASSED ✅' : 'FAILED ❌', `New upvote count: ${upvote.data.upvoteCount}`);

  // 10. Admin Stats
  const stats = await request(
    { hostname: 'localhost', port: 5000, path: '/api/admin/stats', method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } }
  );
  console.log('10. Admin Stats:', stats.data.success ? 'PASSED ✅' : 'FAILED ❌', `Total: ${stats.data.stats?.total}, Pending: ${stats.data.stats?.pending}, InProgress: ${stats.data.stats?.inProgress}, Resolved: ${stats.data.stats?.resolved}, Avg: ${stats.data.stats?.avgResolutionDays}`);

  // 11. Admin Analytics
  const analytics = await request(
    { hostname: 'localhost', port: 5000, path: '/api/admin/analytics', method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } }
  );
  console.log('11. Admin Analytics Charts Data:', analytics.data.success ? 'PASSED ✅' : 'FAILED ❌', `Categories: ${analytics.data.analytics?.categories?.data}`);

  // 12. Public Leaderboard
  const leaderboard = await request({ hostname: 'localhost', port: 5000, path: '/api/complaints/leaderboard', method: 'GET' });
  console.log('12. Ward Leaderboard:', leaderboard.data.success && leaderboard.data.leaderboard?.length > 0 ? 'PASSED ✅' : 'FAILED ❌', `Wards: ${leaderboard.data.leaderboard?.map(w => `${w.ward} (${w.resolutionRate})`).join(', ')}`);

  // 13. Public Resolved Feed
  const publicResolved = await request({ hostname: 'localhost', port: 5000, path: '/api/complaints/public-resolved', method: 'GET' });
  console.log('13. Public Resolved Feed:', publicResolved.data.success ? 'PASSED ✅' : 'FAILED ❌', `Resolved count: ${publicResolved.data.total}`);

  // 14. Status Update (Admin)
  const statusUpdate = await request(
    { hostname: 'localhost', port: 5000, path: `/api/complaints/${sampleId}/status`, method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` } },
    {
      status: 'resolved',
      resolutionNote: 'Pothole filled with cold mix asphalt and steam rolled. Completed verification.',
      resolutionPhotoUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186156f?w=800&auto=format&fit=crop&q=80',
      officerName: 'Ward Inspector Rajesh'
    }
  );
  console.log('14. Officer Status Update to Resolved with Mandatory Photo:', statusUpdate.data.success ? 'PASSED ✅' : 'FAILED ❌', `New Status: ${statusUpdate.data.complaint?.status}`);

  // 15. Resolution Feedback Loop (Citizen Confirms / Rejects)
  const feedbackYes = await request(
    { hostname: 'localhost', port: 5000, path: `/api/complaints/${sampleId}/feedback`, method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` } },
    { confirmed: true, rating: 5, comment: 'Work done nicely, road is smooth now!' }
  );
  console.log('15. Citizen Resolution Verification Feedback Loop:', feedbackYes.data.success ? 'PASSED ✅' : 'FAILED ❌', feedbackYes.data.message);

  console.log('\n================ ALL API INTEGRATION TESTS COMPLETED ================');
}

runTests().catch(console.error);
