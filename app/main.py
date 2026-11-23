"""FastAPI server with in-memory pre-aggregated cache and Telegram dispatch."""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.analytics import SalesDataset, compute_dashboard, export_cleaned_csv, load_sales_csv

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CSV_PATH = BASE_DIR / "data" / "dua_kelinci_sales.csv"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Dua Kelinci Sales Intelligence", version="1.0.0")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

_STATE_LOCK = threading.RLock()
_DATASET: SalesDataset = load_sales_csv(DEFAULT_CSV_PATH.read_text(encoding="utf-8-sig"), DEFAULT_CSV_PATH.name)
_IS_DEFAULT_DATASET: bool = True
_DASHBOARD_CACHE: dict[tuple[str, str, str, str], dict[str, Any]] = {}


def _build_default_recipients(regions: tuple[str, ...]) -> dict[str, dict[str, str]]:
    recipients: dict[str, dict[str, str]] = {
        "ALL": {
            "scope": "ALL",
            "role": "Sales Manager (Nasional)",
            "pic_name": "Budi Santoso (Sales Manager)",
            "chat_id": os.getenv("TELEGRAM_CHAT_ID_ALL", ""),
            "lang": "auto",
        }
    }
    default_names = {
        "Jabodetabek": "Rina Wijaya",
        "Jawa Barat": "Dian Pratama",
        "Jawa Tengah": "Agus Setiawan",
        "Jawa Timur": "Siti Rahmawati",
        "Kalimantan": "Hendra Kusuma",
        "Sumatera": "Fajar Nugroho",
    }
    for reg in regions:
        env_key = f"TELEGRAM_CHAT_ID_{reg.upper().replace(' ', '_')}"
        recipients[reg] = {
            "scope": reg,
            "role": f"Regional PIC — {reg}",
            "pic_name": f"{default_names.get(reg, 'PIC ' + reg)} ({reg})",
            "chat_id": os.getenv(env_key, ""),
            "lang": "auto",
        }
    return recipients


_TELEGRAM_CONFIG: dict[str, Any] = {
    "bot_token": os.getenv("TELEGRAM_BOT_TOKEN", ""),
    "recipients": _build_default_recipients(_DATASET.regions),
}
_DISPATCH_LOGS: list[dict[str, Any]] = []


def _get_cached_dashboard(timeframe: str, region: str, branch: str, lang: str = "id") -> dict[str, Any]:
    lang = "en" if lang == "en" else "id"
    key = (timeframe, region, branch, lang)
    with _STATE_LOCK:
        cached = _DASHBOARD_CACHE.get(key)
        if cached is not None:
            return cached
        if timeframe != "ytd" and timeframe not in _DATASET.months:
            raise HTTPException(status_code=400, detail=f"Unknown timeframe: {timeframe}")
        if region != "ALL" and region not in _DATASET.regions:
            raise HTTPException(status_code=400, detail=f"Unknown region: {region}")
        if branch != "ALL":
            valid_branches = (
                _DATASET.branches_by_region.get(region, ())
                if region != "ALL"
                else tuple(b for bs in _DATASET.branches_by_region.values() for b in bs)
            )
            if branch not in valid_branches:
                raise HTTPException(status_code=400, detail=f"Unknown branch: {branch}")
        result = compute_dashboard(_DATASET, timeframe=timeframe, region=region, branch=branch, lang=lang)
        result["dataset_status"] = {
            "source_name": _DATASET.audit["source_name"],
            "is_default": _IS_DEFAULT_DATASET,
            "raw_rows": _DATASET.audit["raw_rows"],
            "cleaned_rows": _DATASET.audit["cleaned_rows"],
            "date_min": _DATASET.audit["date_min"],
            "date_max": _DATASET.audit["date_max"],
        }
        _DASHBOARD_CACHE[key] = result
        return result


