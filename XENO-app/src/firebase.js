import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  onSnapshot,
  serverTimestamp,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = window.__XENO_FIREBASE_CONFIG;

let app = null;
let auth = null;
let db = null;

if (firebaseConfig) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export function isFirebaseReady() {
  return Boolean(app && auth && db);
}

export function getFirebase() {
  return { app, auth, db };
}

export {
  auth,
  db,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  updateProfile,
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  onSnapshot,
  serverTimestamp,
  deleteDoc
};
