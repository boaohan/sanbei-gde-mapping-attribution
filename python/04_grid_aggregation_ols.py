# ==============================================================================
# 04_grid_aggregation_ols.py
# Description:
# Grid-level (0.25°) aggregation OLS regression.
# The dependent variable is the proportion of persistent degradation
# within each spatial grid.
# ==============================================================================

from pathlib import Path
import json
import numpy as np
import pandas as pd
import statsmodels.api as sm


# ------------------------------------------------------------------------------
# 1. INPUT SETTINGS
# ------------------------------------------------------------------------------
FILE_PATH = Path("GDE_Attribution_Analysis_Samples_v2.csv")
OUTPUT_PATH = Path("grid_aggregation_ols_results.csv")

GRID_SIZE = 0.25

# Core variables aligned with the revised GEE export fields
SELECTED_FEATURES = [
    "slope_GWSA_mm_trend",
    "slope_NDVI_retention",
    "slope_dist_to_water",
    "slope_ET_PET_mean",
    "slope_Precip",
    "slope_Temp",
    "slope_Dist_Cropland_m",
    "Dist_Cropland_2022_m",
]


# ------------------------------------------------------------------------------
# 2. HELPERS
# ------------------------------------------------------------------------------
def extract_coord(geo_str, index):
    """Extract lon/lat from GeoJSON-like .geo field."""
    try:
        geo_dict = json.loads(geo_str)
        return geo_dict["coordinates"][index]
    except Exception:
        return np.nan


# ------------------------------------------------------------------------------
# 3. LOAD DATA
# ------------------------------------------------------------------------------
if not FILE_PATH.exists():
    raise FileNotFoundError(f"Input file not found: {FILE_PATH}")

df = pd.read_csv(FILE_PATH)
print(f"Loaded file: {FILE_PATH}")
print(f"Rows: {len(df):,}, Columns: {len(df.columns):,}")

if "status" not in df.columns:
    raise KeyError("Column 'status' was not found in the input CSV.")

# Prefer lon/lat exported directly from GEE; fall back to .geo if needed
if "lon" not in df.columns or "lat" not in df.columns:
    if ".geo" not in df.columns:
        raise KeyError("Neither lon/lat nor .geo columns were found in the input CSV.")
    df["lon"] = df[".geo"].apply(lambda x: extract_coord(x, 0))
    df["lat"] = df[".geo"].apply(lambda x: extract_coord(x, 1))
else:
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")

df["status"] = pd.to_numeric(df["status"], errors="coerce")
df = df.dropna(subset=["status", "lon", "lat"]).copy()
df = df[df["status"].isin([0, 1])].copy()
df["status"] = df["status"].astype(int)

print("\n========== Coordinate / Response Check ==========")
print(f"Rows after coordinate/status cleaning: {len(df):,}")


# ------------------------------------------------------------------------------
# 4. BUILD GRID ID
# ------------------------------------------------------------------------------
df["grid_lon"] = np.floor(df["lon"] / GRID_SIZE) * GRID_SIZE
df["grid_lat"] = np.floor(df["lat"] / GRID_SIZE) * GRID_SIZE
df["Grid_ID"] = df["grid_lon"].round(6).astype(str) + "_" + df["grid_lat"].round(6).astype(str)

print(f"Number of grids before feature filtering: {df['Grid_ID'].nunique():,}")


# ------------------------------------------------------------------------------
# 5. SELECT FEATURES
# ------------------------------------------------------------------------------
valid_features = [f for f in SELECTED_FEATURES if f in df.columns]
missing_features = [f for f in SELECTED_FEATURES if f not in df.columns]

print("\n========== Feature Check ==========")
print(f"Matched features ({len(valid_features)}): {valid_features}")
if missing_features:
    print(f"Missing features ({len(missing_features)}): {missing_features}")

if len(valid_features) < 2:
    raise ValueError("Not enough valid predictor variables for grid-level OLS.")

model_df = df[["Grid_ID", "status"] + valid_features].copy()

