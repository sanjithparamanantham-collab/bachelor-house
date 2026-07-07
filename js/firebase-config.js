// ============================================================
// FIREBASE CONFIGURATION
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAdryu-2NPhRdxQfnvuGlu8dEBorVNjMMM",
  authDomain:        "bachelor-house-593d6.firebaseapp.com",
  projectId:         "bachelor-house-593d6",
  storageBucket:     "bachelor-house-593d6.firebasestorage.app",
  messagingSenderId: "706486529360",
  appId:             "1:706486529360:web:39a3a783c1925f8b6b9055"
};

// VAPID key for push notifications (optional)
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair
const VAPID_KEY = "PASTE_YOUR_VAPID_KEY_HERE";

window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.VAPID_KEY       = VAPID_KEY;
