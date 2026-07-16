import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAdn3z3kLY8b4IHXbyzNcd1dgWOfbSizLI",
  authDomain: "blackmamba-music-reproductor.firebaseapp.com",
  projectId: "blackmamba-music-reproductor",
  storageBucket: "blackmamba-music-reproductor.firebasestorage.app",
  messagingSenderId: "59372152830",
  appId: "1:59372152830:web:317c45da3ec60a8c9f42af"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
