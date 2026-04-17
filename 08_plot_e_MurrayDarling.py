from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt


# =========================
# 1. File and title
# =========================
CSV_FILE = Path("timeseries_e_MurrayDarling_2005_2024.csv")
REGION_CODE = "e"
REGION_TITLE = "Murray-Darling Basin"
OUTPUT_BASENAME = "e_MurrayDarling_timeseries"


# =========================
# 2. Read data
# =========================
if not CSV_FILE.exists():
    raise FileNotFoundError(f"Input CSV not found: {CSV_FILE}")

df = pd.read_csv(CSV_FILE)

required_cols = ["year", "ndvi", "gwsa_mm"]
for col in required_cols:
    if col not in df.columns:
        raise ValueError(f"Missing required column: {col}")

if "gwsa_n_months" not in df.columns:
    df["gwsa_n_months"] = 12

df["year"] = pd.to_numeric(df["year"], errors="coerce")
df["ndvi"] = pd.to_numeric(df["ndvi"], errors="coerce")
df["gwsa_mm"] = pd.to_numeric(df["gwsa_mm"], errors="coerce")
df["gwsa_n_months"] = pd.to_numeric(df["gwsa_n_months"], errors="coerce")
df = df.sort_values("year").reset_index(drop=True)


# =========================
# 3. Plot settings
# =========================
plt.rcParams["font.family"] = "Arial"
plt.rcParams["pdf.fonttype"] = 42
plt.rcParams["ps.fonttype"] = 42

ndvi_color = "#006d2c"
gwsa_color = "#08519c"

fig, ax = plt.subplots(figsize=(6.0, 4.2))
ax2 = ax.twinx()


# =========================
# 4. Main lines
# =========================
line1 = ax.plot(
    df["year"], df["ndvi"],
    color=ndvi_color, linewidth=2.4,
    marker="o", markersize=5.0,
    markerfacecolor=ndvi_color, markeredgecolor="white", markeredgewidth=0.6,
    label="NDVI"
)

line2 = ax2.plot(
    df["year"], df["gwsa_mm"],
    color=gwsa_color, linewidth=2.4,
    marker="s", markersize=4.8,
    markerfacecolor=gwsa_color, markeredgecolor="white", markeredgewidth=0.6,
    label="GWSA"
)


# =========================
# 5. Linear trend lines
# =========================
valid_ndvi = df.dropna(subset=["year", "ndvi"])
if len(valid_ndvi) >= 2:
    z1 = np.polyfit(valid_ndvi["year"], valid_ndvi["ndvi"], 1)
    p1 = np.poly1d(z1)
    ax.plot(
        valid_ndvi["year"], p1(valid_ndvi["year"]),
        color=ndvi_color, linestyle="--", linewidth=1.5, alpha=0.9
    )

valid_gwsa = df.dropna(subset=["year", "gwsa_mm"])
if len(valid_gwsa) >= 2:
    z2 = np.polyfit(valid_gwsa["year"], valid_gwsa["gwsa_mm"], 1)
    p2 = np.poly1d(z2)
    ax2.plot(
        valid_gwsa["year"], p2(valid_gwsa["year"]),
        color=gwsa_color, linestyle="--", linewidth=1.5, alpha=0.9
    )


# =========================
# 6. Shade partial-GWSA years
# =========================
partial_years = df.loc[df["gwsa_n_months"] < 12, "year"].dropna().tolist()
for yr in partial_years:
    ax.axvspan(yr - 0.5, yr + 0.5, color="0.94", zorder=0)


# =========================
# 7. Labels and axes
# =========================
ax.set_title(f"{REGION_CODE}  {REGION_TITLE}", loc="left", fontsize=13, fontweight="bold")
ax.set_xlabel("Year", fontsize=11)
ax.set_ylabel("NDVI", fontsize=11, color=ndvi_color)
ax2.set_ylabel("GWSA (mm)", fontsize=11, color=gwsa_color)

ax.tick_params(axis="x", labelsize=10, width=1.1)
ax.tick_params(axis="y", labelsize=10, width=1.1, labelcolor=ndvi_color)
ax2.tick_params(axis="y", labelsize=10, width=1.1, labelcolor=gwsa_color)

years = df["year"].dropna().astype(int)
ax.set_xlim(years.min() - 0.5, years.max() + 0.5)
ax.set_xticks(np.arange(years.min(), years.max() + 1, 4))

if df["ndvi"].notna().any():
    y1min, y1max = df["ndvi"].min(), df["ndvi"].max()
    pad1 = (y1max - y1min) * 0.18 if y1max > y1min else 0.03
    ax.set_ylim(y1min - pad1, y1max + pad1)

if df["gwsa_mm"].notna().any():
    y2min, y2max = df["gwsa_mm"].min(), df["gwsa_mm"].max()
    pad2 = (y2max - y2min) * 0.20 if y2max > y2min else 10
    ax2.set_ylim(y2min - pad2, y2max + pad2)


# =========================
# 8. Grid, spines, legend
# =========================
ax.grid(True, axis="y", linestyle=":", linewidth=0.8, alpha=0.5)

for spine in ax.spines.values():
    spine.set_linewidth(1.1)
for spine in ax2.spines.values():
    spine.set_linewidth(1.1)

handles = line1 + line2
labels = [h.get_label() for h in handles]
ax.legend(handles, labels, loc="upper left", fontsize=10, frameon=False)

if partial_years:
    ax.text(
        0.98, 0.03,
        "Shaded year: partial GWSA months",
        transform=ax.transAxes,
        ha="right", va="bottom",
        fontsize=8, color="0.35"
    )


# =========================
# 9. Save and show
# =========================
fig.tight_layout()
fig.savefig(f"{OUTPUT_BASENAME}.png", dpi=600, bbox_inches="tight")
fig.savefig(f"{OUTPUT_BASENAME}.pdf", bbox_inches="tight")
plt.show()
