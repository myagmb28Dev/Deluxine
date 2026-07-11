import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { resolveAuthDomain } from './authDomain';

const firebaseConfig = {
  apiKey: "AIzaSyCDSZxmPwEGqZQbw3IhoRHWaZ_D9BV8aw8",
  authDomain: resolveAuthDomain(
    typeof window === 'undefined' ? undefined : window.location.host,
  ),
  projectId: "deluxine-97b90",
  storageBucket: "deluxine-97b90.firebasestorage.app",
  messagingSenderId: "988227485534",
  appId: "1:988227485534:web:fb7e3677984ff21a5bd9cf"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