class RecipientUpdate(BaseModel):
    pic_name: str = Field(..., min_length=1, max_length=100)
    chat_id: str = Field(default="", max_length=64)
    lang: str = Field(default="auto")  # "auto" | "id" | "en"


class TelegramConfigPayload(BaseModel):
    bot_token: str = Field(default="", max_length=200)
    recipients: dict[str, RecipientUpdate]


class TelegramSendPayload(BaseModel):
    timeframe: str = Field(default="ytd")
    scope: str = Field(default="ALL")
    mode: str = Field(default="single")  # "single" or "blast_all_regions"
    lang: str = Field(default="id")  # "id" or "en"


async def _deliver_telegram(bot_token: str, chat_id: str, text: str) -> tuple[str, str]:
    """Send via Telegram Bot API if token & chat_id exist; otherwise simulate cleanly."""
    if not bot_token.strip() or not chat_id.strip():
        return "SIMULATED_DRY_RUN", "Demo mode (set Bot Token & Chat ID di Pengaturan Telegram untuk kirim live)"
    url = f"https://api.telegram.org/bot{bot_token.strip()}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                url,
                json={"chat_id": chat_id.strip(), "text": text, "parse_mode": "Markdown"},
            )
        if resp.status_code == 200 and resp.json().get("ok"):
            return "SENT_LIVE", "Terkirim ke Telegram Bot API"
        return "FAILED_FALLBACK", f"Telegram API HTTP {resp.status_code}: {resp.text[:160]}"
    except Exception as exc:
        return "FAILED_FALLBACK", f"Network error: {exc}"


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/health")
def health() -> dict[str, Any]:
    with _STATE_LOCK:
        return {
            "status": "ok",
            "rows": len(_DATASET.rows),
            "regions": len(_DATASET.regions),
        }


@app.get("/api/dashboard")
def get_dashboard(
    timeframe: str = Query(default="ytd"),
    region: str = Query(default="ALL"),
    branch: str = Query(default="ALL"),
    lang: str = Query(default="id"),
) -> dict[str, Any]:
    return _get_cached_dashboard(timeframe=timeframe, region=region, branch=branch, lang=lang)


@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)) -> dict[str, Any]:
    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8-sig")
        new_ds = load_sales_csv(text, source_name=file.filename or "uploaded.csv")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"CSV tidak valid: {exc}") from exc

    global _DATASET, _IS_DEFAULT_DATASET
    with _STATE_LOCK:
        _DATASET = new_ds
        _IS_DEFAULT_DATASET = False
        _DASHBOARD_CACHE.clear()
        existing = _TELEGRAM_CONFIG["recipients"]
        updated_recipients = _build_default_recipients(new_ds.regions)
        for k, v in updated_recipients.items():
            if k in existing:
                v["pic_name"] = existing[k]["pic_name"]
                v["chat_id"] = existing[k]["chat_id"]
                v["lang"] = existing[k].get("lang", "auto")
        _TELEGRAM_CONFIG["recipients"] = updated_recipients

    return _get_cached_dashboard(timeframe="ytd", region="ALL", branch="ALL")


@app.post("/api/reset")
def reset_default_dataset() -> dict[str, Any]:
    global _DATASET, _IS_DEFAULT_DATASET
    default_ds = load_sales_csv(DEFAULT_CSV_PATH.read_text(encoding="utf-8-sig"), DEFAULT_CSV_PATH.name)
    with _STATE_LOCK:
        _DATASET = default_ds
        _IS_DEFAULT_DATASET = True
        _DASHBOARD_CACHE.clear()
        existing = _TELEGRAM_CONFIG["recipients"]
        updated_recipients = _build_default_recipients(default_ds.regions)
        for k, v in updated_recipients.items():
            if k in existing:
                v["pic_name"] = existing[k]["pic_name"]
                v["chat_id"] = existing[k]["chat_id"]
                v["lang"] = existing[k].get("lang", "auto")
        _TELEGRAM_CONFIG["recipients"] = updated_recipients
    return _get_cached_dashboard(timeframe="ytd", region="ALL", branch="ALL")


