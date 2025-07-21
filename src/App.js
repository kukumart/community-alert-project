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
    if (db && isAuthReady && auth) {
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
      console.log("App.js: DB or Auth not ready for fetching alerts. db:", !!db, "isAuthReady:", isAuthReady, "auth:", !!auth);
    }
  }, [db, isAuthReady, auth]);

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
  }, [title, description, location, type, severity, db, userId]);

  const handleGetGeminiInsight = useCallback(async (alertId, alertTitle, alertDescription) => {
    setLoadingInsight(prev => ({ ...prev, [alertId]: true }));
    setMessage('');

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
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 font-sans text-gray-800 flex items-center justify-center">
      <div className="max-w-4xl w-full mx-auto bg-white shadow-2xl rounded-3xl p-6 md:p-10 border border-indigo-200">
        <h1 className="text-5xl font-extrabold text-center text-indigo-800 mb-10 drop-shadow-md">
          Community Security Alert System
        </h1>

        {userId && (
          <div className="mb-8 p-5 bg-blue-50 border border-blue-300 rounded-xl text-base text-blue-800 shadow-inner">
            <p className="font-semibold text-lg mb-2">Your User ID:</p>
            <p className="break-all font-mono text-blue-700 bg-blue-100 p-2 rounded-lg select-all">{userId}</p>
            <p className="mt-3 text-sm text-blue-600">Share this ID if you want others to identify your alerts or for collaborative features.</p>
          </div>
        )}

        {message && (
          <div className={`mb-6 p-4 rounded-xl text-center font-medium shadow-md ${message.includes('success') ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'}`}>
            {message}
          </div>
        )}

        {/* Alert Submission Form */}
        <div className="mb-12 p-8 bg-indigo-50 rounded-2xl shadow-lg border border-indigo-200">
          <h2 className="text-3xl font-bold text-indigo-700 mb-6 text-center">Submit a New Alert</h2>
          <form onSubmit={handleSubmitAlert} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-lg font-medium text-gray-700 mb-2">
                Alert Title
              </label>
              <input
                type="text"
                id="title"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150 ease-in-out"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-lg font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                rows="5"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150 ease-in-out"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              ></textarea>
            </div>
            <div>
              <label htmlFor="location" className="block text-lg font-medium text-gray-700 mb-2">
                Location (e.g., Street, City, Landmark)
              </label>
              <input
                type="text"
                id="location"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150 ease-in-out"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="type" className="block text-lg font-medium text-gray-700 mb-2">
                  Type of Incident
                </label>
                <select
                  id="type"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150 ease-in-out bg-white"
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
                <label htmlFor="severity" className="block text-lg font-medium text-gray-700 mb-2">
                  Severity
                </label>
                <select
                  id="severity"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition duration-150 ease-in-out bg-white"
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
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-4 rounded-xl font-bold text-xl hover:from-indigo-700 hover:to-purple-800 transition duration-300 ease-in-out shadow-lg transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Submit Alert'}
            </button>
          </form>
        </div>

        {/* Alert List */}
        <div className="p-8 bg-gray-50 rounded-2xl shadow-lg border border-gray-200">
          <h2 className="text-3xl font-bold text-gray-700 mb-6 text-center">Recent Alerts</h2>
          {alerts.length === 0 ? (
            <p className="text-center text-gray-500 text-lg py-4">No alerts yet. Be the first to submit one!</p>
          ) : (
            <div className="space-y-6">
              {alerts.map((alert) => (
                <div key={alert.id} className="bg-white p-6 rounded-xl shadow-md border border-gray-200 transform hover:scale-[1.01] transition duration-200 ease-in-out">
                  <h3 className="text-2xl font-semibold text-indigo-700 mb-3">{alert.title}</h3>
                  <p className="text-gray-800 mb-3 leading-relaxed">{alert.description}</p>
                  <div className="text-base text-gray-600 space-y-2">
                    <p><strong>Location:</strong> <span className="text-gray-700">{alert.location}</span></p>
                    <p><strong>Type:</strong> <span className="font-medium text-indigo-600">{alert.type}</span></p>
                    <p><strong>Severity:</strong>
                      <span className={`font-bold ml-2 px-3 py-1 rounded-full text-white ${
                        alert.severity === 'Low' ? 'bg-green-500' :
                        alert.severity === 'Medium' ? 'bg-yellow-600' :
                        alert.severity === 'High' ? 'bg-orange-600' :
                        'bg-red-600'
                      }`}>
                        {alert.severity}
                      </span>
                    </p>
                    <p><strong>Reported by:</strong> <span className="break-all font-mono text-gray-700">{alert.userId}</span></p>
                    {alert.timestamp && (
                      <p><strong>Time:</strong> <span className="text-gray-700">{new Date(alert.timestamp.toDate()).toLocaleString()}</span></p>
                    )}
                  </div>
                  {/* New Gemini Insight Button and Display */}
                  <button
                    onClick={() => handleGetGeminiInsight(alert.id, alert.title, alert.description)}
                    className="mt-5 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl text-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition duration-300 ease-in-out shadow-lg transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    disabled={loadingInsight[alert.id]}
                  >
                    {loadingInsight[alert.id] ? 'Generating Insight...' : '✨ Get Gemini Insight'}
                  </button>
                  {geminiInsights[alert.id] && (
                    <div className="mt-4 p-5 bg-purple-100 border border-purple-300 rounded-xl text-base text-purple-900 shadow-inner">
                      <h4 className="font-bold text-lg mb-2 text-purple-800">Gemini Insight:</h4>
                      <p className="whitespace-pre-wrap leading-relaxed">{geminiInsights[alert.id]}</p>
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
