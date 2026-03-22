// src/app/page.tsx

"use client";

import { useState, useEffect, Suspense } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import AuthComponent from "../components/AuthComponent";
import GeminiLayout from "../components/GeminiLayout";
import ErrorBoundary from '@/components/ErrorBoundary';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
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

  if (isAuthLoading) {
    return (
      <ErrorBoundary>
        <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
          Loading...
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