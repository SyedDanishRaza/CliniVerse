// assets/js/patients.js

import { auth, db } from './firebase-config.js';
import {
    ref, get, push, set, update, remove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { showToast, toggleLoader, formatDate, openModal, closeModal } from './utils.js';

let currentUserRole = null;
let patientsData = [];

/**
 * Build dynamic navigation based on role
 */
function buildSidebarNav(role) {
    const nav = document.getElementById('dynamic-nav');
    if (!nav) return;

    let links = '';
    const basePath = role.toLowerCase() + '-dashboard.html';

    links += `
        <a href="${basePath}" class="nav-item">
            <i data-feather="grid"></i>
            <span>Dashboard</span>
        </a>
        <a href="patients.html" class="nav-item active">
            <i data-feather="users"></i>
            <span>Patients</span>
        </a>
        <a href="appointments.html" class="nav-item">
            <i data-feather="calendar"></i>
            <span>Appointments</span>
        </a>
    `;

    if (role === 'Doctor') {
        links += `
        <a href="prescriptions.html" class="nav-item">
            <i data-feather="file-text"></i>
            <span>Prescriptions</span>
        </a>`;
    }

    nav.innerHTML = links;
    feather.replace();
}

/**
 * Initialize Patients Page
 */
export function initPatientsPage() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        // Fetch role from RTDB
        const userDoc = await get(ref(db, 'users/' + user.uid));
        if (userDoc.exists()) {
            currentUserRole = userDoc.val().role;
            buildSidebarNav(currentUserRole);

            document.getElementById('user-display-name').textContent = user.displayName || userDoc.val().name || user.email.split('@')[0];
            document.getElementById('user-avatar').textContent = (user.displayName || userDoc.val().name || 'U').charAt(0).toUpperCase();

            // Admin and Receptionist can add/edit patients
            if (currentUserRole === 'Admin' || currentUserRole === 'Receptionist') {
                document.getElementById('add-patient-btn').style.display = 'inline-flex';
            }
        }

        setupEventListeners();
        loadPatients();
    });
}

function setupEventListeners() {
    // Add Patient Button
    const addBtn = document.getElementById('add-patient-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            document.getElementById('patient-form').reset();
            document.getElementById('patient-id').value = '';
            document.getElementById('modal-title').textContent = 'Add New Patient';
            openModal('patient-modal');
        });
    }

    // Form Submission
    const form = document.getElementById('patient-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await savePatient();
        });
    }

    // Search Input
    const searchInput = document.getElementById('search-patient');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = patientsData.filter(p =>
                p.name.toLowerCase().includes(term) ||
                p.phone.includes(term)
            );
            renderTable(filtered);
        });
    }
}

/**
 * Fetch and Render Patients
 */
async function loadPatients() {
    toggleLoader(true);
    try {
        const snap = await get(ref(db, 'patients'));
        patientsData = [];

        if (snap.exists()) {
            snap.forEach(child => {
                patientsData.push({ id: child.key, ...child.val() });
            });
            patientsData.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }

        renderTable(patientsData);
    } catch (error) {
        console.error("Error loading patients:", error);
        showToast('Failed to load patients.', 'error');
    } finally {
        toggleLoader(false);
    }
}

function renderTable(data) {
    const tbody = document.getElementById('patients-body');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No patients found.</td></tr>`;
        return;
    }

    data.forEach(patient => {
        const canEdit = currentUserRole === 'Admin' || currentUserRole === 'Receptionist';
        const dateStr = formatDate(patient.createdAt);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${patient.name}</td>
            <td>${patient.age} yrs / ${patient.gender}</td>
            <td>${patient.phone}</td>
            <td>${dateStr}</td>
            <td style="text-align: right;">
                ${canEdit ? `
                    <button class="btn btn-outline edit-btn" data-id="${patient.id}" style="padding: 0.25rem 0.5rem; border-color: transparent; color: var(--primary);">
                        <i data-feather="edit-2" style="width: 16px;"></i>
                    </button>
                    ${currentUserRole === 'Admin' ? `
                    <button class="btn btn-outline delete-btn" data-id="${patient.id}" style="padding: 0.25rem 0.5rem; border-color: transparent; color: var(--danger);">
                        <i data-feather="trash-2" style="width: 16px;"></i>
                    </button>
                    ` : ''}
                ` : `
                    <span class="text-muted" style="font-size: 0.8rem;">View Only</span>
                `}
            </td>
        `;
        tbody.appendChild(tr);
    });

    feather.replace();

    // Attach row events
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            editPatient(id);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            deletePatientPrompt(id);
        });
    });
}

/**
 * Save (Create / Update)
 */
async function savePatient() {
    const id = document.getElementById('patient-id').value;
    const name = document.getElementById('p-name').value.trim();
    const age = parseInt(document.getElementById('p-age').value, 10);
    const gender = document.getElementById('p-gender').value;
    const phone = document.getElementById('p-phone').value.trim();
    const address = document.getElementById('p-address').value.trim();

    toggleLoader(true);
    try {
        if (id) {
            // Update
            const patientRef = ref(db, 'patients/' + id);
            await update(patientRef, {
                name, age, gender, phone, address
            });
            showToast('Patient updated successfully.', 'success');
        } else {
            // Create
            const newRef = push(ref(db, 'patients'));
            await set(newRef, {
                name, age, gender, phone, address,
                createdBy: auth.currentUser.uid,
                createdAt: serverTimestamp()
            });
            showToast('Patient added successfully.', 'success');
        }
        closeModal('patient-modal');
        loadPatients();
    } catch (error) {
        console.error("Save Error:", error);
        showToast('Failed to save record.', 'error');
        toggleLoader(false);
    }
}

/**
 * Edit Setup
 */
function editPatient(id) {
    const patient = patientsData.find(p => p.id === id);
    if (!patient) return;

    document.getElementById('modal-title').textContent = 'Edit Patient';
    document.getElementById('patient-id').value = patient.id;
    document.getElementById('p-name').value = patient.name;
    document.getElementById('p-age').value = patient.age;
    document.getElementById('p-gender').value = patient.gender;
    document.getElementById('p-phone').value = patient.phone;
    document.getElementById('p-address').value = patient.address || '';

    openModal('patient-modal');
}

/**
 * Delete Action
 */
async function deletePatientPrompt(id) {
    if (confirm("Are you sure you want to delete this patient record? This cannot be undone.")) {
        toggleLoader(true);
        try {
            await remove(ref(db, 'patients/' + id));
            showToast('Patient record deleted.', 'success');
            loadPatients();
        } catch (error) {
            console.error("Delete Error:", error);
            showToast('Failed to delete record.', 'error');
            toggleLoader(false);
        }
    }
}
