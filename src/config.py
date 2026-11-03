"""Central configuration for the VOLTIX analytics pipeline.

Everything that is an *assumption* (category scope, synthetic-layer parameters,
RFM thresholds) lives here so it is visible, documented, and easy to change.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
DASH_DATA = ROOT / "src" / "dashboard" / "data"
DOCS = ROOT / "docs"
DB_PATH = PROCESSED / "voltix.db"

SEED = 20260713

# ---------------------------------------------------------------------------
# Scope: Olist categories that are plausible for a consumer-electronics brand
# (Portuguese source name -> VOLTIX display name). Edit to change scope.
# ---------------------------------------------------------------------------
ELECTRONICS_CATEGORIES = {
    "informatica_acessorios": "Computer Accessories",
    "telefonia": "Mobile Accessories",
    "eletronicos": "Consumer Electronics",
    "audio": "Audio",
    "pcs": "Computers & Laptops",
    "telefonia_fixa": "Landline & Telecom",
    "tablets_impressao_imagem": "Tablets & Imaging",
    "cine_foto": "Cameras & Photo",
}

# Analysis window. Olist has 4 orders in 2016-09, a gap in 2016-11, and very
# thin data from 2018-09 (the export is truncated); daily orders also decay from ~22 Aug 2018. Window ends 2018-08-20.
WINDOW_START = "2017-01-01"
WINDOW_END = "2018-08-20"

# Order statuses that count as real demand ("eligible"). Cancelled / unavailable are excluded.
ELIGIBLE_STATUSES = ["delivered", "shipped", "invoiced", "processing", "approved"]

BRAZIL_REGION = {
    **{s: "North" for s in ["AC", "AP", "AM", "PA", "RO", "RR", "TO"]},
    **{s: "Northeast" for s in ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"]},
    **{s: "Central-West" for s in ["DF", "GO", "MT", "MS"]},
    **{s: "Southeast" for s in ["ES", "MG", "RJ", "SP"]},
    **{s: "South" for s in ["PR", "RS", "SC"]},
}

# ---------------------------------------------------------------------------
# SYNTHETIC LAYER PARAMETERS (all clearly simulated; Olist has none of these)
# ---------------------------------------------------------------------------
# Typical gross margin on list price, by category (used to simulate unit cost).
CATEGORY_MARGIN = {
    "Audio": 0.40,
    "Mobile Accessories": 0.44,
    "Computer Accessories": 0.36,
    "Consumer Electronics": 0.30,
    "Computers & Laptops": 0.17,
    "Landline & Telecom": 0.28,
    "Tablets & Imaging": 0.24,
    "Cameras & Photo": 0.26,
}
# Baseline return probability per unit, by category.
CATEGORY_RETURN_RATE = {
    "Audio": 0.075,
    "Mobile Accessories": 0.055,
    "Computer Accessories": 0.040,
    "Consumer Electronics": 0.060,
    "Computers & Laptops": 0.045,
    "Landline & Telecom": 0.050,
    "Tablets & Imaging": 0.070,
    "Cameras & Photo": 0.050,
}
# Simulated sales channels (the source data has no channel field).
SALES_CHANNELS = ["VOLTIX Website", "Marketplace A", "Marketplace B"]
CHANNEL_PROBS = [0.36, 0.42, 0.22]
CHANNEL_MEAN_DISCOUNT = {"VOLTIX Website": 0.05, "Marketplace A": 0.10, "Marketplace B": 0.15}
CHANNEL_RETURN_MULT = {"VOLTIX Website": 0.85, "Marketplace A": 1.0, "Marketplace B": 1.35}
# Extra discount depth by calendar month (promo seasons).
MONTH_DISCOUNT_BOOST = {11: 0.08, 12: 0.03, 5: 0.02, 6: 0.01, 3: 0.015}

MARKETING_CHANNELS = ["Paid Search", "Paid Social", "Marketplace Ads", "Email & CRM", "Affiliates"]
ORGANIC = "Organic / Direct"
ACQ_PROBS = [0.22, 0.18, 0.20, 0.06, 0.08, 0.26]  # last = organic
# Monthly budget as a share of that month's net sales (simulated budgeting rule).
MKT_BUDGET_SHARE = {"Paid Search": 0.035, "Paid Social": 0.030, "Marketplace Ads": 0.040,
                    "Email & CRM": 0.008, "Affiliates": 0.012}

RETURN_REASONS = ["Defective / not working", "Not as described", "Wrong item received",
                  "Changed mind", "Arrived late"]

N_INVENTORY_SKUS = 150

# ---------------------------------------------------------------------------
# RFM scoring thresholds (fixed so the segmentation is reproducible)
# Recency is days between a customer's last purchase and the end of the selected period.
# ---------------------------------------------------------------------------
RFM = {
    "recency_cuts_days": [60, 120, 210, 330],   # <=60 ->5, <=120 ->4, <=210 ->3, <=330 ->2, else 1
    "frequency_cuts": {1: 1, 2: 3, 3: 4},        # 1 order ->1, 2 ->3, 3 ->4, 4+ ->5
    "monetary_cuts_brl": [60, 120, 200, 350],    # <60 ->1, <120 ->2, <200 ->3, <350 ->4, else 5
}
