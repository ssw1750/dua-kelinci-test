const state = {
  timeframe: "ytd",
  region: "ALL",
  branch: "ALL",
  lang: "id",
  weakTab: "national",
  data: null,
};

const I18N = {
  id: {
    subtitle: "Monitoring Penjualan Region, Brand, Outlet Terlemah & Telegram Digest",
    audit_btn: "Audit Data",
    upload_btn: "Upload CSV",
    tg_settings_btn: "⚙️ Pengaturan Telegram",
    lbl_timeframe: "Periode",
    lbl_region: "Tampilan PIC / Region",
    lbl_branch: "Cabang (Branch)",
    opt_ytd: "YTD (Data Tersedia: Sep–Okt 2026)",
    opt_sep: "Bulanan — September 2026",
    opt_oct: "Bulanan — Oktober 2026",
    opt_all_regions: "Nasional — Sales Manager (Semua Region)",
    opt_all_branches: "Semua Cabang",
    kpi_net: "Total Net Sales",
    kpi_vol: "Total Volume",
    kpi_inv: "Invoice Penjualan",
    kpi_top: "Top Performer",
    cartons: "karton",
    invoices: "invoice",
    from_national: "dari total nasional",
    first_month: "Bulan awal dataset",
    returns_zero: "0 retur pada cakupan ini",
    tg_title: "Ringkasan Telegram",
    tg_sub: "Format ringkas 1 paragraf siap baca di mobile, otomatis menyesuaikan data region & cabang PIC.",
    btn_copy: "Salin Pesan",
    btn_send_single: "Kirim ke PIC Terpilih",
    btn_blast: "Blast Semua Regional PIC (6 Region)",
    log_title: "Log Pengiriman Telegram",
    reg_title: "Penjualan per Region",
    reg_sub: "6 region kanonikal (setelah normalisasi label)",
    brand_title: "Penjualan per Brand",
    brand_nat: "Cakupan Nasional",
    brand_reg: "Khusus Wilayah",
    matrix_title: "Matriks Penjualan Brand × Region",
    matrix_sub: "Net sales (IDR) setiap brand di masing-masing region untuk periode terpilih",
    weak_title: "Penandaan Outlet Terlemah (3 Level)",
    tab_nat: "5 Terlemah Nasional",
    tab_reg: "5 Terlemah per Region",
    tab_br: "Terlemah per Branch (13 Cabang)",
    copied: "Ringkasan Telegram disalin ke clipboard.",
    sent_ok: "Berhasil memproses {n} pesan Telegram ({s}).",
    cfg_saved: "Pengaturan Telegram disimpan.",
  },
  en: {
    subtitle: "Regional & Brand Sales Monitoring, Weakest Outlets & Telegram Digest",
    audit_btn: "Data Audit",
    upload_btn: "Upload CSV",
    tg_settings_btn: "⚙️ Telegram Settings",
    lbl_timeframe: "Timeframe",
    lbl_region: "PIC / Region View",
    lbl_branch: "Branch",
    opt_ytd: "YTD (Available Data: Sep–Oct 2026)",
    opt_sep: "Monthly — September 2026",
    opt_oct: "Monthly — October 2026",
    opt_all_regions: "National — Sales Manager (All Regions)",
    opt_all_branches: "All Branches",
    kpi_net: "Total Net Sales",
    kpi_vol: "Total Volume",
    kpi_inv: "Sales Invoices",
    kpi_top: "Top Performer",
    cartons: "cartons",
    invoices: "invoices",
    from_national: "of national total",
    first_month: "First month in dataset",
    returns_zero: "0 returns in current scope",
    tg_title: "Telegram Summary",
    tg_sub: "Scannable 1-paragraph mobile digest, automatically tailored to each PIC's region & branch performance.",
    btn_copy: "Copy Message",
    btn_send_single: "Send to Selected PIC",
    btn_blast: "Blast All Regional PICs (6 Regions)",
    log_title: "Telegram Dispatch Log",
    reg_title: "Sales by Region",
    reg_sub: "6 canonical regions (after label normalization)",
    brand_title: "Sales by Brand",
    brand_nat: "National Scope",
    brand_reg: "Region Scope:",
    matrix_title: "Brand × Region Sales Matrix",
    matrix_sub: "Net sales (IDR) for each brand across regions in selected timeframe",
    weak_title: "Weakest Outlets Flagging (3 Tiers)",
    tab_nat: "Bottom 5 National",
    tab_reg: "Bottom 5 per Region",
    tab_br: "Lowest per Branch (13 Branches)",
    copied: "Telegram summary copied to clipboard.",
    sent_ok: "Processed {n} Telegram message(s) ({s}).",
    cfg_saved: "Telegram settings saved.",
  },
};

