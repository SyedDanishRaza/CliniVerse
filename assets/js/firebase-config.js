// assets/js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBs9AG7pJmZd-Y5Nw83yJ87XzBjjOJL8eE",
    authDomain: "cliniverse-ab65e.firebaseapp.com",
    databaseURL: "https://cliniverse-ab65e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cliniverse-ab65e",
    storageBucket: "cliniverse-ab65e.firebasestorage.app",
    messagingSenderId: "1016855973916",
    appId: "1:1016855973916:web:1a54a589dd5301409d8fd9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { auth, db, firebaseConfig };
