// firebase.js (ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// 1) Pega aquí tu firebaseConfig:
export const firebaseConfig = {
  apiKey: "AIzaSyD7tnF2e4lKHut7_2Abcb3bOBeU0DImBDY",
  authDomain: "obrantis-proveedores-facturas.firebaseapp.com",
  projectId: "obrantis-proveedores-facturas",
  storageBucket: "obrantis-proveedores-facturas.firebasestorage.app",
  messagingSenderId: "921140381213",
  appId: "1:921140381213:web:c744fa58681fef32eb28f4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
