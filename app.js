/**
 * AL BADUSHA TRUST - SIMPLE ACCOUNT MANAGER
 * 
 * How it works:
 *   1. People GIVE money (Donations) → we record who gave, how much, for what
 *   2. Trust SPENDS money (Expenses) → we record what we bought, for whom
 *   3. Dashboard shows: Total In, Total Out, Balance
 *   4. Print a receipt for each donor
 */

// ─── LOGIN & ROLES ───────────────────────────────────────────────────────────

const ADMIN_ONLY_TABS = ['donations', 'settings', 'users'];

function getRole() {
    return sessionStorage.getItem('loggedRole') || '';
}

function getLoggedUser() {
    return sessionStorage.getItem('loggedUser') || '';
}

function isAdmin() {
    return getRole() === 'admin';
}

function requireAdmin() {
    if (!isAdmin()) {
        alert('You do not have permission to perform this action.');
        return false;
    }
    return true;
}

function applyRoleUI() {
    document.querySelectorAll('[data-admin-only]').forEach(el => {
        if (isAdmin()) {
            el.classList.remove('role-hidden');
        } else {
            el.classList.add('role-hidden');
        }
    });

    const sessionEl = document.getElementById('sessionInfo');
    if (sessionEl && sessionStorage.getItem('loggedIn') === 'true') {
        const user = getLoggedUser();
        const role = getRole();
        sessionEl.innerHTML = `Logged in as <strong>${user}</strong> (${role})`;
    }

    if (!isAdmin()) {
        const activeTab = document.querySelector('.tab.active');
        if (activeTab && ADMIN_ONLY_TABS.includes(activeTab.id)) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            const dashBtn = document.querySelector('.nav-btn[data-tab="dashboard"]');
            if (dashBtn) dashBtn.classList.add('active');
            const dashTab = document.getElementById('dashboard');
            if (dashTab) dashTab.classList.add('active');
        }
    }
}

function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    const errorEl = document.getElementById('loginError');
    const card = document.querySelector('.login-card');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    errorEl.textContent = '';
    if (submitBtn) submitBtn.disabled = true;

    TrustAPI.login(user, pass)
        .then(async function (result) {
            sessionStorage.setItem('loggedIn', 'true');
            sessionStorage.setItem('loggedUser', result.user);
            sessionStorage.setItem('loggedRole', result.role);
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('appMain').style.display = 'flex';
            await loadData();
            applyRoleUI();
            renderAll();
            loadSettings();
            populateSignatoryDropdown();
        })
        .catch(function (err) {
            if (err.message && (err.message.includes('fetch') || err.message.includes('Failed') || err.message.includes('Network'))) {
                errorEl.textContent = '❌ Cannot reach server. Run: npm run dev — then open http://localhost:3000';
            } else if (err.message && err.message.includes('Login failed')) {
                errorEl.textContent = '❌ Server error — check .env and Supabase connection';
            } else {
                errorEl.textContent = '❌ Wrong username or password';
            }
            card.classList.remove('shake');
            void card.offsetWidth;
            card.classList.add('shake');
        })
        .finally(function () {
            if (submitBtn) submitBtn.disabled = false;
        });
}

function logout() {
    TrustAPI.logout().finally(function () {
        sessionStorage.removeItem('loggedIn');
        sessionStorage.removeItem('loggedUser');
        sessionStorage.removeItem('loggedRole');
        document.getElementById('appMain').style.display = 'none';
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('loginUser').value = '';
        document.getElementById('loginPass').value = '';
        document.getElementById('loginError').textContent = '';
        const sessionEl = document.getElementById('sessionInfo');
        if (sessionEl) sessionEl.innerHTML = '';
    });
}

function checkSession() {
    return TrustAPI.getSession().then(async function (session) {
        if (!session) return false;
        sessionStorage.setItem('loggedIn', 'true');
        sessionStorage.setItem('loggedUser', session.user);
        sessionStorage.setItem('loggedRole', session.role);
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('appMain').style.display = 'flex';
        await loadData();
        applyRoleUI();
        return true;
    }).catch(function () {
        return false;
    });
}

// ─── STATE ───────────────────────────────────────────────────────────────────

let data = {
    settings: {},
    donations: [],
    expenses: [],
    users: [],
    counters: {},
    activityLog: []
};

// ─── INIT ────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {
    setupNav();
    checkSession().then(function (loggedIn) {
        if (loggedIn) {
            renderAll();
            loadSettings();
            populateSignatoryDropdown();
        }
        applyRoleUI();
    });
});

async function loadData() {
    const payload = await TrustAPI.loadFromServer();
    data.settings = payload.settings || {};
    data.donations = payload.donations || [];
    data.expenses = payload.expenses || [];
    data.users = payload.users || [];
    data.counters = payload.counters || {};
    data.activityLog = payload.activity_log || [];
}

