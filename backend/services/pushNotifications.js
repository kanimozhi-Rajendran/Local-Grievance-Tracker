/**
 * Push Notification Service using Expo Push API
 * Sends real push notifications to citizens' devices via Expo.
 */

const sendExpoPushNotification = async (pushToken, { title, body, data = {} }) => {
  if (!pushToken) {
    console.log('[Push Notification] Skipped: No push token registered for user.');
    return { success: false, reason: 'no_token' };
  }

  // Check if push token is a valid Expo push token format
  if (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken[')) {
    console.log(`[Push Notification Simulation] Simulated push to token ${pushToken}: "${title}" - "${body}"`);
    return { success: true, simulated: true };
  }

  try {
    const message = {
      to: pushToken,
      sound: 'default',
      title: title || '🏛️ Local Grievance Tracker Update',
      body,
      data,
      priority: 'high',
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log(`[Push Notification Sent] Expo response:`, result);
    return { success: true, result };
  } catch (err) {
    console.error('[Push Notification Error]', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendExpoPushNotification };
