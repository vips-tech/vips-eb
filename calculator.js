/* ============================================================
   TNEB Bill Calculator – calculator.js
   TANGEDCO LT-1 Domestic Tariff (2022) + 2026 CM 200 Units Free Scheme
   ============================================================ */

'use strict';

/* ── Tariff Configuration ──────────────────────────────────── */

/**
 * TWO separate slab structures depending on total consumption:
 *
 * ≤ 500 units — Old CM Tariff (100 units free)
 * ≤ 500 units — New CM Tariff (200 units free)
 *
 * > 500 units — Old & New CM Tariff are IDENTICAL (100 units free)
 */

// Used when total consumption ≤ 500 — Old scheme (100 free)
const SLABS_BELOW500_OLD = [
  { upTo: 100, rate: 0.00 },   // 0–100   : Free
  { upTo: 200, rate: 2.35 },   // 101–200 : ₹2.35/unit
  { upTo: 400, rate: 4.70 },   // 201–400 : ₹4.70/unit
  { upTo: 500, rate: 6.30 },   // 401–500 : ₹6.30/unit
];

// Used when total consumption ≤ 500 — New scheme (200 free)
const SLABS_BELOW500_NEW = [
  { upTo: 200, rate: 0.00 },   // 0–200   : Free
  { upTo: 400, rate: 4.70 },   // 201–400 : ₹4.70/unit
  { upTo: 500, rate: 6.30 },   // 401–500 : ₹6.30/unit
];

// Used when total consumption > 500 — Old & New are identical (100 free)
const SLABS_ABOVE500 = [
  { upTo: 100,      rate: 0.00  },   // 0–100    : Free
  { upTo: 400,      rate: 4.70  },   // 101–400  : ₹4.70/unit
  { upTo: 500,      rate: 6.30  },   // 401–500  : ₹6.30/unit
  { upTo: 600,      rate: 8.40  },   // 501–600  : ₹8.40/unit
  { upTo: 800,      rate: 9.45  },   // 601–800  : ₹9.45/unit
  { upTo: 1000,     rate: 10.50 },   // 801–1000 : ₹10.50/unit
  { upTo: Infinity, rate: 11.55 },   // 1000+    : ₹11.55/unit
];

/**
 * Fixed charges (bi-monthly) based on total consumption
 * TNEB domestic tariff does not apply a separate fixed charge —
 * all charges are covered by the energy slab rates.
 */
function getFixedCharge(units) {
  return 0;
}

/* ── Core Billing Engine ───────────────────────────────────── */

/**
 * Walk through a given slab table and calculate energy charge.
 * The slab table already encodes the free units (rate = 0 for free slabs).
 *
 * @param {number} totalUnits - Total units consumed
 * @param {Array}  slabs      - Slab table to use
 * @returns {{ rows: Array, energyCharge: number }}
 */
function calcSlabCharge(totalUnits, slabs) {
  const rows = [];
  let energyCharge = 0;
  let prevBoundary = 0;
  let unitsCounted = 0;

  for (const slab of slabs) {
    if (unitsCounted >= totalUnits) break;

    const slabMax      = slab.upTo === Infinity ? totalUnits : Math.min(slab.upTo, totalUnits);
    const slabCapacity = slabMax - unitsCounted;

    if (slabCapacity <= 0) {
      prevBoundary = slab.upTo === Infinity ? totalUnits : slab.upTo;
      continue;
    }

    const amount = +(slabCapacity * slab.rate).toFixed(2);
    energyCharge += amount;

    rows.push({
      slab:   slab.upTo === Infinity
                ? `${prevBoundary + 1} & above`
                : `${prevBoundary + 1} – ${slab.upTo}`,
      units:  slabCapacity,
      rate:   slab.rate,
      amount: amount,
      isFree: slab.rate === 0
    });

    unitsCounted  = slabMax;
    prevBoundary  = slab.upTo === Infinity ? totalUnits : slab.upTo;
  }

  return { rows, energyCharge: +energyCharge.toFixed(2) };
}

/**
 * OLD BILL:
 * - ≤ 500 units → use SLABS_BELOW500_OLD (0–100 free, then 2.35/4.70/6.30)
 * - > 500 units → use SLABS_ABOVE500     (0–100 free, then 4.70/6.30/8.40/9.45/10.50/11.55)
 */
function calcOldBill(units) {
  const slabs       = units <= 500 ? SLABS_BELOW500_OLD : SLABS_ABOVE500;
  const freeUnits   = 100;
  const billable    = Math.max(0, units - freeUnits);
  const { rows, energyCharge } = calcSlabCharge(units, slabs);
  const fixedCharge = getFixedCharge(units);
  const totalAmount = +(energyCharge + fixedCharge).toFixed(2);

  return {
    units, freeUnits, billable,
    energyCharge, fixedCharge, totalAmount,
    rows,
    scheme: 'Old CM Tariff'
  };
}

/**
 * NEW BILL (2026 CM Vijay Scheme):
 * - ≤ 500 units → use SLABS_BELOW500_NEW (0–200 free, then 4.70/6.30)
 * - > 500 units → use SLABS_ABOVE500     (0–100 free, same as old — UNCHANGED)
 */
