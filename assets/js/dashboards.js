// assets/js/dashboards.js

import { auth, db, firebaseConfig } from './firebase-config.js';
import { ref, get, set, update, onValue, push, remove } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";
import {
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    updateProfile,
    signOut,
    getAuth
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { formatDate, toggleLoader } from './utils.js';
import { showToast } from './utils.js'; // Ensure showToast is available

/**
 * Helper to get user display name and render it
 */
function setUserNameDisplay(user) {
    const nameEl = document.getElementById('user-display-name');
    if (nameEl && user) {
        const name = user.displayName || user.email.split('@')[0];
        nameEl.textContent = name;

        const avatarEls = document.querySelectorAll('.avatar');
        if (avatarEls.length > 0) {
            avatarEls.forEach(el => {
                if (user.photoURL) {
                    el.style.backgroundImage = `url(${user.photoURL})`;
                    el.style.backgroundSize = 'cover';
                    el.style.backgroundPosition = 'center';
                    el.textContent = '';
                } else {
                    el.textContent = name.charAt(0).toUpperCase();
                }
            });
        }
    }
}

/**
 * Init Admin Dashboard
 */
export function initAdminDashboard() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        setUserNameDisplay(user);
        toggleLoader(true);

        try {
            const [pSnap, uSnap, aSnap] = await Promise.all([
                get(ref(db, 'patients')),
                get(ref(db, 'users')),
                get(ref(db, 'appointments'))
            ]);

            const pCount = pSnap.exists() ? pSnap.numChildren() : 0;
            const aCount = aSnap.exists() ? aSnap.numChildren() : 0;

            let dCount = 0;
            if (uSnap.exists()) {
                uSnap.forEach(child => { if (child.val().role === 'Doctor') dCount++; });
            }

            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            let tACount = 0;

            const recentAppts = [];
            if (aSnap.exists()) {
                aSnap.forEach(child => {
                    const data = child.val();
                    if (data.date === todayStr) tACount++;
                    recentAppts.push(data);
                });
            }

            document.getElementById('stat-total-patients').textContent = pCount;
            document.getElementById('stat-total-doctors').textContent = dCount;
            document.getElementById('stat-total-appointments').textContent = aCount;
            document.getElementById('stat-today-appointments').textContent = tACount;

            recentAppts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            const top5 = recentAppts.slice(0, 5);

            const tbody = document.getElementById('recent-appointments-body');
            tbody.innerHTML = '';

            if (top5.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No recent appointments found.</td></tr>`;
            } else {
                top5.forEach(data => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${data.date} ${data.time || ''}</td>
                        <td>${data.patientName || 'Unknown'}</td>
                        <td>${data.doctorName || 'Unknown'}</td>
                        <td><span class="badge ${data.status.toLowerCase()}">${data.status}</span></td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            // --- Dashboard Access Toggles Logic ---
            const roles = ['admin', 'doctor', 'receptionist', 'patient'];
            roles.forEach(roleKey => {
                const toggle = document.getElementById(`toggle-${roleKey}`);
                if (toggle) {
                    const accessRef = ref(db, 'dashboardAccess/' + roleKey);
                    onValue(accessRef, (snapshot) => {
                        toggle.checked = snapshot.exists() ? snapshot.val() : true;
                    });
                    toggle.addEventListener('change', async (e) => {
                        const isEnabled = e.target.checked;
                        await set(accessRef, isEnabled);
                        showToast(`${roleKey.charAt(0).toUpperCase() + roleKey.slice(1)} Dashboard ${isEnabled ? 'Enabled' : 'Disabled'}`, 'success');
                    });
                }
            });

            // --- User Management Logic ---
            const usersTbody = document.getElementById('users-table-body');
            if (usersTbody && uSnap.exists()) {
                usersTbody.innerHTML = '';
                uSnap.forEach(child => {
                    const u = child.val();
                    const tr = document.createElement('tr');
                    const statusClass = u.status === 'Inactive' ? 'status-inactive' : 'status-active';
                    const isVerified = u.isVerified || false;
                    const isApproved = u.isApproved || false;

                    let actionBtn = '';
                    if (u.role === 'Doctor' && !isVerified) {
                        actionBtn = `<button class="btn btn-primary btn-sm action-verify" data-uid="${child.key}">Verify</button>`;
                    } else if (u.role === 'Receptionist' && !isApproved) {
                        actionBtn = `<button class="btn btn-primary btn-sm action-approve" data-uid="${child.key}">Approve</button>`;
                    }

                    tr.innerHTML = `
                        <td>${u.name || 'N/A'}</td>
                        <td>${u.email}</td>
                        <td><span class="badge ${u.role.toLowerCase()}">${u.role}</span></td>
                        <td>
                            <span class="status-badge ${statusClass}">${u.status || 'Active'}</span>
                            ${u.role === 'Doctor' ? `<br><small>${isVerified ? '✅ Verified' : '⚠️ Unverified'}</small>` : ''}
                            ${u.role === 'Receptionist' ? `<br><small>${isApproved ? '✅ Approved' : '⚠️ Pending'}</small>` : ''}
                        </td>
                        <td>
                            <div style="display:flex; gap:0.5rem;">
                                ${actionBtn}
                                <button class="btn btn-outline btn-sm action-toggle-status" data-uid="${child.key}" data-status="${u.status || 'Active'}">
                                    ${u.status === 'Inactive' ? 'Activate' : 'Deactivate'}
                                </button>
                            </div>
                        </td>
                    `;
                    usersTbody.appendChild(tr);
                });

                document.querySelectorAll('.action-verify').forEach(btn => {
                    btn.onclick = async () => {
                        await set(ref(db, `users/${btn.dataset.uid}/isVerified`), true);
                        showToast('Doctor verified', 'success');
                        initAdminDashboard();
                    };
                });
                document.querySelectorAll('.action-approve').forEach(btn => {
                    btn.onclick = async () => {
                        await set(ref(db, `users/${btn.dataset.uid}/isApproved`), true);
                        showToast('Receptionist approved', 'success');
                        initAdminDashboard();
                    };
                });

                document.querySelectorAll('.action-toggle-status').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const uid = e.target.dataset.uid;
                        const currentStatus = e.target.dataset.status;
                        const newStatus = currentStatus === 'Inactive' ? 'Active' : 'Inactive';
                        await set(ref(db, `users/${uid}/status`), newStatus);
                        showToast(`User status updated to ${newStatus}`, 'success');
                        initAdminDashboard(); // Refresh
                    });
                });

                // --- Add Staff Logic ---
                const staffModal = document.getElementById('staff-modal');
                const addStaffBtn = document.getElementById('add-staff-btn');
                const closeStaffBtn = document.getElementById('close-staff-modal');
                const cancelStaffBtn = document.getElementById('cancel-staff-modal');
                const staffForm = document.getElementById('add-staff-form');
                const staffRoleSelect = document.getElementById('staff-role');
                const specGroup = document.querySelector('.staff-spec-group');

                if (addStaffBtn) addStaffBtn.onclick = () => staffModal.classList.remove('hidden');
                const hideStaffModal = () => staffModal.classList.add('hidden');
                if (closeStaffBtn) closeStaffBtn.onclick = hideStaffModal;
                if (cancelStaffBtn) cancelStaffBtn.onclick = hideStaffModal;

                if (staffRoleSelect) {
                    staffRoleSelect.onchange = (e) => {
                        specGroup.style.display = e.target.value === 'Doctor' ? 'block' : 'none';
                    };
                }

                if (staffForm) {
                    staffForm.onsubmit = async (e) => {
                        e.preventDefault();
                        toggleLoader(true);

                        const name = document.getElementById('staff-name').value;
                        const email = document.getElementById('staff-email').value;
                        const role = document.getElementById('staff-role').value;
                        const pass = document.getElementById('staff-pass').value;
                        const spec = document.getElementById('staff-spec').value;

                        try {
                            // Secondary app to create user without logging out Admin
                            let secondaryApp;
                            if (getApps().find(a => a.name === "Secondary")) {
                                secondaryApp = getApp("Secondary");
                            } else {
                                secondaryApp = initializeApp(firebaseConfig, "Secondary");
                            }
                            const secondaryAuth = getAuth(secondaryApp);

                            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
                            const newUser = userCredential.user;

                            await updateProfile(newUser, { displayName: name });

                            const userData = {
                                id: newUser.uid,
                                name: name,
                                email: email,
                                role: role,
                                status: 'Active',
                                createdAt: Date.now()
                            };
                            if (role === 'Doctor') userData.specialization = spec;
                            if (role === 'Receptionist') userData.isApproved = true;

                            await set(ref(db, 'users/' + newUser.uid), userData);
                            await signOut(secondaryAuth);

                            showToast(`${role} account created successfully!`, 'success');
                            hideStaffModal();
                            staffForm.reset();
                            initAdminDashboard(); // Refresh UI
                        } catch (err) {
                            console.error(err);
                            showToast(`Failed: ${err.message}`, 'error');
                        } finally {
                            toggleLoader(false);
                        }
                    };
                }
            }

            // --- Clinic Settings Logic ---
            const settingsSnap = await get(ref(db, 'clinicSettings'));
            if (settingsSnap.exists()) {
                const s = settingsSnap.val();
                document.getElementById('clinic-open').value = s.openTime || '09:00';
                document.getElementById('clinic-close').value = s.closeTime || '18:00';
                document.getElementById('slot-duration').value = s.slotDuration || '30';
            }

            document.getElementById('clinic-timing-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const openTime = document.getElementById('clinic-open').value;
                const closeTime = document.getElementById('clinic-close').value;
                const slotDuration = document.getElementById('slot-duration').value;
                const weeklyOff = document.getElementById('weekly-off')?.value || 'Sunday';
                await set(ref(db, 'clinicSettings'), { openTime, closeTime, slotDuration, weeklyOff });
                showToast('Clinic settings updated', 'success');
            }, { once: true });

            // --- Holiday Management Logic ---
            const holidayBtn = document.getElementById('add-holiday-btn');
            const holidayListEl = document.getElementById('holidays-list');

            onValue(ref(db, 'clinicSettings/holidays'), (snapshot) => {
                holidayListEl.innerHTML = '';
                if (snapshot.exists()) {
                    snapshot.forEach(child => {
                        const h = child.val();
                        const id = child.key;
                        const div = document.createElement('div');
                        div.className = 'toggle-box mb-2';
                        div.innerHTML = `
                            <div>
                                <strong>${h.date}</strong> - ${h.name}
                            </div>
                            <button class="btn btn-danger btn-sm action-delete-holiday" data-id="${id}">Remove</button>
                        `;
                        holidayListEl.appendChild(div);
                    });

                    document.querySelectorAll('.action-delete-holiday').forEach(btn => {
                        btn.onclick = async (e) => {
                            const hid = e.target.dataset.id;
                            await remove(ref(db, `clinicSettings/holidays/${hid}`));
                            showToast('Holiday removed', 'success');
                        };
                    });
                } else {
                    holidayListEl.innerHTML = '<p class="text-center text-muted">No holidays marked.</p>';
                }
            });

            holidayBtn.onclick = async () => {
                const date = document.getElementById('holiday-date').value;
                const name = document.getElementById('holiday-name').value;
                if (!date || !name) {
                    showToast('Please fill date and name', 'error');
                    return;
                }
                const newHolidayRef = push(ref(db, 'clinicSettings/holidays'));
                await set(newHolidayRef, { date, name });
                showToast('Holiday added', 'success');
                document.getElementById('holiday-date').value = '';
                document.getElementById('holiday-name').value = '';
            };

            // --- Analytics Logic (Chart.js) ---
            renderAdminCharts(aSnap, uSnap);

        } catch (error) {
            console.error("Dashboard Error:", error);
        } finally {
            toggleLoader(false);
        }
    });
}

function renderAdminCharts(aSnap, uSnap) {
    const ctxAppts = document.getElementById('appointmentsChart')?.getContext('2d');
    const ctxRegs = document.getElementById('registrationsChart')?.getContext('2d');
    const ctxStatus = document.getElementById('statusChart')?.getContext('2d');

    if (!ctxAppts) return; // Charts tab not active or not rendered yet

    // Simple Distribution for Appointments Status
    let pending = 0, confirmed = 0, completed = 0;
    if (aSnap.exists()) {
        aSnap.forEach(s => {
            const status = s.val().status;
            if (status === 'Pending') pending++;
            else if (status === 'Confirmed') confirmed++;
            else if (status === 'Completed') completed++;
        });
    }

    new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Confirmed', 'Completed'],
            datasets: [{
                data: [pending, confirmed, completed],
                backgroundColor: ['#f59e0b', '#3b82f6', '#10b981'],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });

    // Daily Appointments (Last 7 Days)
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
    }).reverse();

    const apptsData = last7Days.map(date => {
        let count = 0;
        if (aSnap.exists()) {
            aSnap.forEach(s => { if (s.val().date === date) count++; });
        }
        return count;
    });

    new Chart(ctxAppts, {
        type: 'line',
        data: {
            labels: last7Days,
            datasets: [{
                label: 'Appointments',
                data: apptsData,
                borderColor: '#dc2626',
                tension: 0.1,
                fill: false
            }]
        }
    });

    // Registrations by Role
    let dCount = 0, rCount = 0, pCount = 0;
    if (uSnap.exists()) {
        uSnap.forEach(s => {
            const role = s.val().role;
            if (role === 'Doctor') dCount++;
            else if (role === 'Receptionist') rCount++;
            else if (role === 'Patient') pCount++;
        });
    }

    new Chart(ctxRegs, {
        type: 'bar',
        data: {
            labels: ['Doctors', 'Receptionists', 'Patients'],
            datasets: [{
                label: 'Total Users',
                data: [dCount, rCount, pCount],
                backgroundColor: '#dc2626',
            }]
        }
    });
}

/**
 * Init Doctor Dashboard
 */
export function initDoctorDashboard() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        setUserNameDisplay(user);
        toggleLoader(true);

        try {
            const [apptsSnap, prescSnap, scheduleSnap] = await Promise.all([
                get(ref(db, 'appointments')),
                get(ref(db, 'prescriptions')),
                get(ref(db, 'doctorSchedules/' + user.uid))
            ]);

            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            let tApptsCount = 0, pApptsCount = 0, cApptsCount = 0, prCount = 0;
            const todayAppts = [];

            if (apptsSnap.exists()) {
                apptsSnap.forEach(docSnap => {
                    const data = docSnap.val();
                    const id = docSnap.key;
                    if (data.doctorId === user.uid) {
                        if (data.date === todayStr) {
                            tApptsCount++;
                            todayAppts.push({ id, ...data });
                        }
                        if (data.status === 'Pending') pApptsCount++;
                        if (data.status === 'Completed') cApptsCount++;
                        // Tracking for weekly stats might happen here but we use a simpler count for now
                    }
                });
            }
            if (prescSnap.exists()) {
                prescSnap.forEach(docSnap => { if (docSnap.val().doctorId === user.uid) prCount++; });
            }

            document.getElementById('stat-today-patients').textContent = tApptsCount;
            document.getElementById('stat-pending-appts').textContent = pApptsCount;
            document.getElementById('stat-completed-appts').textContent = cApptsCount;
            document.getElementById('stat-total-prescriptions').textContent = prCount;

            const tbody = document.getElementById('today-appointments-body');
            tbody.innerHTML = '';

            if (todayAppts.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">No appointments for today.</td></tr>`;
            } else {
                todayAppts.forEach(data => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${data.time || 'N/A'}</td>
                        <td>${data.patientName || 'Unknown'}</td>
                        <td><span class="badge ${data.status.toLowerCase()}">${data.status}</span></td>
                        <td>
                            <button class="btn btn-outline btn-sm action-insight" 
                                data-name="${data.patientName}" 
                                data-desc="${data.illnessDescription || 'Not provided'}">Insight</button>
                            <a href="prescriptions.html?patientId=${data.patientId}&apptId=${data.id}" class="btn btn-primary btn-sm">Write Rx</a>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

                document.querySelectorAll('.action-insight').forEach(btn => {
                    btn.onclick = (e) => {
                        const { name, desc } = e.target.dataset;
                        document.getElementById('insight-patient-name').textContent = name;
                        document.getElementById('insight-description').textContent = desc;
                        document.getElementById('insight-modal').classList.remove('hidden');
                    };
                });
            }

            // --- Availability Logic ---
            if (scheduleSnap.exists()) {
                const s = scheduleSnap.val();
                document.getElementById('doctor-open').value = s.openTime || '09:00';
                document.getElementById('doctor-close').value = s.closeTime || '17:00';

                const list = document.getElementById('leaves-list');
                list.innerHTML = '';
                if (s.leaves) {
                    Object.keys(s.leaves).forEach(date => {
                        const item = document.createElement('div');
                        item.className = 'status-badge status-inactive';
                        item.style.margin = '5px 0';
                        item.textContent = `Leave: ${date}`;
                        list.appendChild(item);
                    });
                }
            }

            document.getElementById('doctor-hours-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const openTime = document.getElementById('doctor-open').value;
                const closeTime = document.getElementById('doctor-close').value;
                await set(ref(db, `doctorSchedules/${user.uid}/openTime`), openTime);
                await set(ref(db, `doctorSchedules/${user.uid}/closeTime`), closeTime);
                showToast('Working hours updated', 'success');
            });

            document.getElementById('add-leave-btn').onclick = async () => {
                const date = document.getElementById('leave-date').value;
                if (!date) return;
                await set(ref(db, `doctorSchedules/${user.uid}/leaves/${date}`), true);
                showToast('Leave day marked', 'success');
                initDoctorDashboard();
            };

            // --- Analytics ---
            renderDoctorCharts(apptsSnap, user.uid);

        } catch (error) {
            console.error("Dashboard Error:", error);
        } finally {
            toggleLoader(false);
        }
    });
}

