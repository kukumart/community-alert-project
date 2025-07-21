// netlify/functions/submit-alert.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fetch = require('node-fetch'); // You might need to install 'node-fetch'

// IMPORTANT: Replace with your Firebase Admin SDK service account key.
// In a real application, you would store this securely as an environment variable.
// For Netlify, you can set it as a build environment variable.
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?
  JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('ascii')) :
  {}; // Fallback for local development, should not be empty in production

// Initialize Firebase Admin SDK once
let app;
try {
  app = initializeApp({
    credential: cert(serviceAccount)
  });
} catch (error) {
  if (!error.message.includes('already exists')) {
    console.error("Firebase Admin SDK initialization error:", error);
  }
  // If app already exists, it means it was initialized in a previous invocation (hot reload)
  // This is common in serverless environments.
}

const db = getFirestore(app);

// WhatsApp API Configuration (Store these as Netlify Environment Variables)
// These will be empty strings if not set in Netlify, so we add checks below.
// CORRECTED: Accessing environment variables by their names, not their values
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL; // e.g., 'https://api.twilio.com/2010-04-01/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Messages.json'
const WHATSAPP_ACCOUNT_SID = process.env.WHATSAPP_ACCOUNT_SID;
const WHATSAPP_AUTH_TOKEN = process.env.WHATSAPP_AUTH_TOKEN;
const WHATSAPP_FROM_NUMBER = process.env.WHATSAPP_FROM_NUMBER; // Your WhatsApp-enabled Twilio number (e.g., 'whatsapp:+14155238886')
const WHATSAPP_TO_NUMBER = process.env.WHATSAPP_TO_NUMBER; // The recipient's WhatsApp number (e.g., 'whatsapp:+31612345678')

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { title, description, location, type, severity, userId } = data;

    if (!title || !description || !location || !type || !severity || !userId) {
      return { statusCode: 400, body: 'Missing required fields' };
    }

    // Get the app ID from the Netlify environment (or pass from client if needed)
    const appId = process.env.APP_ID || 'default-app-id';

    // 1. Save alert to Firestore
    await db.collection(`artifacts/${appId}/public/data/alerts`).add({
      title,
      description,
      location,
      type,
      severity,
      userId,
      timestamp: new Date(), // Server-side timestamp
    });

    // 2. Send WhatsApp Notification (Conditional based on severity, etc.)
    // You might want to send notifications only for 'High' or 'Critical' severity alerts
    if (severity === 'High' || severity === 'Critical') {
      // Using actual emoji for clarity, assuming correct file encoding
      const messageBody = `🚨 New Security Alert: ${title}\nLocation: ${location}\nSeverity: ${severity}\nDescription: ${description.substring(0, Math.min(description.length, 100))}...`;

      // Example for Twilio (adjust for your chosen provider)
      if (WHATSAPP_API_URL && WHATSAPP_ACCOUNT_SID && WHATSAPP_AUTH_TOKEN && WHATSAPP_FROM_NUMBER && WHATSAPP_TO_NUMBER) {
        const authHeader = Buffer.from(`${WHATSAPP_ACCOUNT_SID}:${WHATSAPP_AUTH_TOKEN}`).toString('base64');
        const params = new URLSearchParams();
        params.append('To', WHATSAPP_TO_NUMBER);
        params.append('From', WHATSAPP_FROM_NUMBER);
        params.append('Body', messageBody);

        try {
          const whatsappResponse = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${authHeader}`
            },
            body: params.toString(),
          });

          const whatsappResult = await whatsappResponse.json();
          if (!whatsappResponse.ok) {
            console.error('WhatsApp API Error:', whatsappResult);
            // You might want to log this error but still return success for the alert submission
          } else {
            console.log('WhatsApp message sent:', whatsappResult);
          }
        } catch (whatsappError) {
          console.error('Failed to send WhatsApp message:', whatsappError);
        }
      } else {
        console.warn('WhatsApp API credentials not fully configured. Skipping WhatsApp notification.');
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Alert submitted successfully and notification attempted!' }),
    };
  } catch (error) {
    console.error('Error submitting alert:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to submit alert', details: error.message }),
    };
  }
};