function calcNewBill(units) {
  const eligible    = units <= 500;
  const slabs       = eligible ? SLABS_BELOW500_NEW : SLABS_ABOVE500;
  const freeUnits   = eligible ? 200 : 100;
  const billable    = Math.max(0, units - freeUnits);
  const { rows, energyCharge } = calcSlabCharge(units, slabs);
  const fixedCharge = getFixedCharge(units);
  const totalAmount = +(energyCharge + fixedCharge).toFixed(2);

  return {
    units, freeUnits, billable, eligible,
    energyCharge, fixedCharge, totalAmount,
    rows,
    scheme: eligible ? 'New CM Tariff (200 Units Free – 2026)' : 'New CM Tariff (>500 units – Unchanged)'
  };
}

/* ── Chart Instances ───────────────────────────────────────── */
let barChartInstance = null;
let pieChartInstance = null;

/* ── Animated Counter ──────────────────────────────────────── */
/**
 * Animate a number from 0 to target in the given element.
 * @param {HTMLElement} el
 * @param {number} target
 * @param {number} duration ms
 */
function animateCounter(el, target, duration = 800) {
  const start     = performance.now();
  const startVal  = 0;

  function step(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased    = 1 - Math.pow(1 - progress, 3);
    const current  = Math.round(startVal + (target - startVal) * eased);
    el.textContent = '₹' + current.toLocaleString('en-IN');
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ── Chart Rendering ───────────────────────────────────────── */

/** Render bar chart comparing old vs new bill */
function renderBarChart(oldBill, newBill) {
  const ctx = document.getElementById('barChart').getContext('2d');
  if (barChartInstance) barChartInstance.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const labelColor = isDark ? '#9aa0b8' : '#4a5060';

  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Old Bill\n(100 Free)', 'New Bill\n(200 Free)', 'Savings'],
      datasets: [{
        label: 'Amount (₹)',
        data: [oldBill.totalAmount, newBill.totalAmount, oldBill.totalAmount - newBill.totalAmount],
        backgroundColor: [
          'rgba(211, 47, 47, 0.80)',
          'rgba(46, 125, 50, 0.80)',
          'rgba(230, 81, 0, 0.80)'
        ],
        borderColor: ['#d32f2f', '#2e7d32', '#e65100'],
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ₹' + ctx.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 })
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: labelColor, font: { size: 11 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: labelColor,
            font: { size: 11 },
            callback: v => '₹' + v.toLocaleString('en-IN')
          },
          beginAtZero: true
        }
      }
    }
  });
}

/** Render pie chart showing savings vs amount payable */
function renderPieChart(oldBill, newBill) {
  const ctx = document.getElementById('pieChart').getContext('2d');
  if (pieChartInstance) pieChartInstance.destroy();

  const savings    = +(oldBill.totalAmount - newBill.totalAmount).toFixed(2);
  const payable    = newBill.totalAmount;
  const isDark     = document.documentElement.getAttribute('data-theme') === 'dark';
  const labelColor = isDark ? '#9aa0b8' : '#4a5060';

  pieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Amount Payable', 'Savings'],
      datasets: [{
        data: [payable, savings],
        backgroundColor: ['rgba(46,125,50,0.85)', 'rgba(230,81,0,0.85)'],
        borderColor: ['#2e7d32', '#e65100'],
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: labelColor,
            font: { size: 12 },
            padding: 16,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ' ₹' + ctx.parsed.toLocaleString('en-IN', { minimumFractionDigits: 2 })
          }
        }
      }
    }
  });
}

/* ── Breakdown Table Rendering ─────────────────────────────── */

/**
 * Populate a breakdown table body with slab rows.
 * @param {string} tbodyId  - ID of <tbody>
 * @param {string} tfootId  - ID of <tfoot>
 * @param {object} bill     - Bill object from calcOldBill / calcNewBill
 */
function renderBreakdownTable(tbodyId, tfootId, bill) {
  const tbody = document.getElementById(tbodyId);
  const tfoot = document.getElementById(tfootId);
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  bill.rows.forEach(row => {
    const tr = document.createElement('tr');
    if (row.isFree) tr.classList.add('free-row');
    tr.innerHTML = `
      <td>${row.slab}</td>
      <td>${row.units} units</td>
      <td>${row.isFree ? 'FREE' : '₹' + row.rate.toFixed(2)}</td>
      <td>${row.isFree ? '₹0.00' : '₹' + row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    `;
    tbody.appendChild(tr);
  });

  // Fixed charge row
  if (bill.fixedCharge > 0) {
    const fcRow = document.createElement('tr');
    fcRow.innerHTML = `
      <td colspan="3">Fixed Charge (Bi-Monthly)</td>
      <td>₹${bill.fixedCharge.toFixed(2)}</td>
    `;
    tbody.appendChild(fcRow);
  }

  // Footer total
  tfoot.innerHTML = `
    <tr>
      <td colspan="3"><strong>Total Bill Amount</strong></td>
      <td><strong>₹${bill.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
    </tr>
  `;
}

