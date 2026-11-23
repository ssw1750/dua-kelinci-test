"""In-memory CSV cleaning, aggregation, and Telegram summary engine."""

from __future__ import annotations

import collections
import csv
import io
from dataclasses import dataclass
from typing import Any

REGION_ALIASES: dict[str, str] = {
    "JABODETABEK": "Jabodetabek",
    "JAWA BARAT": "Jawa Barat",
    "JABAR": "Jawa Barat",
    "JAWA TENGAH": "Jawa Tengah",
    "JATENG": "Jawa Tengah",
    "JAWA TIMUR": "Jawa Timur",
    "JATIM": "Jawa Timur",
    "KALIMANTAN": "Kalimantan",
    "SUMATERA": "Sumatera",
}

TIMEFRAME_LABELS: dict[str, dict[str, str]] = {
    "id": {
        "ytd": "YTD (Sep–Okt 2026)",
        "2026-09": "September 2026",
        "2026-10": "Oktober 2026",
    },
    "en": {
        "ytd": "YTD (Sep–Oct 2026)",
        "2026-09": "September 2026",
        "2026-10": "October 2026",
    },
}


def normalize_region(raw_region: str) -> tuple[str, bool]:
    """Canonicalize region casing/abbreviations and report whether it changed."""
    cleaned = " ".join(raw_region.strip().split())
    canonical = REGION_ALIASES.get(cleaned.upper(), cleaned)
    return canonical, canonical != raw_region


def format_idr_compact(amount: int | float, lang: str = "id") -> str:
    """Format IDR amounts into concise shorthand for Telegram/cards."""
    sign = "-" if amount < 0 else ""
    val = abs(amount)
    if lang == "en":
        if val >= 1_000_000_000:
            return f"{sign}Rp {val / 1_000_000_000:.2f}B"
        if val >= 1_000_000:
            return f"{sign}Rp {val / 1_000_000:.1f}M"
        if val >= 1_000:
            return f"{sign}Rp {round(val / 1_000):,}K"
        return f"{sign}Rp {int(val):,}"
    if val >= 1_000_000_000:
        return f"{sign}Rp {val / 1_000_000_000:.2f} M".replace(".", ",")
    if val >= 1_000_000:
        return f"{sign}Rp {val / 1_000_000:.1f} jt".replace(".", ",")
    if val >= 1_000:
        return f"{sign}Rp {round(val / 1_000):,} rb".replace(",", ".")
    return f"{sign}Rp {int(val):,}".replace(",", ".")


@dataclass(frozen=True)
class SalesDataset:
    """Cleaned, immutable in-memory sales dataset plus data-quality audit trail."""

    rows: tuple[dict[str, Any], ...]
    audit: dict[str, Any]
    regions: tuple[str, ...]
    branches_by_region: dict[str, tuple[str, ...]]
    brands: tuple[str, ...]
    months: tuple[str, ...]


