/* ============================================================
   TNEB Bill Calculator – calculator.js
   TANGEDCO LT-1 Domestic Tariff (2022) + 2026 CM 200 Units Free Scheme
   ============================================================ */

'use strict';

/* ── Tariff Configuration ──────────────────────────────────── */

/**
 * TANGEDCO LT-1 Domestic Slab Rates (Bi-Monthly, effective Sep 2022)
 * Each entry: { upTo: max units in slab, rate: ₹ per unit }
 * The first 100 units are FREE under the old scheme (rate = 0).
 */
const SLABS = [
  { upTo: 100,  rate: 0.00  },   // 0–100   : Free
  { upTo: 200,  rate: 2.35  },   // 101–200 : ₹2.35/unit
  { upTo: 400,  rate: 4.80  },   // 201–400 : ₹4.80/unit
  { upTo: 500,  rate: 6.45  },   // 401–500 : ₹6.45/unit
  { upTo: 600,  rate: 8.55  },   // 501–600 : ₹8.55/unit
  { upTo: 800,  rate: 9.65  },   // 601–800 : ₹9.65/unit
  { upTo: 1000, rate: 10.30 },   // 801–1000: ₹10.30/unit
  { upTo: Infinity, rate: 11.00 } // >1000   : ₹11.00/unit
];

/**
 * Fixed charges (bi-monthly) based on total consumption
 */
function getFixedCharge(units) {
  if (units <= 100)  return 0;
  if (units <= 200)  return 40;
  if (units <= 500)  return 75;
  if (units <= 1000) return 125;
  return 175;
}

/* ── Core Billing Engine ───────────────────────────────────── */

/**
 * Calculate energy charge using progressive slab billing.
 * @param {number} billableUnits - Units to be charged (after free deduction)
 * @param {number} totalUnits    - Original total units (for slab boundary reference)
 * @returns {{ rows: Array, energyCharge: number }}
 */
function calcSlabCharge(billableUnits, totalUnits) {
  const rows = [];
  let remaining = billableUnits;
  let energyCharge = 0;
  let prevBoundary = 0;

  for (const slab of SLABS) {
    if (remaining <= 0) break;

    const slabCapacity = slab.upTo - prevBoundary;
    const unitsInSlab  = Math.min(remaining, slabCapacity);

    if (unitsInSlab > 0) {
      const amount = +(unitsInSlab * slab.rate).toFixed(2);
      energyCharge += amount;
      rows.push({
        slab:   slab.upTo === Infinity
                  ? `${prevBoundary + 1} & above`
                  : `${prevBoundary + 1} – ${slab.upTo}`,
        units:  unitsInSlab,
        rate:   slab.rate,
        amount: amount,
        isFree: slab.rate === 0
      });
    }

    remaining    -= unitsInSlab;
    prevBoundary  = slab.upTo;
  }

  return { rows, energyCharge: +energyCharge.toFixed(2) };
}

/**
 * OLD BILL: First 100 units free for ALL domestic consumers.
 * Remaining units billed at progressive slab rates.
 * @param {number} units - Total bi-monthly consumption
 * @returns {object} Full bill breakdown
 */
function calcOldBill(units) {
  const freeUnits    = Math.min(units, 100);
  const billable     = Math.max(0, units - freeUnits);
  const { rows, energyCharge } = calcSlabCharge(billable, units);
  const fixedCharge  = getFixedCharge(units);
  const totalAmount  = +(energyCharge + fixedCharge).toFixed(2);

  // Prepend free-units row for display
  const displayRows = [
    { slab: '0 – 100', units: freeUnits, rate: 0, amount: 0, isFree: true },
    ...rows
  ];

  return {
    units, freeUnits, billable,
    energyCharge, fixedCharge, totalAmount,
    rows: displayRows,
    scheme: 'Old (100 Units Free)'
  };
}

/**
 * NEW BILL (2026 CM Vijay Scheme):
 * - Consumers using ≤ 500 units bimonthly → 200 units FREE
 * - Consumers using > 500 units bimonthly → 100 units FREE (old scheme continues)
 * @param {number} units - Total bi-monthly consumption
 * @returns {object} Full bill breakdown
 */
