// assets/js/auth.js

import { auth, db } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { ref, get, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";
import { showToast, toggleLoader } from './utils.js';

/**
 * Handle Login Submission
 */
const loginForm = document.getElementById('login-form');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showToast('Please enter both email and password', 'error');
            return;
        }

        toggleLoader(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Fetch User Role from RTDB
            const userDocRef = ref(db, 'users/' + user.uid);
            const userDoc = await get(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.val();
                const role = userData.role;



                showToast(`Welcome back, ${userData.name || 'User'}!`, 'success');

                // Redirect based on role
                setTimeout(() => {
                    redirectBasedOnRole(role);
                }, 1000);
            } else {
                showToast('User profile not found in database.', 'error');
                await signOut(auth);
                toggleLoader(false);
            }
        } catch (error) {
            console.error("Login Error:", error);
            toggleLoader(false);
            // Translate Firebase Errors
            let errorMsg = "Login failed. Check your credentials.";
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorMsg = "Invalid email or password.";
            } else if (error.code === 'auth/too-many-requests') {
                errorMsg = "Too many failed attempts. Try again later.";
            }
            showToast(errorMsg, 'error');
        }
    });
}

/**
 * Handle Signup form
 */
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullname = document.getElementById('fullname').value.trim();
        const email = document.getElementById('email').value.trim();
        const role = document.getElementById('role').value;
        const password = document.getElementById('password').value;

        if (!fullname || !email || !password || !role) {
            showToast('Please fill all fields.', 'error');
            return;
        }

        if (role !== 'Patient') {
            showToast('Only Patient registration is allowed here. Staff accounts must be created by an Administrator.', 'error');
            return;
        }





        toggleLoader(true);
        try {
            // 1. Create User in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Update Display Name in Auth instance
            await updateProfile(user, { displayName: fullname });

            // 3. Create User Document in RTDB
            await set(ref(db, 'users/' + user.uid), {
                id: user.uid,
                name: fullname,
                email: email,
                role: role,
                createdAt: serverTimestamp()
            });

            showToast('Account created successfully!', 'success');

            setTimeout(() => {
                redirectBasedOnRole(role);
            }, 1000);

        } catch (error) {
            console.error("Signup Error:", error);
            toggleLoader(false);

            let errorMsg = "Failed to create account.";
            if (error.code === 'auth/email-already-in-use') {
                errorMsg = "This email is already registered.";
            } else if (error.code === 'auth/weak-password') {
                errorMsg = "Password must be at least 6 characters.";
            }
            showToast(errorMsg, 'error');
        }
    });
}

async function redirectBasedOnRole(role) {
    try {
        const dashboardKey = role.toLowerCase();
        // Check if dashboard is disabled in RTDB
        const accessSnap = await get(ref(db, 'dashboardAccess/' + dashboardKey));

        if (accessSnap.exists() && accessSnap.val() === false) {
            showToast('This dashboard is temporarily disabled by administrator.', 'error');
            setTimeout(() => {
                if (window.logout) window.logout();
            }, 1000);
            return;
        }
    } catch (e) {
        console.error("Access check failed", e);
    }

    const isPagesDir = window.location.pathname.includes('/pages/');
    const basePath = isPagesDir ? './' : 'pages/';

    let targetPage = '';
    switch (role) {
        case 'Admin': targetPage = 'admin-dashboard.html'; break;
        case 'Doctor': targetPage = 'doctor-dashboard.html'; break;
        case 'Receptionist': targetPage = 'receptionist-dashboard.html'; break;
        case 'Patient': targetPage = 'patient-dashboard.html'; break;
        default:
            showToast('Unknown user role.', 'error');
            toggleLoader(false);
            return;
    }

    const targetUrl = `${basePath}${targetPage}`;
    if (window.location.href.includes(targetPage)) {
        // Already on target page, just stop loader
        toggleLoader(false);
    } else {
        window.location.href = targetUrl;
    }
}

/**
 * Handle Logout
 */
window.logout = async () => {
    try {
        await signOut(auth);
        const basePath = window.location.pathname.includes('/pages/') ? '' : 'pages/';
        window.location.replace(`${basePath}login.html`);
    } catch (error) {
        console.error("Logout Error:", error);
        showToast('Failed to logout. Try again.', 'error');
    }
};

/**
 * Global Session Checker (Use on protected routes)
 * Validates Auth state and checks role bounds.
 */
let isCheckingAuth = false;
export function enforceProtectedRoute(allowedRoles = []) {
    onAuthStateChanged(auth, async (user) => {
        if (isCheckingAuth) return;
        isCheckingAuth = true;

        // If no user is logged in, redirect to login page
        if (!user) {
            isCheckingAuth = false;
            const isPagesDir = window.location.pathname.includes('/pages/');
            const loginUrl = isPagesDir ? 'login.html' : 'pages/login.html';
            if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('signup.html')) {
                window.location.replace(loginUrl);
            }
            return;
        }

        // User is logged in, now verify their role and dashboard status
        try {
            const userDoc = await get(ref(db, 'users/' + user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.val();
                const role = userData.role;

                // 1. Role mismatch check
                if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
                    console.warn(`Unauthorized access: Expected ${allowedRoles}, got ${role}`);
                    redirectBasedOnRole(role);
                    return;
                }

                // 2. Dashboard Access (Live Admin Toggle) check
                const accessSnap = await get(ref(db, 'dashboardAccess/' + role.toLowerCase()));
                if (accessSnap.exists() && accessSnap.val() === false) {
                    showToast('This dashboard has been disabled by management.', 'error');
                    setTimeout(() => window.logout(), 1500);
                    return;
                }



            } else {
                console.error("User document missing in database.");
                window.logout();
            }
        } finally {
            isCheckingAuth = false;
        }
    });
}

// Attach logout to any button with id 'logout-btn' automatically if present
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.logout();
        });
    }
});
