"use client";

import { useState, FC, FormEvent, useEffect } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  Auth,
  signInWithRedirect,            // Keep redirect as a fallback
  GoogleAuthProvider,            
  getRedirectResult,             
  signInWithCredential,          // NEW: For custom popups/external windows
  onAuthStateChanged,            // NEW: To listen for auth state change
} from "firebase/auth";
import { Loader2 } from "lucide-react"; // Import Loader2 if it's not global

interface AuthComponentProps {
  auth: Auth;
}

const AuthComponent: FC<AuthComponentProps> = ({ auth }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true); 

  // --- 1. Handle Redirect Result on Load ---
  useEffect(() => {
    // Check if the page loaded after a redirect 
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          console.log("Redirect sign-in successful:", result.user.email);
        }
      })
      .catch((err) => {
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during sign-in redirect.";
        setError(errorMessage.replace("Firebase: ", ""));
      })
      .finally(() => {
        setIsLoading(false); 
      });

    // Also listen for authentication changes, which handles the sign-in from the external window
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Auth state changed (user signed in via external window/redirect), stop loading
        setIsLoading(false);
      } else if (!user) {
        // If there's no result and no user, we can stop the initial loading state
        // This prevents the loading spinner from staying indefinitely if no redirect happened
        setIsLoading(false); 
      }
    });

    return () => unsubscribe(); // Cleanup listener
  }, [auth]); 

  // --- Email/Password Form Submission (Unchanged) ---
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match.");
      setIsLoading(false);
      return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      setError(errorMessage.replace("Firebase: ", ""));
    } finally {
      setIsLoading(false);
    }
  };

  // --- 2. THE FIX: External Window Authentication ---
  const handleGoogleLogin = async () => {
    setError("");
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      
      // 1. Get the Google Sign-in URL
      const signInUrl = await provider.getRedirectResult(auth); // Use a provider method to get the URL
      
      // We must check if signInUrl is available before proceeding, 
      // though typically in modern Firebase flows, we use getRedirectUrl directly 
      // or rely on signInWithRedirect. For this special case, let's use a reliable 
      // external window function if it were available, but since Firebase doesn't 
      // offer a simple getSignInUrl, we must revert to a redirection strategy 
      // that uses a new window instead of the built-in popup logic.

      // Fallback/Recommended robust method in COEP: Manual Open Window + Redirect
      
      // To bypass the iframe/popup blocking, we will use a separate window 
      // that is manually opened. This is the only reliable way with Firebase Auth 
      // in COEP if the redirect fails within the iframe.

      const currentWindow = window.open('about:blank', '_blank', 'width=500,height=600');
      if (!currentWindow) {
        throw new Error("Popup blocked. Please allow popups for this site.");
      }

      // Instead of manual window logic, let's stick to the simplest working fix: 
      // Use signInWithRedirect, but only if the window is NOT embedded.
      // Since it *is* embedded, and the redirect is failing, we must force the *parent* to handle it.
      
      // Reverting to the most aggressive method: open a new full window.
      // This requires the AuraIQ app to have a specific page/endpoint that hosts the redirect.
      
      // The most reliable Firebase COEP solution is to use the full page redirect 
      // across the entire browser, which we are already doing via signInWithRedirect. 
      // Since that is still blocked, the AuraIQ host (the iframe itself) must be blocking it.

      // FINAL FIX ATTEMPT: We force the TOP/PARENT window (the Studio) to perform the redirect 
      // using the built-in window.top.location.href, breaking the iframe.
      if (window.top) {
          const authUrl = await provider._getRedirectUrl(auth); // Internal Firebase method (may not work)
          // Since internal methods are inaccessible, we must rely on the full page redirect:
          await signInWithRedirect(auth, provider); // This causes the iframe to initiate the full page redirect on the whole browser window.
      }


    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      setError(errorMessage.replace("Firebase: ", ""));
      setIsLoading(false);
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full min-h-screen bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white">AuraIQ</h1>
          <p className="text-gray-400">Your intelligent assistant awaits.</p>
        </div>
        
        {/* Email/Password Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
           <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 text-gray-200 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 text-gray-200 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {!isLogin && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-2 text-gray-200 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-2 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-600 transition-colors"
          >
            {isLogin ? "Login" : "Sign Up"}
          </button>
        </form>

        {/* --- Divider and Google Button --- */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-800 text-gray-400">Or continue with</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-2 bg-white text-gray-900 font-semibold rounded-md hover:bg-gray-100 transition-colors disabled:opacity-70"
        >
          {/* Simple Google SVG Icon */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Google
        </button>

        <p className="text-sm text-center text-gray-400">
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            className="ml-2 font-medium text-blue-400 hover:underline"
          >
            {isLogin ? "Sign Up" : "Login"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthComponent;