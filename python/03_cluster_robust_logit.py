# ==============================================================================
# 03_cluster_robust_logit.py
# Description:
# Cluster-robust logistic regression addressing spatial autocorrelation
# using 0.25-degree spatial grids.
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
OUTPUT_PATH = Path("cluster_robust_logit_results.csv")

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

print("\n========== Coordinate Check ==========")
print(f"Rows after coordinate/status cleaning: {len(df):,}")


# ------------------------------------------------------------------------------
# 4. BUILD SPATIAL CLUSTERS
# ------------------------------------------------------------------------------
df["grid_lon"] = np.floor(df["lon"] / GRID_SIZE) * GRID_SIZE
df["grid_lat"] = np.floor(df["lat"] / GRID_SIZE) * GRID_SIZE
df["Grid_ID"] = df["grid_lon"].round(6).astype(str) + "_" + df["grid_lat"].round(6).astype(str)

n_clusters = df["Grid_ID"].nunique()
print(f"Number of spatial clusters: {n_clusters}")

if n_clusters < 2:
    raise ValueError("Too few spatial clusters for cluster-robust estimation.")


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
    raise ValueError("Not enough valid predictor variables for cluster-robust logistic regression.")


# ------------------------------------------------------------------------------
# 6. CLEAN AND STANDARDIZE
# ------------------------------------------------------------------------------
model_df = df[["status", "Grid_ID"] + valid_features].copy()

for col in valid_features:
    model_df[col] = pd.to_numeric(model_df[col], errors="coerce")

model_df = model_df.replace([np.inf, -np.inf], np.nan).dropna().copy()

# Remove zero-variance predictors
zero_var_cols = [c for c in valid_features if model_df[c].nunique(dropna=True) <= 1]
if zero_var_cols:
    print(f"\nDropped zero-variance variables: {zero_var_cols}")
    model_df = model_df.drop(columns=zero_var_cols)
    valid_features = [f for f in valid_features if f not in zero_var_cols]

if len(valid_features) < 2:
    raise ValueError("Too few variables remain after removing zero-variance predictors.")

X = model_df[valid_features].copy()
y = model_df["status"].copy()
groups = model_df["Grid_ID"].copy()

X_scaled = (X - X.mean()) / X.std(ddof=0)
X_scaled = X_scaled.replace([np.inf, -np.inf], np.nan).dropna()

# Align y and groups after dropna in standardized matrix
y = y.loc[X_scaled.index]
groups = groups.loc[X_scaled.index]

X_model = sm.add_constant(X_scaled, has_constant="add")

print("\n========== Modeling Data ==========")
print(f"Rows used in model: {len(X_model):,}")
print(f"Clusters used in model: {groups.nunique():,}")


# ------------------------------------------------------------------------------
# 7. FIT CLUSTER-ROBUST LOGIT
# ------------------------------------------------------------------------------
try:
    model_cluster = sm.Logit(y, X_model)
    result_cluster = model_cluster.fit(
        disp=False,
        maxiter=200,
        cov_type="cluster",
        cov_kwds={"groups": groups}
    )

    print("\n========== Cluster-Robust Logit ==========")
    print(result_cluster.summary())

except Exception as e:
    raise RuntimeError(f"Cluster-robust logit failed: {e}")


# ------------------------------------------------------------------------------
# 8. SAVE RESULTS
# ------------------------------------------------------------------------------
conf_int = result_cluster.conf_int()

result_table = pd.DataFrame({
    "Factor": result_cluster.params.index,
    "Coeff": result_cluster.params.values,
    "StdErr_cluster": result_cluster.bse.values,
    "Z_cluster": result_cluster.tvalues.values,
    "P_value_cluster": result_cluster.pvalues.values,
    "CI_lower": conf_int[0].values,
    "CI_upper": conf_int[1].values,
})

result_table["Odds_Ratio"] = np.exp(result_table["Coeff"])
result_table["OR_CI_lower"] = np.exp(result_table["CI_lower"])
result_table["OR_CI_upper"] = np.exp(result_table["CI_upper"])

print("\n========== Cluster-Robust Coefficients ==========")
print(result_table)

result_table.to_csv(OUTPUT_PATH, index=False)
print(f"\nSaved cluster-robust results to: {OUTPUT_PATH}")