/* ── Tab Switching ─────────────────────────────────────────── */
function switchTab(tab) {
  document.getElementById('oldBreakdown').style.display = tab === 'old' ? 'block' : 'none';
  document.getElementById('newBreakdown').style.display = tab === 'new' ? 'block' : 'none';
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', (i === 0 && tab === 'old') || (i === 1 && tab === 'new'));
  });
}

/* ── Breakdown Toggle ──────────────────────────────────────── */
let breakdownOpen = false;
function toggleBreakdown() {
  breakdownOpen = !breakdownOpen;
  document.getElementById('breakdownContent').style.display = breakdownOpen ? 'block' : 'none';
  document.getElementById('breakdownToggleText').textContent =
    breakdownOpen ? 'Hide Details ▲' : 'Show Details ▼';
}

/* ── Eligibility Banner ────────────────────────────────────── */
function updateEligibilityBanner(units) {
  const banner = document.getElementById('eligibilityBanner');
  const icon   = document.getElementById('eligIcon');
  const text   = document.getElementById('eligText');

  if (!units || units <= 0) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';
  if (units <= 500) {
    banner.className = 'eligibility-banner eligible';
    icon.textContent = '✅';
    text.innerHTML   = `<strong>Eligible for 200 Units Free Scheme!</strong> Your consumption (${units} units) is within the 500-unit limit.`;
  } else {
    banner.className = 'eligibility-banner ineligible';
    icon.textContent = '⚠️';
    text.innerHTML   = `<strong>Not eligible for 200 Units Free Scheme.</strong> Your consumption (${units} units) exceeds 500 units. Old 100-unit free scheme applies.`;
  }
}

/* ── Main Calculate Function ───────────────────────────────── */
function calculate() {
  const unitsInput = document.getElementById('units');
  const units      = parseFloat(unitsInput.value);

  // Validation
  if (!unitsInput.value || isNaN(units) || units < 0) {
    unitsInput.style.borderColor = '#e74c3c';
    unitsInput.focus();
    setTimeout(() => { unitsInput.style.borderColor = ''; }, 2000);
    return;
  }

  const roundedUnits = Math.round(units);

  // Compute bills
  const oldBill = calcOldBill(roundedUnits);
  const newBill = calcNewBill(roundedUnits);
  const savings = +(oldBill.totalAmount - newBill.totalAmount).toFixed(2);
  const savingsPct = oldBill.totalAmount > 0
    ? ((savings / oldBill.totalAmount) * 100).toFixed(1)
    : 0;

  // Show eligibility
  updateEligibilityBanner(roundedUnits);

  // Show results section
  const resultsSection = document.getElementById('resultsSection');
  resultsSection.style.display = 'block';

  // Animate counters
  animateCounter(document.getElementById('oldBillDisplay'), oldBill.totalAmount);
  animateCounter(document.getElementById('newBillDisplay'), newBill.totalAmount);
  animateCounter(document.getElementById('savingsDisplay'), savings);
  document.getElementById('savingsPct').textContent = `${savingsPct}% Savings`;

  // Render charts
  renderBarChart(oldBill, newBill);
  renderPieChart(oldBill, newBill);

  // Render breakdown tables
  renderBreakdownTable('oldBreakdownBody', 'oldBreakdownFoot', oldBill);
  renderBreakdownTable('newBreakdownBody', 'newBreakdownFoot', newBill);

  // Reset breakdown state
  breakdownOpen = false;
  document.getElementById('breakdownContent').style.display = 'none';
  document.getElementById('breakdownToggleText').textContent = 'Show Details ▼';
  switchTab('old');

  // Store for scroll
  window._lastOldBill = oldBill;
  window._lastNewBill = newBill;

  // Smooth scroll to results
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

/* ── Reset ─────────────────────────────────────────────────── */
function resetAll() {
  document.getElementById('units').value = '';
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('eligibilityBanner').style.display = 'none';
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
  if (pieChartInstance) { pieChartInstance.destroy(); pieChartInstance = null; }
  window._lastOldBill = null;
  window._lastNewBill = null;
  document.getElementById('units').focus();
}

/* ── Dark / Light Mode Toggle ──────────────────────────────── */
const themeToggle = document.getElementById('themeToggle');
const themeIcon   = document.getElementById('themeIcon');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('tneb-theme', theme);
  // Re-render charts if visible
  if (window._lastOldBill && window._lastNewBill) {
    renderBarChart(window._lastOldBill, window._lastNewBill);
    renderPieChart(window._lastOldBill, window._lastNewBill);
  }
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// Load saved theme — default to light
(function () {
  const saved = localStorage.getItem('tneb-theme') || 'light';
  applyTheme(saved);
})();

/* ── Enter key triggers calculate ─────────────────────────── */
document.getElementById('units').addEventListener('keydown', e => {
  if (e.key === 'Enter') calculate();
});

/* ── Live eligibility preview ──────────────────────────────── */
document.getElementById('units').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  if (!isNaN(v) && v > 0) updateEligibilityBanner(Math.round(v));
  else document.getElementById('eligibilityBanner').style.display = 'none';
});


