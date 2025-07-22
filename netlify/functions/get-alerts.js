// netlify/functions/get-alerts.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// IMPORTANT: Replace with your Firebase Admin SDK service account key.
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?
  JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('ascii')) :
  {}; // Fallback for local development

let app;
try {
  app = initializeApp({
    credential: cert(serviceAccount)
  });
} catch (error) {
  if (!error.message.includes('already exists')) {
    console.error("Firebase Admin SDK initialization error:", error);
  }
}

const db = getFirestore(app);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const appId = process.env.APP_ID || 'default-app-id'; // Same APP_ID as in submit-alert.js

    const snapshot = await db.collection(`artifacts/${appId}/public/data/alerts`)
      // .orderBy('timestamp', 'desc') // Can use orderBy here if Firestore index is set up
      .get();

    const alerts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp ? doc.data().timestamp.toDate().toISOString() : null, // Convert Timestamp to ISO string
    }));

    // Sort alerts by timestamp in memory if orderBy was commented out
    alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alerts),
    };
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch alerts', details: error.message }),
    };
  }
};
