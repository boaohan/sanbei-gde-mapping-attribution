# ==============================================================================
# 02_logistic_regression.py
# Description:
# Standardized logistic regression for persistent GDE degradation and
# forest-plot visualization of standardized coefficients.
# ==============================================================================

from pathlib import Path
import numpy as np
import pandas as pd
import statsmodels.api as sm
import matplotlib.pyplot as plt
from sklearn.metrics import roc_auc_score, accuracy_score, confusion_matrix


# ------------------------------------------------------------------------------
# 1. INPUT SETTINGS
# ------------------------------------------------------------------------------
FILE_PATH = Path("GDE_Attribution_Analysis_Samples_v2.csv")
VIF_FILE = Path("vif_results.csv")

# If True and vif_results.csv exists, keep only variables with VIF <= threshold
USE_VIF_FILTER = True
VIF_THRESHOLD = 10.0

# Candidate variables after aligning with the revised GEE export fields
DEFAULT_FEATURES = [
    "slope_GWSA_mm_mean",
    "slope_GWSA_mm_trend",
    "slope_NDVI_grow_mean",
    "slope_NDVI_retention",
    "slope_water_freq_mndwi",
    "slope_ET_mean",
    "slope_PET_mean",
    "slope_ET_PET_mean",
    "slope_dist_to_water",
    "slope_Precip",
    "slope_Temp",
    "slope_Dist_Cropland_m",
    "Dist_Cropland_2022_m",
]

COEF_OUTPUT_PATH = Path("logit_coefficients.csv")
FIG_OUTPUT_PATH = Path("logit_forest_plot.png")


# ------------------------------------------------------------------------------
# 2. LOAD DATA
# ------------------------------------------------------------------------------
if not FILE_PATH.exists():
    raise FileNotFoundError(f"Input file not found: {FILE_PATH}")

df = pd.read_csv(FILE_PATH)
print(f"Loaded file: {FILE_PATH}")
print(f"Rows: {len(df):,}, Columns: {len(df.columns):,}")

if "status" not in df.columns:
    raise KeyError("Column 'status' was not found in the input CSV.")

df["status"] = pd.to_numeric(df["status"], errors="coerce")


# ------------------------------------------------------------------------------
# 3. SELECT FEATURES
# ------------------------------------------------------------------------------
valid_features = [f for f in DEFAULT_FEATURES if f in df.columns]
missing_features = [f for f in DEFAULT_FEATURES if f not in df.columns]

print("\n========== Feature Check ==========")
print(f"Matched features ({len(valid_features)}): {valid_features}")
if missing_features:
    print(f"Missing features ({len(missing_features)}): {missing_features}")

if USE_VIF_FILTER and VIF_FILE.exists():
    vif_df = pd.read_csv(VIF_FILE)
    if {"Variable", "VIF"}.issubset(vif_df.columns):
        keep_set = set(vif_df.loc[vif_df["VIF"] <= VIF_THRESHOLD, "Variable"])
        vif_filtered_features = [f for f in valid_features if f in keep_set]

        if len(vif_filtered_features) >= 2:
            valid_features = vif_filtered_features
            print("\nApplied VIF filter.")
            print(f"Features retained after VIF <= {VIF_THRESHOLD}: {valid_features}")
        else:
            print("\nVIF filter was not applied because too few variables remained.")
    else:
        print("\nVIF file found, but required columns {'Variable', 'VIF'} are missing.")

if len(valid_features) < 2:
    raise ValueError("Not enough valid predictor variables for logistic regression.")


# ------------------------------------------------------------------------------
# 4. CLEAN DATA
# ------------------------------------------------------------------------------
model_df = df[["status"] + valid_features].copy()

for col in model_df.columns:
    model_df[col] = pd.to_numeric(model_df[col], errors="coerce")

model_df = model_df.replace([np.inf, -np.inf], np.nan).dropna()

# Keep only binary status values 0/1
model_df = model_df[model_df["status"].isin([0, 1])].copy()
model_df["status"] = model_df["status"].astype(int)

print("\n========== Data Cleaning ==========")
print(f"Remaining rows for modeling: {len(model_df):,}")

if len(model_df) == 0:
    raise ValueError("No valid rows remain after cleaning.")

if model_df["status"].nunique() < 2:
    raise ValueError("The response variable 'status' does not contain both 0 and 1.")


# ------------------------------------------------------------------------------
# 5. STANDARDIZE PREDICTORS
# ------------------------------------------------------------------------------
X = model_df[valid_features].copy()
y = model_df["status"].copy()

