/* global __app_id, __firebase_config, __initial_auth_token */
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, serverTimestamp } from 'firebase/firestore';

// Global variables provided by the Canvas environment (with local fallbacks)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  // IMPORTANT: Replace with your actual Firebase project config for local testing.
  // You can find this in Firebase Console -> Project settings -> Your apps -> Web app -> Firebase SDK snippet (Config)
  apiKey: "YOUR_API_KEY", // <--- Make sure this is your REAL API Key
  authDomain: "YOUR_AUTH_DOMAIN", // <--- Make sure this is your REAL Auth Domain
  projectId: "YOUR_PROJECT_ID", // <--- Make sure this is your REAL Project ID
  storageBucket: "YOUR_STORAGE_BUCKET", // <--- Make sure this is your REAL Storage Bucket
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // <--- Make sure this is your REAL Messaging Sender ID
  appId: "YOUR_APP_ID" // <--- Make sure this is your REAL App ID
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState('Physical');
  const [severity, setSeverity] = useState('Low');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize Firebase and set up authentication listener
  useEffect(() => {
    console.log("App.js: Initializing Firebase...");
    if (!firebaseConfig || !firebaseConfig.apiKey) {
      console.error("App.js: Firebase config is missing or invalid. Please provide your Firebase config for local development.");
      setMessage("Firebase not configured. Check browser console for details.");
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authentication = getAuth(app);

      setDb(firestore);
      setAuth(authentication);
      console.log("App.js: Firebase app, firestore, and auth instances set.");

      const unsubscribe = onAuthStateChanged(authentication, async (user) => {
        if (user) {
          console.log("App.js: onAuthStateChanged - User logged in:", user.uid);
          setUserId(user.uid);
        } else {
          console.log("App.js: onAuthStateChanged - No user, attempting anonymous sign-in or custom token sign-in.");
          if (initialAuthToken) {
            try {
              await signInWithCustomToken(authentication, initialAuthToken);
              console.log("App.js: Signed in with custom token.");
            } catch (error) {
              console.error("App.js: Error signing in with custom token:", error);
              await signInAnonymously(authentication); // Fallback to anonymous
              console.log("App.js: Signed in anonymously after custom token failure.");
            }
          } else {
            await signInAnonymously(authentication);
            console.log("App.js: Signed in anonymously.");
          }
        }
        setIsAuthReady(true); // Mark auth as ready after initial check/sign-in attempt
        console.log("App.js: Authentication state ready. isAuthReady set to true.");
      });

      return () => {
        console.log("App.js: Cleaning up auth state listener.");
        unsubscribe();
      };
    } catch (error) {
      console.error("App.js: Error initializing Firebase:", error);
      setMessage("Failed to initialize Firebase. Check browser console for details.");
    }
  }, []); // Empty dependency array means this runs once on mount

  // Fetch alerts when Firebase is ready and authenticated
  useEffect(() => {
    if (db && isAuthReady) {
      console.log("App.js: Firebase DB and Auth ready. Attempting to fetch alerts.");
      const alertsCollectionRef = collection(db, `artifacts/${appId}/public/data/alerts`);
      const q = query(alertsCollectionRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("App.js: Alerts snapshot received.");
        const fetchedAlerts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        fetchedAlerts.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
        setAlerts(fetchedAlerts);
        setMessage(''); // Clear any previous error messages related to auth
      }, (error) => {
        console.error("App.js: Error fetching alerts:", error);
        setMessage("Failed to fetch alerts. Check browser console for details.");
      });

      return () => {
        console.log("App.js: Cleaning up alerts snapshot listener.");
        unsubscribe();
      };
    } else {
      console.log("App.js: DB or Auth not ready for fetching alerts. db:", !!db, "isAuthReady:", isAuthReady);
    }
  }, [db, isAuthReady, appId]); // Dependencies for re-running effect

  const handleSubmitAlert = async (e) => {
    e.preventDefault();
    if (!title || !description || !location || !type || !severity) {
      setMessage("Please fill in all fields.");
      return;
    }
    if (!db || !userId) {
      setMessage("Firebase not initialized or user not authenticated.");
      console.error("App.js: Attempted submit without DB or userId. DB:", !!db, "userId:", userId);
      return;
    }

    setLoading(true);
    setMessage('');
    console.log("App.js: Submitting alert to Netlify function...");

    try {
      const response = await fetch('/.netlify/functions/submit-alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, description, location, type, severity, userId }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(result.message || "Alert submitted successfully!");
        setTitle('');
        setDescription('');
        setLocation('');
        setType('Physical');
        setSeverity('Low');
        console.log("App.js: Alert submitted successfully via Netlify function.");
      } else {
        console.error("App.js: Error from Netlify function:", result.error || result);
        setMessage(result.error || "Failed to submit alert. Please try again.");
      }
    } catch (error) {
      console.error("App.js: Network or unexpected error submitting alert:", error);
      setMessage("An unexpected error occurred. Check browser console for details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 font-sans text-gray-800">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-xl p-6 md:p-8">
        <h1 className="text-4xl font-extrabold text-center text-indigo-700 mb-8">
          Community Security Alert System
        </h1>

        {userId && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            <p className="font-semibold">Your User ID:</p>
            <p className="break-all">{userId}</p>
            <p className="mt-2 text-xs">Share this ID if you want others to identify your alerts.</p>
          </div>
        )}

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-center ${message.includes('success') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message}
          </div>
        )}

        {/* Alert Submission Form */}
        <div className="mb-10 p-6 bg-indigo-50 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-indigo-600 mb-5">Submit a New Alert</h2>
          <form onSubmit={handleSubmitAlert} className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Alert Title
              </label>
              <input
                type="text"
                id="title"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                rows="4"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              ></textarea>
            </div>
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                Location (e.g., Street, City, Landmark)
              </label>
              <input
                type="text"
                id="location"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                  Type of Incident
                </label>
                <select
                  id="type"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="Physical">Physical Security</option>
                  <option value="Cyber">Cyber Security</option>
                  <option value="Environmental">Environmental Hazard</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="severity" className="block text-sm font-medium text-gray-700 mb-1">
                  Severity
                </label>
                <select
                  id="severity"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white p-3 rounded-md font-semibold hover:bg-indigo-700 transition duration-200 ease-in-out shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Submit Alert'}
            </button>
          </form>
        </div>

        {/* Alert List */}
        <div className="p-6 bg-gray-50 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-gray-700 mb-5">Recent Alerts</h2>
          {alerts.length === 0 ? (
            <p className="text-center text-gray-500">No alerts yet. Be the first to submit one!</p>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert) => (
                <div key={alert.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                  <h3 className="text-xl font-semibold text-indigo-600 mb-2">{alert.title}</h3>
                  <p className="text-gray-700 mb-2">{alert.description}</p>
                  <div className="text-sm text-gray-500 space-y-1">
                    <p><strong>Location:</strong> {alert.location}</p>
                    <p><strong>Type:</strong> <span className="font-medium text-indigo-500">{alert.type}</span></p>
                    <p><strong>Severity:</strong>
                      <span className={`font-bold ml-1 ${
                        alert.severity === 'Low' ? 'text-green-500' :
                        alert.severity === 'Medium' ? 'text-yellow-600' :
                        alert.severity === 'High' ? 'text-orange-600' :
                        'text-red-600'
                      }`}>
                        {alert.severity}
                      </span>
                    </p>
                    <p><strong>Reported by:</strong> <span className="break-all">{alert.userId}</span></p>
                    {alert.timestamp && (
                      <p><strong>Time:</strong> {new Date(alert.timestamp.toDate()).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