function calcNewBill(units) {
  const eligible  = units <= 500;
  const freeUnits = eligible ? Math.min(units, 200) : Math.min(units, 100);
  const billable  = Math.max(0, units - freeUnits);
  const { rows, energyCharge } = calcSlabCharge(billable, units);
  const fixedCharge = eligible && units <= 200 ? 0 : getFixedCharge(units);
  const totalAmount = +(energyCharge + fixedCharge).toFixed(2);

  const displayRows = [
    {
      slab:   eligible ? '0 – 200 (Free)' : '0 – 100 (Free)',
      units:  freeUnits,
      rate:   0,
      amount: 0,
      isFree: true
    },
    ...rows
  ];

  return {
    units, freeUnits, billable, eligible,
    energyCharge, fixedCharge, totalAmount,
    rows: displayRows,
    scheme: eligible ? 'New (200 Units Free – 2026)' : 'New (100 Units Free – >500 units)'
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

  // Store for PDF export
  window._lastOldBill = oldBill;
  window._lastNewBill = newBill;
  window._lastSavings = savings;
  window._lastSavingsPct = savingsPct;

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

/* ── PDF Export ────────────────────────────────────────────── */
function exportPDF() {
  const old = window._lastOldBill;
  const nw  = window._lastNewBill;
  if (!old || !nw) { alert('Please calculate a bill first.'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 20;

  // ── Header ──
  doc.setFillColor(192, 57, 43);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('TNEB Bill Comparison Report', pageW / 2, 9, { align: 'center' });

  doc.setTextColor(50, 50, 50);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TANGEDCO Domestic Consumer (LT-1) | Generated: ' + new Date().toLocaleDateString('en-IN'), pageW / 2, y, { align: 'center' });
  y += 10;

  // ── Consumer Info ──
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Consumer Details', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Units Consumed (Bi-Monthly): ${old.units} kWh`, margin, y); y += 5;
  doc.text(`Consumer Type: Domestic (LT-1)`, margin, y); y += 5;
  doc.text(`Eligibility: ${nw.eligible ? '✓ Eligible for 200 Units Free Scheme (≤500 units)' : '✗ Not eligible (>500 units) – 100 units free applies'}`, margin, y);
  y += 10;

  // ── Summary Box ──
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, pageW - margin * 2, 28, 3, 3, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(192, 57, 43);
  doc.text('Old Bill (100 Free):', margin + 5, y + 8);
  doc.setTextColor(39, 174, 96);
  doc.text('New Bill (200 Free):', margin + 5, y + 16);
  doc.setTextColor(243, 156, 18);
  doc.text('You Save:', margin + 5, y + 24);

  doc.setTextColor(50, 50, 50);
  doc.text('₹' + old.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), pageW - margin - 5, y + 8, { align: 'right' });
  doc.text('₹' + nw.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), pageW - margin - 5, y + 16, { align: 'right' });
  doc.text('₹' + (old.totalAmount - nw.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) + ' (' + window._lastSavingsPct + '%)', pageW - margin - 5, y + 24, { align: 'right' });
  y += 36;

  // ── Helper: draw a slab table ──
  function drawTable(title, bill, startY) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text(title, margin, startY);
    startY += 5;

    const cols = ['Slab', 'Units', 'Rate (₹/unit)', 'Amount (₹)'];
    const colW  = [(pageW - margin * 2) * 0.35, 0.2, 0.2, 0.25].map(r => (pageW - margin * 2) * r);
    let cx = margin;

    // Header row
    doc.setFillColor(192, 57, 43);
    doc.rect(margin, startY, pageW - margin * 2, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    cols.forEach((col, i) => {
      doc.text(col, cx + 2, startY + 5);
      cx += colW[i];
    });
    startY += 7;

    // Data rows
    bill.rows.forEach((row, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 250 : 242, idx % 2 === 0 ? 250 : 242, idx % 2 === 0 ? 250 : 242);
      doc.rect(margin, startY, pageW - margin * 2, 6, 'F');
      doc.setTextColor(row.isFree ? 39 : 50, row.isFree ? 174 : 50, row.isFree ? 96 : 50);
      doc.setFont('helvetica', row.isFree ? 'italic' : 'normal');
      doc.setFontSize(8);
      cx = margin;
      const vals = [
        row.slab,
        row.units + ' units',
        row.isFree ? 'FREE' : '₹' + row.rate.toFixed(2),
        row.isFree ? '₹0.00' : '₹' + row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })
      ];
      vals.forEach((v, i) => {
        doc.text(v, cx + 2, startY + 4);
        cx += colW[i];
      });
      startY += 6;
    });

    // Fixed charge row
    if (bill.fixedCharge > 0) {
      doc.setFillColor(255, 248, 220);
      doc.rect(margin, startY, pageW - margin * 2, 6, 'F');
      doc.setTextColor(50, 50, 50);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Fixed Charge (Bi-Monthly)', margin + 2, startY + 4);
      doc.text('₹' + bill.fixedCharge.toFixed(2), pageW - margin - 2, startY + 4, { align: 'right' });
      startY += 6;
    }

    // Total row
    doc.setFillColor(192, 57, 43);
    doc.rect(margin, startY, pageW - margin * 2, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Total Bill Amount', margin + 2, startY + 5);
    doc.text('₹' + bill.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), pageW - margin - 2, startY + 5, { align: 'right' });
    startY += 12;

    return startY;
  }

  y = drawTable('Old Bill Slab Breakdown (100 Units Free)', old, y);
  if (y > 220) { doc.addPage(); y = 20; }
  y = drawTable('New Bill Slab Breakdown (200 Units Free – 2026 Scheme)', nw, y);

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'italic');
  doc.text('This is an unofficial calculator for reference only. Actual bills may vary. | TANGEDCO LT-1 Domestic Tariff (2022)', pageW / 2, 290, { align: 'center' });

  doc.save(`TNEB_Bill_${old.units}units_${new Date().toISOString().slice(0,10)}.pdf`);
}
