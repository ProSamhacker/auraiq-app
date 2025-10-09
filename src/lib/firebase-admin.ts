import admin from 'firebase-admin';
import { getApps } from 'firebase-admin/app';

// Parse the service account key from the environment variable
const serviceAccount = JSON.parse(
  process.env.FIREBASE_ADMIN_CONFIG as string
);

// Initialize the Firebase Admin SDK if it hasn't been already
if (getApps().length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // You can add other config here if needed, like storageBucket
  });
}

// Export the initialized admin services
const adminDb = admin.firestore();
const adminAuth = admin.auth();
const adminStorage = admin.storage();

export { admin, adminDb, adminAuth, adminStorage };