@app.get("/api/export/cleaned.csv")
def download_cleaned_csv() -> PlainTextResponse:
    with _STATE_LOCK:
        csv_body = export_cleaned_csv(_DATASET)
        src = _DATASET.audit["source_name"].rsplit(".", 1)[0]
    return PlainTextResponse(
        content=csv_body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{src}_cleaned.csv"'},
    )


@app.get("/api/telegram/recipients")
def get_telegram_recipients() -> dict[str, Any]:
    with _STATE_LOCK:
        token = _TELEGRAM_CONFIG["bot_token"]
        return {
            "has_bot_token": bool(token.strip()),
            "bot_token_masked": f"{token[:6]}...{token[-4:]}" if len(token) > 12 else ("***" if token else ""),
            "recipients": list(_TELEGRAM_CONFIG["recipients"].values()),
        }


@app.post("/api/telegram/recipients")
def update_telegram_recipients(payload: TelegramConfigPayload) -> dict[str, Any]:
    with _STATE_LOCK:
        if payload.bot_token != "__KEEP__":
            _TELEGRAM_CONFIG["bot_token"] = payload.bot_token.strip()
        for scope_key, rec in payload.recipients.items():
            if scope_key in _TELEGRAM_CONFIG["recipients"]:
                _TELEGRAM_CONFIG["recipients"][scope_key]["pic_name"] = rec.pic_name.strip()
                _TELEGRAM_CONFIG["recipients"][scope_key]["chat_id"] = rec.chat_id.strip()
                _TELEGRAM_CONFIG["recipients"][scope_key]["lang"] = (
                    rec.lang if rec.lang in ("auto", "id", "en") else "auto"
                )
    return get_telegram_recipients()


@app.post("/api/telegram/send")
async def send_telegram(payload: TelegramSendPayload) -> dict[str, Any]:
    with _STATE_LOCK:
        bot_token = _TELEGRAM_CONFIG["bot_token"]
        recipients_snapshot = {k: dict(v) for k, v in _TELEGRAM_CONFIG["recipients"].items()}
        regions = list(_DATASET.regions)

    if payload.mode == "blast_all_regions":
        target_scopes = regions
    elif payload.mode == "single":
        if payload.scope not in recipients_snapshot:
            raise HTTPException(status_code=400, detail=f"Unknown recipient scope: {payload.scope}")
        target_scopes = [payload.scope]
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported mode: {payload.mode}")

    dispatched: list[dict[str, Any]] = []
    for scope_key in target_scopes:
        rec = recipients_snapshot[scope_key]
        eff_lang = payload.lang if rec.get("lang", "auto") == "auto" else rec["lang"]
        scoped_dash = _get_cached_dashboard(
            timeframe=payload.timeframe, region=scope_key, branch="ALL", lang=eff_lang
        )
        msg_text = scoped_dash["telegram_summary"]["text"]
        status, detail = await _deliver_telegram(bot_token, rec["chat_id"], msg_text)
        entry = {
            "timestamp": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S"),
            "scope": scope_key,
            "lang": eff_lang,
            "role": rec["role"],
            "pic_name": rec["pic_name"],
            "chat_id": rec["chat_id"] or "(demo-dry-run)",
            "timeframe": scoped_dash["filters"]["timeframe_label"],
            "status": status,
            "detail": detail,
            "message": msg_text,
        }
        dispatched.append(entry)

    with _STATE_LOCK:
        _DISPATCH_LOGS[:0] = dispatched
        del _DISPATCH_LOGS[30:]

    return {"sent_count": len(dispatched), "dispatches": dispatched}


@app.get("/api/telegram/logs")
def get_telegram_logs() -> dict[str, Any]:
    with _STATE_LOCK:
        return {"logs": list(_DISPATCH_LOGS)}
