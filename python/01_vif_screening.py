# ==============================================================================
# 01_vif_screening.py
# Description:
# Check Variance Inflation Factor (VIF) for candidate attribution variables.
# This script is aligned with the revised GEE export fields.
# ==============================================================================

from pathlib import Path
import numpy as np
import pandas as pd
from statsmodels.stats.outliers_influence import variance_inflation_factor


# ------------------------------------------------------------------------------
# 1. INPUT SETTINGS
# ------------------------------------------------------------------------------
FILE_PATH = Path("GDE_Attribution_Analysis_Samples_v2.csv")
VIF_OUTPUT_PATH = Path("vif_results.csv")

# Candidate predictors aligned with the revised GEE export
SELECTED_COLS = [
    "slope_GWSA_mm_mean",
    "slope_GWSA_mm_trend",
    "slope_NDVI_grow_mean",
    "slope_NDVI_grow_max",
    "slope_NDVI_grow_min",
    "slope_NDVI_grow_std",
    "slope_NDVI_grow_amp",
    "slope_NDVI_grow_cv",
    "slope_NDVI_drought_mean",
    "slope_NDVI_nondrought_mean",
    "slope_NDVI_retention",
    "slope_drought_month_count",
    "slope_drought_valid_months",
    "slope_nondrought_valid_months",
    "slope_water_freq_ndwi",
    "slope_water_freq_mndwi",
    "slope_dist_to_water",
    "slope_ET_mean",
    "slope_PET_mean",
    "slope_ET_PET_mean",
    "slope_ET_std",
    "slope_ET_PET_std",
    "slope_Precip",
    "slope_Temp",
    "slope_Dist_Cropland_m",
    "Dist_Cropland_2022_m",
]

# Optional: VIF threshold for quick inspection
VIF_THRESHOLD = 10.0


# ------------------------------------------------------------------------------
# 2. LOAD DATA
# ------------------------------------------------------------------------------
if not FILE_PATH.exists():
    raise FileNotFoundError(f"Input file not found: {FILE_PATH}")

df = pd.read_csv(FILE_PATH)
print(f"Loaded file: {FILE_PATH}")
print(f"Rows: {len(df):,}, Columns: {len(df.columns):,}")

valid_cols = [c for c in SELECTED_COLS if c in df.columns]
missing_cols = [c for c in SELECTED_COLS if c not in df.columns]

print("\n========== Column Check ==========")
print(f"Matched columns ({len(valid_cols)}): {valid_cols}")

if missing_cols:
    print(f"Missing columns ({len(missing_cols)}): {missing_cols}")

if len(valid_cols) < 2:
    raise ValueError("Not enough valid predictor columns found for VIF calculation.")


# ------------------------------------------------------------------------------
# 3. CLEAN DATA
# ------------------------------------------------------------------------------
X = df[valid_cols].copy()

# Convert to numeric in case any field was read as object
for col in X.columns:
    X[col] = pd.to_numeric(X[col], errors="coerce")

# Replace inf with NaN, then drop rows with any missing predictor
X = X.replace([np.inf, -np.inf], np.nan)
n_before = len(X)
X = X.dropna(axis=0, how="any")
n_after = len(X)

print("\n========== Data Cleaning ==========")
print(f"Rows before dropna: {n_before:,}")
print(f"Rows after dropna:  {n_after:,}")
print(f"Rows removed:       {n_before - n_after:,}")

if len(X) == 0:
    raise ValueError("No valid rows remain after removing missing/infinite values.")

# Remove zero-variance columns to avoid VIF failure
zero_var_cols = [c for c in X.columns if X[c].nunique(dropna=True) <= 1]
if zero_var_cols:
    print(f"\nZero-variance columns removed: {zero_var_cols}")
    X = X.drop(columns=zero_var_cols)

if X.shape[1] < 2:
    raise ValueError("Not enough non-constant predictor columns remain for VIF calculation.")


# ------------------------------------------------------------------------------
# 4. CALCULATE VIF
# ------------------------------------------------------------------------------
X_const = X.copy()
X_const["const"] = 1.0

vif_data = pd.DataFrame({
    "Variable": X_const.columns,
    "VIF": [variance_inflation_factor(X_const.values, i) for i in range(X_const.shape[1])]
})

# Usually the constant is not interpreted as a predictor
vif_predictors = vif_data[vif_data["Variable"] != "const"].copy()
vif_predictors = vif_predictors.sort_values("VIF", ascending=False).reset_index(drop=True)

print("\n========== VIF Check Results ==========")
print(vif_predictors)

print(f"\nVariables with VIF > {VIF_THRESHOLD}:")
high_vif = vif_predictors[vif_predictors["VIF"] > VIF_THRESHOLD]
if len(high_vif) == 0:
    print("None")
else:
    print(high_vif)


# ------------------------------------------------------------------------------
# 5. SAVE OUTPUT
# ------------------------------------------------------------------------------
vif_predictors.to_csv(VIF_OUTPUT_PATH, index=False)
print(f"\nSaved VIF table to: {VIF_OUTPUT_PATH}")