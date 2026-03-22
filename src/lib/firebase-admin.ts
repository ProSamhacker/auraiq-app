import admin from 'firebase-admin';
import { getApps } from 'firebase-admin/app';

// Parse the service account key from the environment variable safely
let serviceAccount = null;
try {
  const config = process.env.FIREBASE_ADMIN_CONFIG;
  if (config && config !== 'undefined' && config !== 'null') {
    serviceAccount = JSON.parse(config);
  }
} catch (error) {
  console.warn('Failed to parse FIREBASE_ADMIN_CONFIG from environment');
}

// Initialize the Firebase Admin SDK if it hasn't been already
if (getApps().length === 0) {
  try {
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      admin.initializeApp();
    }
  } catch (error) {
    console.warn('Firebase admin initialization skipped or failed (expected during build without credentials).');
  }
}

// Export the initialized admin services safely
let adminDb: admin.firestore.Firestore | any = null;
let adminAuth: admin.auth.Auth | any = null;
let adminStorage: admin.storage.Storage | any = null;

try {
  adminDb = admin.firestore();
  adminAuth = admin.auth();
  adminStorage = admin.storage();
} catch (e) {
  console.warn('Firebase admin services could not be initialized. This is normal during build.');
}

export { admin, adminDb, adminAuth, adminStorage };