for col in valid_features:
    model_df[col] = pd.to_numeric(model_df[col], errors="coerce")

model_df = model_df.replace([np.inf, -np.inf], np.nan).dropna().copy()

print(f"\nRows after predictor cleaning: {len(model_df):,}")
print(f"Number of grids after predictor cleaning: {model_df['Grid_ID'].nunique():,}")


# ------------------------------------------------------------------------------
# 6. GRID-LEVEL AGGREGATION
# ------------------------------------------------------------------------------
# status mean = degradation proportion in each grid
agg_dict = {col: "mean" for col in valid_features}
agg_dict["status"] = "mean"

grid_df = model_df.groupby("Grid_ID", as_index=False).agg(agg_dict)

# Also keep sample count per grid for diagnostics
grid_counts = model_df.groupby("Grid_ID").size().reset_index(name="n_samples")
grid_df = grid_df.merge(grid_counts, on="Grid_ID", how="left")

print("\n========== Grid Aggregation ==========")
print(f"Aggregated grid count: {len(grid_df):,}")
print(f"Mean samples per grid: {grid_df['n_samples'].mean():.2f}")
print(f"Median samples per grid: {grid_df['n_samples'].median():.2f}")

# Rename response for clarity
grid_df = grid_df.rename(columns={"status": "degradation_proportion"})


# ------------------------------------------------------------------------------
# 7. REMOVE ZERO-VARIANCE PREDICTORS
# ------------------------------------------------------------------------------
zero_var_cols = [c for c in valid_features if grid_df[c].nunique(dropna=True) <= 1]
if zero_var_cols:
    print(f"\nDropped zero-variance variables: {zero_var_cols}")
    grid_df = grid_df.drop(columns=zero_var_cols)
    valid_features = [f for f in valid_features if f not in zero_var_cols]

if len(valid_features) < 2:
    raise ValueError("Too few predictors remain after removing zero-variance variables.")


# ------------------------------------------------------------------------------
# 8. STANDARDIZE PREDICTORS
# ------------------------------------------------------------------------------
X_grid = grid_df[valid_features].copy()
y_grid = grid_df["degradation_proportion"].copy()

X_grid_scaled = (X_grid - X_grid.mean()) / X_grid.std(ddof=0)
X_grid_scaled = X_grid_scaled.replace([np.inf, -np.inf], np.nan).dropna()

# Align response and metadata
y_grid = y_grid.loc[X_grid_scaled.index]
grid_meta = grid_df.loc[X_grid_scaled.index, ["Grid_ID", "n_samples"]].copy()

X_model = sm.add_constant(X_grid_scaled, has_constant="add")

print("\n========== Modeling Data ==========")
print(f"Grids used in model: {len(X_model):,}")


# ------------------------------------------------------------------------------
# 9. FIT GRID-LEVEL OLS
# ------------------------------------------------------------------------------
try:
    model_grid_ols = sm.OLS(y_grid, X_model)
    result_grid_ols = model_grid_ols.fit(cov_type="HC3")

    print("\n========== Grid-level OLS (HC3 robust SE) ==========")
    print(result_grid_ols.summary())

except Exception as e:
    raise RuntimeError(f"Grid-level OLS failed: {e}")


# ------------------------------------------------------------------------------
# 10. SAVE RESULTS
# ------------------------------------------------------------------------------
conf_int = result_grid_ols.conf_int()

result_table = pd.DataFrame({
    "Factor": result_grid_ols.params.index,
    "Coeff": result_grid_ols.params.values,
    "StdErr_HC3": result_grid_ols.bse.values,
    "T_HC3": result_grid_ols.tvalues.values,
    "P_value_HC3": result_grid_ols.pvalues.values,
    "CI_lower": conf_int[0].values,
    "CI_upper": conf_int[1].values,
})

print("\n========== Grid-level OLS Coefficients ==========")
print(result_table)

result_table.to_csv(OUTPUT_PATH, index=False)
print(f"\nSaved grid-level OLS results to: {OUTPUT_PATH}")