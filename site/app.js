const $ = (sel) => document.querySelector(sel);

let ALL = [];
let FILTERED = [];

function uniq(arr){
  return [...new Set(arr)].filter(v => v && String(v).trim().length>0).sort((a,b)=>String(a).localeCompare(String(b)));
}

function fmtInt(n){
  if(n === null || n === undefined) return "—";
  const x = Number(n);
  if(Number.isNaN(x)) return "—";
  return x.toLocaleString();
}

function badgeOwned(card){
  if(card.owned === 1) return '<span class="badge badge--ok">✓</span>';
  if(card.incoming === 1) return '<span class="badge badge--warn">⧗</span>';
  return '<span class="badge badge--no">—</span>';
}
function badgeIncoming(card){
  return card.incoming === 1 ? '<span class="badge badge--warn">⧗</span>' : '<span class="badge">—</span>';
}

function computeStats(cards){
  const total = cards.length;
  const owned = cards.reduce((a,c)=>a+(c.owned===1?1:0),0);
  const incoming = cards.reduce((a,c)=>a+(c.incoming===1?1:0),0);
  const missing = cards.reduce((a,c)=>a+(c.missing===1?1:0),0);
  const pct = total ? (owned/total*100) : 0;

  const ptsTotal = cards.reduce((a,c)=>a+(Number(c.pointsWeight)||0),0);
  const ptsOwned = cards.reduce((a,c)=>a+((c.owned===1?Number(c.pointsWeight)||0:0)),0);

  return {total, owned, incoming, missing, pct, ptsTotal, ptsOwned};
}

function setStatsUI(stats){
  $("#statTotal").textContent = fmtInt(stats.total);
  $("#statOwned").textContent = fmtInt(stats.owned);
  $("#statIncoming").textContent = fmtInt(stats.incoming);
  $("#statMissing").textContent = fmtInt(stats.missing);
  $("#statCompletion").textContent = `${stats.pct.toFixed(1)}%`;
  $("#statPoints").textContent = `${fmtInt(stats.ptsOwned)} / ${fmtInt(stats.ptsTotal)}`;
}

function buildSelect(selectEl, values){
  selectEl.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = "All";
  selectEl.appendChild(optAll);

  for(const v of values){
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    selectEl.appendChild(o);
  }
}

