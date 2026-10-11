import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Workspace scopes for Google Sheets and Google Drive
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.setCustomParameters({
  prompt: 'consent select_account',
});

// In-memory token cache (DO NOT store in localStorage or sessionStorage per skill guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

type TokenListener = (token: string | null) => void;
const tokenListeners = new Set<TokenListener>();

export const onTokenChange = (listener: TokenListener) => {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
};

const setCachedToken = (token: string | null) => {
  cachedAccessToken = token;
  tokenListeners.forEach((listener) => {
    try {
      listener(token);
    } catch (e) {
      console.error('Error in token listener:', e);
    }
  });
};

export const hasGoogleToken = (): boolean => {
  return !!cachedAccessToken;
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (user && !isSigningIn) {
      // Need re-authentication to obtain access token if page was reloaded
      setCachedToken(null);
      if (onAuthFailure) onAuthFailure();
    } else {
      setCachedToken(null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google erişim anahtarı alınamadı.');
    }

    setCachedToken(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    // Gracefully handle user cancellation or closed popup without throwing fatal error
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request'
    ) {
      // User simply closed the popup or clicked away, no error needed
      return null;
    }

    if (error?.code === 'auth/popup-blocked') {
      throw new Error('Giriş açılır penceresi tarayıcınız tarafından engellendi. Lütfen adres çubuğundaki kilit/açılır pencere simgesinden izin verip tekrar deneyiniz.');
    }

    console.warn('Google Sign in warning:', error?.message || error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const ensureAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  const result = await googleSignIn();
  return result?.accessToken || null;
};

export const clearAccessToken = () => {
  setCachedToken(null);
};

export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

export const logout = async () => {
  await signOut(auth);
  setCachedToken(null);
};
