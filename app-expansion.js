(function () {
    'use strict';

    // =========================
    // CONSTANTS / GLOBAL STATE
    // =========================
    const FILTER_STORAGE_KEY = 'trust_filter_state';
    const DASHBOARD_SCOPE_KEY = 'trust_dashboard_scope';
    const COUNTER_STORAGE_KEY = 'trust_counters';
    const ACTIVITY_STORAGE_KEY = 'trust_activity_log';
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

    const CATEGORIES = [
        'All',
        'Education',
        'Medical',
        'Food',
        'Infrastructure',
        'Majlis',
        'Poor Giveaway',
        'Marriage',
        'General'
    ];
    window.CATEGORIES = CATEGORIES;

    const LABELS = {
        en: {
            subtitle: 'Simple Account Management',
            lowBalance: 'Low balance warning',
            noActivity: 'No activity available',
            backupNever: 'No backup exported yet',
            backupLast: 'Last backup',
            settingsSaved: 'Settings saved successfully',
            passwordChanged: 'Password updated successfully',
            cleared: 'All trust data cleared'
        },
        ta: {
            subtitle: 'எளிய கணக்கு மேலாண்மை',
            lowBalance: 'குறைந்த இருப்பு எச்சரிக்கை',
            noActivity: 'செயல்பாடு இல்லை',
            backupNever: 'இன்னும் காப்பு எடுக்கப்படவில்லை',
            backupLast: 'கடைசி காப்பு',
            settingsSaved: 'அமைப்புகள் சேமிக்கப்பட்டது',
            passwordChanged: 'கடவுச்சொல் மாற்றப்பட்டது',
            cleared: 'அனைத்து தரவும் நீக்கப்பட்டது'
        }
    };
    window.LABELS = LABELS;

    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (err) {
            console.error('Failed to parse JSON for', key, err);
            return fallback;
        }
    }

    function readSessionJSON(key, fallback) {
        try {
            const raw = sessionStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (err) {
            console.error('Failed to parse session JSON for', key, err);
            return fallback;
        }
    }

    function writeSessionJSON(key, value) {
        sessionStorage.setItem(key, JSON.stringify(value));
    }

    let filterState = readSessionJSON(FILTER_STORAGE_KEY, {
        period: 'all',
        from: '',
        to: '',
        category: 'All'
    });

    let dashboardScope = sessionStorage.getItem(DASHBOARD_SCOPE_KEY) || 'fy';
    if (!['fy', 'all'].includes(dashboardScope)) dashboardScope = 'fy';

    let sessionTimer = null;
    let modalDirtyState = {
        donForm: false,
        expForm: false,
        userForm: false
    };

    let voucherPrintContextId = '';

    // =========================
    // STORE ORIGINAL FUNCTIONS
    // =========================
    const _renderDashboard = window.renderDashboard;
    const _renderDonations = window.renderDonations;
    const _renderExpenses = window.renderExpenses;
    const _openAddDonation = window.openAddDonation;
    const _openAddExpense = window.openAddExpense;
    const _editDonation = window.editDonation;
    const _editExpense = window.editExpense;
    const _finishSaveDonation = window.finishSaveDonation;
    const _finishSaveExpense = window.finishSaveExpense;
    const _closeDonModal = window.closeDonModal;
    const _closeExpModal = window.closeExpModal;
    const _closeUserModal = window.closeUserModal;
    const _loadSettings = window.loadSettings;
    const _saveSettings = window.saveSettings;
    const _exportData = window.exportData;
    const _exportExcel = window.exportExcel;
    const _logout = window.logout;

    // =========================
    // COMMON HELPERS
    // =========================
    function getSafeSettings() {
        data.settings = data.settings || {};
        return data.settings;
    }

    function toDateValue(input) {
        if (!input) return null;
        const d = new Date(input + 'T00:00:00');
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatMonthKey(monthKey) {
        const parts = monthKey.split('-');
        if (parts.length !== 2) return monthKey;
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        const dt = new Date(year, month - 1, 1);
        return dt.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    }

    function getCurrentFYLabel() {
        const fy = getSafeSettings().financialYear;
        if (fy && fy.trim()) return fy.trim();
        return getAutoFYLabel(new Date());
    }

    function getAutoFYLabel(date) {
        const d = date || new Date();
        const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
        const n = String((y + 1) % 100).padStart(2, '0');
        return y + '-' + n;
    }

    /** FY label that actually contains today's date (fixes stale settings vs current calendar) */
    function getEffectiveFYLabel() {
        const settingsFy = getSafeSettings().financialYear;
        const today = new Date().toISOString().slice(0, 10);
        if (settingsFy) {
            const range = getFYDateRange(settingsFy);
            if (today >= range.from && today <= range.to) return settingsFy.trim();
        }
        return getAutoFYLabel(new Date());
    }

    function ensureFilterStateShape() {
        if (!filterState || typeof filterState !== 'object') {
            filterState = { period: 'all', from: '', to: '', category: 'All' };
        }
        filterState.period = filterState.period || 'all';
        filterState.from = filterState.from || '';
        filterState.to = filterState.to || '';
        filterState.category = filterState.category || 'All';
    }

    function saveFilterState() {
        ensureFilterStateShape();
        writeSessionJSON(FILTER_STORAGE_KEY, filterState);
        sessionStorage.setItem(DASHBOARD_SCOPE_KEY, dashboardScope);
    }

    function sanitizeText(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // =========================
    // PHASE 1: FILTERS / DASHBOARD
    // =========================
    function getFYDateRange(fy) {
        const fallback = getCurrentFYLabel();
        const label = (fy || fallback).trim();
        const match = label.match(/^(\d{4})-(\d{2}|\d{4})$/);
        if (!match) {
            const now = new Date();
            const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
            return {
                from: startYear + '-04-01',
                to: (startYear + 1) + '-03-31'
            };
        }

        const startYear = Number(match[1]);
        let endYear = Number(match[2]);
        if (endYear < 100) endYear = Number(String(startYear).slice(0, 2) + String(endYear).padStart(2, '0'));

        return {
            from: startYear + '-04-01',
            to: endYear + '-03-31'
        };
    }
    window.getFYDateRange = getFYDateRange;

    function getDateRangeFromFilter() {
        ensureFilterStateShape();
        const now = new Date();
        const toIso = function (d) {
            return d.toISOString().slice(0, 10);
        };

        const period = filterState.period || 'fy';
        if (period === 'all') return { from: '', to: '' };

        if (period === 'custom') {
            return {
                from: filterState.from || '',
                to: filterState.to || ''
            };
        }

        if (period === 'today') {
            const today = toIso(now);
            return { from: today, to: today };
        }

        if (period === '7d' || period === '30d') {
            const days = period === '7d' ? 7 : 30;
            const start = new Date(now);
            start.setDate(start.getDate() - (days - 1));
            return { from: toIso(start), to: toIso(now) };
        }

        if (period === 'month') {
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { from: toIso(first), to: toIso(last) };
        }

        if (period === 'quarter') {
            const q = Math.floor(now.getMonth() / 3);
            const first = new Date(now.getFullYear(), q * 3, 1);
            const last = new Date(now.getFullYear(), q * 3 + 3, 0);
            return { from: toIso(first), to: toIso(last) };
        }

        return getFYDateRange(getEffectiveFYLabel());
    }
    window.getDateRangeFromFilter = getDateRangeFromFilter;

    function filterByDateRange(list, from, to) {
        if (!Array.isArray(list) || (!from && !to)) return list || [];
        const fromDt = toDateValue(from);
        const toDt = toDateValue(to);
        return list.filter(function (item) {
            const dt = toDateValue(item.date);
            if (!dt) return false;
            if (fromDt && dt < fromDt) return false;
            if (toDt && dt > toDt) return false;
            return true;
        });
    }
    window.filterByDateRange = filterByDateRange;

    function filterByCategory(list, category, keyName) {
        if (!Array.isArray(list)) return [];
        if (!category || category === 'All') return list;
        const key = keyName || 'category';
        return list.filter(function (item) {
            return (item[key] || '').toLowerCase() === category.toLowerCase();
        });
    }
    window.filterByCategory = filterByCategory;

    function getFilteredDonations(forDashboard) {
        let list = Array.isArray(data.donations) ? data.donations.slice() : [];
        const range = getDateRangeFromFilter();
        const skipDate = forDashboard && dashboardScope === 'all';
        if (!skipDate && filterState.period !== 'all') {
            list = filterByDateRange(list, range.from, range.to);
        }
        list = filterByCategory(list, filterState.category, 'purpose');
        return list;
    }
    window.getFilteredDonations = getFilteredDonations;

    function getFilteredExpenses(forDashboard) {
        let list = Array.isArray(data.expenses) ? data.expenses.slice() : [];
        const range = getDateRangeFromFilter();
        const skipDate = forDashboard && dashboardScope === 'all';
        if (!skipDate && filterState.period !== 'all') {
            list = filterByDateRange(list, range.from, range.to);
        }
        list = filterByCategory(list, filterState.category, 'category');
        return list;
    }
    window.getFilteredExpenses = getFilteredExpenses;

    function setFilterPeriod(period) {
        filterState.period = period || 'fy';
        if (filterState.period !== 'custom') {
            filterState.from = '';
            filterState.to = '';
        }
        saveFilterState();
        applyFilters();
    }
    window.setFilterPeriod = setFilterPeriod;

    function applyFilters() {
        saveFilterState();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.renderDonations === 'function') window.renderDonations();
        if (typeof window.renderExpenses === 'function') window.renderExpenses();
        if (typeof window.renderDonorList === 'function') window.renderDonorList();
        if (typeof window.renderActivityLog === 'function') window.renderActivityLog();
    }
    window.applyFilters = applyFilters;

    function ensureSelectOptions(select, values) {
        if (!select) return;
        select.innerHTML = '';
        values.forEach(function (value) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = value;
            select.appendChild(opt);
        });
    }

    function renderFilterBar(containerId, type) {
        const container = document.getElementById(containerId);
        if (!container) return;

        ensureFilterStateShape();

        let bar = container.querySelector('.filter-bar[data-expansion="' + type + '"]');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'filter-bar';
            bar.dataset.expansion = type;
            container.insertBefore(bar, container.firstChild);
        }

        bar.innerHTML = [
            '<label style="font-size:12px;font-weight:600">Period</label>',
            '<select data-role="period">',
            '  <option value="fy">Financial Year</option>',
            '  <option value="all">All Dates</option>',
            '  <option value="today">Today</option>',
            '  <option value="7d">Last 7 Days</option>',
            '  <option value="30d">Last 30 Days</option>',
            '  <option value="month">This Month</option>',
            '  <option value="quarter">This Quarter</option>',
            '  <option value="custom">Custom Range</option>',
            '</select>',
            '<input type="date" data-role="from" title="From date">',
            '<input type="date" data-role="to" title="To date">',
            '<select data-role="category"></select>',
            '<button class="btn btn-outline btn-sm" type="button" data-role="apply"><i class="fas fa-filter"></i> Apply</button>',
            '<button class="btn btn-outline btn-sm" type="button" data-role="reset"><i class="fas fa-rotate-left"></i> Reset</button>',
            type === 'dashboard' ? '<button class="btn btn-primary btn-sm" type="button" data-role="print"><i class="fas fa-print"></i> Print Report</button>' : ''
        ].join('');

        const periodEl = bar.querySelector('[data-role="period"]');
        const fromEl = bar.querySelector('[data-role="from"]');
        const toEl = bar.querySelector('[data-role="to"]');
        const catEl = bar.querySelector('[data-role="category"]');
        const applyEl = bar.querySelector('[data-role="apply"]');
        const resetEl = bar.querySelector('[data-role="reset"]');
        const printEl = bar.querySelector('[data-role="print"]');

        ensureSelectOptions(catEl, CATEGORIES);

        periodEl.value = filterState.period || 'fy';
        fromEl.value = filterState.from || '';
        toEl.value = filterState.to || '';
        catEl.value = filterState.category || 'All';

        const custom = periodEl.value === 'custom';
        fromEl.style.display = custom ? 'inline-block' : 'none';
        toEl.style.display = custom ? 'inline-block' : 'none';

        periodEl.onchange = function () {
            filterState.period = periodEl.value;
            const showCustom = periodEl.value === 'custom';
            fromEl.style.display = showCustom ? 'inline-block' : 'none';
            toEl.style.display = showCustom ? 'inline-block' : 'none';
            if (!showCustom) {
                filterState.from = '';
                filterState.to = '';
            }
            saveFilterState();
        };

        fromEl.onchange = function () { filterState.from = fromEl.value; saveFilterState(); };
        toEl.onchange = function () { filterState.to = toEl.value; saveFilterState(); };
        catEl.onchange = function () { filterState.category = catEl.value; saveFilterState(); };
        applyEl.onclick = function () { applyFilters(); };
        resetEl.onclick = function () {
            filterState = { period: 'all', from: '', to: '', category: 'All' };
            saveFilterState();
            applyFilters();
            showToast('Filters reset — showing all records', 'info');
        };
        if (printEl) printEl.onclick = function () { printReport(); };
    }
    window.renderFilterBar = renderFilterBar;

    function getMonthlySummary(donations, expenses) {
        const map = {};
        donations.forEach(function (d) {
            const month = String(d.date || '').slice(0, 7);
            if (!month) return;
            map[month] = map[month] || { in: 0, out: 0 };
            map[month].in += Number(d.amount || 0);
        });
        expenses.forEach(function (e) {
            const month = String(e.date || '').slice(0, 7);
            if (!month) return;
            map[month] = map[month] || { in: 0, out: 0 };
            map[month].out += Number(e.amount || 0);
        });
        return Object.keys(map)
            .sort()
            .map(function (month) {
                return {
                    month: month,
                    totalIn: map[month].in,
                    totalOut: map[month].out,
                    balance: map[month].in - map[month].out
                };
            });
    }

    function renderMonthlySummaryTable(donations, expenses) {
        const dashboard = document.getElementById('dashboard');
        if (!dashboard) return;

        let wrap = document.getElementById('monthlySummaryWrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'monthlySummaryWrap';
            wrap.className = 'card';
            const summaryGrid = dashboard.querySelector('.summary-grid');
            if (summaryGrid && summaryGrid.parentNode) {
                summaryGrid.parentNode.insertBefore(wrap, summaryGrid.nextSibling);
            } else {
                dashboard.appendChild(wrap);
            }
        }

        const rows = getMonthlySummary(donations, expenses);
        let body = '';
        rows.forEach(function (row) {
            body += '<tr>' +
                '<td>' + sanitizeText(formatMonthKey(row.month)) + '</td>' +
                '<td>' + money(row.totalIn) + '</td>' +
                '<td>' + money(row.totalOut) + '</td>' +
                '<td><strong>' + money(row.balance) + '</strong></td>' +
                '</tr>';
        });

        wrap.innerHTML = [
            '<div class="card-head">',
            '  <h3><i class="fas fa-table"></i> Monthly Summary</h3>',
            '</div>',
            rows.length === 0
                ? '<div class="empty-msg" style="padding:12px"><i class="fas fa-info-circle"></i> No monthly data</div>'
                : '<div class="table-wrap"><table class="responsive-table monthly-table"><thead><tr><th>Month</th><th>Total In</th><th>Total Out</th><th>Balance</th></tr></thead><tbody>' + body + '</tbody></table></div>'
        ].join('');
        applyResponsiveTableLabels();
    }

    function renderDashboardScopeToggle() {
        const dashboard = document.getElementById('dashboard');
        if (!dashboard) return;

        let controls = dashboard.querySelector('.dashboard-controls');
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'dashboard-controls';
            dashboard.insertBefore(controls, dashboard.firstChild);
        }

        controls.innerHTML = [
            '<button class="scope-btn' + (dashboardScope === 'fy' ? ' active' : '') + '" data-scope="fy">FY Scope</button>',
            '<button class="scope-btn' + (dashboardScope === 'all' ? ' active' : '') + '" data-scope="all">All Data</button>'
        ].join('');

        controls.querySelectorAll('[data-scope]').forEach(function (btn) {
            btn.onclick = function () {
                dashboardScope = btn.getAttribute('data-scope') || 'fy';
                saveFilterState();
                applyFilters();
            };
        });
    }

    function renderRecentActivitySearch(activityRows) {
        const recentList = document.getElementById('recentList');
        if (!recentList) return;

        const parentCard = recentList.closest('.card');
        if (!parentCard) return;

        let search = parentCard.querySelector('#recentActivitySearch');
        if (!search) {
            const wrap = document.createElement('div');
            wrap.style.padding = '8px 16px 0';
            wrap.innerHTML = '<input id="recentActivitySearch" type="text" placeholder="Search recent activity..." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px">';
            const cardHead = parentCard.querySelector('.card-head');
            if (cardHead && cardHead.nextSibling) {
                parentCard.insertBefore(wrap, cardHead.nextSibling);
            } else {
                parentCard.insertBefore(wrap, recentList);
            }
            search = wrap.querySelector('#recentActivitySearch');
        }

        const renderList = function () {
            const q = (search.value || '').toLowerCase();
            const filtered = activityRows.filter(function (item) {
                return !q || item.text.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q);
            });
            recentList.innerHTML = '';
            if (filtered.length === 0) {
                recentList.innerHTML = '<div class="empty-msg"><i class="fas fa-history"></i> ' + t('noActivity') + '</div>';
                return;
            }
            filtered.slice(0, 10).forEach(function (item) {
                recentList.innerHTML += '<div class="recent-item">' +
                    '<div class="info"><strong>' + sanitizeText(item.text) + '</strong><small>' + fmtDate(item.date) + ' · ' + sanitizeText(item.sub) + '</small></div>' +
                    '<div class="amt ' + (item.type === 'in' ? 'in' : 'out') + '">' + (item.type === 'in' ? '+ ' : '- ') + money(item.amount) + '</div>' +
                    '</div>';
            });
        };

        search.oninput = renderList;
        renderList();
    }

    function renderDashboard() {
        const donations = getFilteredDonations(true);
        const expenses = getFilteredExpenses(true);

        const totalIn = donations.reduce(function (s, d) { return s + Number(d.amount || 0); }, 0);
        const totalOut = expenses.reduce(function (s, e) { return s + Number(e.amount || 0); }, 0);
        const balance = totalIn - totalOut;

        const statIn = document.getElementById('statIn');
        const statOut = document.getElementById('statOut');
        const statBalance = document.getElementById('statBalance');
        const statDonors = document.getElementById('statDonors');
        if (statIn) statIn.textContent = money(totalIn);
        if (statOut) statOut.textContent = money(totalOut);
        if (statBalance) statBalance.textContent = money(balance);
        if (statDonors) statDonors.textContent = String(donations.length);

        const fyPill = document.getElementById('fyPill');
        if (fyPill) {
            fyPill.textContent = dashboardScope === 'all'
                ? 'All Data Scope'
                : 'FY ' + getCurrentFYLabel();
        }

        renderDashboardScopeToggle();
        renderFilterBar('dashboard', 'dashboard');

        const dashboard = document.getElementById('dashboard');
        if (dashboard) {
            let alertNode = dashboard.querySelector('#lowBalanceAlertBox');
            if (!alertNode) {
                alertNode = document.createElement('div');
                alertNode.id = 'lowBalanceAlertBox';
                dashboard.insertBefore(alertNode, dashboard.firstChild.nextSibling);
            }
            const lowBalLimit = Number(getSafeSettings().lowBalanceAlert || 0);
            if (lowBalLimit > 0 && balance <= lowBalLimit) {
                alertNode.innerHTML = '<div class="alert-banner warning"><i class="fas fa-triangle-exclamation"></i> ' +
                    t('lowBalance') + ': ' + money(balance) + ' (limit ' + money(lowBalLimit) + ')</div>';
            } else {
                alertNode.innerHTML = '';
            }
        }

        renderCategoryChart();
        renderMonthlySummaryTable(donations, expenses);
        if (isAdmin()) renderActivityLog();

        const recentRows = [];
        donations.forEach(function (d) {
            recentRows.push({ date: d.date, text: d.donorName || d.id, sub: d.purpose || 'Donation', amount: Number(d.amount || 0), type: 'in' });
        });
        expenses.forEach(function (e) {
            recentRows.push({ date: e.date, text: e.description || e.id, sub: e.category || 'Expense', amount: Number(e.amount || 0), type: 'out' });
        });
        recentRows.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
        renderRecentActivitySearch(recentRows);
    }
    window.renderDashboard = renderDashboard;

    function renderCategoryChart() {
        const purposeList = document.getElementById('purposeList');
        if (!purposeList) return;

        const expenses = getFilteredExpenses();
        const byCategory = {};
        expenses.forEach(function (e) {
            const cat = e.category || 'General';
            byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount || 0);
        });
        const rows = Object.keys(byCategory)
            .map(function (k) { return { category: k, amount: byCategory[k] }; })
            .sort(function (a, b) { return b.amount - a.amount; });

        if (rows.length === 0) {
            purposeList.innerHTML = '<div class="empty-msg"><i class="fas fa-info-circle"></i> No expenses recorded yet</div>';
            return;
        }

        const max = rows[0].amount || 1;
        let html = '<div class="chart-bars">';
        rows.forEach(function (row) {
            const width = Math.max(2, Math.round((row.amount / max) * 100));
            html += '<div class="chart-bar-row">' +
                '<div class="chart-bar-label">' + sanitizeText(row.category) + '</div>' +
                '<div class="chart-bar-track"><div class="chart-bar-fill" style="width:' + width + '%"></div></div>' +
                '<div class="chart-bar-val">' + money(row.amount) + '</div>' +
                '</div>';
        });
        html += '</div>';
        purposeList.innerHTML = html;
    }
    window.renderCategoryChart = renderCategoryChart;

    function renderDonorList() {
        if (!isAdmin()) return;
        const donationsTab = document.getElementById('donations');
        if (!donationsTab) return;

        let card = document.getElementById('donorListCard');
        if (!card) {
            card = document.createElement('div');
            card.id = 'donorListCard';
            card.className = 'card';
            donationsTab.appendChild(card);
        }

        const map = {};
        getFilteredDonations().forEach(function (d) {
            const name = (d.donorName || 'Unknown').trim();
            map[name] = (map[name] || 0) + Number(d.amount || 0);
        });

        const rows = Object.keys(map)
            .map(function (name) { return { name: name, amount: map[name] }; })
            .sort(function (a, b) { return b.amount - a.amount; });

        if (rows.length === 0) {
            card.innerHTML = '<div class="card-head"><h3><i class="fas fa-users"></i> Donor List</h3></div>' +
                '<div class="empty-msg" style="padding:12px"><i class="fas fa-user-slash"></i> No donors in filtered scope</div>';
            return;
        }

        let body = '';
        rows.slice(0, 25).forEach(function (row, idx) {
            body += '<tr><td>' + (idx + 1) + '</td><td>' + sanitizeText(row.name) + '</td><td style="text-align:right">' + money(row.amount) + '</td></tr>';
        });
        card.innerHTML = '<div class="card-head"><h3><i class="fas fa-users"></i> Donor List (Top)</h3></div>' +
            '<div class="table-wrap"><table class="responsive-table"><thead><tr><th>#</th><th>Donor</th><th style="text-align:right">Total Given</th></tr></thead><tbody>' + body + '</tbody></table></div>';
        applyResponsiveTableLabels();
    }
    window.renderDonorList = renderDonorList;

    function printReport() {
        const donations = getFilteredDonations();
        const expenses = getFilteredExpenses();
        const totalIn = donations.reduce(function (s, d) { return s + Number(d.amount || 0); }, 0);
        const totalOut = expenses.reduce(function (s, e) { return s + Number(e.amount || 0); }, 0);
        const balance = totalIn - totalOut;
        const monthly = getMonthlySummary(donations, expenses);

        const reportWindow = window.open('', '_blank', 'width=1024,height=720');
        if (!reportWindow) return;

        let rows = '';
        monthly.forEach(function (m) {
            rows += '<tr><td>' + sanitizeText(formatMonthKey(m.month)) + '</td><td>' + money(m.totalIn) + '</td><td>' + money(m.totalOut) + '</td><td>' + money(m.balance) + '</td></tr>';
        });

        reportWindow.document.write('<!DOCTYPE html><html><head><title>Trust Report</title>' +
            '<style>body{font-family:Arial,sans-serif;padding:24px}h1{margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:8px;text-align:left}.meta{display:flex;gap:20px;flex-wrap:wrap}.pill{padding:6px 10px;background:#f3f4f6;border-radius:6px}</style>' +
            '</head><body class="print-report-area">' +
            '<h1>' + sanitizeText(getSafeSettings().trustName || 'AL BADUSHA TRUST') + '</h1>' +
            '<p>Summary Report</p>' +
            '<div class="meta"><div class="pill">In: ' + money(totalIn) + '</div><div class="pill">Out: ' + money(totalOut) + '</div><div class="pill">Balance: ' + money(balance) + '</div><div class="pill">Scope: ' + sanitizeText(dashboardScope.toUpperCase()) + '</div></div>' +
            '<h3>Monthly Summary</h3><table><thead><tr><th>Month</th><th>Total In</th><th>Total Out</th><th>Balance</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<p style="margin-top:16px;font-size:12px">Generated on ' + new Date().toLocaleString('en-IN') + '</p>' +
            '<script>window.onload=function(){window.print();};</script>' +
            '</body></html>');
        reportWindow.document.close();
    }
    window.printReport = printReport;

    // =========================
    // PHASE 2: COUNTERS / ID / VOUCHERS
    // =========================
    function loadCounters() {
        if (!data.counters || typeof data.counters !== 'object') {
            data.counters = {};
        }
    }

    function saveCounters() {
        return save('counters', data.counters || {});
    }

    function normalizeFYForId(fyLabel) {
        const match = String(fyLabel || '').match(/^(\d{4})-(\d{2}|\d{4})$/);
        if (!match) {
            const now = new Date();
            const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
            return { start: y, end: y + 1 };
        }
        const start = Number(match[1]);
        let end = Number(match[2]);
        if (end < 100) end = Number(String(start).slice(0, 2) + String(end).padStart(2, '0'));
        return { start: start, end: end };
    }

    function nextFYId(type) {
        const fy = getCurrentFYLabel();
        const years = normalizeFYForId(fy);
        const key = String(type) + '_' + fy;
        const current = Number((data.counters && data.counters[key]) || 0);
        const next = current + 1;
        data.counters[key] = next;
        saveCounters();
        return String(type).toUpperCase() + '-' + years.end + '-' + String(next).padStart(3, '0');
    }
    window.nextFYId = nextFYId;

    function ensureFieldById(form, id, label, placeholder) {
        if (!form || document.getElementById(id)) return;
        const targetBody = form.querySelector('.modal-body');
        if (!targetBody) return;
        const row = document.createElement('div');
        row.className = 'form-row';
        row.innerHTML = '<div class="field">' +
            '<label>' + sanitizeText(label) + '</label>' +
            '<input type="text" id="' + sanitizeText(id) + '" placeholder="' + sanitizeText(placeholder || '') + '">' +
            '</div>';
        targetBody.appendChild(row);
    }

    function ensureExpansionFormFields() {
        const donForm = document.getElementById('donForm');
        const expForm = document.getElementById('expForm');
        ensureFieldById(donForm, 'donFormReferenceNo', 'Reference No', 'Bank ref / UTR / Cheque no');
        ensureFieldById(donForm, 'donFormLinkedExpenseId', 'Linked Expense ID', 'Optional');
        ensureFieldById(expForm, 'expFormReferenceNo', 'Reference No', 'Bill no / transaction ref');
        ensureFieldById(expForm, 'expFormLinkedDonationId', 'Linked Donation ID', 'Optional');
    }

    function copyRecordWithoutSystem(record) {
        const clone = {};
        Object.keys(record || {}).forEach(function (k) {
            if (k === 'id') return;
            clone[k] = record[k];
        });
        return clone;
    }

    function duplicateLastDonation() {
        if (!requireAdmin()) return;
        if (!data.donations || data.donations.length === 0) {
            showToast('No donation to duplicate', 'info');
            return;
        }
        const last = data.donations[data.donations.length - 1];
        const dup = copyRecordWithoutSystem(last);
        dup.id = nextFYId('REC');
        dup.date = new Date().toISOString().slice(0, 10);
        data.donations.push(dup);
        save('donations', data.donations);
        logActivity('DUPLICATE_DONATION', dup.id, 'Duplicated from ' + last.id);
        renderAll();
        showToast('Donation duplicated: ' + dup.id, 'success');
    }
    window.duplicateLastDonation = duplicateLastDonation;

    function duplicateLastExpense() {
        if (!requireAdmin()) return;
        if (!data.expenses || data.expenses.length === 0) {
            showToast('No expense to duplicate', 'info');
            return;
        }
        const last = data.expenses[data.expenses.length - 1];
        const dup = copyRecordWithoutSystem(last);
        dup.id = nextFYId('EXP');
        dup.date = new Date().toISOString().slice(0, 10);
        data.expenses.push(dup);
        save('expenses', data.expenses);
        logActivity('DUPLICATE_EXPENSE', dup.id, 'Duplicated from ' + last.id);
        renderAll();
        showToast('Expense duplicated: ' + dup.id, 'success');
    }
    window.duplicateLastExpense = duplicateLastExpense;

    function openExpenseVoucher(id) {
        const e = (data.expenses || []).find(function (x) { return x.id === id; });
        if (!e) {
            showToast('Expense not found', 'error');
            return;
        }

        voucherPrintContextId = id;
        const s = getSafeSettings();
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) return;

        w.document.write('<!DOCTYPE html><html><head><title>Expense Voucher</title>' +
            '<style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.45}.box{border:1px solid #ccc;border-radius:8px;padding:14px;margin-top:10px}h2{margin:0 0 10px}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #eee}.amt{font-size:24px;font-weight:700;color:#b91c1c}</style>' +
            '</head><body>' +
            '<h2>' + sanitizeText(s.trustName || 'AL BADUSHA TRUST') + '</h2>' +
            '<div>' + sanitizeText(s.address || '') + '</div>' +
            '<div class="box"><table>' +
            '<tr><td><strong>Voucher #</strong></td><td>' + sanitizeText(e.id) + '</td></tr>' +
            '<tr><td><strong>Date</strong></td><td>' + fmtDate(e.date) + '</td></tr>' +
            '<tr><td><strong>Description</strong></td><td>' + sanitizeText(e.description || '') + '</td></tr>' +
            '<tr><td><strong>Category</strong></td><td>' + sanitizeText(e.category || '') + '</td></tr>' +
            '<tr><td><strong>Paid To</strong></td><td>' + sanitizeText(e.paidTo || '-') + '</td></tr>' +
            '<tr><td><strong>Reference</strong></td><td>' + sanitizeText(e.referenceNo || '-') + '</td></tr>' +
            '<tr><td><strong>Linked Donation</strong></td><td>' + sanitizeText(e.linkedDonationId || '-') + '</td></tr>' +
            '<tr><td><strong>Bank</strong></td><td>' + sanitizeText((s.bankName || '-') + ' | ' + (s.bankAccount || '-')) + '</td></tr>' +
            '<tr><td colspan="2" class="amt">Amount: ' + money(e.amount || 0) + '</td></tr>' +
            '</table></div><p style="margin-top:18px;font-size:12px">Generated on ' + new Date().toLocaleString('en-IN') + '</p>' +
            '<script>window.onload=function(){window.print();};</script>' +
            '</body></html>');
        w.document.close();
    }
    window.openExpenseVoucher = openExpenseVoucher;

    function printExpenseVoucher() {
        if (!voucherPrintContextId) {
            showToast('No voucher selected', 'info');
            return;
        }
        openExpenseVoucher(voucherPrintContextId);
    }
    window.printExpenseVoucher = printExpenseVoucher;

    function getRunningBalanceMap() {
        const ledger = [];
        (data.donations || []).forEach(function (d) {
            ledger.push({ date: d.date, id: d.id, type: 'donation', amount: Number(d.amount || 0) });
        });
        (data.expenses || []).forEach(function (e) {
            ledger.push({ date: e.date, id: e.id, type: 'expense', amount: Number(e.amount || 0) });
        });
        ledger.sort(function (a, b) {
            const dt = new Date(a.date) - new Date(b.date);
            if (dt !== 0) return dt;
            if (a.type === b.type) return 0;
            return a.type === 'donation' ? -1 : 1;
        });
        let bal = 0;
        const map = {};
        ledger.forEach(function (row) {
            if (row.type === 'donation') bal += row.amount;
            else bal -= row.amount;
            map[row.id] = bal;
        });
        return map;
    }

    // =========================
    // PHASE 3: TOASTS / SETTINGS / EXPORTS / SECURITY
    // =========================
    function showToast(msg, type) {
        const toastType = type || 'info';
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = 'toast ' + toastType;
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-6px)';
            setTimeout(function () { toast.remove(); }, 250);
        }, 2400);
    }
    window.showToast = showToast;

    function t(key) {
        const lang = (getSafeSettings().language || 'en').toLowerCase();
        const table = LABELS[lang] || LABELS.en;
        return table[key] || (LABELS.en[key] || key);
    }
    window.t = t;

    function applyTheme() {
        const theme = (getSafeSettings().theme || 'light').toLowerCase();
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }
    window.applyTheme = applyTheme;

    function applyLanguage() {
        const lang = (getSafeSettings().language || 'en').toLowerCase();
        document.documentElement.lang = lang === 'ta' ? 'ta' : 'en';
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            const key = el.getAttribute('data-i18n');
            if (!key) return;
            el.textContent = t(key);
        });
    }
    window.applyLanguage = applyLanguage;

    function logActivity(action, recordId, details) {
        if (!Array.isArray(data.activityLog)) data.activityLog = [];
        data.activityLog.unshift({
            ts: new Date().toISOString(),
            user: sessionStorage.getItem('loggedUser') || 'system',
            action: action || 'UNKNOWN',
            recordId: recordId || '',
            details: details || ''
        });
        data.activityLog = data.activityLog.slice(0, 300);
        save('activityLog', data.activityLog).catch(function (err) {
            console.error('Failed to save activity log', err);
        });
    }
    window.logActivity = logActivity;

    function loadActivity() {
        if (!Array.isArray(data.activityLog)) data.activityLog = [];
    }

    function renderActivityLog() {
        if (!isAdmin()) return;
        const settingsTab = document.getElementById('settings');
        if (!settingsTab) return;
        let card = document.getElementById('activityLogCard');
        if (!card) {
            card = document.createElement('div');
            card.id = 'activityLogCard';
            card.className = 'card';
            card.style.marginTop = '20px';
            const backupSection = settingsTab.querySelector('.data-backup-section');
            if (backupSection && backupSection.parentNode) {
                backupSection.parentNode.insertBefore(card, backupSection);
            } else {
                settingsTab.querySelector('.card').appendChild(card);
            }
        }

        const rows = (data.activityLog || []).slice(0, 20);
        let html = '<div class="card-head"><h3><i class="fas fa-clipboard-list"></i> Activity Log</h3></div>';
        if (rows.length === 0) {
            html += '<div class="empty-msg" style="padding:12px"><i class="fas fa-info-circle"></i> ' + t('noActivity') + '</div>';
            card.innerHTML = html;
            return;
        }
        html += '<div class="activity-log">';
        rows.forEach(function (row) {
            html += '<div class="activity-item">' +
                '<strong>' + sanitizeText(row.action) + '</strong> ' +
                (row.recordId ? '<span>[' + sanitizeText(row.recordId) + ']</span> ' : '') +
                '<span>' + sanitizeText(row.details || '') + '</span>' +
                '<div>' + new Date(row.ts).toLocaleString('en-IN') + ' · ' + sanitizeText(row.user || 'system') + '</div>' +
                '</div>';
        });
        html += '</div>';
        card.innerHTML = html;
    }
    window.renderActivityLog = renderActivityLog;

    function changeMyPassword() {
        const username = sessionStorage.getItem('loggedUser');
        if (!username) return;

        const current = prompt('Enter current password');
        if (current === null) return;
        const next = prompt('Enter new password (min 4 chars)');
        if (next === null) return;
        if (next.length < 4) {
            showToast('Password must be at least 4 characters', 'error');
            return;
        }

        TrustAPI.changePassword(current, next)
            .then(function () {
                logActivity('CHANGE_PASSWORD', username, 'Password changed by self');
                showToast(t('passwordChanged'), 'success');
            })
            .catch(function (err) {
                showToast(err.message || 'Failed to change password', 'error');
            });
    }
    window.changeMyPassword = changeMyPassword;

    function clearAllData() {
        if (!requireAdmin()) return;
        if (!confirm('This will clear all trust data. Continue?')) return;
        if (!confirm('Please confirm again. This cannot be undone.')) return;

        const defaults = window.DEFAULT_SETTINGS || {
            trustName: 'AL BADUSHA TRUST',
            financialYear: '2025-26',
            trustees: ['Syed Al Badusha'],
            managingTrustee: 'Syed Al Badusha'
        };

        Promise.all([
            save('settings', defaults),
            save('donations', []),
            save('expenses', []),
            save('counters', {}),
            save('activityLog', [])
        ])
            .then(function () {
                showToast(t('cleared'), 'success');
                setTimeout(function () { location.reload(); }, 500);
            })
            .catch(function (err) {
                showToast('Failed to clear data: ' + err.message, 'error');
            });
    }
    window.clearAllData = clearAllData;

    function renderBackupWarning() {
        const section = document.querySelector('#settings .data-backup-section');
        if (!section) return;
        let box = document.getElementById('backupWarningBox');
        if (!box) {
            box = document.createElement('div');
            box.id = 'backupWarningBox';
            section.insertBefore(box, section.firstChild);
        }
        const s = getSafeSettings();
        if (!s.lastBackupDate) {
            box.innerHTML = '<div class="alert-banner danger"><i class="fas fa-triangle-exclamation"></i> ' + t('backupNever') + '</div>';
            return;
        }
        box.innerHTML = '<div class="alert-banner info"><i class="fas fa-shield-heart"></i> ' +
            t('backupLast') + ': ' + new Date(s.lastBackupDate).toLocaleString('en-IN') + '</div>';
    }
    window.renderBackupWarning = renderBackupWarning;

    function exportCSV(type) {
        if (!requireAdmin()) return;
        const target = (type || '').toLowerCase();
        let rows = [];
        if (target === 'donations') rows = getFilteredDonations();
        else if (target === 'expenses') rows = getFilteredExpenses();
        else {
            showToast('Use donations or expenses for CSV export', 'info');
            return;
        }
        if (rows.length === 0) {
            showToast('No records in current filter', 'info');
            return;
        }

        const keys = Object.keys(rows[0]);
        const lines = [keys.join(',')];
        rows.forEach(function (row) {
            const line = keys.map(function (k) {
                const v = row[k] == null ? '' : String(row[k]).replace(/"/g, '""');
                return '"' + v + '"';
            }).join(',');
            lines.push(line);
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'trust_' + target + '_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        logActivity('EXPORT_CSV', target, 'Rows: ' + rows.length);
    }
    window.exportCSV = exportCSV;

    function printTable(type) {
        const target = (type || '').toLowerCase();
        const rows = target === 'donations' ? getFilteredDonations() : target === 'expenses' ? getFilteredExpenses() : [];
        if (rows.length === 0) {
            showToast('No rows to print', 'info');
            return;
        }
        const columns = Object.keys(rows[0]);
        let htmlRows = '';
        rows.forEach(function (row) {
            htmlRows += '<tr>' + columns.map(function (col) {
                return '<td>' + sanitizeText(row[col]) + '</td>';
            }).join('') + '</tr>';
        });

        const w = window.open('', '_blank', 'width=1100,height=760');
        if (!w) return;
        w.document.write('<!DOCTYPE html><html><head><title>Print ' + sanitizeText(type) + '</title>' +
            '<style>body{font-family:Arial;padding:16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:6px}</style>' +
            '</head><body><h3>' + sanitizeText(type) + ' (Filtered)</h3><table><thead><tr>' +
            columns.map(function (c) { return '<th>' + sanitizeText(c) + '</th>'; }).join('') +
            '</tr></thead><tbody>' + htmlRows + '</tbody></table><script>window.onload=function(){window.print();};</script></body></html>');
        w.document.close();
    }
    window.printTable = printTable;

    function exportExcelFiltered() {
        if (!requireAdmin()) return;
        if (typeof XLSX === 'undefined') {
            showToast('Excel library not loaded', 'error');
            return;
        }
        const donations = getFilteredDonations();
        const expenses = getFilteredExpenses();
        const totalIn = donations.reduce(function (s, d) { return s + Number(d.amount || 0); }, 0);
        const totalOut = expenses.reduce(function (s, e) { return s + Number(e.amount || 0); }, 0);

        const summaryRows = [
            ['AL BADUSHA TRUST - Filtered Summary'],
            ['Scope', dashboardScope],
            ['Period', filterState.period],
            ['Category', filterState.category],
            ['Exported', new Date().toLocaleString('en-IN')],
            [],
            ['Total Received', totalIn],
            ['Total Spent', totalOut],
            ['Balance', totalIn - totalOut]
        ];
        const donRows = [['Receipt #', 'Date', 'Donor', 'Amount', 'Purpose', 'Mode', 'Reference']];
        donations.forEach(function (d) {
            donRows.push([d.id, fmtDate(d.date), d.donorName, d.amount, d.purpose, d.mode, d.referenceNo || '']);
        });
        const expRows = [['Voucher #', 'Date', 'Description', 'Category', 'Amount', 'Paid To', 'Reference']];
        expenses.forEach(function (e) {
            expRows.push([e.id, fmtDate(e.date), e.description, e.category, e.amount, e.paidTo || '', e.referenceNo || '']);
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(donRows), 'Donations');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), 'Expenses');
        XLSX.writeFile(wb, 'al_badusha_trust_filtered_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        logActivity('EXPORT_EXCEL', 'filtered', 'Don: ' + donations.length + ', Exp: ' + expenses.length);
    }

    function resetActivityTimer() {
        if (sessionTimer) clearTimeout(sessionTimer);
        sessionTimer = setTimeout(function () {
            showToast('Session timed out due to inactivity', 'info');
            if (typeof _logout === 'function') _logout();
        }, SESSION_TIMEOUT_MS);
    }
    window.resetActivityTimer = resetActivityTimer;

    function setupSessionTimeout() {
        ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(function (evt) {
            document.addEventListener(evt, resetActivityTimer, { passive: true });
        });
        resetActivityTimer();
    }

    function setupUnsavedFormGuard() {
        ['donForm', 'expForm', 'userForm'].forEach(function (id) {
            const form = document.getElementById(id);
            if (!form) return;
            form.addEventListener('input', function (e) {
                if (e.isTrusted) modalDirtyState[id] = true;
            });
            form.addEventListener('change', function (e) {
                if (e.isTrusted) modalDirtyState[id] = true;
            });
            form.addEventListener('submit', function () { modalDirtyState[id] = false; });
        });

        window.addEventListener('beforeunload', function (e) {
            if (modalDirtyState.donForm || modalDirtyState.expForm || modalDirtyState.userForm) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    // =========================
    // SETTINGS FIELD EXTENSION
    // =========================
    function ensureSettingsExtraFields() {
        const settingsForm = document.querySelector('#settings form');
        if (!settingsForm || document.getElementById('setBankName')) return;

        const block = document.createElement('div');
        block.innerHTML = [
            '<div class="form-row"><div class="field"><label>Bank Name</label><input type="text" id="setBankName"></div><div class="field"><label>Bank Account</label><input type="text" id="setBankAccount"></div></div>',
            '<div class="form-row"><div class="field"><label>IFSC</label><input type="text" id="setIfsc"></div><div class="field"><label>Low Balance Alert (₹)</label><input type="number" id="setLowBalanceAlert" min="0" step="1"></div></div>',
            '<div class="form-row"><div class="field"><label>Theme</label><select id="setTheme"><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="field"><label>Language</label><select id="setLanguage"><option value="en">English</option><option value="ta">Tamil</option></select></div></div>',
            '<div class="form-row full"><div class="field"><label>Tax Note</label><textarea id="setTaxNote" rows="2" placeholder="Optional tax statement for receipts"></textarea></div></div>'
        ].join('');
        settingsForm.insertBefore(block, settingsForm.querySelector('div[style*="margin-top:20px"]'));
    }

    function loadSettingsExpanded() {
        if (typeof _loadSettings === 'function') _loadSettings();
        ensureSettingsExtraFields();
        const s = getSafeSettings();
        const setVal = function (id, value) {
            const el = document.getElementById(id);
            if (el) el.value = value || '';
        };
        setVal('setBankName', s.bankName);
        setVal('setBankAccount', s.bankAccount);
        setVal('setIfsc', s.ifsc);
        setVal('setTaxNote', s.taxNote);
        setVal('setLowBalanceAlert', s.lowBalanceAlert || 0);
        setVal('setLanguage', s.language || 'en');
        setVal('setTheme', s.theme || 'light');

        applyTheme();
        applyLanguage();
        renderBackupWarning();
    }
    window.loadSettings = loadSettingsExpanded;

    function saveSettingsExpanded(e) {
        if (!requireAdmin()) return;
        if (e && typeof e.preventDefault === 'function') e.preventDefault();

        ensureSettingsExtraFields();
        const inputs = document.querySelectorAll('.trustee-name-input');
        const trusteesList = Array.from(inputs).map(function (inp) { return inp.value.trim(); }).filter(function (val) { return val !== ''; });

        data.settings = {
            trustName: document.getElementById('setName').value,
            address: document.getElementById('setAddress').value,
            email: document.getElementById('setEmail').value,
            phone: document.getElementById('setPhone').value,
            pan: document.getElementById('setPan').value,
            regNumber: document.getElementById('setReg').value,
            managingTrustee: trusteesList[0] || 'Syed Al Badusha',
            trustees: trusteesList,
            financialYear: document.getElementById('setFY').value,
            bankName: (document.getElementById('setBankName') || {}).value || '',
            bankAccount: (document.getElementById('setBankAccount') || {}).value || '',
            ifsc: (document.getElementById('setIfsc') || {}).value || '',
            taxNote: (document.getElementById('setTaxNote') || {}).value || '',
            lowBalanceAlert: Number((document.getElementById('setLowBalanceAlert') || {}).value || 0),
            language: ((document.getElementById('setLanguage') || {}).value || 'en').toLowerCase(),
            theme: ((document.getElementById('setTheme') || {}).value || 'light').toLowerCase(),
            lastBackupDate: getSafeSettings().lastBackupDate || null
        };
        save('settings', data.settings)
            .then(function () {
                applyTheme();
                applyLanguage();
                renderBackupWarning();
                modalDirtyState.settingsForm = false;
                logActivity('SAVE_SETTINGS', 'settings', 'Settings saved');
                showToast(t('settingsSaved'), 'success');
                populateSignatoryDropdown();
                renderAll();
            })
            .catch(function (err) {
                showToast('Failed to save settings: ' + err.message, 'error');
            });
    }
    window.saveSettings = saveSettingsExpanded;

    // =========================
    // WRAP EXISTING CRUD FLOWS
    // =========================
    window.openAddDonation = function () {
        ensureExpansionFormFields();
        modalDirtyState.donForm = false;
        if (typeof _openAddDonation === 'function') _openAddDonation();
        const idEl = document.getElementById('donFormId');
        if (idEl) idEl.value = nextFYId('REC');
        modalDirtyState.donForm = false;
    };

    window.openAddExpense = function () {
        ensureExpansionFormFields();
        modalDirtyState.expForm = false;
        if (typeof _openAddExpense === 'function') _openAddExpense();
        const idEl = document.getElementById('expFormId');
        if (idEl) idEl.value = nextFYId('EXP');
        modalDirtyState.expForm = false;
    };

    window.editDonation = function (id) {
        ensureExpansionFormFields();
        if (typeof _editDonation === 'function') _editDonation(id);
        const d = (data.donations || []).find(function (x) { return x.id === id; });
        if (!d) return;
        const ref = document.getElementById('donFormReferenceNo');
        const linked = document.getElementById('donFormLinkedExpenseId');
        if (ref) ref.value = d.referenceNo || '';
        if (linked) linked.value = d.linkedExpenseId || '';
        modalDirtyState.donForm = false;
    };

    window.editExpense = function (id) {
        ensureExpansionFormFields();
        if (typeof _editExpense === 'function') _editExpense(id);
        const e = (data.expenses || []).find(function (x) { return x.id === id; });
        if (!e) return;
        const ref = document.getElementById('expFormReferenceNo');
        const linked = document.getElementById('expFormLinkedDonationId');
        if (ref) ref.value = e.referenceNo || '';
        if (linked) linked.value = e.linkedDonationId || '';
        modalDirtyState.expForm = false;
    };

    window.finishSaveDonation = function (donation) {
        donation.referenceNo = (document.getElementById('donFormReferenceNo') || {}).value || donation.referenceNo || '';
        donation.linkedExpenseId = (document.getElementById('donFormLinkedExpenseId') || {}).value || donation.linkedExpenseId || '';
        logActivity('SAVE_DONATION', donation.id, donation.donorName || '');
        modalDirtyState.donForm = false;
        if (typeof _finishSaveDonation === 'function') _finishSaveDonation(donation);
        showToast('Donation saved', 'success');
    };

    window.finishSaveExpense = function (expense) {
        expense.referenceNo = (document.getElementById('expFormReferenceNo') || {}).value || expense.referenceNo || '';
        expense.linkedDonationId = (document.getElementById('expFormLinkedDonationId') || {}).value || expense.linkedDonationId || '';
        logActivity('SAVE_EXPENSE', expense.id, expense.description || '');
        modalDirtyState.expForm = false;
        if (typeof _finishSaveExpense === 'function') _finishSaveExpense(expense);
        showToast('Expense saved', 'success');
    };

    window.closeDonModal = function () {
        if (modalDirtyState.donForm && !confirm('Discard unsaved donation changes?')) return;
        modalDirtyState.donForm = false;
        if (typeof _closeDonModal === 'function') _closeDonModal();
    };

    window.closeExpModal = function () {
        if (modalDirtyState.expForm && !confirm('Discard unsaved expense changes?')) return;
        modalDirtyState.expForm = false;
        if (typeof _closeExpModal === 'function') _closeExpModal();
    };

    window.closeUserModal = function () {
        if (modalDirtyState.userForm && !confirm('Discard unsaved user changes?')) return;
        modalDirtyState.userForm = false;
        if (typeof _closeUserModal === 'function') _closeUserModal();
    };

    window.importData = function (event) {
        if (!requireAdmin()) return;
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
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
                                loadSettings();
                                applyTheme();
                                applyLanguage();
                                renderBackupWarning();
                                renderAll();
                                showToast('Data restored successfully', 'success');
                                logActivity('IMPORT_BACKUP', 'settings', 'Backup restored');
                            })
                            .catch(function (err) {
                                showToast('Failed to restore backup: ' + err.message, 'error');
                            });
                    }
                } else {
                    showToast('Invalid backup file format', 'error');
                }
            } catch (error) {
                showToast('Error reading backup file', 'error');
                console.error(error);
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    };

    window.exportData = function () {
        if (!requireAdmin()) return;
        const s = getSafeSettings();
        s.lastBackupDate = new Date().toISOString();
        save('settings', s)
            .then(function () {
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
                const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
                const a = document.createElement('a');
                a.setAttribute('href', dataStr);
                a.setAttribute('download', 'al_badusha_trust_backup_' + new Date().toISOString().split('T')[0] + '.json');
                document.body.appendChild(a);
                a.click();
                a.remove();
                renderBackupWarning();
                logActivity('EXPORT_BACKUP', 'settings', 'Backup file exported');
                showToast('Backup exported', 'success');
            })
            .catch(function (err) {
                showToast('Failed to export backup: ' + err.message, 'error');
            });
    };

    window.exportExcel = function () {
        exportExcelFiltered();
    };

    // =========================
    // TABLE OVERRIDES (RUNNING BALANCE)
    // =========================
    function renderDonationsExpanded() {
        const body = document.getElementById('donBody');
        if (!body) return;
        body.innerHTML = '';

        renderFilterBar('donations', 'donations');

        const q = ((document.getElementById('donSearch') || {}).value || '').toLowerCase();
        const runningMap = getRunningBalanceMap();
        const filtered = getFilteredDonations().filter(function (d) {
            return (d.donorName || '').toLowerCase().includes(q) ||
                (d.id || '').toLowerCase().includes(q) ||
                (d.purpose || '').toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
            const total = (data.donations || []).length;
            const hint = total > 0
                ? ' (' + total + ' saved — change Period to <strong>All Dates</strong> or click Reset)'
                : '';
            body.innerHTML = '<tr><td colspan="7" class="empty-msg"><i class="fas fa-hand-holding-heart"></i> No donations match filters' + hint + '</td></tr>';
            renderDonorList();
            return;
        }

        filtered.forEach(function (d) {
            const idJson = JSON.stringify(d.id);
            const attachBtn = d.attachment
                ? '<button class="btn btn-outline btn-sm" onclick="viewAttachment(' + JSON.stringify(d.attachment) + ')"><i class="fas fa-paperclip"></i> Proof</button>'
                : '';
            body.innerHTML += '<tr>' +
                '<td><strong>' + sanitizeText(d.id) + '</strong></td>' +
                '<td>' + fmtDate(d.date) + '</td>' +
                '<td><strong>' + sanitizeText(d.donorName) + '</strong><div style="font-size:11px;color:var(--text-muted)">' + sanitizeText(d.donorPhone || '') + '</div></td>' +
                '<td><span class="badge ' + (d.mode === 'Cash' ? 'badge-cash' : 'badge-bank') + '">' + sanitizeText(d.mode) + '</span></td>' +
                '<td><span class="badge ' + getBadgeClass(d.purpose) + '">' + sanitizeText(d.purpose) + '</span><div style="font-size:11px;color:var(--text-muted)">Ref: ' + sanitizeText(d.referenceNo || '-') + '</div></td>' +
                '<td class="amount green" style="text-align:right">' + money(d.amount) + '<div style="font-size:11px;color:var(--text-muted)">Bal: ' + money(runningMap[d.id] || 0) + '</div></td>' +
                '<td style="text-align:right">' +
                attachBtn +
                '<button class="btn btn-outline btn-sm" onclick="editDonation(' + idJson + ')"><i class="fas fa-edit"></i> Edit</button>' +
                '<button class="btn btn-outline btn-sm" onclick="openReceipt(' + idJson + ')"><i class="fas fa-print"></i> Receipt</button>' +
                '<button class="btn btn-danger btn-sm" onclick="deleteDonation(' + idJson + ')"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
        });

        renderDonorList();
        applyResponsiveTableLabels();
    }

    function renderExpensesExpanded() {
        const body = document.getElementById('expBody');
        if (!body) return;
        body.innerHTML = '';

        renderFilterBar('expenses', 'expenses');

        const q = ((document.getElementById('expSearch') || {}).value || '').toLowerCase();
        const runningMap = getRunningBalanceMap();
        const filtered = getFilteredExpenses().filter(function (e) {
            return (e.description || '').toLowerCase().includes(q) ||
                (e.id || '').toLowerCase().includes(q) ||
                (e.category || '').toLowerCase().includes(q) ||
                (e.paidTo || '').toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
            const total = (data.expenses || []).length;
            const hint = total > 0
                ? ' (' + total + ' saved — change Period to <strong>All Dates</strong> or click Reset)'
                : '';
            body.innerHTML = '<tr><td colspan="7" class="empty-msg"><i class="fas fa-receipt"></i> No expenses match filters' + hint + '</td></tr>';
            return;
        }

        filtered.forEach(function (e) {
            const idJson = JSON.stringify(e.id);
            const adminActions = isAdmin()
                ? (e.attachment ? '<button class="btn btn-outline btn-sm" onclick="viewAttachment(' + JSON.stringify(e.attachment) + ')"><i class="fas fa-file-invoice"></i> Bill</button>' : '') +
                    '<button class="btn btn-outline btn-sm" onclick="openExpenseVoucher(' + idJson + ')"><i class="fas fa-print"></i> Voucher</button>' +
                    '<button class="btn btn-outline btn-sm" onclick="editExpense(' + idJson + ')"><i class="fas fa-edit"></i> Edit</button>' +
                    '<button class="btn btn-danger btn-sm" onclick="deleteExpense(' + idJson + ')"><i class="fas fa-trash"></i></button>'
                : (e.attachment ? '<button class="btn btn-outline btn-sm" onclick="viewAttachment(' + JSON.stringify(e.attachment) + ')"><i class="fas fa-file-invoice"></i> Bill</button>' : '');

            body.innerHTML += '<tr>' +
                '<td><strong>' + sanitizeText(e.id) + '</strong></td>' +
                '<td>' + fmtDate(e.date) + '</td>' +
                '<td>' + sanitizeText(e.description) + '<div style="font-size:11px;color:var(--text-muted)">Ref: ' + sanitizeText(e.referenceNo || '-') + '</div></td>' +
                '<td><span class="badge ' + getBadgeClass(e.category) + '">' + sanitizeText(e.category) + '</span></td>' +
                '<td style="font-size:12px;color:var(--text-muted)">' + sanitizeText(e.paidTo) + '</td>' +
                '<td class="amount red" style="text-align:right">' + money(e.amount) + '<div style="font-size:11px;color:var(--text-muted)">Bal: ' + money(runningMap[e.id] || 0) + '</div></td>' +
                '<td style="text-align:right">' + adminActions + '</td>' +
                '</tr>';
        });

        applyResponsiveTableLabels();
    }

    window.renderDonations = renderDonationsExpanded;
    window.renderExpenses = renderExpensesExpanded;

    const _renderAllExpansion = window.renderAll;
    if (typeof _renderAllExpansion === 'function') {
        window.renderAll = function () {
            _renderAllExpansion();
            applyResponsiveTableLabels();
        };
    }

    // =========================
    // PHASE 4: MOBILE / SHORTCUTS / INIT
    // =========================
    function applyResponsiveTableLabels() {
        document.querySelectorAll('.responsive-table').forEach(function (table) {
            const headers = Array.from(table.querySelectorAll('thead th')).map(function (th) {
                return (th.textContent || '').trim();
            });
            table.querySelectorAll('tbody tr').forEach(function (tr) {
                tr.querySelectorAll('td').forEach(function (td, index) {
                    if (td.hasAttribute('colspan')) {
                        td.removeAttribute('data-label');
                        return;
                    }
                    if (headers[index]) td.setAttribute('data-label', headers[index]);
                });
            });
        });
    }
    window.applyResponsiveTableLabels = applyResponsiveTableLabels;

    function toggleMobileMenu() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (!sidebar || !overlay) return;
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    }
    window.toggleMobileMenu = toggleMobileMenu;

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', function (e) {
            const ctrl = e.ctrlKey || e.metaKey;
            if (!ctrl) return;

            if (e.key.toLowerCase() === 'd') {
                e.preventDefault();
                if (isAdmin()) openAddDonation();
            } else if (e.key.toLowerCase() === 'e') {
                e.preventDefault();
                if (isAdmin()) openAddExpense();
            } else if (e.key.toLowerCase() === 'p') {
                e.preventDefault();
                printReport();
            } else if (e.key.toLowerCase() === 'b') {
                e.preventDefault();
                if (isAdmin()) exportData();
            }
        });
    }
    window.setupKeyboardShortcuts = setupKeyboardShortcuts;

    function addQuickActionButtons() {
        const donActionBar = document.querySelector('#donations .action-bar');
        if (donActionBar && !document.getElementById('donQuickActions')) {
            const box = document.createElement('div');
            box.id = 'donQuickActions';
            box.style.display = 'flex';
            box.style.gap = '8px';
            box.innerHTML = '<button class="btn btn-outline btn-sm" onclick="duplicateLastDonation()"><i class="fas fa-copy"></i> Duplicate Last</button>' +
                '<button class="btn btn-outline btn-sm" onclick="exportCSV(\'donations\')"><i class="fas fa-file-csv"></i> CSV</button>' +
                '<button class="btn btn-outline btn-sm" onclick="printTable(\'donations\')"><i class="fas fa-print"></i> Print</button>';
            donActionBar.appendChild(box);
        }

        const expActionBar = document.querySelector('#expenses .action-bar');
        if (expActionBar && !document.getElementById('expQuickActions')) {
            const box = document.createElement('div');
            box.id = 'expQuickActions';
            box.style.display = 'flex';
            box.style.gap = '8px';
            box.innerHTML = '<button class="btn btn-outline btn-sm" onclick="duplicateLastExpense()"><i class="fas fa-copy"></i> Duplicate Last</button>' +
                '<button class="btn btn-outline btn-sm" onclick="exportCSV(\'expenses\')"><i class="fas fa-file-csv"></i> CSV</button>' +
                '<button class="btn btn-outline btn-sm" onclick="printTable(\'expenses\')"><i class="fas fa-print"></i> Print</button>';
            expActionBar.appendChild(box);
        }

        const backupSection = document.querySelector('#settings .data-backup-section .backup-actions');
        if (backupSection && !document.getElementById('expansionSettingsActions')) {
            const row = document.createElement('div');
            row.id = 'expansionSettingsActions';
            row.style.display = 'flex';
            row.style.gap = '12px';
            row.style.flexWrap = 'wrap';
            row.style.marginTop = '12px';
            row.innerHTML = '<button class="btn btn-outline" onclick="changeMyPassword()"><i class="fas fa-key"></i> Change My Password</button>' +
                '<button class="btn btn-danger" onclick="clearAllData()"><i class="fas fa-trash"></i> Clear All Data</button>';
            backupSection.parentNode.appendChild(row);
        }
    }

    function fixStaleFiltersIfNeeded() {
        ensureFilterStateShape();
        if (filterState.period === 'all') return;
        const donations = Array.isArray(data.donations) ? data.donations : [];
        const expenses = Array.isArray(data.expenses) ? data.expenses : [];
        if (donations.length === 0 && expenses.length === 0) return;
        const range = getDateRangeFromFilter();
        const visibleDon = filterByDateRange(donations, range.from, range.to).length;
        const visibleExp = filterByDateRange(expenses, range.from, range.to).length;
        if (visibleDon === 0 && visibleExp === 0) {
            filterState.period = 'all';
            filterState.category = 'All';
            saveFilterState();
            applyFilters();
            showToast('Showing all records — previous date filter hid your entries', 'info');
        }
    }

    function initExpansion() {
        ensureFilterStateShape();
        ensureExpansionFormFields();
        ensureSettingsExtraFields();
        loadCounters();
        loadActivity();
        addQuickActionButtons();
        setupKeyboardShortcuts();
        setupSessionTimeout();
        setupUnsavedFormGuard();

        document.querySelectorAll('.nav-btn[data-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const sidebar = document.getElementById('sidebar');
                const overlay = document.getElementById('sidebarOverlay');
                if (sidebar) sidebar.classList.remove('open');
                if (overlay) overlay.classList.remove('open');
            });
        });

        applyTheme();
        applyLanguage();
        renderBackupWarning();

        // Ensure wrappers are used and UI reflects filtered scope.
        setTimeout(function () {
            fixStaleFiltersIfNeeded();
            if (typeof window.renderAll === 'function') window.renderAll();
        }, 50);
        logActivity('INIT_EXPANSION', '', 'Expansion initialized');
    }
    window.initExpansion = initExpansion;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExpansion);
    } else {
        initExpansion();
    }

    // Keep references for debugging if needed.
    window.__expansionOriginals = {
        _renderDashboard: _renderDashboard,
        _renderDonations: _renderDonations,
        _renderExpenses: _renderExpenses,
        _openAddDonation: _openAddDonation,
        _openAddExpense: _openAddExpense,
        _loadSettings: _loadSettings,
        _saveSettings: _saveSettings,
        _exportData: _exportData,
        _exportExcel: _exportExcel
    };
})();
