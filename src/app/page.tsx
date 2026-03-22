// src/app/page.tsx

"use client";

import { useState, useEffect, Suspense } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";
import AuthComponent from "../components/AuthComponent";
import GeminiLayout from "../components/GeminiLayout";
import ErrorBoundary from '@/components/ErrorBoundary';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsAuthLoading(false);
      return;
    }

    // 1. Set up the Firebase listener
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("Auth state changed:", user ? "Logged in" : "Logged out");
      setUser(user);
      setIsAuthLoading(false);
    });

    // 2. Add a fallback timeout (e.g., 4 seconds)
    const timeoutId = setTimeout(() => {
      setIsAuthLoading((isLoading) => {
        if (isLoading) {
          console.warn("Auth listener timed out - forcing load");
          return false; 
        }
        return isLoading;
      });
    }, 4000);

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  if (!isFirebaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gray-900 text-white text-center">
        <h1 className="text-3xl font-bold text-red-500 mb-4">Configuration Error</h1>
        <p className="text-xl mb-4 text-gray-300">Firebase environment variables are missing.</p>
        <div className="bg-gray-800 p-6 rounded-lg text-left max-w-lg border border-gray-700">
          <p className="mb-2">If you recently deployed this to Vercel, you need to add your <code className="bg-gray-900 px-1 py-0.5 rounded text-red-400">NEXT_PUBLIC_FIREBASE_*</code> environment variables to your project settings.</p>
          <ol className="list-decimal pl-5 space-y-2 text-gray-400">
            <li>Go to your Vercel Project Dashboard</li>
            <li>Click Settings &rarr; Environment Variables</li>
            <li>Add all variables from your local <code className="bg-gray-900 text-sm px-1">.env.local</code> file</li>
            <li>Click <strong>Redeploy</strong> to apply the changes</li>
          </ol>
        </div>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <ErrorBoundary>
        <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-400">Connecting securely...</p>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {user ? (
        <Suspense fallback={<div className="flex items-center justify-center h-screen bg-[#131314] text-white">Loading Interface...</div>}>
          <GeminiLayout user={user} auth={auth} db={db} />
        </Suspense>
      ) : (
        <AuthComponent auth={auth} />
      )}
    </ErrorBoundary>
  );
}