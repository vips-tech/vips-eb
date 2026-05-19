// Quick verification of billing logic
const SLABS = [
  { upTo: 100,      rate: 0.00  },
  { upTo: 400,      rate: 4.70  },
  { upTo: 500,      rate: 6.30  },
  { upTo: 600,      rate: 8.40  },
  { upTo: 800,      rate: 9.45  },
  { upTo: 1000,     rate: 10.30 },
  { upTo: Infinity, rate: 11.00 }
];

function getFixed(u) {
  if (u <= 100)  return 0;
  if (u <= 200)  return 40;
  if (u <= 500)  return 75;
  if (u <= 1000) return 125;
  return 175;
}

// Correct slab engine: walks all units from 0, charges only beyond freeUnits
function calcSlab(totalUnits, freeUnits) {
  let unitsCounted = 0, charge = 0, prevBoundary = 0, rows = [];
  for (const s of SLABS) {
    if (unitsCounted >= totalUnits) break;
    const slabCap = s.upTo === Infinity
      ? totalUnits - unitsCounted
      : Math.min(s.upTo, totalUnits) - unitsCounted;
    if (slabCap <= 0) { prevBoundary = s.upTo; continue; }
    const freeInSlab   = Math.max(0, Math.min(freeUnits, unitsCounted + slabCap) - unitsCounted);
    const chargeInSlab = slabCap - freeInSlab;
    if (chargeInSlab > 0) {
      const amt = +(chargeInSlab * s.rate).toFixed(2);
      charge += amt;
      rows.push({ slab: (prevBoundary + 1) + '-' + (s.upTo === Infinity ? 'above' : s.upTo), units: chargeInSlab, rate: s.rate, amt });
    }
    unitsCounted  += slabCap;
    prevBoundary   = s.upTo === Infinity ? totalUnits : s.upTo;
  }
  return { charge: +charge.toFixed(2), rows };
}

[100, 200, 300, 450, 500, 607, 800, 1200].forEach(units => {
  const oldFree  = Math.min(units, 100);
  const { charge: oldE } = calcSlab(units, oldFree);
  const oldF     = getFixed(units);
  const oldTotal = +(oldE + oldF).toFixed(2);

  const eligible = units <= 500;
  const newFree  = eligible ? Math.min(units, 200) : Math.min(units, 100);
  const { charge: newE } = calcSlab(units, newFree);
  const newF     = eligible && units <= 200 ? 0 : getFixed(units);
  const newTotal = +(newE + newF).toFixed(2);
  const savings  = +(oldTotal - newTotal).toFixed(2);

  console.log(`Units:${units} | Old:Rs${oldTotal} | New:Rs${newTotal} | Save:Rs${savings} | Eligible:${eligible}`);
});

// Detailed check for 607 units
console.log('\n=== 607 units detail (Old Bill, 100 free) ===');
const { charge, rows } = calcSlab(607, 100);
rows.forEach(r => console.log(`  ${r.slab}: ${r.units}u @ Rs${r.rate} = Rs${r.amt}`));
console.log(`  Energy: Rs${charge}  Fixed: Rs125  Total: Rs${charge + 125}`);
console.log('  Expected: 300u@4.70=1410 + 100u@6.30=630 + 100u@8.40=840 + 7u@9.45=66.15 = Rs2946.15 + Rs125 = Rs3071.15');
