// src/lib/firebase.ts

import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | any;
let auth: Auth | any;
let db: Firestore | any;

try {
  // Only initialize if an API key is present, preventing auth/invalid-api-key build errors
  if (firebaseConfig.apiKey) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    console.warn("No NEXT_PUBLIC_FIREBASE_API_KEY found. Skipping Firebase initialization. Providing mock instances to prevent build errors.");
    auth = {
      onAuthStateChanged: (cb: any) => { cb(null); return () => {}; },
      currentUser: null,
      signOut: async () => {},
    } as unknown as Auth;
    db = {} as Firestore;
  }
} catch (error) {
  console.error("Firebase Initialization Error:", error);
  auth = {
    onAuthStateChanged: (cb: any) => { cb(null); return () => {}; },
    currentUser: null,
    signOut: async () => {},
  } as unknown as Auth;
  db = {} as Firestore;
}

export { app, auth, db };