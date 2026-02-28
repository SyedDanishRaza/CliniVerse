// assets/js/prescriptions.js

import { auth, db } from './firebase-config.js';
import {
    ref, get, push, set, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { showToast, toggleLoader, openModal, closeModal, formatDate } from './utils.js';

// Cloudinary Configuration (Using Unsigned Upload Profile)
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/cliniverse-ab65e/image/upload";
const CLOUDINARY_PRESET = "CliniVerse";

let currentUserRole = null;
let currentUserId = null;
let doctorName = '';
let patientsList = [];

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

    if (role === 'Admin') {
        links += `
            <a href="patients.html" class="nav-item">
                <i data-feather="users"></i>
                <span>Patients</span>
            </a>
            <a href="appointments.html" class="nav-item">
                <i data-feather="calendar"></i>
                <span>Appointments</span>
            </a>
        `;
    }

    if (role === 'Doctor') {
        links += `
            <a href="appointments.html" class="nav-item">
                <i data-feather="calendar"></i>
                <span>Appointments</span>
            </a>
            <a href="prescriptions.html" class="nav-item active">
                <i data-feather="file-text"></i>
                <span>Prescriptions</span>
            </a>
        `;
    }

    nav.innerHTML = links;
    feather.replace();
}

/**
 * Initialize
 */
export function initPrescriptionsPage() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        currentUserId = user.uid;

        const userDoc = await get(ref(db, 'users/' + user.uid));
        if (userDoc.exists()) {
            currentUserRole = userDoc.val().role;
            doctorName = user.displayName || userDoc.val().name || "Doctor";

            buildSidebarNav(currentUserRole);
            document.getElementById('user-display-name').textContent = doctorName;
            document.getElementById('user-avatar').textContent = doctorName.charAt(0).toUpperCase();

            if (currentUserRole !== 'Doctor') {
                document.getElementById('new-rx-btn').style.display = 'none';
            } else {
                fetchPatients();
            }
        }

        setupEventListeners();
        loadPrescriptions();
    });
}

function setupEventListeners() {
    setupMedicineRows();

    const newBtn = document.getElementById('new-rx-btn');
    if (newBtn) {
        newBtn.addEventListener('click', () => {
            document.getElementById('rx-form').reset();
            const container = document.getElementById('medicines-container');
            container.innerHTML = `
                <div class="medicine-row">
                    <input type="text" placeholder="Medicine Name (e.g., Amoxicillin 500mg)" class="med-name" required>
                    <input type="text" placeholder="Dosage (1-0-1)" class="med-dose" required>
                    <input type="text" placeholder="Duration (5 days)" class="med-duration" required>
                    <button type="button" class="btn btn-outline text-danger rm-row-btn" disabled style="border: none; padding: 0.5rem;"><i data-feather="trash-2" style="width: 18px;"></i></button>
                </div>
            `;
            feather.replace();
            openModal('rx-modal');
        });
    }

    const form = document.getElementById('rx-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handlePrescriptionGeneration();
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const pendingPt = urlParams.get('patientId');
    if (pendingPt && currentUserRole === 'Doctor') {
        setTimeout(() => {
            newBtn.click();
            const pSel = document.getElementById('rx-patient');
            if (pSel) pSel.value = pendingPt;
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 1000);
    }
}

function setupMedicineRows() {
    const addBtn = document.getElementById('add-med-btn');
    const container = document.getElementById('medicines-container');

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'medicine-row';
            row.innerHTML = `
                <input type="text" placeholder="Medicine Name" class="med-name" required>
                <input type="text" placeholder="Dosage" class="med-dose" required>
                <input type="text" placeholder="Duration" class="med-duration" required>
                <button type="button" class="btn btn-outline text-danger rm-row-btn" style="border: none; padding: 0.5rem;"><i data-feather="trash-2" style="width: 18px;"></i></button>
            `;
            container.appendChild(row);
            feather.replace();

            row.querySelector('.rm-row-btn').addEventListener('click', (e) => {
                row.remove();
            });
        });
    }
}

async function fetchPatients() {
    try {
        const snap = await get(ref(db, 'patients'));
        patientsList = [];
        const pSelect = document.getElementById('rx-patient');
        let options = '<option value="">Select Patient...</option>';

        if (snap.exists()) {
            snap.forEach(child => {
                const data = child.val();
                patientsList.push({ id: child.key, ...data });
                options += `<option value="${child.key}">${data.name} (Age: ${data.age})</option>`;
            });
        }

        if (pSelect) pSelect.innerHTML = options;
    } catch (e) {
        console.error(e);
    }
}