const t = (key) => I18N[state.lang][key] || key;
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

function applyStaticTranslations() {
  document.querySelector(".subtitle").textContent = t("subtitle");
  document.querySelector('[data-i18n="audit_btn"]').textContent = t("audit_btn");
  document.querySelector('[data-i18n="upload_btn"]').textContent = t("upload_btn");
  document.querySelector('[data-i18n="tg_settings_btn"]').textContent = t("tg_settings_btn");

  document.querySelector('label[for="filter-timeframe"]').textContent = t("lbl_timeframe");
  document.querySelector('label[for="filter-region"]').textContent = t("lbl_region");
  document.querySelector('label[for="filter-branch"]').textContent = t("lbl_branch");

  const tfSel = document.getElementById("filter-timeframe");
  tfSel.options[0].textContent = t("opt_ytd");
  tfSel.options[1].textContent = t("opt_sep");
  tfSel.options[2].textContent = t("opt_oct");

  const kpiLabels = document.querySelectorAll(".kpi-label");
  kpiLabels[0].textContent = t("kpi_net");
  kpiLabels[1].textContent = t("kpi_vol");
  kpiLabels[2].textContent = t("kpi_inv");
  kpiLabels[3].textContent = t("kpi_top");

  document.getElementById("btn-copy-tg").textContent = t("btn_copy");
  document.getElementById("btn-send-single").textContent = t("btn_send_single");
  document.getElementById("btn-blast-all").textContent = t("btn_blast");
  document.querySelector(".telegram-section .section-sub").textContent = t("tg_sub");
  document.querySelector(".dispatch-header h3").textContent = t("log_title");

  const twoColHeaders = document.querySelectorAll(".two-col .section-header");
  twoColHeaders[0].querySelector("h2").textContent = t("reg_title");
  twoColHeaders[0].querySelector(".section-sub").textContent = t("reg_sub");
  twoColHeaders[1].querySelector("h2").textContent = t("brand_title");

  document.querySelector("#matrix-table").closest(".card").querySelector("h2").textContent = t("matrix_title");
  document.querySelector("#matrix-table").closest(".card").querySelector(".section-sub").textContent = t("matrix_sub");

  const weakCard = document.getElementById("weakest-content").closest(".card");
  weakCard.querySelector("h2").textContent = t("weak_title");
  document.querySelector('.tab[data-tab="national"]').textContent = t("tab_nat");
  document.querySelector('.tab[data-tab="region"]').textContent = t("tab_reg");
  document.querySelector('.tab[data-tab="branch"]').textContent = t("tab_br");
}

