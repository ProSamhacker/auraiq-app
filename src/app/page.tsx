// src/app/page.tsx

"use client";

import { useState, useEffect } from "react";
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
        <GeminiLayout user={user} auth={auth} db={db} />
      ) : (
        <AuthComponent auth={auth} />
      )}
    </ErrorBoundary>
  );
}