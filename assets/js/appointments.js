// assets/js/appointments.js

import { auth, db } from './firebase-config.js';
import {
    ref, get, push, set, update, remove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { showToast, toggleLoader, openModal, closeModal } from './utils.js';

let currentUserRole = null;
let currentUserId = null;
let appointmentsData = [];
let patientsList = [];
let doctorsList = [];

/**
 * Dynamic Sidebar Nav Builder based on Role
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
    `;

    links += `
        <a href="patients.html" class="nav-item">
            <i data-feather="users"></i>
            <span>Patients</span>
        </a>
    `;

    links += `
        <a href="appointments.html" class="nav-item active">
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
 * Initialize Appointments Page
 */
export function initAppointmentsPage() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        currentUserId = user.uid;

        const userDoc = await get(ref(db, 'users/' + user.uid));
        if (userDoc.exists()) {
            currentUserRole = userDoc.val().role;
            buildSidebarNav(currentUserRole);

            document.getElementById('user-display-name').textContent = user.displayName || userDoc.val().name || user.email.split('@')[0];
            document.getElementById('user-avatar').textContent = (user.displayName || userDoc.val().name || 'U').charAt(0).toUpperCase();

            // Admin and Receptionist can book
            if (currentUserRole === 'Admin' || currentUserRole === 'Receptionist') {
                document.getElementById('book-appt-btn').style.display = 'inline-flex';
                await fetchBookingDropdownOptions();
            } else if (currentUserRole === 'Doctor') {
                document.getElementById('appt-patient').parentElement.style.display = 'none';
                document.getElementById('appt-doctor').parentElement.style.display = 'none';
                document.getElementById('appt-date').disabled = true;
                document.getElementById('appt-time').disabled = true;
            }
        }

        setupEventListeners();
        loadAppointments();
    });
}

function setupEventListeners() {
    // Book Button
    const bookBtn = document.getElementById('book-appt-btn');
    if (bookBtn) {
        bookBtn.addEventListener('click', () => {
            document.getElementById('appt-form').reset();
            document.getElementById('appt-id').value = '';
            document.getElementById('modal-title').textContent = 'Book Appointment';
            openModal('appt-modal');
        });
    }

    // Form Submission
    const form = document.getElementById('appt-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveAppointment();
        });
    }

    // Filters
    const filterDate = document.getElementById('filter-date');
    const filterStatus = document.getElementById('filter-status');
    const clearBtn = document.getElementById('clear-filters-btn');

    if (filterDate) filterDate.addEventListener('change', runFilters);
    if (filterStatus) filterStatus.addEventListener('change', runFilters);
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (filterDate) filterDate.value = '';
            if (filterStatus) filterStatus.value = '';
            renderTable(appointmentsData);
        });
    }
}

function runFilters() {
    const fDate = document.getElementById('filter-date').value;
    const fStatus = document.getElementById('filter-status').value;

    let filtered = appointmentsData;

    if (fDate) {
        filtered = filtered.filter(a => a.date === fDate);
    }
    if (fStatus) {
        filtered = filtered.filter(a => a.status === fStatus);
    }

    renderTable(filtered);
}

/**
 * Fetch Dependencies for Add/Edit Modal (Admins/Reception)
 */
async function fetchBookingDropdownOptions() {
    try {
        const [pSnap, uSnap] = await Promise.all([
            get(ref(db, 'patients')),
            get(ref(db, 'users'))
        ]);

        patientsList = [];
        if (pSnap.exists()) {
            pSnap.forEach(child => {
                patientsList.push({ id: child.key, ...child.val() });
            });
        }

        doctorsList = [];
        if (uSnap.exists()) {
            uSnap.forEach(child => {
                if (child.val().role === 'Doctor') {
                    doctorsList.push({ id: child.key, ...child.val() });
                }
            });
        }

        const pSelect = document.getElementById('appt-patient');
        const dSelect = document.getElementById('appt-doctor');

        pSelect.innerHTML = '<option value="">Select Patient...</option>' +
            patientsList.map(p => `<option value="${p.id}">${p.name} (${p.phone})</option>`).join('');

        dSelect.innerHTML = '<option value="">Select Doctor...</option>' +
            doctorsList.map(d => `<option value="${d.id}">Dr. ${d.name}</option>`).join('');

    } catch (e) {
        console.error("Error fetching dropdowns: ", e);
    }
}

/**
 * Fetch and Render Appointments
 */
