// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCMCcr3xulMa_Rw7hPOsGiNzEDBEv2Xyc8",
  authDomain: "sale-book-69518.firebaseapp.com",
  databaseURL: "https://sale-book-69518-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sale-book-69518",
  storageBucket: "sale-book-69518.firebasestorage.app",
  messagingSenderId: "644482577022",
  appId: "1:644482577022:web:a5aca4bb0ff5f8578b5e2f",
  measurementId: "G-FWW1H7NSVJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Auth and Database modules
export const auth = getAuth(app);
export const db = getDatabase(app);