const state = {
  timeframe: "ytd",
  region: "ALL",
  branch: "ALL",
  weakTab: "national",
  data: null,
};

const fmtIDR = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");

function renderTelegramMarkdown(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
}

function showToast(msg) {
  const el = document.getElementById("tg-toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

async function fetchDashboard() {
  const params = new URLSearchParams({
    timeframe: state.timeframe,
    region: state.region,
    branch: state.branch,
  });
  const res = await fetch(`/api/dashboard?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json();
    alert(err.detail || "Gagal memuat data");
    return;
  }
  state.data = await res.json();
  syncFilterOptions(state.data.filters);
  renderDashboard(state.data);
}

function syncFilterOptions(filters) {
  const regSel = document.getElementById("filter-region");
  if (regSel.options.length <= 1) {
    filters.available_regions.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = `Regional PIC — ${r}`;
      regSel.appendChild(opt);
    });
  }
  regSel.value = state.region;

  const brSel = document.getElementById("filter-branch");
  const validBranches =
    state.region === "ALL"
      ? Object.values(filters.branches_by_region).flat().sort()
      : filters.branches_by_region[state.region] || [];
  brSel.innerHTML = '<option value="ALL">Semua Cabang</option>';
  validBranches.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    brSel.appendChild(opt);
  });
  brSel.value = validBranches.includes(state.branch) ? state.branch : "ALL";
}

function renderDashboard(data) {
  const { kpis, filters, by_region, by_brand, brand_region_matrix, telegram_summary, audit } = data;

  document.getElementById("active-scope-pill").textContent =
    `${filters.timeframe_label} · ${filters.region === "ALL" ? "Nasional" : filters.region}` +
    (filters.branch !== "ALL" ? ` / ${filters.branch}` : "");

  const issueCount =
    audit.duplicates_removed +
    audit.region_normalized_rows +
    audit.outlet_trimmed_rows +
    audit.missing_salesman_rows;
  document.getElementById("audit-badge-count").textContent = `${issueCount} temuan + ${audit.return_rows} retur`;

  // KPIs
  document.getElementById("kpi-net-sales").textContent = fmtIDR(kpis.net_sales_idr);
  document.getElementById("kpi-mom").textContent =
    kpis.mom_pct !== null
      ? `${kpis.mom_pct >= 0 ? "+" : ""}${kpis.mom_pct}% vs Sep 2026`
      : "Bulan awal dataset";
  document.getElementById("kpi-qty").textContent = `${kpis.qty_carton.toLocaleString("id-ID")} karton`;
  document.getElementById("kpi-share").textContent = `${kpis.national_share_pct}% dari total nasional`;
  document.getElementById("kpi-invoices").textContent = `${kpis.sales_invoices.toLocaleString("id-ID")} invoice`;
  document.getElementById("kpi-returns").textContent =
    kpis.return_count > 0
      ? `${kpis.return_count} retur (${fmtIDR(kpis.return_value_idr)})`
      : "0 retur pada cakupan ini";

  const topBrand = by_brand[0] || { brand: "-", share_pct: 0 };
  const topRegion = by_region[0] || { region: "-", share_pct: 0 };
  document.getElementById("kpi-top-brand").textContent = `${topBrand.brand} (${topBrand.share_pct}%)`;
  document.getElementById("kpi-top-region").textContent = `Top Region: ${topRegion.region} (${topRegion.share_pct}%)`;

  // Telegram Preview
  document.getElementById("tg-role-label").textContent = telegram_summary.recipient_role;
  document.getElementById("tg-preview").innerHTML = renderTelegramMarkdown(telegram_summary.text);

  // Region Bars
  const maxReg = Math.max(...by_region.map((r) => r.net_sales_idr), 1);
  document.getElementById("chart-region").innerHTML = by_region
    .map(
      (r) => `
      <div class="bar-row">
        <div class="bar-row-head">
          <strong>${r.region} ${filters.region === r.region ? "★" : ""}</strong>
          <span>${fmtIDR(r.net_sales_idr)} (${r.share_pct}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(r.net_sales_idr / maxReg) * 100}%"></div>
        </div>
      </div>`
    )
    .join("");

  // Brand Bars
  const maxBrand = Math.max(...by_brand.map((b) => b.net_sales_idr), 1);
  document.getElementById("brand-scope-sub").textContent =
    filters.region === "ALL" ? "Cakupan Nasional" : `Khusus Wilayah ${filters.region}`;
  document.getElementById("chart-brand").innerHTML = by_brand
    .map(
      (b) => `
      <div class="bar-row">
        <div class="bar-row-head">
          <strong>${b.brand}</strong>
          <span>${fmtIDR(b.net_sales_idr)} (${b.share_pct}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill alt" style="width:${(b.net_sales_idr / maxBrand) * 100}%"></div>
        </div>
      </div>`
    )
    .join("");

  // Brand x Region Matrix
  const regions = filters.available_regions;
  const maxCell = Math.max(
    ...brand_region_matrix.flatMap((row) => regions.map((rg) => row.regions[rg] || 0)),
    1
  );
  const headHtml = `<thead><tr><th>Brand</th>${regions.map((r) => `<th class="num">${r}</th>`).join("")}<th class="num">Total</th></tr></thead>`;
  const bodyHtml = brand_region_matrix
    .map((row) => {
      const cells = regions
        .map((rg) => {
          const v = row.regions[rg] || 0;
          const alpha = (0.04 + 0.22 * (v / maxCell)).toFixed(2);
          return `<td class="num" style="background:rgba(15,118,110,${alpha})">${fmtIDR(v)}</td>`;
        })
        .join("");
      return `<tr><td><strong>${row.brand}</strong></td>${cells}<td class="num"><strong>${fmtIDR(row.total_idr)}</strong></td></tr>`;
    })
    .join("");
  document.getElementById("matrix-table").innerHTML = headHtml + `<tbody>${bodyHtml}</tbody>`;

  renderWeakestTab();
  renderAuditModal(audit);
}

function renderWeakestTab() {
  if (!state.data) return;
  const wk = state.data.weakest_outlets;
  const container = document.getElementById("weakest-content");

  if (state.weakTab === "national") {
    container.innerHTML = buildOutletTable(wk.national_bottom_5, "5 Outlet Terlemah Nasional");
  } else if (state.weakTab === "region") {
    if (state.region !== "ALL") {
      container.innerHTML = buildOutletTable(
        wk.active_region_bottom_5,
        `5 Outlet Terlemah — ${state.region}`
      );
    } else {
      container.innerHTML = Object.entries(wk.bottom_5_per_region)
        .map(([reg, list]) => `<h4 style="margin:12px 0 6px">${reg}</h4>` + buildOutletTable(list))
        .join("");
    }
  } else {
    container.innerHTML = buildOutletTable(
      wk.lowest_per_branch,
      "Outlet Terlemah per Cabang (13 Cabang)",
      true
    );
  }
}

function buildOutletTable(rows, caption = "", showBranchCount = false) {
  if (!rows || !rows.length) return '<p class="muted">Tidak ada data.</p>';
  return `
    ${caption ? `<p class="muted" style="margin:0 0 8px">${caption}</p>` : ""}
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Outlet ID</th>
          <th>Nama Outlet</th>
          <th>Tipe</th>
          <th>Branch</th>
          <th>Region</th>
          <th class="num">Invoice</th>
          <th class="num">Karton</th>
          <th class="num">Net Sales</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (o, idx) => `
          <tr>
            <td><span class="badge-weak">#${idx + 1}</span></td>
            <td><code>${o.outlet_id}</code></td>
            <td><strong>${o.outlet_name}</strong></td>
            <td>${o.outlet_type}</td>
            <td>${o.branch}${showBranchCount ? ` <span class="muted">(${o.branch_outlet_count} outlet)</span>` : ""}</td>
            <td>${o.region}</td>
            <td class="num">${o.invoice_count}</td>
            <td class="num">${o.qty_carton}</td>
            <td class="num"><strong>${fmtIDR(o.net_sales_idr)}</strong></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderAuditModal(audit) {
  const dups = audit.duplicate_details
    .map((d) => `<li>Baris ${d.line}: <code>${d.invoice_no}</code> — ${d.sku} (${fmtIDR(d.net_sales_idr)})</li>`)
    .join("");
  const rets = audit.return_details
    .map((r) => `<li>Baris ${r.line}: <code>${r.invoice_no}</code> (${r.date}) — ${r.outlet_id} ${r.outlet_name}, ${r.qty_carton} karton, ${fmtIDR(r.net_sales_idr)}</li>`)
    .join("");

  document.getElementById("audit-body").innerHTML = `
    <p><strong>Sumber:</strong> <code>${audit.source_name}</code> (${audit.raw_rows} baris mentah → <strong>${audit.cleaned_rows}</strong> baris bersih)</p>
    <p><strong>Metode Deduplikasi:</strong> ${audit.dedup_method} (menghindari penghapusan multi-SKU dalam 1 invoice atau repeat order sah).</p>
    <ul>
      <li><strong>Normalisasi Region:</strong> ${audit.region_normalized_rows} baris diseragamkan (${Object.entries(audit.region_variants).map(([k, v]) => `<code>${k}</code> → ${v}`).join(", ")}).</li>
      <li><strong>Duplikat Identik Dihapus:</strong> ${audit.duplicates_removed} baris (total ${fmtIDR(audit.duplicate_net_sales_removed_idr)}):<ul>${dups}</ul></li>
      <li><strong>Spasi Nama Outlet Dirapikan:</strong> ${audit.outlet_trimmed_rows} baris.</li>
      <li><strong>Salesman Kosong:</strong> ${audit.missing_salesman_rows} baris ditandai <code>"Unknown"</code>.</li>
      <li><strong>Nota Retur (Tetap Dihitung di Net Sales):</strong> ${audit.return_rows} baris:<ul>${rets}</ul></li>
    </ul>`;
}

async function sendTelegram(mode) {
  const res = await fetch("/api/telegram/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeframe: state.timeframe, scope: state.region, mode }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.detail || "Gagal mengirim");
    return;
  }
  showToast(`Berhasil memproses ${data.sent_count} pesan Telegram (${data.dispatches[0]?.status}).`);
  await loadTelegramLogs();
}

async function loadTelegramLogs() {
  const res = await fetch("/api/telegram/logs");
  const { logs } = await res.json();
  const container = document.getElementById("dispatch-logs");
  if (!logs.length) return;
  container.innerHTML = logs
    .map(
      (l) => `
      <div class="dispatch-item">
        <div class="dispatch-item-head">
          <strong>${l.pic_name} · <span class="muted">${l.timeframe}</span></strong>
          <span>
            <span class="pill ${l.status === "SENT_LIVE" ? "pill-ok" : "pill-warn"}">${l.status}</span>
            <span class="muted">${l.timestamp}</span>
          </span>
        </div>
        <div class="dispatch-msg">${renderTelegramMarkdown(l.message)}</div>
      </div>`
    )
    .join("");
}

async function openTgConfig() {
  const res = await fetch("/api/telegram/recipients");
  const cfg = await res.json();
  document.getElementById("tg-mode-indicator").textContent = cfg.has_bot_token
    ? `Mode: Live Bot (${cfg.bot_token_masked})`
    : "Mode: Demo / Dry-Run (tanpa Bot Token)";

  const listEl = document.getElementById("cfg-recipients-list");
  listEl.innerHTML = cfg.recipients
    .map(
      (r) => `
      <div class="rec-row" data-scope="${r.scope}">
        <strong>${r.role}</strong>
        <input type="text" class="rec-name" value="${r.pic_name}" placeholder="Nama PIC" />
        <input type="text" class="rec-chat" value="${r.chat_id}" placeholder="Telegram Chat ID (opsional)" />
      </div>`
    )
    .join("");
  document.getElementById("modal-tg-config").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  fetchDashboard();
  loadTelegramLogs();

  document.getElementById("filter-timeframe").addEventListener("change", (e) => {
    state.timeframe = e.target.value;
    fetchDashboard();
  });
  document.getElementById("filter-region").addEventListener("change", (e) => {
    state.region = e.target.value;
    state.branch = "ALL";
    fetchDashboard();
  });
  document.getElementById("filter-branch").addEventListener("change", (e) => {
    state.branch = e.target.value;
    fetchDashboard();
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      state.weakTab = btn.dataset.tab;
      renderWeakestTab();
    });
  });

  document.getElementById("btn-copy-tg").addEventListener("click", async () => {
    if (!state.data) return;
    await navigator.clipboard.writeText(state.data.telegram_summary.text);
    showToast("Ringkasan Telegram disalin ke clipboard.");
  });
  document.getElementById("btn-send-single").addEventListener("click", () => sendTelegram("single"));
  document.getElementById("btn-blast-all").addEventListener("click", () => sendTelegram("blast_all_regions"));

  document.getElementById("btn-audit").addEventListener("click", () => {
    document.getElementById("modal-audit").classList.remove("hidden");
  });
  document.getElementById("btn-tg-config").addEventListener("click", openTgConfig);

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.close).classList.add("hidden");
    });
  });

  document.getElementById("tg-config-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tokenInput = document.getElementById("cfg-bot-token").value;
    const recipients = {};
    document.querySelectorAll(".rec-row").forEach((row) => {
      recipients[row.dataset.scope] = {
        pic_name: row.querySelector(".rec-name").value,
        chat_id: row.querySelector(".rec-chat").value,
      };
    });
    const res = await fetch("/api/telegram/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_token: tokenInput || "__KEEP__", recipients }),
    });
    const cfg = await res.json();
    document.getElementById("tg-mode-indicator").textContent = cfg.has_bot_token
      ? `Mode: Live Bot (${cfg.bot_token_masked})`
      : "Mode: Demo / Dry-Run (tanpa Bot Token)";
    document.getElementById("modal-tg-config").classList.add("hidden");
    showToast("Pengaturan Telegram disimpan.");
  });

  document.getElementById("csv-upload").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json();
      alert(err.detail || "Upload gagal");
      return;
    }
    state.timeframe = "ytd";
    state.region = "ALL";
    state.branch = "ALL";
    state.data = await res.json();
    syncFilterOptions(state.data.filters);
    renderDashboard(state.data);
    showToast(`Berhasil memuat ${file.name}.`);
  });
});
