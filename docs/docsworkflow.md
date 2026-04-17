# Workflow

## Project overview

This repository contains the Google Earth Engine (GEE) and Python workflow used to map groundwater-dependent ecosystems (GDEs), analyze their multi-period trajectories, identify the drivers of persistent degradation in China’s Three-North region during 2005–2024, and provide global dryland greening background and regional NDVI–GWSA co-variation analyses.

The workflow consists of five main components:

1. ecohydrological feature construction in GEE
2. high-confidence sample generation and Random Forest probability mapping
3. multi-period trajectory analysis
4. attribution analysis using Python
5. global dryland greening background and regional NDVI–GWSA co-variation analysis

---

## Study periods

The analysis is conducted for four multi-year periods:

- **P1:** 2005–2009
- **P2:** 2010–2014
- **P3:** 2015–2019
- **P4:** 2020–2024

These four periods are used consistently throughout feature construction, probability mapping, trajectory coding, and attribution analysis.

---

## Folder structure

```text
sanbei-gde-mapping-attribution/
├─ README.md
├─ requirements.txt
├─ .gitignore
├─ gee/
│  ├─ 01_ecofeatures/
│  │  ├─ 01_build_ecofeatures_by_period.js
│  │  └─ 02_add_groundwater_grace_gldas.js
│  ├─ 02_sampling_rf/
│  │  └─ 01_auto_samples_rf_by_period.js
│  ├─ 03_trajectory/
│  │  ├─ 01_build_union_mask.js
│  │  └─ 02_trajectory_classification.js
│  ├─ 04_attribution_prep/
│  │  └─ 01_export_attribution_samples.js
│  └─ 05_global_context/
│     ├─ 01_global_dryland_ndvi_greening_p4_minus_p1.js
│     ├─ 02_extract_roi_ndvi_gwsa_timeseries_template.js
│     ├─ 03_extract_roi_ndvi_gwsa_timeseries_b_China_ThreeNorth.js
│     ├─ 04_extract_roi_ndvi_gwsa_timeseries_c_Ogallala.js
│     ├─ 05_extract_roi_ndvi_gwsa_timeseries_d_OrangeSenqu.js
│     └─ 06_extract_roi_ndvi_gwsa_timeseries_e_MurrayDarling.js
├─ python/
│  ├─ 01_vif_screening.py
│  ├─ 02_logistic_regression.py
│  ├─ 03_cluster_robust_logit.py
│  ├─ 04_grid_aggregation_ols.py
│  ├─ 05_plot_b_China_ThreeNorth.py
│  ├─ 06_plot_c_Ogallala.py
│  ├─ 07_plot_d_OrangeSenqu.py
│  └─ 08_plot_e_MurrayDarling.py
├─ config/
│  └─ gee_asset_paths_template.js
└─ docs/
   └─ workflow.md
Step 1. Build ecohydrological features in GEE
Script

gee/01_ecofeatures/01_build_ecofeatures_by_period.js

Purpose

This script builds the core ecohydrological predictor layers for one study period.

Main outputs

The script generates multi-band eco-feature images, including:

groundwater storage anomaly metrics
NDVI growing-season statistics
drought-retention metrics
water-frequency metrics
distance to water
ET and PET metrics
Key variables

Typical output bands include:

NDVI_grow_mean
NDVI_grow_max
NDVI_grow_min
NDVI_grow_std
NDVI_grow_amp
NDVI_grow_cv
NDVI_drought_mean
NDVI_nondrought_mean
NDVI_retention
drought_month_count
drought_valid_months
nondrought_valid_months
water_freq_ndwi
water_freq_mndwi
dist_to_water
ET_mean
PET_mean
ET_PET_mean
ET_std
ET_PET_std
Main data sources

Typical data sources include:

MOD13Q1
MOD09A1
MOD16A2GF
TerraClimate
Notes

Run this script once for each period by updating:

P_START
P_END
PERIOD_LABEL
Step 2. Add groundwater metrics from GRACE and GLDAS
Script

gee/01_ecofeatures/02_add_groundwater_grace_gldas.js

Purpose

This script calculates groundwater storage anomaly using:

GWSA = TWSA (GRACE) - LWSA (GLDAS-derived liquid water storage anomaly)

It then merges groundwater metrics with the base eco-feature image for each period.

Main outputs

Additional groundwater-related bands include:

GWSA_mm_mean
GWSA_mm_trend
Main data sources
GRACE / GRACE-FO mascon product
GLDAS Noah
Notes

This script should be run after the base eco-feature images have already been created.

Step 3. Generate high-confidence samples and Random Forest probability maps
Script

gee/02_sampling_rf/01_auto_samples_rf_by_period.js

Purpose

This script identifies high-confidence samples for four classes:

NonGDE
GDE_W
GDE_V
Cropland

It then trains a Random Forest classifier and produces GDE probability maps.

Main processing steps
load eco-feature image for one period
build cropland mask
calculate distribution-based thresholds using random points
define rule-based samples for:
water-associated GDEs
vegetation-dominated GDEs
non-GDEs
cropland
extract stratified samples
split training and testing subsets
train Random Forest classifier
output class map and probability layers
Main outputs

Typical output bands include:

GDE_class
NonGDE_p
GDE_W_p
GDE_V_p
Cropland_p
GDE_prob
GDE_binary
Notes

Run this script separately for each period.

Step 4. Build a union mask across periods
Script

gee/03_trajectory/01_build_union_mask.js

Purpose

This script combines the four period-specific GDE_binary maps and builds a consistent union mask.

Logic
load GDE_binary from P1–P4
keep only pixels valid in all four periods
assign a pixel as part of the union mask if it is classified as GDE in at least one period
Main output
GDE_union
Step 5. Compute trajectory code and grouped trajectory classes
Script

gee/03_trajectory/02_trajectory_classification.js

Purpose

This script computes a four-digit trajectory code from the four binary GDE maps.

Example trajectory codes
1111 = stable GDE
1110 = late degradation
1100 = persistent degradation
0111 = persistent recovery
1010 = fluctuating
Grouped classes

The trajectory codes are grouped into:

1 = degradation
2 = recovery
3 = stable GDE
4 = fluctuation / mixed
Main outputs
traj_code
traj_group
Step 6. Export attribution samples
Script

gee/04_attribution_prep/01_export_attribution_samples.js

Purpose

This script prepares the table used for downstream statistical attribution analysis.

Response variable

The response variable is binary:

0 = stable GDE
1 = persistent degradation

Only stable and persistently degraded pixels are sampled for attribution analysis.

Drivers exported

The script exports:

slopes of ecohydrological drivers across the four periods
long-term climate trends
cropland-distance trend
current cropland distance
trajectory code
longitude and latitude
geometry
Main output

A CSV table exported to Google Drive for Python analysis.

Step 7. VIF screening
Script

python/01_vif_screening.py

Purpose

This script evaluates multicollinearity among candidate predictors using Variance Inflation Factor (VIF).

Output
printed VIF table
vif_results.csv
Step 8. Standardized logistic regression
Script

python/02_logistic_regression.py

Purpose

This script fits a standardized logistic regression model to identify the key drivers of persistent degradation.

Main outputs
regression summary
AUC
accuracy
confusion matrix
coefficient table
forest plot
Typical variables

Examples of core variables include:

slope_GWSA_mm_trend
slope_NDVI_retention
slope_dist_to_water
slope_ET_PET_mean
slope_Precip
slope_Temp
slope_Dist_Cropland_m
Dist_Cropland_2022_m
Step 9. Cluster-robust logit
Script

python/03_cluster_robust_logit.py

Purpose

This script addresses spatial autocorrelation by using 0.25-degree grid clusters.

Main logic
assign each sample to a 0.25-degree spatial grid
use grid ID as the clustering variable
fit a cluster-robust logistic regression
Output
cluster-robust coefficient table
Step 10. Grid-level aggregation OLS
Script

python/04_grid_aggregation_ols.py

Purpose

This script performs a grid-level robustness analysis by aggregating samples to 0.25-degree grids.

Response variable

The dependent variable is the proportion of persistent degradation within each grid.

Output
grid-level OLS coefficient table
Step 11. Global dryland greening background
Script

gee/05_global_context/01_global_dryland_ndvi_greening_p4_minus_p1.js

Purpose

This script generates a global positive NDVI-change background layer for arid and semi-arid regions between P1 (2005–2009) and P4 (2020–2024).

Main logic
compute growing-season mean NDVI for P1 and P4 from MOD13C1
derive a dryland mask from TerraClimate aridity index (AI = P / PET)
calculate dNDVI = NDVI_P4 - NDVI_P1
retain only positive NDVI change and mask low-vegetation pixels
export the final background raster
Main output
panelA_dNDVI_pos_P4minusP1_native05deg
Step 12. Regional NDVI–GWSA co-variation analysis
Scripts
gee/05_global_context/02_extract_roi_ndvi_gwsa_timeseries_template.js
gee/05_global_context/03_extract_roi_ndvi_gwsa_timeseries_b_China_ThreeNorth.js
gee/05_global_context/04_extract_roi_ndvi_gwsa_timeseries_c_Ogallala.js
gee/05_global_context/05_extract_roi_ndvi_gwsa_timeseries_d_OrangeSenqu.js
gee/05_global_context/06_extract_roi_ndvi_gwsa_timeseries_e_MurrayDarling.js
python/05_plot_b_China_ThreeNorth.py
python/06_plot_c_Ogallala.py
python/07_plot_d_OrangeSenqu.py
python/08_plot_e_MurrayDarling.py
Purpose

These scripts extract annual NDVI and GWSA time series for representative regions and generate dual-axis NDVI–GWSA plots.

Representative regions
China Three-North
Ogallala
Orange-Senqu
Murray-Darling
GEE outputs
one CSV table for each region containing:
year
rid
region
ndvi
gwsa_mm
gwsa_n_months
Python outputs
one PNG figure for each region
one PDF figure for each region
Plot features
NDVI and GWSA plotted on dual y-axes
linear trend lines for both variables
shaded years for incomplete GWSA monthly coverage
Recommended running order

Run the workflow in the following order:

gee/01_ecofeatures/01_build_ecofeatures_by_period.js
gee/01_ecofeatures/02_add_groundwater_grace_gldas.js
gee/02_sampling_rf/01_auto_samples_rf_by_period.js
gee/03_trajectory/01_build_union_mask.js
gee/03_trajectory/02_trajectory_classification.js
gee/04_attribution_prep/01_export_attribution_samples.js
python/01_vif_screening.py
python/02_logistic_regression.py
python/03_cluster_robust_logit.py
python/04_grid_aggregation_ols.py
gee/05_global_context/01_global_dryland_ndvi_greening_p4_minus_p1.js
gee/05_global_context/03_extract_roi_ndvi_gwsa_timeseries_b_China_ThreeNorth.js
gee/05_global_context/04_extract_roi_ndvi_gwsa_timeseries_c_Ogallala.js
gee/05_global_context/05_extract_roi_ndvi_gwsa_timeseries_d_OrangeSenqu.js
gee/05_global_context/06_extract_roi_ndvi_gwsa_timeseries_e_MurrayDarling.js
python/05_plot_b_China_ThreeNorth.py
python/06_plot_c_Ogallala.py
python/07_plot_d_OrangeSenqu.py
python/08_plot_e_MurrayDarling.py
Important notes for public release
Do not upload private GEE asset paths directly in public scripts.
Use config/gee_asset_paths_template.js as a public template.
Do not upload large raw raster files to this repository.
Public source datasets should be accessed from their original repositories.
Keep code, documentation, and variable names consistent across GEE and Python scripts.
Use placeholder asset paths in public ROI scripts and replace them locally before running.