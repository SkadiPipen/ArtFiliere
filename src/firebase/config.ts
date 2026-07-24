// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBi-FtxIf4WWonzzquHqm8a5Qn-dgb0o6o",
  authDomain: "capstone-5b0bc.firebaseapp.com",
  projectId: "capstone-5b0bc",
  storageBucket: "capstone-5b0bc.firebasestorage.app",
  messagingSenderId: "536434633851",
  appId: "1:536434633851:web:fc47a600a7e8fc5d7e86de",
  measurementId: "G-FELZ12WNR1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);