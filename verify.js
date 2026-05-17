// Quick verification of billing logic for 450 units
const SLABS = [
  { upTo: 100,      rate: 0.00  },
  { upTo: 200,      rate: 2.35  },
  { upTo: 400,      rate: 4.80  },
  { upTo: 500,      rate: 6.45  },
  { upTo: 600,      rate: 8.55  },
  { upTo: 800,      rate: 9.65  },
  { upTo: 1000,     rate: 10.30 },
  { upTo: Infinity, rate: 11.00 }
];
function getFixed(u){ if(u<=100)return 0; if(u<=200)return 40; if(u<=500)return 75; if(u<=1000)return 125; return 175; }
function calcSlab(billable){
  let rem=billable, charge=0, prev=0, rows=[];
  for(const s of SLABS){
    if(rem<=0)break;
    const cap=s.upTo===Infinity?rem:s.upTo-prev, inSlab=Math.min(rem,cap);
    if(inSlab>0){ charge+=inSlab*s.rate; rows.push({slab:(prev+1)+'-'+(s.upTo===Infinity?'above':s.upTo), units:inSlab, rate:s.rate, amt:+(inSlab*s.rate).toFixed(2)}); }
    rem-=inSlab; prev=s.upTo===Infinity?prev+inSlab:s.upTo;
  }
  return {charge:+charge.toFixed(2), rows};
}

[100, 200, 300, 450, 500, 600, 800, 1200].forEach(units => {
  const oldFree=100, oldBillable=Math.max(0,units-oldFree);
  const {charge:oldE}=calcSlab(oldBillable);
  const oldF=getFixed(units), oldTotal=+(oldE+oldF).toFixed(2);

  const eligible=units<=500, newFree=eligible?Math.min(units,200):100;
  const newBillable=Math.max(0,units-newFree);
  const {charge:newE}=calcSlab(newBillable);
  const newF=eligible&&units<=200?0:getFixed(units), newTotal=+(newE+newF).toFixed(2);
  const savings=+(oldTotal-newTotal).toFixed(2);

  console.log(`Units:${units} | Old:Rs${oldTotal} | New:Rs${newTotal} | Save:Rs${savings} | Eligible:${eligible}`);
});