function matches(card, q){
  if(!q) return true;
  const hay = `${card.group} ${card.set} ${card.cardNo} ${card.name} ${card.variant} ${card.category} ${card.inscription}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function applyFilters(){
  const q = $("#search").value.trim();
  const group = $("#filterGroup").value;
  const set = $("#filterSet").value;
  const variant = $("#filterVariant").value;
  const status = $("#filterStatus").value;

  FILTERED = ALL.filter(c=>{
    if(group !== "all" && c.group !== group) return false;
    if(set !== "all" && c.set !== set) return false;
    if(variant !== "all" && c.variant !== variant) return false;
    if(status === "owned" && c.owned !== 1) return false;
    if(status === "incoming" && c.incoming !== 1) return false;
    if(status === "missing" && c.missing !== 1) return false;
    return matches(c,q);
  });

  renderTable(FILTERED);
  setStatsUI(computeStats(FILTERED));
}

function renderTable(cards){
  const tbody = $("#tableBody");
  tbody.innerHTML = "";

  const frag = document.createDocumentFragment();
  for(const card of cards){
    const tr = document.createElement("tr");
    tr.dataset.id = card.id;
    tr.innerHTML = `
      <td>${badgeOwned(card)}</td>
      <td>${badgeIncoming(card)}</td>
      <td>${card.group}</td>
      <td>${card.set}</td>
      <td>${card.cardNo}</td>
      <td>${card.name}</td>
      <td>${card.variant}</td>
      <td>${card.printRun ?? "—"}</td>
      <td>${card.pointsWeight ?? ""}</td>
    `;
    frag.appendChild(tr);
  }
  if(cards.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="9" class="muted">No matches. Try loosening filters.</td>`;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

function openCard(id){
  const card = ALL.find(c=>c.id===id);
  if(!card) return;

  $("#dlgTitle").textContent = `${card.cardNo} — ${card.name}`;
  $("#dlgSubtitle").textContent = `${card.set} • ${card.variant}`;

  const img = $("#dlgImg");
  img.src = card.image;
  img.alt = `${card.cardNo} ${card.name}`;

  // details panel
  const details = $("#dlgDetails");
  const pr = card.printRun ? fmtInt(card.printRun) : "—";
  const plate = card.isPlate === "Y" ? "Yes" : "No";
  const chase = card.inChase === "Y" ? "Yes" : "No";
  const lines = [
    `<div><strong>Group:</strong> ${card.group}</div>`,
    `<div><strong>Category:</strong> ${card.category}</div>`,
    `<div><strong>Print Run:</strong> ${pr}</div>`,
    `<div><strong>Plate:</strong> ${plate}</div>`,
    `<div><strong>Chase:</strong> ${chase}</div>`,
    `<div><strong>Owned:</strong> ${card.owned === 1 ? "Yes" : "No"}</div>`,
    `<div><strong>Incoming:</strong> ${card.incoming === 1 ? "Yes" : "No"}</div>`,
    `<div><strong>Missing:</strong> ${card.missing === 1 ? "Yes" : "No"}</div>`,
    `<div><strong>Points weight:</strong> ${card.pointsWeight}</div>`,
    card.inscription ? `<div><strong>Inscription:</strong> ${card.inscription}</div>` : "",
    `<hr style="border:none;border-top:1px solid #243043;margin:10px 0;" />`,
    `<div class="muted">Image filename:</div>`,
    `<div><code>${card.id}.jpg</code></div>`,
    `<div class="muted">Internal key:</div>`,
    `<div><code>${card.cardKey}</code></div>`
  ];
  details.innerHTML = lines.join("");

  // external links
  const q = encodeURIComponent(`${card.cardNo} ${card.name} Skybox The Boys ${card.variant}`);
  $("#lnkTcdb").href = `https://www.tcdb.com/Search.cfm?SearchText=${q}`;
  $("#lnkEbay").href = `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`;

  $("#cardDialog").showModal();
}

async function main(){
  const res = await fetch("data/cards.json");
  ALL = await res.json();

  // Ensure numeric-ish fields are the right type
  ALL = ALL.map(c => ({
    ...c,
    owned: Number(c.owned)||0,
    incoming: Number(c.incoming)||0,
    missing: Number(c.missing)||0,
    pointsWeight: Number(c.pointsWeight)||0,
    printRun: (c.printRun === null || c.printRun === "" || c.printRun === undefined) ? null : Number(c.printRun)
  }));

  // Build selects
  buildSelect($("#filterGroup"), uniq(ALL.map(c=>c.group)));
  buildSelect($("#filterSet"), uniq(ALL.map(c=>c.set)));
  buildSelect($("#filterVariant"), uniq(ALL.map(c=>c.variant)));

  // Initial stats + table
  FILTERED = ALL.slice();
  renderTable(FILTERED);
  setStatsUI(computeStats(FILTERED));

  // events
  ["#search","#filterGroup","#filterSet","#filterVariant","#filterStatus"].forEach(sel=>{
    $(sel).addEventListener("input", applyFilters);
    $(sel).addEventListener("change", applyFilters);
  });

  $("#btnResetFilters").addEventListener("click", ()=>{
    $("#search").value = "";
    $("#filterGroup").value = "all";
    $("#filterSet").value = "all";
    $("#filterVariant").value = "all";
    $("#filterStatus").value = "all";
    applyFilters();
  });

  $("#tableBody").addEventListener("click", (e)=>{
    const tr = e.target.closest("tr");
    if(!tr || !tr.dataset.id) return;
    openCard(tr.dataset.id);
  });

  $("#dlgClose").addEventListener("click", ()=>$("#cardDialog").close());
  $("#btnAbout").addEventListener("click", ()=>$("#aboutDialog").showModal());
  $("#aboutClose").addEventListener("click", ()=>$("#aboutDialog").close());
}

main().catch(err=>{
  console.error(err);
  const tbody = $("#tableBody");
  tbody.innerHTML = `<tr><td colspan="9" class="muted">Failed to load data/cards.json. See console.</td></tr>`;
});
