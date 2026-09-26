const Complaint = require('../models/Complaint');
const { SLA_DAYS, ESCALATION_LEVELS } = require('../config/sla');
const { sendExpoPushNotification } = require('./pushNotifications');
const { sendSMS } = require('./sms');

/**
 * Checks all active complaints and auto-escalates overdue items past their SLA deadline.
 */
async function checkAndAutoEscalateComplaints() {
  try {
    const now = new Date();
    // Active complaints that have not been resolved or rejected
    const activeComplaints = await Complaint.find({
      status: { $in: ['submitted', 'pending', 'acknowledged', 'in_progress', 'reopened'] },
      dueDate: { $ne: null },
    }).populate('userId', 'name phone area pushToken');

    const escalatedItems = [];

    for (const complaint of activeComplaints) {
      if (complaint.dueDate && now > new Date(complaint.dueDate)) {
        const msOverdue = now.getTime() - new Date(complaint.dueDate).getTime();
        const daysOverdue = Math.floor(msOverdue / (1000 * 60 * 60 * 24));

        let newLevel = 2; // Level 2: Ward Officer
        let levelTitle = ESCALATION_LEVELS[2].title;

        // If overdue by more than 5 days past SLA, escalate to Level 3 (Municipal Commissioner)
        if (daysOverdue >= 5 || complaint.escalationLevel >= 2) {
          newLevel = 3;
          levelTitle = ESCALATION_LEVELS[3].title;
        }

        const needsEscalation = !complaint.isEscalated || complaint.escalationLevel < newLevel;

        if (needsEscalation) {
          complaint.isEscalated = true;
          complaint.escalationLevel = newLevel;

          const escalationReason = `Overdue by ${Math.max(1, daysOverdue)} day(s) past SLA resolution target (${SLA_DAYS[complaint.category] || 7} days)`;

          complaint.escalationHistory.push({
            level: newLevel,
            levelTitle,
            escalatedAt: now,
            reason: escalationReason,
          });

          complaint.statusTimeline.push({
            status: complaint.status,
            changedBy: {
              name: 'SLA Auto-Escalation Engine',
              role: 'system',
            },
            timestamp: now,
            note: `Auto-escalated to Level ${newLevel} (${levelTitle}): ${escalationReason}`,
          });

          await complaint.save();
          escalatedItems.push({ id: complaint._id, level: newLevel, daysOverdue });

          // Send notification to citizen
          if (complaint.userId) {
            const shortDesc = complaint.description.length > 30 ? complaint.description.substring(0, 30) + '...' : complaint.description;
            const pushMsg = `Your grievance "${shortDesc}" is overdue and has been AUTO-ESCALATED to Level ${newLevel} (${levelTitle}) for immediate priority resolution.`;

            if (complaint.userId.pushToken) {
              await sendExpoPushNotification(complaint.userId.pushToken, {
                title: `🚨 Escalation Notice: Level ${newLevel}`,
                body: pushMsg,
                data: { complaintId: complaint._id.toString(), escalated: true },
              });
            }

            if (complaint.userId.phone) {
              await sendSMS(complaint.userId.phone, `[Grievance Cell] Complaint #${complaint._id.toString().slice(-6)} is overdue and escalated to ${levelTitle}. Priority action initiated.`);
            }
          }
        }
      }
    }

    if (escalatedItems.length > 0) {
      console.log(`[Auto-Escalation Engine] Auto-escalated ${escalatedItems.length} overdue complaint(s).`);
    }

    return escalatedItems;
  } catch (err) {
    console.error('[Auto-Escalation Engine Error]', err);
    return [];
  }
}

/**
 * Calculates ward-wise transparency leaderboard
 */
async function getWardLeaderboard() {
  try {
    const complaints = await Complaint.find({}).lean();
    const wardMap = new Map();

    // Default wards
    const defaultWards = ['Ward 1', 'Ward 2', 'Ward 4', 'Ward 7', 'Ward 12', 'Ward 18', 'Central Zone'];
    defaultWards.forEach((w) => {
      wardMap.set(w, {
        ward: w,
        total: 0,
        resolved: 0,
        pending: 0,
        inProgress: 0,
        escalated: 0,
        totalResolutionHours: 0,
        resolvedCountForAvg: 0,
      });
    });

    complaints.forEach((c) => {
      let wardName = 'Central Zone';
      const address = c.location?.address || '';
      const wardMatch = address.match(/Ward\s*\d+/i);
      if (wardMatch) {
        wardName = wardMatch[0].replace(/\s+/g, ' ');
      }

      if (!wardMap.has(wardName)) {
        wardMap.set(wardName, {
          ward: wardName,
          total: 0,
          resolved: 0,
          pending: 0,
          inProgress: 0,
          escalated: 0,
          totalResolutionHours: 0,
          resolvedCountForAvg: 0,
        });
      }

      const item = wardMap.get(wardName);
      item.total += 1;
      if (c.status === 'resolved') {
        item.resolved += 1;
        if (c.resolvedAt && c.createdAt) {
          const hours = (new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
          item.totalResolutionHours += Math.max(1, hours);
          item.resolvedCountForAvg += 1;
        }
      } else if (c.status === 'in_progress') {
        item.inProgress += 1;
      } else {
        item.pending += 1;
      }

      if (c.isEscalated) {
        item.escalated += 1;
      }
    });

    const leaderboard = Array.from(wardMap.values()).map((w) => {
      const avgResolutionDays = w.resolvedCountForAvg > 0 ? (w.totalResolutionHours / w.resolvedCountForAvg / 24).toFixed(1) : '2.4';
      const resolutionRate = w.total > 0 ? Math.round((w.resolved / w.total) * 100) : 100;
      const score = resolutionRate * 0.7 + (w.escalated === 0 ? 30 : Math.max(0, 30 - w.escalated * 5));

      return {
        ward: w.ward,
        total: w.total,
        resolved: w.resolved,
        pending: w.pending + w.inProgress,
        escalated: w.escalated,
        resolutionRate: `${resolutionRate}%`,
        avgResolutionDays: `${avgResolutionDays} days`,
        score: Math.round(score),
      };
    });

    leaderboard.sort((a, b) => b.score - a.score);
    return leaderboard;
  } catch (err) {
    console.error('[Leaderboard Calculation Error]', err);
    return [];
  }
}

module.exports = {
  checkAndAutoEscalateComplaints,
  getWardLeaderboard,
};
