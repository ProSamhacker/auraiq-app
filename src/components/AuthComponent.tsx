"use client";

import { useState, FC, FormEvent, useEffect } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { Loader2, AlertCircle } from "lucide-react";

interface AuthComponentProps {
  auth: Auth;
}

const AuthComponent: FC<AuthComponentProps> = ({ auth }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<'popup' | 'redirect'>('popup');

  // FIXED: Better redirect result handling
  useEffect(() => {
    let isMounted = true;
    
    const handleRedirect = async () => {
      try {
        setIsLoading(true);
        const result = await getRedirectResult(auth);
        
        if (result && isMounted) {
          console.log("✅ Redirect sign-in successful:", result.user.email);
          // User will be automatically redirected by onAuthStateChanged
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("❌ Redirect error:", err);
          setError(err.message?.replace("Firebase: ", "") || "Sign-in failed");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    handleRedirect();

    return () => {
      isMounted = false;
    };
  }, [auth]);

  // Detect environment
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Email/Password Authentication
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
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message?.replace("Firebase: ", "") || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  // FIXED: Smart Google Authentication
  const handleGoogleLogin = async () => {
    setError("");
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account',
        // FIXED: Add these for better reliability
        display: 'popup',
      });

      // FIXED: Better method detection
      let shouldUsePopup = true;
      
      if (isInIframe) {
        // Always use popup in iframe
        shouldUsePopup = true;
        console.log("🔧 Using popup (iframe detected)");
      } else if (isMobile) {
        // Use redirect on mobile for better UX
        shouldUsePopup = false;
        console.log("🔧 Using redirect (mobile detected)");
      }

      if (shouldUsePopup) {
        try {
          const result = await signInWithPopup(auth, provider);
          console.log("✅ Popup sign-in successful:", result.user.email);
        } catch (popupError: any) {
          console.error("❌ Popup error:", popupError);
          
          // Handle specific popup errors
          if (popupError.code === 'auth/popup-blocked') {
            setError("Popup blocked. Please allow popups and try again, or use email sign-in.");
          } else if (popupError.code === 'auth/popup-closed-by-user') {
            setError("Sign-in cancelled.");
          } else if (popupError.code === 'auth/cancelled-popup-request') {
            // User opened multiple popups, ignore this error
            console.log("Multiple popups detected, ignoring...");
          } else {
            // Try redirect as fallback
            console.log("🔄 Falling back to redirect...");
            await signInWithRedirect(auth, provider);
          }
        }
      } else {
        // Use redirect
        await signInWithRedirect(auth, provider);
        // Don't set loading to false - redirect will happen
        return;
      }
    } catch (err: any) {
      console.error("❌ Google auth error:", err);
      setError(err.message?.replace("Firebase: ", "") || "Google sign-in failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Signing you in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full min-h-screen bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">AuraIQ</h1>
          <p className="text-gray-400">Your intelligent assistant awaits</p>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-200">{error}</p>
              <button
                onClick={() => setError("")}
                className="text-xs text-red-400 hover:text-red-300 underline mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        
        {/* Email/Password Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            className="w-full px-4 py-3 text-gray-200 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            className="w-full px-4 py-3 text-gray-200 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
          />
          {!isLogin && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
              className="w-full px-4 py-3 text-gray-200 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
            />
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-3 font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              isLogin ? "Login" : "Sign Up"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-800 text-gray-400">Or continue with</span>
          </div>
        </div>

        {/* Google Sign-In Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
        >
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
          {isLoading ? "Signing in..." : "Google"}
        </button>

        {/* Environment Info */}
        {(isInIframe || isMobile) && (
          <div className="text-xs text-center text-gray-500">
            {isInIframe && "🔧 Embedded mode - using popup auth"}
            {isMobile && !isInIframe && "📱 Mobile detected - optimized flow"}
          </div>
        )}

        {/* Toggle Login/Signup */}
        <p className="text-sm text-center text-gray-400">
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            disabled={isLoading}
            className="ml-2 font-medium text-blue-400 hover:underline disabled:opacity-50"
          >
            {isLogin ? "Sign Up" : "Login"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthComponent;