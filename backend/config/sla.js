/**
 * SLA (Service Level Agreement) Resolution Targets per Category (in Days)
 * - Streetlight: 5 days
 * - Road Damage: 15 days
 * - Water Leak: 3 days
 * - Garbage Dump: 2 days
 * - Other: 7 days
 */

const SLA_DAYS = {
  streetlight: 5,
  road: 15,
  water: 3,
  garbage: 2,
  other: 7,
};

const ESCALATION_LEVELS = {
  1: {
    title: 'Junior Engineer / Ward Inspector',
    description: 'Level 1: Local Field Team & Line Inspector',
  },
  2: {
    title: 'Assistant Executive Engineer / Ward Officer',
    description: 'Level 2: Zonal Ward Head & Public Works Officer',
  },
  3: {
    title: 'Municipal Commissioner / Panchayat Secretary',
    description: 'Level 3: Apex Executive Authority',
  },
};

/**
 * Calculates due date for a complaint based on its category and creation timestamp
 */
const calculateDueDate = (category, fromDate = new Date()) => {
  const cat = String(category).toLowerCase();
  const days = SLA_DAYS[cat] || SLA_DAYS.other;
  const due = new Date(fromDate);
  due.setDate(due.getDate() + days);
  return due;
};

module.exports = {
  SLA_DAYS,
  ESCALATION_LEVELS,
  calculateDueDate,
};

