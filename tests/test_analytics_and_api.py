"""Automated tests for data cleaning, aggregations, and scoped Telegram dispatch."""

from pathlib import Path
from fastapi.testclient import TestClient

from app.analytics import compute_dashboard, load_sales_csv
from app.main import app

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "dua_kelinci_sales.csv"


def test_data_cleaning_and_exact_dedup() -> None:
    ds = load_sales_csv(CSV_PATH.read_text(encoding="utf-8-sig"))
    assert ds.audit["raw_rows"] == 1891
    assert ds.audit["cleaned_rows"] == 1888
    assert ds.audit["duplicates_removed"] == 3
    assert ds.audit["region_normalized_rows"] == 10
    assert ds.audit["outlet_trimmed_rows"] == 4
    assert ds.audit["missing_salesman_rows"] == 5
    assert ds.audit["return_rows"] == 1
    assert ds.audit["return_details"][0]["invoice_no"] == "RTR900001"
    assert len(ds.regions) == 6
    assert len(ds.brands) == 8


def test_timeframe_totals_and_three_tier_weakest_outlets() -> None:
    ds = load_sales_csv(CSV_PATH.read_text(encoding="utf-8-sig"))

    sep = compute_dashboard(ds, timeframe="2026-09")
    oct_d = compute_dashboard(ds, timeframe="2026-10")
    ytd = compute_dashboard(ds, timeframe="ytd")

    assert sep["kpis"]["net_sales_idr"] == 847_517_400
    assert oct_d["kpis"]["net_sales_idr"] == 878_448_600
    assert ytd["kpis"]["net_sales_idr"] == 1_725_966_000
    assert ytd["kpis"]["sales_invoices"] == 823
    assert ytd["kpis"]["return_count"] == 1

    nat_ids = [o["outlet_id"] for o in ytd["weakest_outlets"]["national_bottom_5"]]
    assert nat_ids == ["OUT1003", "OUT1026", "OUT1035", "OUT1045", "OUT1042"]
    assert len(ytd["weakest_outlets"]["lowest_per_branch"]) == 13
    for reg in ds.regions:
        assert len(ytd["weakest_outlets"]["bottom_5_per_region"][reg]) == 5


def test_telegram_blast_sends_distinct_region_messages() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/telegram/send",
        json={"timeframe": "ytd", "scope": "ALL", "mode": "blast_all_regions", "lang": "id"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["sent_count"] == 6
    messages_by_region = {d["scope"]: d["message"] for d in data["dispatches"]}
    assert len(set(messages_by_region.values())) == 6
    for reg, msg in messages_by_region.items():
        assert reg in msg
        assert "Outlet Terlemah/Cabang:" in msg


def test_bilingual_english_dashboard_and_telegram() -> None:
    client = TestClient(app)
    resp = client.get("/api/dashboard?timeframe=ytd&region=ALL&lang=en")
    assert resp.status_code == 200
    data = resp.json()
    assert data["filters"]["lang"] == "en"
    assert "Dua Kelinci Sales Digest — National" in data["telegram_summary"]["text"]

    blast = client.post(
        "/api/telegram/send",
        json={"timeframe": "ytd", "scope": "ALL", "mode": "blast_all_regions", "lang": "en"},
    )
    assert blast.status_code == 200
    for d in blast.json()["dispatches"]:
        assert d["lang"] == "en"
        assert "Weakest/Branch:" in d["message"]
