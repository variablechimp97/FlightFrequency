/* ────────────────────────────────────────────────────────────────
   DATA LAYER — localStorage persistence
   Data survives page close, browser restart, GitHub Pages visits.
   Scoped to this origin + key so nothing conflicts.
   ──────────────────────────────────────────────────────────────── */
const KEY = "flylog_v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function save(flights) {
  localStorage.setItem(KEY, JSON.stringify(flights));
}

function addFlight(f) {
  const all = load();
  f.id = Date.now().toString();
  all.unshift(f); // newest first
  save(all);
}

function removeFlight(id) {
  save(load().filter((f) => f.id !== id));
}

/* ────────────────────────────────────────────────────────────────
   HELPERS
   ──────────────────────────────────────────────────────────────── */
const TYPE = {
  solo: "Solo",
  dual: "Dual",
  xc: "Cross Country",
  night: "Night",
};
const BADGE = { solo: "b-solo", dual: "b-dual", xc: "b-xc", night: "b-night" };

// Format a YYYY-MM-DD string for display (e.g. "Jun 28, 2026")
// Adding T12:00:00 forces noon local time to avoid UTC-offset display drift
const fmt = (ds) =>
  ds
    ? new Date(ds + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

// Convert a Date object to a YYYY-MM-DD string using LOCAL time.
// IMPORTANT: toISOString() uses UTC, which can be off by a day in timezones
// behind UTC (like US Central). This function matches what <input type="date">
// stores, so grid cells and flight dates always line up correctly.
function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ────────────────────────────────────────────────────────────────
   STATS + PROGRESS BARS
   ──────────────────────────────────────────────────────────────── */
function renderStats() {
  const all = load();
  const sum = (k) => all.reduce((s, f) => s + (+f[k] || 0), 0);
  const total = sum("totalTime");
  const solo = sum("solo");
  const dual = sum("dual");
  const xc = sum("crossCountry");
  const night = sum("night");
  const ld = all.reduce(
    (s, f) => s + (+f.landingsDay || 0) + (+f.landingsNight || 0),
    0,
  );

  document.getElementById("s-total").textContent = total.toFixed(1);
  document.getElementById("s-solo").textContent = solo.toFixed(1);
  document.getElementById("s-dual").textContent = dual.toFixed(1);
  document.getElementById("s-xc").textContent = xc.toFixed(1);
  document.getElementById("s-night").textContent = night.toFixed(1);
  document.getElementById("s-ld").textContent = ld;

  const setBar = (fillId, lblId, val, max) => {
    const pct = Math.min(100, Math.round((val / max) * 100));
    const el = document.getElementById(fillId);
    el.style.width = pct + "%";
    el.setAttribute("aria-valuenow", val.toFixed(1));
    document.getElementById(lblId).textContent =
      `${val.toFixed(1)} / ${max} hr`;
  };

  setBar("pt-fill", "pt-lbl", total, 40);
  setBar("ps-fill", "ps-lbl", solo, 10);
  setBar("px-fill", "px-lbl", xc, 5);
}

/* ────────────────────────────────────────────────────────────────
   ACTIVITY GRID
   Renders 52 weeks × 7 days. Each cell is shaded in one of four
   blue intensities based on total hours flown that calendar day.

   Key design decision: cells use toLocalDateStr() (not toISOString)
   so they match the YYYY-MM-DD strings stored by <input type="date">.
   ──────────────────────────────────────────────────────────────── */
function renderGrid() {
  // Build a map: local date string → total hours flown that day
  const dateMap = {};
  load().forEach((f) => {
    if (f.date) {
      dateMap[f.date] = (dateMap[f.date] || 0) + (+f.totalTime || 0);
    }
  });

  const today = new Date();
  const WEEKS = 52;
  const STEP = 14; // 12px cell + 2px gap

  // Walk back 52 weeks, then back to the nearest Sunday
  const start = new Date(today);
  start.setDate(today.getDate() - WEEKS * 7);
  while (start.getDay() !== 0) {
    start.setDate(start.getDate() - 1);
  }

  const weeksEl = document.getElementById("weeks");
  const monthEl = document.getElementById("month-row");
  weeksEl.innerHTML = "";
  monthEl.innerHTML = "";

  let prevMonth = -1;

  for (let w = 0; w < WEEKS; w++) {
    const col = document.createElement("div");
    col.className = "week";

    for (let d = 0; d < 7; d++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + w * 7 + d);

      const cell = document.createElement("div");
      cell.className = "cell";

      if (cur > today) {
        // Future dates: invisible spacer
        cell.classList.add("future");
      } else {
        // Use LOCAL date string — this is the fix for the timezone bug
        const ds = toLocalDateStr(cur);
        const h = dateMap[ds] || 0;

        // Four intensity levels based on hours flown
        const lv = h === 0 ? 0 : h < 0.9 ? 1 : h < 1.8 ? 2 : h < 3 ? 3 : 4;
        if (lv > 0) cell.dataset.l = lv;

        cell.title =
          h > 0
            ? `${cur.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${h.toFixed(1)} hr`
            : cur.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
      }

      col.appendChild(cell);
    }
    weeksEl.appendChild(col);

    // Place a month label at the start of each new month
    const wd = new Date(start);
    wd.setDate(start.getDate() + w * 7);
    if (wd.getMonth() !== prevMonth) {
      const span = document.createElement("span");
      span.className = "month-lbl";
      span.textContent = wd.toLocaleString("en-US", { month: "short" });
      span.style.left = w * STEP + "px";
      monthEl.appendChild(span);
      prevMonth = wd.getMonth();
    }
  }
}