async function fetchDashboard() {
  const params = new URLSearchParams({
    timeframe: state.timeframe,
    region: state.region,
    branch: state.branch,
    lang: state.lang,
  });
  const res = await fetch(`/api/dashboard?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json();
    alert(err.detail || "Failed to load data");
    return;
  }
  state.data = await res.json();
  syncFilterOptions(state.data.filters);
  applyStaticTranslations();
  renderDashboard(state.data);
}

function syncFilterOptions(filters) {
  const regSel = document.getElementById("filter-region");
  regSel.innerHTML = `<option value="ALL">${t("opt_all_regions")}</option>`;
  filters.available_regions.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = `Regional PIC — ${r}`;
    regSel.appendChild(opt);
  });
  regSel.value = state.region;

  const brSel = document.getElementById("filter-branch");
  const validBranches =
    state.region === "ALL"
      ? Object.values(filters.branches_by_region).flat().sort()
      : filters.branches_by_region[state.region] || [];
  brSel.innerHTML = `<option value="ALL">${t("opt_all_branches")}</option>`;
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
  const scopeLabel = filters.region === "ALL" ? (state.lang === "en" ? "National" : "Nasional") : filters.region;

  document.getElementById("active-scope-pill").textContent =
    `${filters.timeframe_label} · ${scopeLabel}` +
    (filters.branch !== "ALL" ? ` / ${filters.branch}` : "");

  const issueCount =
    audit.duplicates_removed +
    audit.region_normalized_rows +
    audit.outlet_trimmed_rows +
    audit.missing_salesman_rows;
  document.getElementById("audit-badge-count").textContent =
    `${issueCount} ${state.lang === "en" ? "fixes" : "temuan"} + ${audit.return_rows} ${state.lang === "en" ? "return" : "retur"}`;

  // KPIs
  document.getElementById("kpi-net-sales").textContent = fmtIDR(kpis.net_sales_idr);
  document.getElementById("kpi-mom").textContent =
    kpis.mom_pct !== null
      ? `${kpis.mom_pct >= 0 ? "+" : ""}${kpis.mom_pct}% vs Sep 2026`
      : t("first_month");
  document.getElementById("kpi-qty").textContent = `${kpis.qty_carton.toLocaleString("id-ID")} ${t("cartons")}`;
  document.getElementById("kpi-share").textContent = `${kpis.national_share_pct}% ${t("from_national")}`;
  document.getElementById("kpi-invoices").textContent = `${kpis.sales_invoices.toLocaleString("id-ID")} ${t("invoices")}`;
  document.getElementById("kpi-returns").textContent =
    kpis.return_count > 0
      ? `${kpis.return_count} ${state.lang === "en" ? "return" : "retur"} (${fmtIDR(kpis.return_value_idr)})`
      : t("returns_zero");

  const topBrand = by_brand[0] || { brand: "-", share_pct: 0 };
  const topRegion = by_region[0] || { region: "-", share_pct: 0 };
  document.getElementById("kpi-top-brand").textContent = `${topBrand.brand} (${topBrand.share_pct}%)`;
  document.getElementById("kpi-top-region").textContent = `Top Region: ${topRegion.region} (${topRegion.share_pct}%)`;

  // Telegram Preview
  const tgH2 = document.querySelector(".telegram-section h2");
  tgH2.innerHTML = `${t("tg_title")} (<span id="tg-role-label">${telegram_summary.recipient_role}</span>)`;
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
    filters.region === "ALL" ? t("brand_nat") : `${t("brand_reg")} ${filters.region}`;
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
    container.innerHTML = buildOutletTable(wk.national_bottom_5, t("tab_nat"));
  } else if (state.weakTab === "region") {
    if (state.region !== "ALL") {
      container.innerHTML = buildOutletTable(
        wk.active_region_bottom_5,
        `${t("tab_reg")} — ${state.region}`
      );
    } else {
      container.innerHTML = Object.entries(wk.bottom_5_per_region)
        .map(([reg, list]) => `<h4 style="margin:12px 0 6px">${reg}</h4>` + buildOutletTable(list))
        .join("");
    }
  } else {
    container.innerHTML = buildOutletTable(wk.lowest_per_branch, t("tab_br"), true);
  }
}

function buildOutletTable(rows, caption = "", showBranchCount = false) {
  if (!rows || !rows.length) return '<p class="muted">No data.</p>';
  const isEn = state.lang === "en";
  return `
    ${caption ? `<p class="muted" style="margin:0 0 8px">${caption}</p>` : ""}
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Outlet ID</th>
          <th>${isEn ? "Outlet Name" : "Nama Outlet"}</th>
          <th>${isEn ? "Type" : "Tipe"}</th>
          <th>Branch</th>
          <th>Region</th>
          <th class="num">Invoice</th>
          <th class="num">${isEn ? "Cartons" : "Karton"}</th>
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
            <td>${o.branch}${showBranchCount ? ` <span class="muted">(${o.branch_outlet_count} outlets)</span>` : ""}</td>
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
    .map((d) => `<li>Line ${d.line}: <code>${d.invoice_no}</code> — ${d.sku} (${fmtIDR(d.net_sales_idr)})</li>`)
    .join("");
  const rets = audit.return_details
    .map((r) => `<li>Line ${r.line}: <code>${r.invoice_no}</code> (${r.date}) — ${r.outlet_id} ${r.outlet_name}, ${r.qty_carton} cartons, ${fmtIDR(r.net_sales_idr)}</li>`)
    .join("");

  document.getElementById("audit-body").innerHTML = `
    <p><strong>Source:</strong> <code>${audit.source_name}</code> (${audit.raw_rows} raw → <strong>${audit.cleaned_rows}</strong> cleaned rows)</p>
    <p><strong>Deduplication Method:</strong> ${audit.dedup_method} (preserves multi-SKU lines and valid repeat orders).</p>
    <ul>
      <li><strong>Region Normalization:</strong> ${audit.region_normalized_rows} rows (${Object.entries(audit.region_variants).map(([k, v]) => `<code>${k}</code> → ${v}`).join(", ")}).</li>
      <li><strong>Exact Duplicates Removed:</strong> ${audit.duplicates_removed} rows (${fmtIDR(audit.duplicate_net_sales_removed_idr)}):<ul>${dups}</ul></li>
      <li><strong>Outlet Name Whitespace Trimmed:</strong> ${audit.outlet_trimmed_rows} rows.</li>
      <li><strong>Missing Salesman:</strong> ${audit.missing_salesman_rows} rows tagged <code>"Unknown"</code>.</li>
      <li><strong>Return Credit Notes (Netted into Net Sales):</strong> ${audit.return_rows} row(s):<ul>${rets}</ul></li>
    </ul>`;
}

async function sendTelegram(mode) {
  const res = await fetch("/api/telegram/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timeframe: state.timeframe,
      scope: state.region,
      mode,
      lang: state.lang,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.detail || "Send failed");
    return;
  }
  showToast(
    t("sent_ok")
      .replace("{n}", data.sent_count)
      .replace("{s}", data.dispatches[0]?.status || "")
  );
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
          <strong>${l.pic_name} · <span class="muted">${l.timeframe} (${(l.lang || "id").toUpperCase()})</span></strong>
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
    : "Mode: Demo / Dry-Run";

  const listEl = document.getElementById("cfg-recipients-list");
  listEl.innerHTML = cfg.recipients
    .map(
      (r) => `
      <div class="rec-row" data-scope="${r.scope}">
        <strong>${r.role}</strong>
        <input type="text" class="rec-name" value="${r.pic_name}" placeholder="PIC Name" />
        <input type="text" class="rec-chat" value="${r.chat_id}" placeholder="Telegram Chat ID" />
        <select class="rec-lang">
          <option value="auto" ${r.lang === "auto" ? "selected" : ""}>Auto (UI)</option>
          <option value="id" ${r.lang === "id" ? "selected" : ""}>ID</option>
          <option value="en" ${r.lang === "en" ? "selected" : ""}>EN</option>
        </select>
      </div>`
    )
    .join("");
  document.getElementById("modal-tg-config").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  fetchDashboard();
  loadTelegramLogs();

  document.getElementById("lang-id").addEventListener("click", () => {
    state.lang = "id";
    document.getElementById("lang-id").classList.add("active");
    document.getElementById("lang-en").classList.remove("active");
    fetchDashboard();
  });
  document.getElementById("lang-en").addEventListener("click", () => {
    state.lang = "en";
    document.getElementById("lang-en").classList.add("active");
    document.getElementById("lang-id").classList.remove("active");
    fetchDashboard();
  });

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
      document.querySelectorAll(".tab").forEach((tBtn) => tBtn.classList.remove("active"));
      btn.classList.add("active");
      state.weakTab = btn.dataset.tab;
      renderWeakestTab();
    });
  });

  document.getElementById("btn-copy-tg").addEventListener("click", async () => {
    if (!state.data) return;
    await navigator.clipboard.writeText(state.data.telegram_summary.text);
    showToast(t("copied"));
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
        lang: row.querySelector(".rec-lang").value,
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
      : "Mode: Demo / Dry-Run";
    document.getElementById("modal-tg-config").classList.add("hidden");
    showToast(t("cfg_saved"));
  });

  document.getElementById("csv-upload").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json();
      alert(err.detail || "Upload failed");
      return;
    }
    state.timeframe = "ytd";
    state.region = "ALL";
    state.branch = "ALL";
    state.data = await res.json();
    syncFilterOptions(state.data.filters);
    applyStaticTranslations();
    renderDashboard(state.data);
    showToast(`Loaded ${file.name}.`);
  });
});
