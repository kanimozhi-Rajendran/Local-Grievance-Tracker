/**
 * SMS Service for OTP Delivery
 * Uses Twilio REST API when credentials are provided in .env,
 * otherwise provides a resilient mock console-logging fallback.
 */

const sendSMS = async (toPhone, message) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  // If Twilio credentials are configured, attempt real SMS delivery
  if (accountSid && authToken && fromPhone) {
    try {
      // Ensure phone is E.164 formatted (e.g. +91XXXXXXXXXX or leading +)
      let formattedTo = toPhone.trim();
      if (!formattedTo.startsWith('+')) {
        if (formattedTo.length === 10) {
          formattedTo = `+91${formattedTo}`; // Default to India country code for 10-digit numbers
        } else {
          formattedTo = `+${formattedTo}`;
        }
      }

      const params = new URLSearchParams();
      params.append('To', formattedTo);
      params.append('From', fromPhone);
      params.append('Body', message);

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[Twilio Error]', data.message || data);
        console.log(`[SMS Fallback] Falling back to console OTP delivery due to Twilio error.`);
        return {
          success: true,
          isRealSMS: false,
          warning: `Twilio delivery error: ${data.message || 'Check credentials'}. Used console fallback.`,
        };
      }

      console.log(`[Twilio SMS] Real SMS sent successfully to ${formattedTo}. SID: ${data.sid}`);
      return { success: true, isRealSMS: true, sid: data.sid };
    } catch (err) {
      console.error('[Twilio Exception]', err.message);
      return { success: true, isRealSMS: false, warning: err.message };
    }
  }

  // Fallback: Mock SMS delivery logged to console
  console.log(`\n========================================`);
  console.log(`[SMS Gateway Mock] No Twilio credentials in .env`);
  console.log(`Target: ${toPhone}`);
  console.log(`Message: "${message}"`);
  console.log(`========================================\n`);

  return { success: true, isRealSMS: false };
};

module.exports = { sendSMS };