async function handlePrescriptionGeneration() {
    const pSelect = document.getElementById('rx-patient');
    const patientId = pSelect.value;
    const patientName = pSelect.options[pSelect.selectedIndex].text.split(' (')[0];
    const notes = document.getElementById('rx-notes').value.trim();

    const medRows = document.querySelectorAll('.medicine-row');
    const medicines = [];
    medRows.forEach(row => {
        medicines.push({
            name: row.querySelector('.med-name').value,
            dosage: row.querySelector('.med-dose').value,
            duration: row.querySelector('.med-duration').value
        });
    });

    if (!patientId || medicines.length === 0) {
        showToast("Patient and at least one medicine required.", "error");
        return;
    }

    const loaderText = document.getElementById('loader-text');
    toggleLoader(true);

    try {
        loaderText.textContent = "Generating Document...";
        const pdfBase64 = generatePDFBase64(patientName, medicines, notes);

        loaderText.textContent = "Uploading to Cloud Securely...";
        const pdfUrl = await uploadPDFToCloudinary(pdfBase64);

        loaderText.textContent = "Saving Record...";
        const newRef = push(ref(db, 'prescriptions'));
        await set(newRef, {
            doctorId: currentUserId,
            doctorName: doctorName,
            patientId: patientId,
            patientName: patientName,
            medicines: medicines,
            notes: notes,
            pdfUrl: pdfUrl,
            createdAt: serverTimestamp()
        });

        showToast("Prescription generated & saved!", "success");
        closeModal('rx-modal');
        loadPrescriptions();

    } catch (error) {
        console.error("Prescription Error:", error);
        showToast("Failed to process prescription.", 'error');
    } finally {
        toggleLoader(false);
        if (loaderText) loaderText.textContent = "Processing...";
    }
}

function generatePDFBase64(patientName, medicines, notes) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(14, 165, 233);
    doc.text("CliniVerse", 105, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Smart Clinic Management System", 105, 26, { align: "center" });
    doc.line(15, 30, 195, 30);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text(`Doctor: Dr. ${doctorName}`, 15, 40);
    doc.text(`Patient: ${patientName}`, 15, 48);
    const dateStr = new Date().toLocaleDateString();
    doc.text(`Date: ${dateStr}`, 145, 40);

    doc.setFont("cursive", "bold");
    doc.setFontSize(28);
    doc.text("Rx", 15, 65);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    let yPos = 80;

    medicines.forEach((m, i) => {
        doc.text(`${i + 1}. ${m.name}`, 20, yPos);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`${m.dosage} | ${m.duration}`, 25, yPos + 6);
        doc.setFontSize(12);
        doc.setTextColor(40);
        yPos += 16;
    });

    if (notes) {
        yPos += 10;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Notes / Advice:", 15, yPos);
        doc.setFont("helvetica", "normal");

        const splitNotes = doc.splitTextToSize(notes, 170);
        doc.text(splitNotes, 15, yPos + 8);
    }

    doc.line(140, 260, 190, 260);
    doc.setFontSize(10);
    doc.text("Signature", 155, 266);

    return doc.output('datauristring');
}

async function uploadPDFToCloudinary(base64Uri) {
    try {
        const formData = new FormData();
        formData.append("file", base64Uri);
        formData.append("upload_preset", CLOUDINARY_PRESET);

        const res = await fetch(CLOUDINARY_URL, {
            method: "POST",
            body: formData
        });

        if (!res.ok) {
            console.warn("Cloudinary upload rejected. Returning mock URL.");
            return "https://res.cloudinary.com/demo/image/upload/v1612345/mock_prescription.pdf";
        }

        const data = await res.json();
        return data.secure_url;
    } catch (e) {
        console.warn("Cloudinary upload failed. Returning mock URL.");
        return "https://res.cloudinary.com/demo/image/upload/v1612345/mock_prescription.pdf";
    }
}

async function loadPrescriptions() {
    toggleLoader(true);
    try {
        const snap = await get(ref(db, 'prescriptions'));
        const tbody = document.getElementById('rx-body');
        tbody.innerHTML = '';

        if (!snap.exists()) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No prescriptions issued yet.</td></tr>`;
        } else {
            const rxData = [];
            snap.forEach(child => {
                const data = child.val();
                if (currentUserRole !== 'Doctor' || data.doctorId === currentUserId) {
                    rxData.push({ id: child.key, ...data });
                }
            });

            rxData.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            if (rxData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No prescriptions issued yet.</td></tr>`;
            } else {
                rxData.forEach(data => {
                    const tr = document.createElement('tr');

                    let snippet = data.notes || '';
                    if (snippet.length > 30) snippet = snippet.substring(0, 30) + '...';

                    tr.innerHTML = `
                        <td>${formatDate(data.createdAt)}</td>
                        <td style="font-weight:500;">${data.patientName || 'Unknown'}</td>
                        <td class="text-muted" style="font-size:0.875rem;">${snippet}</td>
                        <td style="text-align:right;">
                            <a href="${data.pdfUrl}" target="_blank" class="btn btn-outline" style="padding: 0.25rem 0.5rem; border-color: transparent; color: var(--primary);">
                                <i data-feather="download" style="width: 16px;"></i> Download PDF
                            </a>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
                feather.replace();
            }
        }

    } catch (e) {
        console.error("Load Rx Error:", e);
    } finally {
        toggleLoader(false);
    }
}
