import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

// Global variables provided by the Canvas environment (with local fallbacks)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  // IMPORTANT: Replace with your actual Firebase project config for local testing.
  // You can find this in Firebase Console -> Project settings -> Your apps -> Web app -> Firebase SDK snippet (Config)
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
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
  const [type, setType] = useState('Physical'); // Default type
  const [severity, setSeverity] = useState('Low'); // Default severity
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize Firebase and set up authentication listener
  useEffect(() => {
    // Only initialize if firebaseConfig has an apiKey (meaning it's properly set up)
    if (!firebaseConfig.apiKey) {
      console.error("Firebase config is missing. Please provide your Firebase config for local development.");
      setMessage("Firebase not configured for local development. Check console.");
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authentication = getAuth(app);

      setDb(firestore);
      setAuth(authentication);

      // Listen for auth state changes
      const unsubscribe = onAuthStateChanged(authentication, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // Sign in anonymously if no user is found and no initial token is provided
          if (!initialAuthToken) {
            await signInAnonymously(authentication);
          }
          setIsAuthReady(true); // Mark auth as ready even if anonymous
        }
      });

      // Use the initial custom auth token if available
      if (initialAuthToken) {
        signInWithCustomToken(authentication, initialAuthToken)
          .then(() => {
            console.log("Signed in with custom token.");
          })
          .catch((error) => {
            console.error("Error signing in with custom token:", error);
            // Fallback to anonymous if custom token fails
            signInAnonymously(authentication);
          });
      }

      return () => unsubscribe(); // Clean up auth listener on unmount
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setMessage("Failed to initialize Firebase. Check console for details.");
    }
  }, [initialAuthToken]); // Added initialAuthToken to dependency array

  // Fetch alerts when Firebase is ready
  useEffect(() => {
    if (db && isAuthReady) {
      const alertsCollectionRef = collection(db, `artifacts/${appId}/public/data/alerts`);
      // Note: orderBy is commented out due to potential Firestore index issues in Canvas environment.
      // Data will be sorted in memory.
      const q = query(alertsCollectionRef /*, orderBy('timestamp', 'desc')*/);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedAlerts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort alerts by timestamp in memory (descending)
        fetchedAlerts.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
        setAlerts(fetchedAlerts);
      }, (error) => {
        console.error("Error fetching alerts:", error);
        setMessage("Failed to fetch alerts. Check console for details.");
      });

      return () => unsubscribe(); // Clean up snapshot listener
    }
  }, [db, isAuthReady, appId]);

  const handleSubmitAlert = async (e) => {
    e.preventDefault();
    if (!title || !description || !location || !type || !severity) {
      setMessage("Please fill in all fields.");
      return;
    }
    if (!db || !userId) {
      setMessage("Firebase not initialized or user not authenticated.");
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // Add alert to Firestore
      await addDoc(collection(db, `artifacts/${appId}/public/data/alerts`), {
        title,
        description,
        location,
        type,
        severity,
        userId,
        timestamp: serverTimestamp(),
      });

      setMessage("Alert submitted successfully!");
      setTitle('');
      setDescription('');
      setLocation('');
      setType('Physical');
      setSeverity('Low');
    } catch (error) {
      console.error("Error submitting alert:", error);
      setMessage("Failed to submit alert. Check console for details.");
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
