// assets/js/patient-dashboard.js

import { auth, db } from './firebase-config.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { enforceProtectedRoute } from './auth.js';
import { formatDate, toggleLoader } from './utils.js';

// Enforce role
enforceProtectedRoute(['Patient']);

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        const nameEl = document.getElementById('user-display-name');
        if (nameEl) {
            nameEl.textContent = user.displayName || user.email.split('@')[0];
            document.querySelector('.avatar').textContent = nameEl.textContent.charAt(0).toUpperCase();
        }

        toggleLoader(true);
        try {
            // Find Patient Record by Email
            const pSnap = await get(ref(db, 'patients'));
            let matchedPatient = null;
            let patientId = null;

            if (pSnap.exists()) {
                pSnap.forEach(child => {
                    const data = child.val();
                    if (data.email && data.email.toLowerCase() === user.email.toLowerCase()) {
                        matchedPatient = data;
                        patientId = child.key;
                    }
                });
            }

            if (!matchedPatient) {
                document.getElementById('unlinked-warning').classList.remove('hidden');
                document.getElementById('pt-email').textContent = user.email;
                toggleLoader(false);
                return;
            }

            // Populate Profile Info
            document.getElementById('pt-email').textContent = matchedPatient.email || 'N/A';
            document.getElementById('pt-phone').textContent = matchedPatient.phone || 'N/A';
            document.getElementById('pt-age-gender').textContent = `${matchedPatient.age || '-'} / ${matchedPatient.gender || '-'}`;
            document.getElementById('pt-blood').textContent = matchedPatient.bloodGroup || 'N/A';

            // Fetch Appointments & Prescriptions
            const [aSnap, pxSnap] = await Promise.all([
                get(ref(db, 'appointments')),
                get(ref(db, 'prescriptions'))
            ]);

            const timelineData = [];
            let upcomingCount = 0;
            const todayStr = new Date().toISOString().split('T')[0];

            if (aSnap.exists()) {
                aSnap.forEach(child => {
                    const a = child.val();
                    if (a.patientId === patientId) {
                        timelineData.push({
                            type: 'appointment',
                            date: a.date,
                            timestamp: a.createdAt || Date.now(),
                            data: a
                        });

                        // Count upcoming (simplified check based on date string comparison)
                        if (a.date >= todayStr && a.status !== 'Cancelled') {
                            upcomingCount++;
                        }
                    }
                });
            }
            document.getElementById('stat-upcoming-appts').textContent = upcomingCount;

            if (pxSnap.exists()) {
                pxSnap.forEach(child => {
                    const px = child.val();
                    if (px.patientId === patientId) {
                        timelineData.push({
                            type: 'prescription',
                            date: new Date(px.createdAt).toISOString().split('T')[0], // Approximation if no direct date
                            timestamp: px.createdAt || Date.now(),
                            data: px
                        });
                    }
                });
            }

            // Render Timeline (Sorted by newest first)
            timelineData.sort((a, b) => b.timestamp - a.timestamp);
            renderTimeline(timelineData);

        } catch (error) {
            console.error(error);
        } finally {
            toggleLoader(false);
        }
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (window.logout) window.logout();
        });
    }
});

function renderTimeline(dataList) {
    const container = document.getElementById('timeline-container');
    const emptyMsg = document.getElementById('timeline-empty');

    if (dataList.length === 0) {
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';
    let html = '';

    dataList.forEach(item => {
        if (item.type === 'appointment') {
            const a = item.data;
            html += `
                <div class="timeline-item">
                    <div class="timeline-content">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                            <span style="font-weight:600; color:var(--primary); font-size:1.1rem;">Appointment</span>
                            <span style="font-size:0.875rem; color:var(--text-muted);">${a.date} ${a.time || ''}</span>
                        </div>
                        <p style="margin-bottom:0.5rem;">Dr. ${a.doctorName || 'Unknown'}</p>
                        <span class="badge ${a.status.toLowerCase()}">${a.status}</span>
                    </div>
                </div>
            `;
        } else if (item.type === 'prescription') {
            const px = item.data;
            html += `
                <div class="timeline-item">
                    <div class="timeline-content">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                            <span style="font-weight:600; color:var(--secondary); font-size:1.1rem;">Prescription Issued</span>
                            <span style="font-size:0.875rem; color:var(--text-muted);">${formatDate(px.createdAt)}</span>
                        </div>
                        <p style="margin-bottom:0.5rem;">Issued by Dr. ${px.doctorName}</p>
                        <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:1rem;">Medicines: ${px.medicines ? px.medicines.map(m => m.name).join(', ') : 'N/A'}</p>
                        <a href="${px.pdfUrl}" target="_blank" class="btn btn-outline" style="font-size:0.8rem; padding:0.4rem 0.8rem;">
                            <i data-feather="download" style="width:14px; margin-right:4px;"></i> Download PDF
                        </a>
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html;
    if (window.feather) feather.replace();
}