async function loadAppointments() {
    toggleLoader(true);
    try {
        const snap = await get(ref(db, 'appointments'));

        appointmentsData = [];
        if (snap.exists()) {
            snap.forEach(child => {
                const data = child.val();
                if (currentUserRole !== 'Doctor' || data.doctorId === currentUserId) {
                    appointmentsData.push({ id: child.key, ...data });
                }
            });
            // Reverse sort by date then time usually, or createdAt
            appointmentsData.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }

        renderTable(appointmentsData);

        // Check URL flags
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'new' && (currentUserRole === 'Admin' || currentUserRole === 'Receptionist')) {
            document.getElementById('book-appt-btn').click();
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (urlParams.get('edit')) {
            editAppointment(urlParams.get('edit'));
            window.history.replaceState({}, document.title, window.location.pathname);
        }

    } catch (error) {
        console.error("Error loading appointments:", error);
        showToast('Failed to load appointments.', 'error');
    } finally {
        toggleLoader(false);
    }
}

function renderTable(data) {
    const tbody = document.getElementById('appointments-body');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No appointments found.</td></tr>`;
        return;
    }

    data.forEach(appt => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight: 500;">${appt.date}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${appt.time || 'N/A'}</div>
            </td>
            <td>${appt.patientName || 'Unknown'}</td>
            <td>Dr. ${appt.doctorName || 'Unknown'}</td>
            <td><span class="badge ${appt.status.toLowerCase()}">${appt.status}</span></td>
            <td style="text-align: right;">
                <button class="btn btn-outline edit-btn" data-id="${appt.id}" style="padding: 0.25rem 0.5rem; border-color: transparent; color: var(--primary);">
                    <i data-feather="edit-2" style="width: 16px;"></i> Edit Status
                </button>
                ${(currentUserRole === 'Admin' || currentUserRole === 'Receptionist') ? `
                <button class="btn btn-outline delete-btn" data-id="${appt.id}" style="padding: 0.25rem 0.5rem; border-color: transparent; color: var(--danger);">
                    <i data-feather="trash-2" style="width: 16px;"></i>
                </button>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    feather.replace();

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            editAppointment(id);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            deleteAppointmentPrompt(id);
        });
    });
}

/**
 * Save (Create / Update)
 */
async function saveAppointment() {
    const id = document.getElementById('appt-id').value;
    const status = document.getElementById('appt-status').value;

    let patientId = '', doctorId = '', date = '', time = '', ptName = '', docName = '';

    if (currentUserRole !== 'Doctor') {
        const pSelect = document.getElementById('appt-patient');
        const dSelect = document.getElementById('appt-doctor');
        patientId = pSelect.value;
        doctorId = dSelect.value;
        date = document.getElementById('appt-date').value;
        time = document.getElementById('appt-time').value;

        ptName = pSelect.options[pSelect.selectedIndex].text.split(' (')[0];
        docName = dSelect.options[dSelect.selectedIndex].text.replace('Dr. ', '');
    }

    toggleLoader(true);
    try {
        if (id) {
            const updatePayload = { status };
            if (currentUserRole !== 'Doctor') {
                updatePayload.patientId = patientId;
                updatePayload.doctorId = doctorId;
                updatePayload.date = date;
                updatePayload.time = time;
                updatePayload.patientName = ptName;
                updatePayload.doctorName = docName;
            }

            await update(ref(db, 'appointments/' + id), updatePayload);
            showToast('Appointment updated.', 'success');
        } else {
            if (!patientId || !doctorId || !date) {
                showToast('Please fill all required fields.', 'error');
                toggleLoader(false);
                return;
            }

            const newRef = push(ref(db, 'appointments'));
            await set(newRef, {
                patientId, doctorId, date, time, status,
                patientName: ptName,
                doctorName: docName,
                createdBy: auth.currentUser.uid,
                createdAt: serverTimestamp()
            });
            showToast('Appointment booked successfully.', 'success');
        }
        closeModal('appt-modal');
        loadAppointments();
    } catch (error) {
        console.error("Save Error:", error);
        showToast('Failed to save appointment.', 'error');
        toggleLoader(false);
    }
}

/**
 * Edit Setup
 */
function editAppointment(id) {
    const appt = appointmentsData.find(a => a.id === id);
    if (!appt) return;

    document.getElementById('modal-title').textContent = 'Edit Appointment';
    document.getElementById('appt-id').value = appt.id;
    document.getElementById('appt-status').value = appt.status;

    if (currentUserRole !== 'Doctor') {
        document.getElementById('appt-patient').value = appt.patientId;
        document.getElementById('appt-doctor').value = appt.doctorId;
        document.getElementById('appt-date').value = appt.date;
        document.getElementById('appt-time').value = appt.time || '';
    }

    openModal('appt-modal');
}

/**
 * Delete Action
 */
async function deleteAppointmentPrompt(id) {
    if (confirm("Cancel and delete this appointment?")) {
        toggleLoader(true);
        try {
            await remove(ref(db, 'appointments/' + id));
            showToast('Appointment cancelled.', 'success');
            loadAppointments();
        } catch (error) {
            console.error("Delete Error:", error);
            showToast('Failed to cancel appointment.', 'error');
            toggleLoader(false);
        }
    }
}
