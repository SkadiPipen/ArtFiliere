import { getApp, getApps, initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyBi-FtxIf4WWonzzquHqm8a5Qn-dgb0o6o",
  authDomain: "capstone-5b0bc.firebaseapp.com",
  projectId: "capstone-5b0bc",
  storageBucket: "capstone-5b0bc.firebasestorage.app",
  messagingSenderId: "536434633851",
  appId: "1:536434633851:web:fc47a600a7e8fc5d7e86de",
  measurementId: "G-FELZ12WNR1"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