async function save(key, value) {
    const apiKey = key === 'activityLog' ? 'activity_log' : key;
    data[key] = value;
    await TrustAPI.saveToServer(apiKey, value);
}

async function refreshSharedData(silent) {
    if (sessionStorage.getItem('loggedIn') !== 'true') return;
    try {
        await loadData();
        renderAll();
        if (!silent && typeof showToast === 'function') showToast('Data refreshed', 'success');
    } catch (err) {
        console.error(err);
        if (typeof showToast === 'function') showToast('Failed to refresh data', 'error');
    }
}
window.refreshSharedData = refreshSharedData;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function money(n) {
    return '₹' + Number(n).toLocaleString('en-IN');
}

// Convert YYYY-MM-DD → DD-MM-YYYY
function fmtDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + '-' + parts[1] + '-' + parts[0];
}

function toWords(amount) {
    amount = Math.floor(amount);
    if (amount === 0) return "Zero Rupees Only";
    
    const u = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
               "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
    const t = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
    
    function w(n) {
        let s = "";
        if (n >= 100) { s += u[Math.floor(n/100)] + " Hundred "; n %= 100; }
        if (n >= 20) { s += t[Math.floor(n/10)] + " "; n %= 10; }
        if (n > 0) s += u[n] + " ";
        return s.trim();
    }
    
    let words = "";
    let cr = Math.floor(amount / 10000000); amount %= 10000000;
    let lk = Math.floor(amount / 100000); amount %= 100000;
    let th = Math.floor(amount / 1000); amount %= 1000;
    
    if (cr > 0) words += w(cr) + " Crore ";
    if (lk > 0) words += w(lk) + " Lakh ";
    if (th > 0) words += w(th) + " Thousand ";
    if (amount > 0) words += w(amount) + " ";
    
    return words.trim() + " Rupees Only";
}

function nextId(prefix, list) {
    return prefix + String(list.length + 1).padStart(3, '0');
}

function getCategoryIcon(cat) {
    const map = {
        'Education': 'fas fa-graduation-cap',
        'Medical': 'fas fa-heartbeat',
        'Food': 'fas fa-utensils',
        'Infrastructure': 'fas fa-building',
        'Majlis': 'fas fa-mosque',
        'General': 'fas fa-hand-holding-heart',
        'Poor Giveaway': 'fas fa-gift',
        'Marriage': 'fas fa-ring'
    };
    return map[cat] || 'fas fa-coins';
}

function getCategoryClass(cat) {
    const map = {
        'Education': 'edu',
        'Medical': 'med',
        'Food': 'food',
        'Infrastructure': 'infra',
        'Majlis': 'majlis',
        'General': 'other',
        'Poor Giveaway': 'poor',
        'Marriage': 'marriage'
    };
    return map[cat] || 'other';
}

function getBadgeClass(cat) {
    const map = {
        'Education': 'badge-edu',
        'Medical': 'badge-med',
        'Food': 'badge-food',
        'Infrastructure': 'badge-infra',
        'Majlis': 'badge-majlis',
        'General': 'badge-gen',
        'Poor Giveaway': 'badge-poor',
        'Marriage': 'badge-marriage'
    };
    return map[cat] || 'badge-gen';
}

function viewAttachment(dataUrl) {
    const win = window.open();
    win.document.write('<iframe src="' + dataUrl  + '" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>');
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────

function setupNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (!tab) return;

            if (!isAdmin() && ADMIN_ONLY_TABS.includes(tab)) return;

            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.getElementById(tab).classList.add('active');

            refreshSharedData(true);
        });
    });
}