def load_sales_csv(csv_text: str, source_name: str = "dua_kelinci_sales.csv") -> SalesDataset:
    """Parse, normalize, and safely deduplicate sales CSV text in memory."""
    reader = csv.DictReader(io.StringIO(csv_text.lstrip("\ufeff")))
    if not reader.fieldnames:
        raise ValueError("CSV file has no header row.")

    seen_full_rows: set[tuple[Any, ...]] = set()
    cleaned_rows: list[dict[str, Any]] = []

    raw_count = 0
    region_normalized_rows = 0
    region_variants: dict[str, str] = {}
    outlet_trimmed_rows = 0
    missing_salesman_rows = 0
    duplicate_records: list[dict[str, Any]] = []
    return_records: list[dict[str, Any]] = []

    for line_no, raw in enumerate(reader, start=2):
        raw_count += 1
        raw_region = raw["region"]
        canonical_region, region_changed = normalize_region(raw_region)
        if region_changed:
            region_normalized_rows += 1
            region_variants[raw_region] = canonical_region

        raw_outlet_name = raw["outlet_name"]
        trimmed_outlet_name = " ".join(raw_outlet_name.strip().split())
        if trimmed_outlet_name != raw_outlet_name:
            outlet_trimmed_rows += 1

        raw_salesman = (raw.get("salesman") or "").strip()
        if not raw_salesman:
            missing_salesman_rows += 1
            salesman = "Unknown"
        else:
            salesman = raw_salesman

        qty = int(raw["qty_carton"])
        price = int(raw["price_per_carton_idr"])
        gross = int(raw["gross_sales_idr"])
        discount = int(raw["discount_idr"])
        net = int(raw["net_sales_idr"])
        invoice_no = raw["invoice_no"].strip()
        is_return = invoice_no.startswith("RTR") or qty < 0 or net < 0

        normalized_row: dict[str, Any] = {
            "date": raw["date"].strip(),
            "month": raw["date"].strip()[:7],
            "invoice_no": invoice_no,
            "region": canonical_region,
            "branch": raw["branch"].strip(),
            "outlet_id": raw["outlet_id"].strip(),
            "outlet_name": trimmed_outlet_name,
            "outlet_type": raw["outlet_type"].strip(),
            "salesman": salesman,
            "brand": raw["brand"].strip(),
            "sku": raw["sku"].strip(),
            "qty_carton": qty,
            "price_per_carton_idr": price,
            "gross_sales_idr": gross,
            "discount_idr": discount,
            "net_sales_idr": net,
            "is_return": is_return,
        }

        # Exact full-row deduplication across all normalized business columns
        dedup_key = (
            normalized_row["date"],
            normalized_row["invoice_no"],
            normalized_row["region"],
            normalized_row["branch"],
            normalized_row["outlet_id"],
            normalized_row["outlet_name"],
            normalized_row["outlet_type"],
            normalized_row["salesman"],
            normalized_row["brand"],
            normalized_row["sku"],
            normalized_row["qty_carton"],
            normalized_row["price_per_carton_idr"],
            normalized_row["gross_sales_idr"],
            normalized_row["discount_idr"],
            normalized_row["net_sales_idr"],
        )
        if dedup_key in seen_full_rows:
            duplicate_records.append(
                {
                    "line": line_no,
                    "invoice_no": invoice_no,
                    "sku": normalized_row["sku"],
                    "net_sales_idr": net,
                }
            )
            continue
        seen_full_rows.add(dedup_key)

        if is_return:
            return_records.append(
                {
                    "line": line_no,
                    "date": normalized_row["date"],
                    "invoice_no": invoice_no,
                    "region": canonical_region,
                    "branch": normalized_row["branch"],
                    "outlet_id": normalized_row["outlet_id"],
                    "outlet_name": trimmed_outlet_name,
                    "sku": normalized_row["sku"],
                    "qty_carton": qty,
                    "net_sales_idr": net,
                }
            )

        cleaned_rows.append(normalized_row)

    regions = tuple(sorted({r["region"] for r in cleaned_rows}))
    branches_by_region = {
        reg: tuple(sorted({r["branch"] for r in cleaned_rows if r["region"] == reg}))
        for reg in regions
    }
    brands = tuple(sorted({r["brand"] for r in cleaned_rows}))
    months = tuple(sorted({r["month"] for r in cleaned_rows}))

    audit = {
        "source_name": source_name,
        "raw_rows": raw_count,
        "cleaned_rows": len(cleaned_rows),
        "duplicates_removed": len(duplicate_records),
        "duplicate_details": duplicate_records,
        "duplicate_net_sales_removed_idr": sum(d["net_sales_idr"] for d in duplicate_records),
        "region_normalized_rows": region_normalized_rows,
        "region_variants": region_variants,
        "outlet_trimmed_rows": outlet_trimmed_rows,
        "missing_salesman_rows": missing_salesman_rows,
        "return_rows": len(return_records),
        "return_details": return_records,
        "dedup_method": "Exact full-row match across all 15 normalized columns",
    }

    return SalesDataset(
        rows=tuple(cleaned_rows),
        audit=audit,
        regions=regions,
        branches_by_region=branches_by_region,
        brands=brands,
        months=months,
    )