/* ────────────────────────────────────────────────────────────────
   FLIGHT LOG TABLE
   ──────────────────────────────────────────────────────────────── */
function renderLog() {
  const all = load();
  const el = document.getElementById("log");

  if (!all.length) {
    el.innerHTML =
      '<p class="empty">No flights logged yet. Click "+ Log Flight" to get started.</p>';
    return;
  }

  const rows = all
    .map(
      (f) => `
    <tr tabindex="0" role="button"
        aria-label="View flight on ${fmt(f.date)}, ${f.from || "?"} to ${f.to || "?"}"
        onclick="openView('${f.id}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openView('${f.id}')}">
      <td>${fmt(f.date)}</td>
      <td style="font-weight:600">${f.from || "—"} → ${f.to || "—"}</td>
      <td>${f.aircraft || "—"}</td>
      <td><span class="badge ${BADGE[f.type] || "b-solo"}">${TYPE[f.type] || f.type || "Solo"}</span></td>
      <td style="text-align:right">${(+f.totalTime || 0).toFixed(1)} hr</td>
    </tr>`,
    )
    .join("");

  el.innerHTML = `
    <table aria-label="Flight log entries">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Route</th>
          <th scope="col">Aircraft</th>
          <th scope="col">Type</th>
          <th scope="col" style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ────────────────────────────────────────────────────────────────
   MODAL — focus management + focus trap (WCAG 2.4.3)
   ──────────────────────────────────────────────────────────────── */
let prevFocus = null;

function openModal(html) {
  prevFocus = document.activeElement;
  document.getElementById("modal-body").innerHTML = html;

  const ov = document.getElementById("overlay");
  ov.hidden = false;

  // Move focus into modal after the DOM settles
  setTimeout(() => document.getElementById("modal-x").focus(), 40);

  ov.addEventListener("keydown", handleModalKey);
}

function closeModal() {
  const ov = document.getElementById("overlay");
  ov.hidden = true;
  ov.removeEventListener("keydown", handleModalKey);

  // Restore focus to the element that triggered the modal
  if (prevFocus) prevFocus.focus();
}

// Keep Tab/Shift+Tab cycling inside the modal (WCAG 2.4.3 Focus Order)
function handleModalKey(e) {
  if (e.key === "Escape") {
    closeModal();
    return;
  }
  if (e.key !== "Tab") return;

  const modal = document.getElementById("modal");
  const focusable = [
    ...modal.querySelectorAll(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* ────────────────────────────────────────────────────────────────
   ADD FLIGHT MODAL
   ──────────────────────────────────────────────────────────────── */
function openAdd() {
  const today = toLocalDateStr(new Date());

  openModal(`
    <h2 id="modal-h">Log a Flight</h2>
    <form id="fl-form" novalidate>
      <div class="fg">
        <div class="fi">
          <label for="fd">Date <abbr title="required">*</abbr></label>
          <input type="date" id="fd" value="${today}" required aria-required="true">
        </div>
        <div class="fi">
          <label for="fa">Aircraft (N-number)</label>
          <input type="text" id="fa" placeholder="N6274E" autocomplete="off" style="text-transform:uppercase">
        </div>
        <div class="fi">
          <label for="ffr">From (ICAO)</label>
          <input type="text" id="ffr" placeholder="KANE" maxlength="4" autocomplete="off" style="text-transform:uppercase">
        </div>
        <div class="fi">
          <label for="fto">To (ICAO)</label>
          <input type="text" id="fto" placeholder="KANE" maxlength="4" autocomplete="off" style="text-transform:uppercase">
        </div>

        <div class="sdiv">Time (hours)</div>
        <div class="fi">
          <label for="ft">Total <abbr title="required">*</abbr></label>
          <input type="number" id="ft" min="0.1" max="24" step="0.1" placeholder="1.2" required aria-required="true">
        </div>
        <div class="fi">
          <label for="ftype">Primary Type</label>
          <select id="ftype">
            <option value="dual">Dual</option>
            <option value="solo">Solo</option>
            <option value="xc">Cross Country</option>
            <option value="night">Night</option>
          </select>
        </div>
        <div class="fi">
          <label for="fdual">Dual received</label>
          <input type="number" id="fdual" min="0" step="0.1" placeholder="0.0">
        </div>
        <div class="fi">
          <label for="fsolo">Solo</label>
          <input type="number" id="fsolo" min="0" step="0.1" placeholder="0.0">
        </div>
        <div class="fi">
          <label for="fxc">Cross country</label>
          <input type="number" id="fxc" min="0" step="0.1" placeholder="0.0">
        </div>
        <div class="fi">
          <label for="fnight">Night</label>
          <input type="number" id="fnight" min="0" step="0.1" placeholder="0.0">
        </div>

        <div class="sdiv">Landings</div>
        <div class="fi">
          <label for="fld">Day landings</label>
          <input type="number" id="fld" min="0" step="1" placeholder="0">
        </div>
        <div class="fi">
          <label for="fln">Night landings</label>
          <input type="number" id="fln" min="0" step="1" placeholder="0">
        </div>
        <div class="fi full">
          <label for="frm">Remarks</label>
          <textarea id="frm" placeholder="Pattern work, 10 touch-and-gos…"></textarea>
        </div>
      </div>

      <div id="fl-err" role="alert" class="form-err"></div>

      <div class="form-actions">
        <button type="button" class="btn-c" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-s">Save Flight</button>
      </div>
    </form>`);

  document.getElementById("fl-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const errEl = document.getElementById("fl-err");
    const date = document.getElementById("fd").value;
    const total = +document.getElementById("ft").value;

    if (!date || !total || total <= 0) {
      errEl.textContent = "Date and Total Time are required.";
      errEl.style.display = "block";
      (date
        ? document.getElementById("ft")
        : document.getElementById("fd")
      ).focus();
      return;
    }

    addFlight({
      date,
      aircraft: document.getElementById("fa").value.trim().toUpperCase(),
      from: document.getElementById("ffr").value.trim().toUpperCase(),
      to: document.getElementById("fto").value.trim().toUpperCase(),
      type: document.getElementById("ftype").value,
      totalTime: total,
      dual: +document.getElementById("fdual").value || 0,
      solo: +document.getElementById("fsolo").value || 0,
      crossCountry: +document.getElementById("fxc").value || 0,
      night: +document.getElementById("fnight").value || 0,
      landingsDay: +document.getElementById("fld").value || 0,
      landingsNight: +document.getElementById("fln").value || 0,
      remarks: document.getElementById("frm").value.trim(),
    });

    closeModal();
    renderAll();
  });
}

/* ────────────────────────────────────────────────────────────────
   VIEW FLIGHT MODAL
   ──────────────────────────────────────────────────────────────── */
function openView(id) {
  const f = load().find((x) => x.id === id);
  if (!f) return;

  const rows = [
    ["Date", fmt(f.date)],
    ["Aircraft", f.aircraft],
    ["Route", `${f.from || "?"} → ${f.to || "?"}`],
    ["Type", TYPE[f.type] || f.type],
    ["Total Time", `${(+f.totalTime || 0).toFixed(1)} hr`],
    ["Dual Received", `${(+f.dual || 0).toFixed(1)} hr`],
    ["Solo", `${(+f.solo || 0).toFixed(1)} hr`],
    ["Cross Country", `${(+f.crossCountry || 0).toFixed(1)} hr`],
    ["Night", `${(+f.night || 0).toFixed(1)} hr`],
    ["Day Landings", String(f.landingsDay || 0)],
    ["Night Landings", String(f.landingsNight || 0)],
  ].filter(([, v]) => v && v !== "0" && v !== "0.0 hr");

  openModal(`
    <h2 id="modal-h">Flight Details</h2>
    ${rows
      .map(
        ([l, v]) => `
      <div class="drow">
        <span class="dl">${l}</span>
        <span class="dv">${v}</span>
      </div>`,
      )
      .join("")}
    ${
      f.remarks
        ? `<div class="drow">
           <span class="dl">Remarks</span>
           <span class="dv ital">${f.remarks}</span>
         </div>`
        : ""
    }
    <div class="form-actions" style="margin-top:.875rem">
      <button class="btn-d" onclick="confirmDel('${id}')">Delete</button>
      <button class="btn-c" onclick="closeModal()">Close</button>
    </div>`);
}

function confirmDel(id) {
  if (confirm("Delete this flight entry?")) {
    removeFlight(id);
    closeModal();
    renderAll();
  }
}

/* ────────────────────────────────────────────────────────────────
   INIT
   ──────────────────────────────────────────────────────────────── */
function renderAll() {
  renderStats();
  renderGrid();
  renderLog();
}

document.getElementById("add-btn").addEventListener("click", openAdd);
document.getElementById("modal-x").addEventListener("click", closeModal);
document.getElementById("overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("overlay")) closeModal();
});

renderAll();