function renderAll() {
    renderDashboard();
    renderDonations();
    renderExpenses();
    renderUsers();
    if (typeof renderActivityLog === 'function' && isAdmin()) renderActivityLog();
    applyRoleUI();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

function renderDashboard() {
    const totalIn = data.donations.reduce((s, d) => s + d.amount, 0);
    const totalOut = data.expenses.reduce((s, e) => s + e.amount, 0);
    const balance = totalIn - totalOut;
    const donorCount = data.donations.length;

    document.getElementById('statIn').textContent = money(totalIn);
    document.getElementById('statOut').textContent = money(totalOut);
    document.getElementById('statBalance').textContent = money(balance);
    document.getElementById('statDonors').textContent = donorCount;

    // How money was spent - group by category
    const byCategory = {};
    data.expenses.forEach(e => {
        byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });

    const purposeList = document.getElementById('purposeList');
    purposeList.innerHTML = '';

    if (Object.keys(byCategory).length === 0) {
        purposeList.innerHTML = '<div class="empty-msg"><i class="fas fa-info-circle"></i>No expenses recorded yet</div>';
    } else {
        // Sort by amount descending
        const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
        sorted.forEach(([cat, amt]) => {
            purposeList.innerHTML += `
                <div class="purpose-item">
                    <div class="name">
                        <div class="icon ${getCategoryClass(cat)}"><i class="${getCategoryIcon(cat)}"></i></div>
                        ${cat}
                    </div>
                    <div class="val">${money(amt)}</div>
                </div>
            `;
        });
    }

    // Recent activity (last 6 items, mixed)
    const recentList = document.getElementById('recentList');
    recentList.innerHTML = '';

    let all = [];
    data.donations.forEach(d => all.push({ date: d.date, text: d.donorName, sub: d.purpose, amount: d.amount, type: 'in' }));
    data.expenses.forEach(e => all.push({ date: e.date, text: e.description, sub: e.category, amount: e.amount, type: 'out' }));
    all.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (all.length === 0) {
        recentList.innerHTML = '<div class="empty-msg"><i class="fas fa-history"></i>No activity yet</div>';
    } else {
        all.slice(0, 6).forEach(item => {
            recentList.innerHTML += `
                <div class="recent-item">
                    <div class="info">
                        <strong>${item.text}</strong>
                        <small>${fmtDate(item.date)} · ${item.sub}</small>
                    </div>
                    <div class="amt ${item.type === 'in' ? 'in' : 'out'}">
                        ${item.type === 'in' ? '+' : '-'} ${money(item.amount)}
                    </div>
                </div>
            `;
        });
    }
}

// ─── DONATIONS (Money In) ────────────────────────────────────────────────────

function renderDonations() {
    const body = document.getElementById('donBody');
    body.innerHTML = '';

    const q = (document.getElementById('donSearch')?.value || '').toLowerCase();

    const filtered = data.donations.filter(d =>
        d.donorName.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        d.purpose.toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="empty-msg"><i class="fas fa-hand-holding-heart"></i>No donations found</td></tr>';
        return;
    }

    filtered.forEach(d => {
        body.innerHTML += `
            <tr>
                <td><strong>${d.id}</strong></td>
                <td>${fmtDate(d.date)}</td>
                <td>
                    <strong>${d.donorName}</strong>
                    <div style="font-size:11px;color:var(--text-muted)">${d.donorPhone || ''}</div>
                </td>
                <td><span class="badge ${d.mode === 'Cash' ? 'badge-cash' : 'badge-bank'}">${d.mode}</span></td>
                <td><span class="badge ${getBadgeClass(d.purpose)}">${d.purpose}</span></td>
                <td class="amount green">${money(d.amount)}</td>
                <td style="text-align:right">
                    ${d.attachment ? `<button class="btn btn-outline btn-sm" onclick="viewAttachment('${d.attachment}')"><i class="fas fa-paperclip"></i> Proof</button>` : ''}
                    <button class="btn btn-outline btn-sm" onclick="editDonation('${d.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="openReceipt('${d.id}')">
                        <i class="fas fa-print"></i> Receipt
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteDonation('${d.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

function openAddDonation() {
    if (!requireAdmin()) return;
    populateSignatoryDropdown();
    document.querySelector('#donModal .modal-top h3').innerHTML = `<i class="fas fa-hand-holding-heart"></i> Add <span>Donation</span>`;
    document.querySelector('#donModal button[type="submit"]').innerHTML = `<i class="fas fa-save"></i> Save Donation`;
    document.getElementById('donFormId').value = nextId('REC-', data.donations);
    document.getElementById('donFormDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('donModal').classList.add('open');
}

function editDonation(id) {
    if (!requireAdmin()) return;
    const d = data.donations.find(x => x.id === id);
    if (!d) return;

    populateSignatoryDropdown();

    document.getElementById('donFormId').value = d.id;
    document.getElementById('donFormDate').value = d.date;
    document.getElementById('donFormName').value = d.donorName;
    document.getElementById('donFormPhone').value = d.donorPhone || '';
    document.getElementById('donFormAddress').value = d.donorAddress || '';
    document.getElementById('donFormAmount').value = d.amount;
    document.getElementById('donFormMode').value = d.mode;
    document.getElementById('donFormPurpose').value = d.purpose;
    document.getElementById('donFormSignatory').value = d.signatory || data.settings.managingTrustee || 'Syed Al Badusha';
    document.getElementById('donFormNotes').value = d.notes || '';
    
    document.querySelector('#donModal .modal-top h3').innerHTML = `<i class="fas fa-edit"></i> Edit <span>Donation</span>`;
    document.querySelector('#donModal button[type="submit"]').innerHTML = `<i class="fas fa-save"></i> Update Donation`;
    document.getElementById('donModal').classList.add('open');
}

function closeDonModal() {
    document.getElementById('donModal').classList.remove('open');
    document.getElementById('donForm').reset();
}

function saveDonation(e) {
    if (!requireAdmin()) return;
    e.preventDefault();

    const donation = {
        id: document.getElementById('donFormId').value,
        date: document.getElementById('donFormDate').value,
        donorName: document.getElementById('donFormName').value,
        donorPhone: document.getElementById('donFormPhone').value,
        donorAddress: document.getElementById('donFormAddress').value,
        amount: parseFloat(document.getElementById('donFormAmount').value),
        mode: document.getElementById('donFormMode').value,
        purpose: document.getElementById('donFormPurpose').value,
        signatory: document.getElementById('donFormSignatory').value,
        notes: document.getElementById('donFormNotes').value
    };

    const fileInput = document.getElementById('donFormAttachment');
    if (fileInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = function(event) {
            donation.attachment = event.target.result;
            finishSaveDonation(donation);
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        finishSaveDonation(donation);
    }
}

function finishSaveDonation(donation) {
    const idx = data.donations.findIndex(d => d.id === donation.id);
    if (idx !== -1) {
        if (!donation.attachment && data.donations[idx].attachment) {
            donation.attachment = data.donations[idx].attachment;
        }
        data.donations[idx] = donation;
    } else {
        data.donations.push(donation);
    }
    save('donations', data.donations)
        .then(function () {
            closeDonModal();
            renderAll();
        })
        .catch(function (err) {
            alert('Failed to save donation: ' + err.message);
        });
}

function deleteDonation(id) {
    if (!requireAdmin()) return;
    if (!confirm('Delete this donation record?')) return;
    data.donations = data.donations.filter(d => d.id !== id);
    save('donations', data.donations)
        .then(renderAll)
        .catch(function (err) {
            alert('Failed to delete donation: ' + err.message);
        });
}

// ─── EXPENSES (Money Out) ────────────────────────────────────────────────────

function renderExpenses() {
    const body = document.getElementById('expBody');
    body.innerHTML = '';

    const q = (document.getElementById('expSearch')?.value || '').toLowerCase();

    const filtered = data.expenses.filter(e =>
        e.description.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.paidTo.toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="empty-msg"><i class="fas fa-receipt"></i>No expenses found</td></tr>';
        return;
    }

    filtered.forEach(e => {
        const adminActions = isAdmin() ? `
                    ${e.attachment ? `<button class="btn btn-outline btn-sm" onclick="viewAttachment('${e.attachment}')"><i class="fas fa-file-invoice"></i> Bill</button>` : ''}
                    <button class="btn btn-outline btn-sm" onclick="editExpense('${e.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteExpense('${e.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
        ` : (e.attachment ? `<button class="btn btn-outline btn-sm" onclick="viewAttachment('${e.attachment}')"><i class="fas fa-file-invoice"></i> Bill</button>` : '');

        body.innerHTML += `
            <tr>
                <td><strong>${e.id}</strong></td>
                <td>${fmtDate(e.date)}</td>
                <td>${e.description}</td>
                <td><span class="badge ${getBadgeClass(e.category)}">${e.category}</span></td>
                <td style="font-size:12px;color:var(--text-muted)">${e.paidTo}</td>
                <td class="amount red">${money(e.amount)}</td>
                <td style="text-align:right">
                    ${adminActions}
                </td>
            </tr>
        `;
    });
}

function openAddExpense() {
    if (!requireAdmin()) return;
    document.getElementById('expModalTitle').innerHTML = `<i class="fas fa-receipt"></i> Add <span>Expense</span>`;
    document.getElementById('expSubmitBtn').innerHTML = `<i class="fas fa-save"></i> Save Expense`;
    document.getElementById('expFormId').value = nextId('EXP-', data.expenses);
    document.getElementById('expFormDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('expModal').classList.add('open');
}

function editExpense(id) {
    if (!requireAdmin()) return;
    const e = data.expenses.find(x => x.id === id);
    if (!e) return;

    document.getElementById('expModalTitle').innerHTML = `<i class="fas fa-edit"></i> Edit <span>Expense</span>`;
    document.getElementById('expSubmitBtn').innerHTML = `<i class="fas fa-save"></i> Update Expense`;

    document.getElementById('expFormId').value = e.id;
    document.getElementById('expFormDate').value = e.date;
    document.getElementById('expFormDesc').value = e.description;
    document.getElementById('expFormCategory').value = e.category;
    document.getElementById('expFormAmount').value = e.amount;
    document.getElementById('expFormPaidTo').value = e.paidTo || '';

    document.getElementById('expModal').classList.add('open');
}

function closeExpModal() {
    document.getElementById('expModal').classList.remove('open');
    document.getElementById('expForm').reset();
    document.getElementById('expModalTitle').innerHTML = `<i class="fas fa-receipt"></i> Add <span>Expense</span>`;
    document.getElementById('expSubmitBtn').innerHTML = `<i class="fas fa-save"></i> Save Expense`;
}

function saveExpense(e) {
    if (!requireAdmin()) return;
    e.preventDefault();

    const expense = {
        id: document.getElementById('expFormId').value,
        date: document.getElementById('expFormDate').value,
        description: document.getElementById('expFormDesc').value,
        category: document.getElementById('expFormCategory').value,
        amount: parseFloat(document.getElementById('expFormAmount').value),
        paidTo: document.getElementById('expFormPaidTo').value
    };

    const fileInput = document.getElementById('expFormAttachment');
    if (fileInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = function(event) {
            expense.attachment = event.target.result;
            finishSaveExpense(expense);
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        finishSaveExpense(expense);
    }
}

function finishSaveExpense(expense) {
    const idx = data.expenses.findIndex(e => e.id === expense.id);
    if (idx !== -1) {
        if (!expense.attachment && data.expenses[idx].attachment) {
            expense.attachment = data.expenses[idx].attachment;
        }
        data.expenses[idx] = expense;
    } else {
        data.expenses.push(expense);
    }
    save('expenses', data.expenses)
        .then(function () {
            closeExpModal();
            renderAll();
        })
        .catch(function (err) {
            alert('Failed to save expense: ' + err.message);
        });
}

function deleteExpense(id) {
    if (!requireAdmin()) return;
    if (!confirm('Delete this expense record?')) return;
    data.expenses = data.expenses.filter(e => e.id !== id);
    save('expenses', data.expenses)
        .then(renderAll)
        .catch(function (err) {
            alert('Failed to delete expense: ' + err.message);
        });
}

// ─── RECEIPT ─────────────────────────────────────────────────────────────────

function openReceipt(id) {
    if (!requireAdmin()) return;
    const d = data.donations.find(x => x.id === id);
    if (!d) return;

    const s = data.settings;

    document.getElementById('recTrustName').textContent = s.trustName;
    document.getElementById('recAddress').textContent = s.address;
    document.getElementById('recContact').textContent = `Email: ${s.email} | Phone: ${s.phone}`;
    document.getElementById('recReg').textContent = `PAN: ${s.pan} | Reg: ${s.regNumber}`;

    document.getElementById('recId').textContent = d.id;
    document.getElementById('recDate').textContent = fmtDate(d.date);
    document.getElementById('recFY').textContent = s.financialYear;

    document.getElementById('recDonor').textContent = d.donorName;
    document.getElementById('recDonorAddr').textContent = d.donorAddress || 'N/A';
    document.getElementById('recAmtWords').textContent = toWords(d.amount);
    document.getElementById('recMode').textContent = d.mode;
    document.getElementById('recPurpose').textContent = d.purpose;
    document.getElementById('recAmount').textContent = money(d.amount) + '/-';
    document.getElementById('recTrustee').textContent = d.signatory || s.managingTrustee || 'Syed Al Badusha';

    // Handle Notes reflection in Receipt
    const notesBox = document.getElementById('recRemarksBox');
    const notesSpan = document.getElementById('recNotes');
    if (d.notes && d.notes.trim()) {
        notesSpan.textContent = d.notes.trim();
        notesBox.style.display = 'block';
    } else {
        notesSpan.textContent = '';
        notesBox.style.display = 'none';
    }

    document.getElementById('receiptModal').classList.add('open');
}

function saveReceiptChanges() {
    if (!requireAdmin()) return;
    const id = document.getElementById('recId').textContent.trim();
    const d = data.donations.find(x => x.id === id);
    if (!d) return;

    // Parse amount from something like "₹25,000/-" or "25000"
    let amtText = document.getElementById('recAmount').textContent.trim();
    amtText = amtText.replace(/[^0-9]/g, ''); // remove ₹, comma, /-, etc.
    const amt = parseFloat(amtText) || d.amount;

    d.donorName = document.getElementById('recDonor').textContent.trim();
    d.donorAddress = document.getElementById('recDonorAddr').textContent.trim();
    d.amount = amt;
    d.mode = document.getElementById('recMode').textContent.trim();
    d.purpose = document.getElementById('recPurpose').textContent.trim();
    
    const notesSpan = document.getElementById('recNotes');
    if (notesSpan) {
        d.notes = notesSpan.textContent.trim();
    }

    // Convert receipt date from DD-MM-YYYY back to YYYY-MM-DD
    const dateStr = document.getElementById('recDate').textContent.trim();
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        d.date = parts[2] + '-' + parts[1] + '-' + parts[0];
    }

    // Save settings if edited in receipt
    const trustName = document.getElementById('recTrustName').textContent.trim();
    const address = document.getElementById('recAddress').textContent.trim();
    const trustee = document.getElementById('recTrustee').textContent.trim();
    const fy = document.getElementById('recFY').textContent.trim();

    if (trustName) data.settings.trustName = trustName;
    if (address) data.settings.address = address;
    if (fy) data.settings.financialYear = fy;
    
    if (trustee) {
        d.signatory = trustee;
    }

    Promise.all([
        save('settings', data.settings),
        save('donations', data.donations)
    ])
        .then(function () {
            renderAll();
            alert('✅ Receipt and donation details successfully updated!');
            closeReceiptModal();
        })
        .catch(function (err) {
            alert('Failed to save changes: ' + err.message);
        });
}

function closeReceiptModal() {
    document.getElementById('receiptModal').classList.remove('open');
}

function printReceipt() {
    window.print();
}

// ─── TRUSTEE MEMBERS LOGIC ───────────────────────────────────────────────────

function renderTrusteeSettings() {
    const container = document.getElementById('trusteeListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!data.settings.trustees || !Array.isArray(data.settings.trustees)) {
        data.settings.trustees = [data.settings.managingTrustee || 'Syed Al Badusha'];
    }

    data.settings.trustees.forEach((trustee, idx) => {
        const row = document.createElement('div');
        row.className = 'trustee-input-row';
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.marginBottom = '8px';
        row.style.alignItems = 'center';
        row.innerHTML = `
            <input type="text" class="trustee-name-input" value="${trustee}" placeholder="Trustee Name" required style="flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px;">
            ${data.settings.trustees.length > 1 ? `
                <button type="button" class="btn btn-danger btn-sm" onclick="removeTrusteeField(${idx})" style="padding: 10px 12px; margin: 0;">
                    <i class="fas fa-times"></i>
                </button>
            ` : ''}
        `;
        container.appendChild(row);
    });
}

function addTrusteeField() {
    if (!requireAdmin()) return;
    const inputs = document.querySelectorAll('.trustee-name-input');
    const currentList = Array.from(inputs).map(inp => inp.value.trim());
    currentList.push('');
    data.settings.trustees = currentList;
    renderTrusteeSettings();
}

function removeTrusteeField(idx) {
    if (!requireAdmin()) return;
    const inputs = document.querySelectorAll('.trustee-name-input');
    const currentList = Array.from(inputs).map(inp => inp.value.trim());
    currentList.splice(idx, 1);
    data.settings.trustees = currentList;
    renderTrusteeSettings();
}

function populateSignatoryDropdown() {
    const select = document.getElementById('donFormSignatory');
    if (!select) return;
    select.innerHTML = '';

    if (!data.settings.trustees || !Array.isArray(data.settings.trustees)) {
        data.settings.trustees = [data.settings.managingTrustee || 'Syed Al Badusha'];
    }

    data.settings.trustees.forEach(t => {
        if (t.trim()) {
            select.innerHTML += `<option value="${t.trim()}">${t.trim()}</option>`;
        }
    });
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

function loadSettings() {
    const s = data.settings;
    document.getElementById('setName').value = s.trustName;
    document.getElementById('setAddress').value = s.address;
    document.getElementById('setEmail').value = s.email;
    document.getElementById('setPhone').value = s.phone;
    document.getElementById('setPan').value = s.pan;
    document.getElementById('setReg').value = s.regNumber;
    document.getElementById('setFY').value = s.financialYear;
    
    renderTrusteeSettings();
}

function saveSettings(e) {
    if (!requireAdmin()) return;
    e.preventDefault();
    
    const inputs = document.querySelectorAll('.trustee-name-input');
    const trusteesList = Array.from(inputs)
        .map(inp => inp.value.trim())
        .filter(val => val !== '');

    data.settings = {
        trustName: document.getElementById('setName').value,
        address: document.getElementById('setAddress').value,
        email: document.getElementById('setEmail').value,
        phone: document.getElementById('setPhone').value,
        pan: document.getElementById('setPan').value,
        regNumber: document.getElementById('setReg').value,
        managingTrustee: trusteesList[0] || 'Syed Al Badusha',
        trustees: trusteesList,
        financialYear: document.getElementById('setFY').value
    };
    save('settings', data.settings)
        .then(function () {
            alert('✅ Settings saved!');
            renderAll();
            populateSignatoryDropdown();
        })
        .catch(function (err) {
            alert('Failed to save settings: ' + err.message);
        });
}

// Load settings when settings tab is clicked
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        if (sessionStorage.getItem('loggedIn') === 'true') {
            loadSettings();
            populateSignatoryDropdown();
        }
    }, 100);
});

// ─── USERS (Admin only) ──────────────────────────────────────────────────────

let userFormMode = 'add';
let userFormOriginalUsername = '';

function renderUsers() {
    const body = document.getElementById('userBody');
    if (!body) return;
    body.innerHTML = '';

    if (!isAdmin()) return;

    const q = (document.getElementById('userSearch')?.value || '').toLowerCase();
    const filtered = data.users.filter(u => u.username.toLowerCase().includes(q));

    if (filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="3" class="empty-msg"><i class="fas fa-users"></i>No users found</td></tr>';
        return;
    }

    filtered.forEach(u => {
        const roleBadge = u.role === 'admin' ? 'badge-admin' : 'badge-viewer';
        const roleLabel = u.role === 'admin' ? 'Admin' : 'Viewer';
        const deleteBtn = (!u.protected && u.username !== getLoggedUser()) ? `
            <button class="btn btn-danger btn-sm" onclick='deleteUser(${JSON.stringify(u.username)})'>
                <i class="fas fa-trash"></i> Delete
            </button>
        ` : (u.protected ? '<span style="font-size:11px;color:var(--text-muted)">Protected</span>' : '');

        body.innerHTML += `
            <tr>
                <td><strong>${u.username}</strong></td>
                <td><span class="badge ${roleBadge}">${roleLabel}</span></td>
                <td style="text-align:right">
                    <button class="btn btn-outline btn-sm" onclick='editUser(${JSON.stringify(u.username)})'>
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    ${deleteBtn}
                </td>
            </tr>
        `;
    });
}

function openAddUser() {
    if (!requireAdmin()) return;
    userFormMode = 'add';
    userFormOriginalUsername = '';
    document.getElementById('userModalTitle').innerHTML = `<i class="fas fa-user-plus"></i> Add <span>User</span>`;
    document.getElementById('userSubmitBtn').innerHTML = `<i class="fas fa-save"></i> Save User`;
    document.getElementById('userFormUsername').readOnly = false;
    document.getElementById('userFormUsername').value = '';
    document.getElementById('userFormPassword').value = '';
    document.getElementById('userFormPassword').required = true;
    document.getElementById('userFormPasswordLabel').innerHTML = 'Password <span class="req">*</span>';
    document.getElementById('userFormRole').value = 'viewer';
    document.getElementById('userModal').classList.add('open');
}

function editUser(username) {
    if (!requireAdmin()) return;
    const u = data.users.find(x => x.username === username);
    if (!u) return;

    userFormMode = 'edit';
    userFormOriginalUsername = username;
    document.getElementById('userModalTitle').innerHTML = `<i class="fas fa-user-edit"></i> Edit <span>User</span>`;
    document.getElementById('userSubmitBtn').innerHTML = `<i class="fas fa-save"></i> Update User`;
    document.getElementById('userFormUsername').value = u.username;
    document.getElementById('userFormUsername').readOnly = true;
    document.getElementById('userFormPassword').value = '';
    document.getElementById('userFormPassword').required = false;
    document.getElementById('userFormPasswordLabel').innerHTML = 'Password <span style="font-weight:400;color:var(--text-muted)">(leave blank to keep current)</span>';
    document.getElementById('userFormRole').value = u.role;
    document.getElementById('userModal').classList.add('open');
}

function closeUserModal() {
    document.getElementById('userModal').classList.remove('open');
    document.getElementById('userForm').reset();
    document.getElementById('userFormUsername').readOnly = false;
    document.getElementById('userFormPassword').required = true;
    document.getElementById('userFormPasswordLabel').innerHTML = 'Password <span class="req">*</span>';
    userFormMode = 'add';
    userFormOriginalUsername = '';
}

function saveUser(e) {
    if (!requireAdmin()) return;
    e.preventDefault();

    const username = document.getElementById('userFormUsername').value.trim();
    const password = document.getElementById('userFormPassword').value;
    const role = document.getElementById('userFormRole').value;

    if (!username) {
        alert('Username is required.');
        return;
    }

    if (userFormMode === 'add') {
        if (password.length < 4) {
            alert('Password must be at least 4 characters.');
            return;
        }
        if (data.users.some(u => u.username === username)) {
            alert('Username already exists.');
            return;
        }
        data.users.push({ username, password, role, protected: false });
    } else {
        const idx = data.users.findIndex(u => u.username === userFormOriginalUsername);
        if (idx === -1) return;

        if (password && password.length < 4) {
            alert('Password must be at least 4 characters.');
            return;
        }

        const updated = {
            username: data.users[idx].username,
            role,
            protected: data.users[idx].protected
        };
        if (password) updated.password = password;

        data.users[idx] = updated;

        if (getLoggedUser() === userFormOriginalUsername) {
            sessionStorage.setItem('loggedRole', role);
            applyRoleUI();
        }
    }

    save('users', data.users)
        .then(function () {
            closeUserModal();
            renderUsers();
            alert('✅ User saved successfully!');
        })
        .catch(function (err) {
            alert('Failed to save user: ' + err.message);
        });
}

function deleteUser(username) {
    if (!requireAdmin()) return;

    const u = data.users.find(x => x.username === username);
    if (!u) return;

    if (u.protected) {
        alert('This user account is protected and cannot be deleted.');
        return;
    }

    if (username === getLoggedUser()) {
        alert('You cannot delete your own account while logged in.');
        return;
    }

    if (!confirm(`Delete user "${username}"?`)) return;

    data.users = data.users.filter(x => x.username !== username);
    save('users', data.users)
        .then(renderUsers)
        .catch(function (err) {
            alert('Failed to delete user: ' + err.message);
        });
}

// ─── DATA BACKUP & RESTORE ───────────────────────────────────────────────────

function exportData() {
    if (!requireAdmin()) return;
    const backupData = {
        settings: data.settings,
        donations: data.donations,
        expenses: data.expenses,
        users: (data.users || []).map(function (u) {
            return {
                username: u.username,
                role: u.role,
                protected: u.protected,
                password: u.password || ''
            };
        }),
        counters: data.counters || {},
        activityLog: data.activityLog || [],
        exportDate: new Date().toISOString()
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "al_badusha_trust_backup_" + new Date().toISOString().split('T')[0] + ".json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function exportExcel() {
    if (!requireAdmin()) return;
    if (typeof XLSX === 'undefined') {
        alert('Excel library failed to load. Please check your internet connection and refresh the page.');
        return;
    }

    const s = data.settings;
    const totalIn = data.donations.reduce((sum, d) => sum + d.amount, 0);
    const totalOut = data.expenses.reduce((sum, e) => sum + e.amount, 0);
    const date = new Date().toISOString().split('T')[0];

    const summaryRows = [
        ['AL BADUSHA TRUST — Account Summary'],
        ['Exported', new Date().toLocaleString('en-IN')],
        [],
        ['Trust Name', s.trustName || ''],
        ['Address', s.address || ''],
        ['Email', s.email || ''],
        ['Phone', s.phone || ''],
        ['PAN', s.pan || ''],
        ['Registration', s.regNumber || ''],
        ['Financial Year', s.financialYear || ''],
        [],
        ['Total Received', totalIn],
        ['Total Spent', totalOut],
        ['Balance', totalIn - totalOut],
        ['Donation Count', data.donations.length],
        ['Expense Count', data.expenses.length]
    ];

    const donationRows = [
        ['Receipt #', 'Date', 'Donor Name', 'Phone', 'Address', 'Amount', 'Mode', 'Purpose', 'Notes']
    ];
    [...data.donations]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(d => {
            donationRows.push([
                d.id,
                fmtDate(d.date),
                d.donorName,
                d.donorPhone || '',
                d.donorAddress || '',
                d.amount,
                d.mode,
                d.purpose,
                d.notes || ''
            ]);
        });

    const expenseRows = [
        ['Voucher #', 'Date', 'Description', 'Category', 'Paid To', 'Amount']
    ];
    [...data.expenses]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(e => {
            expenseRows.push([
                e.id,
                fmtDate(e.date),
                e.description,
                e.category,
                e.paidTo || '',
                e.amount
            ]);
        });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(donationRows), 'Donations');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseRows), 'Expenses');

    XLSX.writeFile(wb, 'al_badusha_trust_' + date + '.xlsx');
}

function importData(event) {
    if (!requireAdmin()) return;
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);

            if (importedData.settings && importedData.donations && importedData.expenses) {
                if (confirm('Are you sure you want to overwrite current data with this backup? This action cannot be undone.')) {
                    data.settings = importedData.settings;
                    data.donations = importedData.donations;
                    data.expenses = importedData.expenses;
                    if (importedData.users) data.users = importedData.users;
                    if (importedData.counters) data.counters = importedData.counters;
                    if (importedData.activityLog) data.activityLog = importedData.activityLog;

                    const saves = [
                        save('settings', data.settings),
                        save('donations', data.donations),
                        save('expenses', data.expenses)
                    ];
                    const usersHavePasswords = importedData.users &&
                        importedData.users.some(function (u) { return u.password; });
                    if (usersHavePasswords) saves.push(save('users', data.users));
                    if (importedData.counters) saves.push(save('counters', data.counters));
                    if (importedData.activityLog) saves.push(save('activityLog', data.activityLog));

                    Promise.all(saves)
                        .then(function () {
                            alert('✅ Data restored successfully!');
                            loadSettings();
                            renderAll();
                        })
                        .catch(function (err) {
                            alert('Failed to restore backup: ' + err.message);
                        });
                }
            } else {
                alert('❌ Invalid backup file format.');
            }
        } catch (error) {
            alert('❌ Error reading backup file.');
            console.error(error);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}