def _filter_rows(
    dataset: SalesDataset,
    timeframe: str = "ytd",
    region: str = "ALL",
    branch: str = "ALL",
) -> list[dict[str, Any]]:
    rows = list(dataset.rows)
    if timeframe != "ytd":
        rows = [r for r in rows if r["month"] == timeframe]
    if region != "ALL":
        rows = [r for r in rows if r["region"] == region]
    if branch != "ALL":
        rows = [r for r in rows if r["branch"] == branch]
    return rows


def _aggregate_outlets(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    stats: dict[str, dict[str, Any]] = {}
    for r in rows:
        oid = r["outlet_id"]
        if oid not in stats:
            stats[oid] = {
                "outlet_id": oid,
                "outlet_name": r["outlet_name"],
                "outlet_type": r["outlet_type"],
                "region": r["region"],
                "branch": r["branch"],
                "net_sales_idr": 0,
                "gross_sales_idr": 0,
                "qty_carton": 0,
                "invoices": set(),
            }
        entry = stats[oid]
        entry["net_sales_idr"] += r["net_sales_idr"]
        entry["gross_sales_idr"] += r["gross_sales_idr"]
        entry["qty_carton"] += r["qty_carton"]
        if not r["is_return"]:
            entry["invoices"].add(r["invoice_no"])

    result = []
    for entry in stats.values():
        result.append(
            {
                "outlet_id": entry["outlet_id"],
                "outlet_name": entry["outlet_name"],
                "outlet_type": entry["outlet_type"],
                "region": entry["region"],
                "branch": entry["branch"],
                "net_sales_idr": entry["net_sales_idr"],
                "gross_sales_idr": entry["gross_sales_idr"],
                "qty_carton": entry["qty_carton"],
                "invoice_count": len(entry["invoices"]),
            }
        )
    result.sort(key=lambda x: (x["net_sales_idr"], x["qty_carton"], x["outlet_id"]))
    return result


def compute_dashboard(
    dataset: SalesDataset,
    timeframe: str = "ytd",
    region: str = "ALL",
    branch: str = "ALL",
    lang: str = "id",
) -> dict[str, Any]:
    """Compute scoped dashboard metrics, matrices, 3-tier weakest outlets, and Telegram summary."""
    lang = "en" if lang == "en" else "id"
    scoped_rows = _filter_rows(dataset, timeframe=timeframe, region=region, branch=branch)
    tf_all_rows = _filter_rows(dataset, timeframe=timeframe, region="ALL", branch="ALL")

    net_sales = sum(r["net_sales_idr"] for r in scoped_rows)
    gross_sales = sum(r["gross_sales_idr"] for r in scoped_rows)
    discount_total = sum(r["discount_idr"] for r in scoped_rows)
    qty_carton = sum(r["qty_carton"] for r in scoped_rows)
    sales_invoices = len({r["invoice_no"] for r in scoped_rows if not r["is_return"]})
    return_count = sum(1 for r in scoped_rows if r["is_return"])
    return_value = sum(r["net_sales_idr"] for r in scoped_rows if r["is_return"])

    # MoM comparison when viewing October or YTD
    mom_pct: float | None = None
    if timeframe in ("2026-10", "ytd"):
        sep_rows = _filter_rows(dataset, timeframe="2026-09", region=region, branch=branch)
        oct_rows = _filter_rows(dataset, timeframe="2026-10", region=region, branch=branch)
        sep_net = sum(r["net_sales_idr"] for r in sep_rows)
        oct_net = sum(r["net_sales_idr"] for r in oct_rows)
        if sep_net > 0:
            mom_pct = round(((oct_net - sep_net) / sep_net) * 100, 2)

    # Region breakdown (always across selected timeframe + optional region highlight)
    reg_totals: dict[str, dict[str, Any]] = {
        reg: {"region": reg, "net_sales_idr": 0, "qty_carton": 0, "invoices": set()}
        for reg in dataset.regions
    }
    for r in tf_all_rows:
        bucket = reg_totals[r["region"]]
        bucket["net_sales_idr"] += r["net_sales_idr"]
        bucket["qty_carton"] += r["qty_carton"]
        if not r["is_return"]:
            bucket["invoices"].add(r["invoice_no"])

    national_net = sum(b["net_sales_idr"] for b in reg_totals.values())
    by_region = sorted(
        [
            {
                "region": b["region"],
                "net_sales_idr": b["net_sales_idr"],
                "qty_carton": b["qty_carton"],
                "invoice_count": len(b["invoices"]),
                "share_pct": round((b["net_sales_idr"] / national_net) * 100, 1) if national_net else 0.0,
            }
            for b in reg_totals.values()
        ],
        key=lambda x: x["net_sales_idr"],
        reverse=True,
    )

    # Brand breakdown within active scope
    brand_totals: dict[str, dict[str, Any]] = {
        br: {"brand": br, "net_sales_idr": 0, "qty_carton": 0} for br in dataset.brands
    }
    for r in scoped_rows:
        bkt = brand_totals[r["brand"]]
        bkt["net_sales_idr"] += r["net_sales_idr"]
        bkt["qty_carton"] += r["qty_carton"]

    by_brand = sorted(
        [
            {
                "brand": b["brand"],
                "net_sales_idr": b["net_sales_idr"],
                "qty_carton": b["qty_carton"],
                "share_pct": round((b["net_sales_idr"] / net_sales) * 100, 1) if net_sales else 0.0,
            }
            for b in brand_totals.values()
        ],
        key=lambda x: x["net_sales_idr"],
        reverse=True,
    )

    # Brand x Region matrix (for active timeframe)
    matrix: dict[str, dict[str, int]] = {
        br: {reg: 0 for reg in dataset.regions} for br in dataset.brands
    }
    for r in tf_all_rows:
        matrix[r["brand"]][r["region"]] += r["net_sales_idr"]
    brand_region_matrix = [
        {
            "brand": br_item["brand"],
            "total_idr": sum(matrix[br_item["brand"]].values()),
            "regions": matrix[br_item["brand"]],
        }
        for br_item in sorted(
            [{"brand": b, "t": sum(matrix[b].values())} for b in dataset.brands],
            key=lambda x: x["t"],
            reverse=True,
        )
    ]

    # 3-Tier Weakest Outlets
    national_outlets = _aggregate_outlets(tf_all_rows)
    national_bottom_5 = national_outlets[:5]

    region_scope_rows = _filter_rows(
        dataset,
        timeframe=timeframe,
        region=region if region != "ALL" else "ALL",
        branch="ALL",
    )
    region_outlets = _aggregate_outlets(region_scope_rows)

    bottom_5_per_region: dict[str, list[dict[str, Any]]] = {}
    for reg in dataset.regions:
        reg_only = [o for o in national_outlets if o["region"] == reg]
        bottom_5_per_region[reg] = reg_only[:5]

    # Lowest outlet per branch (filtered to region if region != ALL)
    branch_groups: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for o in region_outlets:
        branch_groups[o["branch"]].append(o)

    lowest_per_branch = []
    for br_name in sorted(branch_groups):
        ranked = sorted(branch_groups[br_name], key=lambda x: (x["net_sales_idr"], x["qty_carton"]))
        weakest = ranked[0]
        lowest_per_branch.append(
            {
                **weakest,
                "branch_outlet_count": len(ranked),
                "branch_total_net_sales_idr": sum(x["net_sales_idr"] for x in ranked),
            }
        )
    lowest_per_branch.sort(key=lambda x: x["net_sales_idr"])

    telegram_summary = build_telegram_summary(
        dataset=dataset,
        timeframe=timeframe,
        scope_region=region,
        by_region=by_region,
        by_brand=by_brand,
        national_bottom_5=national_bottom_5,
        bottom_5_per_region=bottom_5_per_region,
        lowest_per_branch=lowest_per_branch,
        scoped_net=net_sales,
        national_net=national_net,
        scoped_qty=qty_carton,
        scoped_invoices=sales_invoices,
        return_count=return_count,
        return_value=return_value,
        mom_pct=mom_pct,
        lang=lang,
    )

    tf_labels = TIMEFRAME_LABELS[lang]
    return {
        "filters": {
            "timeframe": timeframe,
            "timeframe_label": tf_labels.get(timeframe, timeframe),
            "region": region,
            "branch": branch,
            "lang": lang,
            "available_regions": list(dataset.regions),
            "branches_by_region": {k: list(v) for k, v in dataset.branches_by_region.items()},
            "available_months": list(dataset.months),
        },
        "kpis": {
            "net_sales_idr": net_sales,
            "gross_sales_idr": gross_sales,
            "discount_idr": discount_total,
            "qty_carton": qty_carton,
            "sales_invoices": sales_invoices,
            "return_count": return_count,
            "return_value_idr": return_value,
            "mom_pct": mom_pct,
            "national_share_pct": round((net_sales / national_net) * 100, 1) if national_net else 0.0,
        },
        "by_region": by_region,
        "by_brand": by_brand,
        "brand_region_matrix": brand_region_matrix,
        "weakest_outlets": {
            "national_bottom_5": national_bottom_5,
            "active_region_bottom_5": (
                bottom_5_per_region[region] if region != "ALL" else national_bottom_5
            ),
            "bottom_5_per_region": bottom_5_per_region,
            "lowest_per_branch": lowest_per_branch,
        },
        "telegram_summary": telegram_summary,
        "audit": dataset.audit,
    }


def build_telegram_summary(
    *,
    dataset: SalesDataset,
    timeframe: str,
    scope_region: str,
    by_region: list[dict[str, Any]],
    by_brand: list[dict[str, Any]],
    national_bottom_5: list[dict[str, Any]],
    bottom_5_per_region: dict[str, list[dict[str, Any]]],
    lowest_per_branch: list[dict[str, Any]],
    scoped_net: int,
    national_net: int,
    scoped_qty: int,
    scoped_invoices: int,
    return_count: int,
    return_value: int,
    mom_pct: float | None,
    lang: str = "id",
) -> dict[str, str]:
    """Generate an intuitive, mobile-friendly Telegram message tailored to scope and language."""
    tf_label = TIMEFRAME_LABELS[lang].get(timeframe, timeframe)
    mom_txt = ""
    if mom_pct is not None:
        arrow = "📈" if mom_pct >= 0 else "📉"
        sign = "+" if mom_pct >= 0 else ""
        mom_txt = f" · {arrow} *{sign}{mom_pct:.2f}%* MoM"

    top_brand = by_brand[0] if by_brand else {"brand": "-", "net_sales_idr": 0, "share_pct": 0}

    if lang == "en":
        ret_txt = (
            f" (incl. {return_count} return {format_idr_compact(abs(return_value), 'en')})"
            if return_count
            else ""
        )
        if scope_region == "ALL":
            top_reg = by_region[0]
            low_reg = by_region[-1]
            weak_list = ", ".join(
                f"*{o['outlet_id']}* {o['outlet_name']} ({o['branch']}, {format_idr_compact(o['net_sales_idr'], 'en')})"
                for o in national_bottom_5
            )
            text = (
                f"📊 *Dua Kelinci Sales Digest — National ({tf_label})*\n"
                f"💰 Net Sales: *{format_idr_compact(scoped_net, 'en')}* ({scoped_qty:,} cartons · {scoped_invoices:,} invoices{ret_txt}{mom_txt})\n"
                f"🏆 Top Region: *{top_reg['region']}* ({format_idr_compact(top_reg['net_sales_idr'], 'en')}) | "
                f"Lowest: *{low_reg['region']}* ({format_idr_compact(low_reg['net_sales_idr'], 'en')}) | "
                f"Top Brand: *{top_brand['brand']}* ({top_brand['share_pct']}%)\n"
                f"⚠️ Bottom 5 Outlets (National): {weak_list}."
            )
            recipient_role = "Sales Manager (National)"
        else:
            share_pct = round((scoped_net / national_net) * 100, 1) if national_net else 0.0
            reg_weak_5 = bottom_5_per_region.get(scope_region, [])
            weak_list = ", ".join(
                f"*{o['outlet_id']}* {o['outlet_name']} ({o['branch']}, {format_idr_compact(o['net_sales_idr'], 'en')})"
                for o in reg_weak_5
            )
            branch_low = ", ".join(
                f"{b['branch']}: *{b['outlet_id']}* ({format_idr_compact(b['net_sales_idr'], 'en')})"
                for b in lowest_per_branch
            )
            text = (
                f"📊 *Region {scope_region} Sales Digest — ({tf_label})*\n"
                f"💰 Net Sales: *{format_idr_compact(scoped_net, 'en')}* ({share_pct}% of national · {scoped_qty:,} cartons · {scoped_invoices:,} invoices{ret_txt}{mom_txt})\n"
                f"🏆 Top Brand in Region: *{top_brand['brand']}* ({format_idr_compact(top_brand['net_sales_idr'], 'en')} / {top_brand['share_pct']}%) | "
                f"Weakest/Branch: {branch_low}\n"
                f"⚠️ Bottom 5 Outlets in {scope_region}: {weak_list}."
            )
            recipient_role = f"Regional PIC — {scope_region}"
        return {"scope": scope_region, "lang": "en", "recipient_role": recipient_role, "text": text}

    ret_txt = f" (termasuk {return_count} retur {format_idr_compact(abs(return_value), 'id')})" if return_count else ""
    if scope_region == "ALL":
        top_reg = by_region[0]
        low_reg = by_region[-1]
        weak_list = ", ".join(
            f"*{o['outlet_id']}* {o['outlet_name']} ({o['branch']}, {format_idr_compact(o['net_sales_idr'], 'id')})"
            for o in national_bottom_5
        )
        text = (
            f"📊 *Rekap Penjualan Dua Kelinci — Nasional ({tf_label})*\n"
            f"💰 Net Sales: *{format_idr_compact(scoped_net, 'id')}* ({scoped_qty:,} karton · {scoped_invoices:,} invoice{ret_txt}{mom_txt})\n"
            f"🏆 Top Region: *{top_reg['region']}* ({format_idr_compact(top_reg['net_sales_idr'], 'id')}) | "
            f"Terendah: *{low_reg['region']}* ({format_idr_compact(low_reg['net_sales_idr'], 'id')}) | "
            f"Top Brand: *{top_brand['brand']}* ({top_brand['share_pct']}%)\n"
            f"⚠️ 5 Outlet Terlemah Nasional: {weak_list}."
        )
        recipient_role = "Sales Manager (Nasional)"
    else:
        share_pct = round((scoped_net / national_net) * 100, 1) if national_net else 0.0
        reg_weak_5 = bottom_5_per_region.get(scope_region, [])
        weak_list = ", ".join(
            f"*{o['outlet_id']}* {o['outlet_name']} ({o['branch']}, {format_idr_compact(o['net_sales_idr'], 'id')})"
            for o in reg_weak_5
        )
        branch_low = ", ".join(
            f"{b['branch']}: *{b['outlet_id']}* ({format_idr_compact(b['net_sales_idr'], 'id')})"
            for b in lowest_per_branch
        )
        text = (
            f"📊 *Rekap Wilayah {scope_region} — ({tf_label})*\n"
            f"💰 Net Sales: *{format_idr_compact(scoped_net, 'id')}* ({share_pct}% nasional · {scoped_qty:,} karton · {scoped_invoices:,} invoice{ret_txt}{mom_txt})\n"
            f"🏆 Top Brand Wilayah: *{top_brand['brand']}* ({format_idr_compact(top_brand['net_sales_idr'], 'id')} / {top_brand['share_pct']}%) | "
            f"Outlet Terlemah/Cabang: {branch_low}\n"
            f"⚠️ 5 Outlet Terlemah {scope_region}: {weak_list}."
        )
        recipient_role = f"Regional PIC — {scope_region}"

    return {"scope": scope_region, "lang": "id", "recipient_role": recipient_role, "text": text}
