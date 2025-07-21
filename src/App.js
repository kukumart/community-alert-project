/* global __app_id, __firebase_config, __initial_auth_token */
import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot } from 'firebase/firestore';

// Global variables provided by the Canvas environment (with local fallbacks)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  // YOUR ACTUAL FIREBASE WEB APP CONFIGURATION
  apiKey: "AIzaSyDclKByULL5nr7kg6ehY93XJpz2Xhb7UQw",
  authDomain: "poultry-pp.firebaseapp.com",
  projectId: "poultry-pp",
  storageBucket: "poultry-pp.firebasestorage.app",
  messagingSenderId: "477596536782",
  appId: "1:477596536782:web:eb280613be9c9748f8a59f",
  measurementId: "G-H38RJ92M6M"
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null); // 'auth' is now used in onAuthStateChanged
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
  const [geminiInsights, setGeminiInsights] = useState({}); // New state for storing Gemini insights
  const [loadingInsight, setLoadingInsight] = useState({}); // New state for per-insight loading

  // Initialize Firebase and set up authentication listener
  useEffect(() => {
    console.log("App.js: Initializing Firebase...");
    
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authentication = getAuth(app);

      setDb(firestore);
      setAuth(authentication); // Use 'authentication' to set 'auth' state
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
    // Explicitly use 'auth' here to satisfy the linter's 'no-unused-vars' rule for the 'auth' state variable.
    // It also ensures that Firestore operations only proceed when the auth instance is fully available.
    if (db && isAuthReady && auth) { 
      console.log("App.js: Firebase DB and Auth ready. Attempting to fetch alerts.");
      // Use the global appId directly as it's a constant
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
      console.log("App.js: DB or Auth not ready for fetching alerts. db:", !!db, "isAuthReady:", isAuthReady, "auth:", !!auth);
    }
  }, [db, isAuthReady, auth]); // Added 'auth' to dependencies

  // Using useCallback to memoize handleSubmitAlert to prevent unnecessary re-renders
  const handleSubmitAlert = useCallback(async (e) => {
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
      // Construct the absolute URL for the Netlify function
      const functionUrl = `${window.location.origin}/.netlify/functions/submit-alert`;
      console.log("App.js: Fetching function at URL:", functionUrl);

      const response = await fetch(functionUrl, {
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
  }, [title, description, location, type, severity, db, userId]); // Dependencies for useCallback

  // Using useCallback to memoize handleGetGeminiInsight
  const handleGetGeminiInsight = useCallback(async (alertId, alertTitle, alertDescription) => {
    setLoadingInsight(prev => ({ ...prev, [alertId]: true }));
    setMessage(''); // Clear any general messages

    try {
      const functionUrl = `${window.location.origin}/.netlify/functions/gemini-insight`;
      console.log(`App.js: Requesting Gemini insight for alert ${alertId} at URL:`, functionUrl);

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: alertTitle, description: alertDescription }),
      });

      const result = await response.json();

      if (response.ok) {
        setGeminiInsights(prev => ({ ...prev, [alertId]: result.insight }));
        console.log(`App.js: Gemini insight received for alert ${alertId}.`);
      } else {
        console.error("App.js: Error from Gemini Insight function:", result.error || result);
        setMessage(result.error || "Failed to get Gemini insight.");
      }
    } catch (error) {
      console.error("App.js: Network or unexpected error getting Gemini insight:", error);
      setMessage("An unexpected error occurred while getting Gemini insight. Check browser console.");
    } finally {
      setLoadingInsight(prev => ({ ...prev, [alertId]: false }));
    }
  }, []); // No dependencies that change per call, so empty array is fine for memoization

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
                  {/* New Gemini Insight Button and Display */}
                  <button
                    onClick={() => handleGetGeminiInsight(alert.id, alert.title, alert.description)}
                    className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-semibold hover:bg-purple-700 transition duration-200 ease-in-out shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loadingInsight[alert.id]}
                  >
                    {loadingInsight[alert.id] ? 'Generating Insight...' : '✨ Get Gemini Insight'}
                  </button>
                  {geminiInsights[alert.id] && (
                    <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
                      <h4 className="font-semibold mb-1">Gemini Insight:</h4>
                      <p className="whitespace-pre-wrap">{geminiInsights[alert.id]}</p>
                    </div>
                  )}
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