function renderDoctorCharts(aSnap, doctorId) {
    const ctxCases = document.getElementById('casesChart')?.getContext('2d');
    const ctxPerf = document.getElementById('perfChart')?.getContext('2d');
    if (!ctxCases) return;

    // Dummy counts for illnesses (in real usage we'd track illness types in DB)
    const illnesses = { 'Flu': 0, 'Headache': 0, 'Injury': 0, 'Checkup': 0, 'Other': 0 };
    let completed = 0, pending = 0;

    if (aSnap.exists()) {
        aSnap.forEach(s => {
            const data = s.val();
            if (data.doctorId === doctorId) {
                if (data.status === 'Completed') completed++; else pending++;
                const desc = (data.illnessDescription || '').toLowerCase();
                if (desc.includes('flu') || desc.includes('fever')) illnesses['Flu']++;
                else if (desc.includes('head') || desc.includes('migraine')) illnesses['Headache']++;
                else if (desc.includes('hurt') || desc.includes('bone')) illnesses['Injury']++;
                else if (desc.includes('regular') || desc.includes('rout')) illnesses['Checkup']++;
                else illnesses['Other']++;
            }
        });
    }

    new Chart(ctxCases, {
        type: 'pie',
        data: {
            labels: Object.keys(illnesses),
            datasets: [{
                data: Object.values(illnesses),
                backgroundColor: ['#dc2626', '#10b981', '#3b82f6', '#f59e0b', '#6b7280']
            }]
        }
    });

    new Chart(ctxPerf, {
        type: 'bar',
        data: {
            labels: ['Pending', 'Completed'],
            datasets: [{
                label: 'Appointments',
                data: [pending, completed],
                backgroundColor: ['#f59e0b', '#10b981']
            }]
        }
    });
}

