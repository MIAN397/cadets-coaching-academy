import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your official production Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBxv4qGeAqogGIh_O-2twI_-rdoiSvN6bw",
  authDomain: "cadets-coaching-academy-1234.firebaseapp.com",
  projectId: "cadets-coaching-academy-1234",
  storageBucket: "cadets-coaching-academy-1234.firebasestorage.app",
  messagingSenderId: "177121203548",
  appId: "1:177121203548:web:4643db84ebf9e689499d99"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
