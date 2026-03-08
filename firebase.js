// firebase.js (ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// 1) Pega aquí tu firebaseConfig:
export const firebaseConfig = {
  apiKey: "AIzaSyAM39Fp0SbBWAf7EjLaG-m5LlOylSuZD3Q",
  authDomain: "proveedores-facturas-pro.firebaseapp.com",
  projectId: "proveedores-facturas-pro",
  storageBucket: "proveedores-facturas-pro.firebasestorage.app",
  messagingSenderId: "494620791690",
  appId: "1:494620791690:web:2ff678bde3c22021092e73"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);