/**
 * Init Receptionist Dashboard
 */
export function initReceptionistDashboard() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        setUserNameDisplay(user);
        toggleLoader(true);

        try {
            const [pReqsSnap, apptsSnap, usersSnap] = await Promise.all([
                get(ref(db, 'patientRequests')),
                get(ref(db, 'appointments')),
                get(ref(db, 'users'))
            ]);

            // --- Patient Requests Logic ---
            const reqsTbody = document.getElementById('patient-requests-body');
            reqsTbody.innerHTML = '';
            if (pReqsSnap.exists()) {
                pReqsSnap.forEach(child => {
                    const data = child.val();
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${data.patientName || 'Anonymous'}</td>
                        <td>${data.symptoms || 'No description'}</td>
                        <td><span class="badge ${data.urgency?.toLowerCase() || 'normal'}">${data.urgency || 'Normal'}</span></td>
                        <td>${data.preferredSpecialization || 'General'}</td>
                        <td>
                            <button class="btn btn-primary btn-sm action-match" 
                                data-id="${child.key}" 
                                data-name="${data.patientName}" 
                                data-symptoms="${data.symptoms}"
                                data-spec="${data.preferredSpecialization || 'General'}"
                                data-pid="${data.patientId}">Match Doctor</button>
                        </td>
                    `;
                    reqsTbody.appendChild(tr);
                });

                document.querySelectorAll('.action-match').forEach(btn => {
                    btn.onclick = (e) => {
                        const { id, name, symptoms, pid } = e.target.dataset;
                        document.getElementById('match-patient-name').textContent = name;
                        document.getElementById('match-symptoms').textContent = symptoms;

                        const select = document.getElementById('match-doctor-select');
                        select.innerHTML = '<option value="">Choose a doctor...</option>';

                        // Also fetch schedules to show availability
                        get(ref(db, 'clinicSettings')).then(cSnap => {
                            const cSettings = cSnap.val() || {};
                            const holidays = cSettings.holidays || {};
                            const weeklyOff = cSettings.weeklyOff || 'Sunday';
                            const dateVal = document.getElementById('match-date').value;
                            const isHoliday = Object.values(holidays).some(h => h.date === dateVal);

                            // Correctly check Weekly Off
                            const selectedDate = new Date(dateVal);
                            const dayName = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
                            const isWeeklyOff = dayName === weeklyOff;

                            get(ref(db, 'doctorSchedules')).then(schedulesSnap => {
                                const schedules = schedulesSnap.val() || {};
                                usersSnap.forEach(uSnap => {
                                    const u = uSnap.val();
                                    if (u.role === 'Doctor') {
                                        const sched = schedules[uSnap.key] || {};
                                        const onLeave = sched.leaves && dateVal && sched.leaves[dateVal];

                                        const opt = document.createElement('option');
                                        opt.value = uSnap.key;
                                        opt.dataset.name = u.name;
                                        let statusText = '';
                                        if (isHoliday) statusText = ' (CLINIC CLOSED - HOLIDAY)';
                                        else if (isWeeklyOff) statusText = ' (CLINIC CLOSED - WEEKLY OFF)';
                                        else if (onLeave) statusText = ' (ON LEAVE)';

                                        const hoursText = sched.openTime ? ` [${sched.openTime}-${sched.closeTime}]` : '';
                                        opt.textContent = `${u.name} (${u.specialization || 'GP'})${hoursText}${statusText}`;
                                        if (onLeave || isHoliday || isWeeklyOff) opt.disabled = true;
                                        select.appendChild(opt);
                                    }
                                });
                            });
                        });

                        document.getElementById('match-modal').classList.remove('hidden');

                        document.getElementById('match-confirm-form').onsubmit = async (evt) => {
                            evt.preventDefault();
                            const docId = select.value;
                            const docName = select.options[select.selectedIndex].dataset.name;
                            const date = document.getElementById('match-date').value;
                            const time = document.getElementById('match-time').value;

                            toggleLoader(true);
                            const newApptRef = push(ref(db, 'appointments'));
                            await set(newApptRef, {
                                patientId: pid,
                                patientName: name,
                                doctorId: docId,
                                doctorName: docName,
                                date: date,
                                time: time,
                                status: 'Confirmed',
                                illnessDescription: symptoms,
                                createdAt: Date.now()
                            });

                            // 2. Send Professional Notification to Patient
                            const notifRef = push(ref(db, `notifications/${pid}`));
                            await set(notifRef, {
                                title: 'Appointment Confirmed',
                                message: `Dear ${name}, your request has been reviewed. Your appointment with Dr. ${docName} is scheduled for ${date} at ${time}. Please arrive 10 minutes early.`,
                                timestamp: Date.now(),
                                type: 'MatchNotification'
                            });

                            await remove(ref(db, `patientRequests/${id}`));
                            showToast('Appointment matched & Patient notified!', 'success');
                            document.getElementById('match-modal').classList.add('hidden');
                            initReceptionistDashboard();
                        };
                    };
                });
            } else {
                reqsTbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No new requests.</td></tr>`;
            }

            // --- Stats & Master Schedule ---
            let totalPatients = 0, todayBookings = 0, upcoming = 0;
            const todayStr = new Date().toISOString().split('T')[0];

            if (usersSnap.exists()) {
                usersSnap.forEach(s => { if (s.val().role === 'Patient') totalPatients++; });
            }

            const apptsTbody = document.getElementById('upcoming-appointments-body');
            apptsTbody.innerHTML = '';

            if (apptsSnap.exists()) {
                const apptsArr = [];
                apptsSnap.forEach(s => {
                    const a = s.val();
                    if (a.date === todayStr) todayBookings++;
                    if (a.date >= todayStr) {
                        upcoming++;
                        apptsArr.push({ id: s.key, ...a });
                    }
                });

                apptsArr.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
                apptsArr.slice(0, 10).forEach(a => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${a.date} ${a.time}</td>
                        <td>${a.patientName}</td>
                        <td>${a.doctorName}</td>
                        <td><span class="badge ${a.status.toLowerCase()}">${a.status}</span></td>
                        <td><button class="btn btn-outline btn-sm action-edit-appt" data-id="${a.id}">Edit</button></td>
                    `;
                    apptsTbody.appendChild(tr);
                });

                document.querySelectorAll('.action-edit-appt').forEach(btn => {
                    btn.onclick = () => showToast('Advanced appointment editing coming soon!', 'info');
                });
            }

            document.getElementById('stat-total-patients').textContent = totalPatients;
            document.getElementById('stat-today-bookings').textContent = todayBookings;
            document.getElementById('stat-upcoming-appts').textContent = upcoming;

            // --- Analytics ---
            renderReceptionCharts(apptsSnap, usersSnap);

        } catch (error) {
            console.error("Dashboard Error:", error);
        } finally {
            toggleLoader(false);
        }
    });
}

function renderReceptionCharts(aSnap, uSnap) {
    const ctxBook = document.getElementById('bookingsChart')?.getContext('2d');
    const ctxLoad = document.getElementById('doctorLoadChart')?.getContext('2d');
    if (!ctxBook) return;

    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
    }).reverse();

    const bookingTrend = last7Days.map(date => {
        let count = 0;
        if (aSnap.exists()) {
            aSnap.forEach(child => { if (child.val().date === date) count++; });
        }
        return count;
    });

    new Chart(ctxBook, {
        type: 'line',
        data: {
            labels: last7Days,
            datasets: [{ label: 'Bookings', data: bookingTrend, borderColor: '#3b82f6', tension: 0.2 }]
        }
    });

    const docAppts = {};
    if (aSnap.exists()) {
        aSnap.forEach(child => {
            const name = child.val().doctorName;
            if (name) docAppts[name] = (docAppts[name] || 0) + 1;
        });
    }

    new Chart(ctxLoad, {
        type: 'bar',
        data: {
            labels: Object.keys(docAppts),
            datasets: [{ label: 'Appts Handled', data: Object.values(docAppts), backgroundColor: '#10b981' }]
        }
    });
}

/**
 * Init Patient Dashboard
 */
export function initPatientDashboard() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        setUserNameDisplay(user);
        toggleLoader(true);

        try {
            const userSnap = await get(ref(db, `users/${user.uid}`));
            let matchedPatient = null;
            let patientId = user.uid;

            if (userSnap.exists()) {
                const u = userSnap.val();
                if (u.role === 'Patient') {
                    matchedPatient = u;
                }
            }

            if (!matchedPatient) {
                const unlinked = document.getElementById('unlinked-warning');
                if (unlinked) unlinked.classList.remove('hidden');

                // Set default matched patient fields
                matchedPatient = {
                    name: user.displayName || user.email.split('@')[0],
                    email: user.email,
                    role: 'Patient'
                };
            } else {
                const unlinked = document.getElementById('unlinked-warning');
                if (unlinked) unlinked.classList.add('hidden');
            }

            const pName = document.getElementById('pt-name'); if (pName) pName.textContent = matchedPatient.name || 'N/A';
            const pEmail = document.getElementById('pt-email'); if (pEmail) pEmail.textContent = user.email;
            const pPhone = document.getElementById('pt-phone'); if (pPhone) pPhone.textContent = matchedPatient.phone || 'N/A';
            const pBlood = document.getElementById('pt-blood'); if (pBlood) pBlood.textContent = matchedPatient.bloodGroup || 'N/A';
            const pAge = document.getElementById('pt-age-gender'); if (pAge) pAge.textContent = `${matchedPatient.age || '-'} / ${matchedPatient.gender || '-'}`;
            const pAddress = document.getElementById('pt-address'); if (pAddress) pAddress.textContent = matchedPatient.address || 'N/A';
            const pEmergency = document.getElementById('pt-emergency'); if (pEmergency) pEmergency.textContent = matchedPatient.emergencyContact || 'N/A';
            const pMedical = document.getElementById('pt-medical'); if (pMedical) pMedical.textContent = matchedPatient.medicalConditions || 'None reported';

            const [apptsSnap, prescSnap] = await Promise.all([
                get(ref(db, 'appointments')),
                get(ref(db, 'prescriptions'))
            ]);

            const activeTbody = document.getElementById('active-appts-body');
            if (activeTbody) {
                activeTbody.innerHTML = '';
                let upcomingCount = 0;
                const todayStr = new Date().toISOString().split('T')[0];
                const historyData = [];

                if (apptsSnap.exists()) {
                    apptsSnap.forEach(s => {
                        const a = s.val();
                        if (a.patientId === patientId || (a.patientEmail && a.patientEmail === user.email)) {
                            if (a.date >= todayStr && a.status !== 'Cancelled' && a.status !== 'Completed') {
                                upcomingCount++;
                                const tr = document.createElement('tr');
                                tr.innerHTML = `
                                    <td>${a.date} ${a.time}</td>
                                    <td>${a.doctorName}</td>
                                    <td><span class="badge ${a.status.toLowerCase()}">${a.status}</span></td>
                                    <td><button class="btn btn-outline btn-sm btn-reschedule" data-id="${s.key}">Reschedule</button></td>
                                `;
                                activeTbody.appendChild(tr);
                            }
                            historyData.push({ type: 'appointment', date: a.date, data: a, ts: a.createdAt || 0 });
                        }
                    });

                    document.querySelectorAll('.btn-reschedule').forEach(btn => {
                        btn.onclick = () => showToast('Please contact the receptionist to reschedule your appointment.', 'info');
                    });
                }
                if (activeTbody.innerHTML === '') activeTbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">No active appointments.</td></tr>';
                const upCountEl = document.getElementById('stat-upcoming-appts');
                if (upCountEl) upCountEl.textContent = upcomingCount;

                if (prescSnap.exists()) {
                    prescSnap.forEach(s => {
                        const p = s.val();
                        if (p.patientId === patientId || (p.patientEmail && p.patientEmail === user.email)) {
                            historyData.push({ type: 'prescription', date: formatDate(p.createdAt), data: p, ts: p.createdAt });
                        }
                    });
                }
                renderPatientHistory(historyData);
            }

            const notifRef = ref(db, `notifications/${user.uid}`);
            onValue(notifRef, (snapshot) => {
                const list = document.getElementById('notifications-list');
                if (!list) return;
                list.innerHTML = '';
                if (snapshot.exists()) {
                    snapshot.forEach(child => {
                        const n = child.val();
                        const item = document.createElement('div');
                        item.className = 'timeline-content mb-3';
                        item.innerHTML = `
                            <p><strong>${n.title}</strong></p>
                            <p style="font-size:0.9rem;">${n.message}</p>
                            <span style="font-size:0.75rem; color:var(--text-muted);">${formatDate(n.timestamp)}</span>
                        `;
                        list.prepend(item);
                    });
                } else {
                    list.innerHTML = '<p class="text-center text-muted">No new notifications.</p>';
                }
            });

            // --- Edit Profile Logic ---
            const editModal = document.getElementById('edit-profile-modal');
            const editBtn = document.getElementById('edit-profile-btn');
            const closeEditBtn = document.getElementById('close-edit-profile');
            const cancelEditBtn = document.getElementById('cancel-edit-profile');
            const editForm = document.getElementById('edit-profile-form');

            if (editBtn) {
                editBtn.onclick = () => {
                    document.getElementById('edit-pt-name').value = matchedPatient.name || '';
                    document.getElementById('edit-pt-phone').value = matchedPatient.phone || '';
                    document.getElementById('edit-pt-blood').value = matchedPatient.bloodGroup || '';
                    document.getElementById('edit-pt-age').value = matchedPatient.age || '';
                    document.getElementById('edit-pt-gender').value = matchedPatient.gender || 'Male';
                    document.getElementById('edit-pt-address').value = matchedPatient.address || '';
                    document.getElementById('edit-pt-emergency').value = matchedPatient.emergencyContact || '';
                    document.getElementById('edit-pt-medical').value = matchedPatient.medicalConditions || '';
                    editModal.classList.remove('hidden');
                };
            }

            const hideEditModal = () => editModal.classList.add('hidden');
            if (closeEditBtn) closeEditBtn.onclick = hideEditModal;
            if (cancelEditBtn) cancelEditBtn.onclick = hideEditModal;

            if (editForm) {
                editForm.onsubmit = async (e) => {
                    e.preventDefault();
                    toggleLoader(true);

                    const updatedData = {
                        name: document.getElementById('edit-pt-name').value,
                        phone: document.getElementById('edit-pt-phone').value,
                        bloodGroup: document.getElementById('edit-pt-blood').value,
                        age: document.getElementById('edit-pt-age').value,
                        gender: document.getElementById('edit-pt-gender').value,
                        address: document.getElementById('edit-pt-address').value,
                        emergencyContact: document.getElementById('edit-pt-emergency').value,
                        medicalConditions: document.getElementById('edit-pt-medical').value,
                        updatedAt: Date.now()
                    };

                    try {
                        // 1. Update user profile
                        await set(ref(db, `users/${patientId}`), {
                            ...matchedPatient,
                            ...updatedData
                        });
                        // 2. Update patient record for Admin/Reception views
                        await update(ref(db, `patients/${patientId}`), {
                            name: updatedData.name,
                            age: updatedData.age,
                            gender: updatedData.gender,
                            phone: updatedData.phone,
                            address: updatedData.address,
                            bloodGroup: updatedData.bloodGroup,
                            emergencyContact: updatedData.emergencyContact,
                            medicalConditions: updatedData.medicalConditions,
                            email: matchedPatient.email || document.getElementById('pt-email').textContent,
                            updatedAt: updatedData.updatedAt,
                            createdAt: matchedPatient.createdAt || Date.now()
                        });

                        showToast('Profile updated successfully!', 'success');
                        hideEditModal();
                        initPatientDashboard(); // Refresh data
                    } catch (err) {
                        console.error(err);
                        showToast('Failed to update profile.', 'error');
                    } finally {
                        toggleLoader(false);
                    }
                };
            }

            const sxForm = document.getElementById('symptoms-form');
            if (sxForm) {
                sxForm.onsubmit = async (e) => {
                    e.preventDefault();
                    const symptoms = document.getElementById('symptoms-desc').value;
                    const urgency = document.getElementById('urgency-level').value;
                    const pref = document.getElementById('pref-spec').value;

                    toggleLoader(true);
                    const reqRef = push(ref(db, 'patientRequests'));
                    await set(reqRef, {
                        patientId: patientId,
                        patientName: matchedPatient.name || user.email.split('@')[0],
                        symptoms: symptoms,
                        urgency: urgency,
                        preferredSpecialization: pref,
                        timestamp: Date.now(),
                        status: 'Pending'
                    });
                    showToast('Symptoms submitted! Reception will contact you.', 'success');
                    sxForm.reset();
                    toggleLoader(false);
                };
            }

            const profilePicInput = document.getElementById('profile-pic-input');
            if (profilePicInput) {
                profilePicInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    toggleLoader(true);
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const base64Str = event.target.result;
                        try {
                            await updateProfile(auth.currentUser, { photoURL: base64Str });
                            setUserNameDisplay(auth.currentUser);

                            await update(ref(db, `users/${patientId}`), { photoURL: base64Str });
                            await update(ref(db, `patients/${patientId}`), { photoURL: base64Str });

                            showToast('Profile photo updated successfully!', 'success');
                        } catch (err) {
                            console.error(err);
                            showToast('Failed to change photo. File might be too large.', 'error');
                        } finally {
                            toggleLoader(false);
                        }
                    };
                    reader.readAsDataURL(file);
                };
            }

        } catch (error) {
            console.error(error);
        } finally {
            toggleLoader(false);
        }
    });
}

function renderPatientHistory(data) {
    const container = document.getElementById('timeline-container');
    if (!container) return;
    container.innerHTML = '';
    if (data.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">No records found.</p>';
        return;
    }

    data.sort((a, b) => b.ts - a.ts);
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'timeline-content mb-4';
        if (item.type === 'appointment') {
            div.innerHTML = `
                <div style="color:var(--primary); font-weight:600;">Past Appointment - ${item.date}</div>
                <p>Dr. ${item.data.doctorName} - ${item.data.status}</p>
            `;
        } else {
            div.innerHTML = `
                <div style="color:var(--secondary); font-weight:600;">Prescription Issued - ${item.date}</div>
                <p>By Dr. ${item.data.doctorName}</p>
                <a href="${item.data.pdfUrl || '#'}" target="_blank" class="btn btn-outline btn-sm">Download Rx</a>
            `;
        }
        container.appendChild(div);
    });
}
