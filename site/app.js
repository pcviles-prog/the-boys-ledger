const $ = (sel) => document.querySelector(sel);

let ALL = [];
async function fetchJsonFallback(paths, opts){
  for(const p of paths){
    try{
      const r = await fetch(p, opts || {cache:"no-store"});
      if(r && r.ok) return await r.json();
    }catch(_){}
  }
  throw new Error("Failed to load JSON from: " + paths.join(", "));
}

function expandLocalPaths(p){
  if(!p) return [];
  // If it's an http(s) URL, return as-is.
  if(/^https?:\/\//i.test(p)) return [p];

  // Try both root and site/ prefixed versions.
  const out = [p];
  if(!p.startsWith("site/")) out.push("site/" + p);
  return out;
}
\r
let IMG_OVERRIDES = {}; // cardKey (or id) -> { src, href, credit }
let FILTERED = [];
let SORT = { key: null, dir: "asc" };

function uniq(arr){
  return [...new Set(arr)].filter(v => v && String(v).trim().length>0).sort((a,b)=>String(a).localeCompare(String(b)));
}

function fmtInt(n){
  if(n === null || n === undefined) return "â€”";
  const x = Number(n);
  if(Number.isNaN(x)) return "â€”";
  return x.toLocaleString();
}

function badgeOwned(card){
  if(card.owned === 1) return '<span class="badge badge--ok">âœ“</span>';
  if(card.incoming === 1) return '<span class="badge badge--warn">â§—</span>';
  return '<span class="badge badge--no">â€”</span>';
}
function badgeIncoming(card){
  return card.incoming === 1 ? '<span class="badge badge--warn">â§—</span>' : '<span class="badge">â€”</span>';
}

function slugify(str){
  return String(str ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getSafeCardNo(cardNo){
  return String(cardNo ?? "").replace(/[^A-Za-z0-9-]/g, "");
}

function getSimpleImagePath(card){
  const safeCardNo = getSafeCardNo(card.cardNo);
  if(card.variant === "Base"){
    return `images/cards/${safeCardNo}.jpg`;
  }
  return `images/cards/${safeCardNo}-${slugify(card.variant)}.jpg`;
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

  FILTERED = sortCards(FILTERED, SORT.key, SORT.dir);

  renderTable(FILTERED);
  setStatsUI(computeStats(FILTERED));
}

function sortCards(cards, key, dir = "asc"){
  if(!key) return cards.slice();
  const mult = dir === "desc" ? -1 : 1;
  const sorted = cards.slice().sort((a,b)=>{
    const av = a[key];
    const bv = b[key];

    const aMissing = av === null || av === undefined || av === "";
    const bMissing = bv === null || bv === undefined || bv === "";
    if(aMissing && bMissing) return 0;
    if(aMissing) return 1;
    if(bMissing) return -1;

    if(typeof av === "number" && typeof bv === "number"){
      return (av - bv) * mult;
    }

    return String(av).localeCompare(String(bv), undefined, {numeric:true, sensitivity:"base"}) * mult;
  });
  return sorted;
}

function updateSortUI(){
  document.querySelectorAll("#cardsTable th[data-sort-key]").forEach((th)=>{
    const key = th.dataset.sortKey;
    th.classList.remove("is-sorted-asc", "is-sorted-desc");
    if(key === SORT.key){
      th.classList.add(SORT.dir === "asc" ? "is-sorted-asc" : "is-sorted-desc");
    }
  });
}

function setStatusFilter(status){
  $("#filterStatus").value = status;
  applyFilters();
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
      <td>${card.printRun ?? "â€”"}</td>
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

  $("#dlgTitle").textContent = `${card.cardNo} â€” ${card.name}`;
  $("#dlgSubtitle").textContent = `${card.set} â€¢ ${card.variant}`;

  const img = $("#dlgImg");
  const simpleImagePath = getSimpleImagePath(card);
  const ov = (IMG_OVERRIDES && (IMG_OVERRIDES[card.cardKey] || IMG_OVERRIDES[card.id])) || null;

  // Prefer your own local images first, then fall back to COMC hotlink.
  const attempts = [];
  for(const p of expandLocalPaths(simpleImagePath)) attempts.push(p);
  if(card.image && card.image !== simpleImagePath){
    for(const p of expandLocalPaths(card.image)) attempts.push(p);
  }
  if(ov && ov.src){
    for(const p of expandLocalPaths(ov.src)) attempts.push(p);
  }

  img.alt = `${card.cardNo} ${card.name}`;
  img.hidden = false;

  let ai = 0;
  const tryNext = ()=>{
    if(ai >= attempts.length){
      img.onerror = null;
      img.hidden = true;
      return;
    }
    img.src = attempts[ai++];
  };
  img.onerror = tryNext;
  tryNext();

  // details panel
  const details = $("#dlgDetails");
  const pr = card.printRun ? fmtInt(card.printRun) : "â€”";
  const plate = card.isPlate === "Y" ? "Yes" : "No";
  const chase = card.inChase === "Y" ? "Yes" : "No";

  const imgSourceLine = ov && (ov.href || ov.src)
    ? `<div><strong>Image source:</strong> ${ov.href
        ? `<a href="${ov.href}" target="_blank" rel="noopener">${ov.credit || "COMC.com"}</a>`
        : (ov.credit || "External")
      }</div>`
    : "";
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
    `<div><code>${simpleImagePath.split("/").pop()}</code></div>`,
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
  ALL = await fetchJsonFallback(["data/cards.json","site/data/cards.json"], {cache:"no-store"});

  // Optional: override images (e.g., hotlinked COMC) without touching cards.json
  try{
    IMG_OVERRIDES = await fetchJsonFallback(
  ["data/image_overrides.json","site/data/image_overrides.json"],
  {cache:"no-store"}
);
  }catch(_){
    IMG_OVERRIDES = {};
  }

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

  document.querySelectorAll("#cardsTable th[data-sort-key]").forEach((th)=>{
    th.addEventListener("click", ()=>{
      const key = th.dataset.sortKey;
      if(SORT.key === key){
        SORT.dir = SORT.dir === "asc" ? "desc" : "asc";
      }else{
        SORT.key = key;
        SORT.dir = "asc";
      }
      updateSortUI();
      applyFilters();
    });
  });

  document.querySelectorAll(".stat[data-status-filter]").forEach((card)=>{
    const status = card.dataset.statusFilter;
    const onActivate = ()=>setStatusFilter(status);
    card.addEventListener("click", onActivate);
    card.addEventListener("keydown", (e)=>{
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        onActivate();
      }
    });
  });

  $("#tableBody").addEventListener("click", (e)=>{
    const tr = e.target.closest("tr");
    if(!tr || !tr.dataset.id) return;
    openCard(tr.dataset.id);
  });

  $("#dlgClose").addEventListener("click", ()=>$("#cardDialog").close());
  $("#btnAbout").addEventListener("click", ()=>$("#aboutDialog").showModal());
  $("#aboutClose").addEventListener("click", ()=>$("#aboutDialog").close());

  updateSortUI();
}

main().catch(err=>{
  console.error(err);
  const tbody = $("#tableBody");
  tbody.innerHTML = `<tr><td colspan="9" class="muted">Failed to load data/cards.json. See console.</td></tr>`;
});