means = X.mean()
stds = X.std(ddof=0).replace(0, np.nan)

zero_std_cols = stds[stds.isna()].index.tolist()
if zero_std_cols:
    print(f"\nDropped zero-variance variables: {zero_std_cols}")
    X = X.drop(columns=zero_std_cols)
    valid_features = [f for f in valid_features if f not in zero_std_cols]
    means = X.mean()
    stds = X.std(ddof=0)

if len(valid_features) < 2:
    raise ValueError("Too few variables remain after removing zero-variance predictors.")

X_scaled = (X - means) / stds
X_scaled = X_scaled.replace([np.inf, -np.inf], np.nan).dropna()

# Align y after dropping any problematic rows in X_scaled
y = y.loc[X_scaled.index]

X_model = sm.add_constant(X_scaled, has_constant="add")


# ------------------------------------------------------------------------------
# 6. FIT LOGISTIC REGRESSION
# ------------------------------------------------------------------------------
model = sm.Logit(y, X_model)
result = model.fit(disp=False, maxiter=200)

print("\n========== Logistic Regression Summary ==========")
print(result.summary())


# ------------------------------------------------------------------------------
# 7. MODEL PERFORMANCE
# ------------------------------------------------------------------------------
pred_prob = result.predict(X_model)
pred_label = (pred_prob >= 0.5).astype(int)

auc = roc_auc_score(y, pred_prob)
acc = accuracy_score(y, pred_label)
cm = confusion_matrix(y, pred_label)

print("\n========== Model Performance ==========")
print(f"AUC: {auc:.4f}")
print(f"Accuracy: {acc:.4f}")
print("Confusion Matrix:")
print(cm)


# ------------------------------------------------------------------------------
# 8. COEFFICIENT TABLE
# ------------------------------------------------------------------------------
conf_int = result.conf_int()
coef_table = pd.DataFrame({
    "Factor": result.params.index,
    "Coeff": result.params.values,
    "CI_lower": conf_int[0].values,
    "CI_upper": conf_int[1].values,
    "P_value": result.pvalues.values,
})

coef_table["Odds_Ratio"] = np.exp(coef_table["Coeff"])
coef_table["OR_CI_lower"] = np.exp(coef_table["CI_lower"])
coef_table["OR_CI_upper"] = np.exp(coef_table["CI_upper"])

coef_table = coef_table[coef_table["Factor"] != "const"].copy()
coef_table["Abs_Coeff"] = coef_table["Coeff"].abs()
coef_table = coef_table.sort_values("Abs_Coeff", ascending=True).reset_index(drop=True)

print("\n========== Standardized Coefficients ==========")
print(coef_table[["Factor", "Coeff", "CI_lower", "CI_upper", "P_value", "Odds_Ratio"]])

coef_table.to_csv(COEF_OUTPUT_PATH, index=False)
print(f"\nSaved coefficient table to: {COEF_OUTPUT_PATH}")


# ------------------------------------------------------------------------------
# 9. FOREST PLOT
# ------------------------------------------------------------------------------
plt.figure(figsize=(11, max(6, 0.6 * len(coef_table) + 1)))

for i, row in enumerate(coef_table.itertuples()):
    color = "#d73027" if row.Coeff > 0 else "#4575b4"

    # 95% CI line
    plt.hlines(
        y=i,
        xmin=row.CI_lower,
        xmax=row.CI_upper,
        color="gray",
        linewidth=2,
        alpha=0.8
    )

    # Point estimate
    plt.scatter(
        row.Coeff,
        i,
        color=color,
        s=90,
        zorder=3
    )

    # Significance stars
    if row.P_value < 0.001:
        sig = "***"
    elif row.P_value < 0.01:
        sig = "**"
    elif row.P_value < 0.05:
        sig = "*"
    else:
        sig = ""

    offset = 0.03 * max(1.0, abs(row.Coeff))
    if row.Coeff >= 0:
        plt.text(row.Coeff + offset, i, sig, va="center", fontsize=12)
    else:
        plt.text(row.Coeff - offset, i, sig, va="center", ha="right", fontsize=12)

plt.axvline(x=0, color="black", linestyle="--", linewidth=1)
plt.yticks(range(len(coef_table)), coef_table["Factor"])
plt.xlabel("Standardized log-odds coefficient")
plt.title("Standardized effects on persistent GDE degradation")
plt.tight_layout()

plt.savefig(FIG_OUTPUT_PATH, dpi=300, bbox_inches="tight")
print(f"Saved forest plot to: {FIG_OUTPUT_PATH}")

plt.show()