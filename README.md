# sanbei-gde-mapping-attribution

Code for mapping, trajectory analysis, and driver attribution of groundwater-dependent ecosystems (GDEs) in China’s Three-North region during 2005–2024, with additional modules for global dryland greening background mapping and regional NDVI–GWSA co-variation analysis.

## Overview

This repository contains the Google Earth Engine (GEE) and Python code used to:

1. build ecohydrological response features for multi-period GDE mapping;
2. generate high-confidence training samples and train Random Forest models;
3. classify multi-period GDE trajectories using a union mask framework;
4. identify the drivers of persistent degradation using regression-based attribution analysis; and
5. provide global dryland greening background and regional NDVI–GWSA co-variation analyses.

The workflow was developed for regional-scale assessment of groundwater-dependent ecosystem dynamics in China’s Three-North region, and was further extended to global dryland greening background mapping and four representative regional NDVI–GWSA time-series analyses.

## Repository structure

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
```

## Workflow

### Step 1. Build ecohydrological response features in GEE

Scripts in `gee/01_ecofeatures/` are used to construct the predictor variables for each study period, including:

- NDVI-based vegetation growth metrics
- drought persistence / drought-retention metrics
- surface-water frequency
- distance to water bodies
- evapotranspiration to potential evapotranspiration ratio (ET/PET)
- groundwater-related constraints derived from GRACE and GLDAS

### Step 2. Generate samples and train Random Forest models

Scripts in `gee/02_sampling_rf/` are used to:

- delineate high-confidence sample classes
- define GDE_W, GDE_V, NonGDE, and Cropland rules
- perform stratified sampling
- split training and testing datasets
- train Random Forest classifiers
- export GDE probability and binary maps

### Step 3. Classify multi-period trajectories

Scripts in `gee/03_trajectory/` are used to:

- build the union mask across all periods
- encode four-period trajectory combinations
- classify persistent degradation, recovery, stability, and fluctuation patterns

### Step 4. Export attribution samples and run statistical analysis

Scripts in `gee/04_attribution_prep/` and `python/01_vif_screening.py` to `python/04_grid_aggregation_ols.py` are used to:

- export samples for driver analysis
- test multicollinearity
- run logistic regression models
- estimate cluster-robust models
- conduct grid-based spatial robustness analysis

### Step 5. Global dryland greening background and regional NDVI–GWSA co-variation analysis

Scripts in `gee/05_global_context/` are used to:

- generate a global dryland / semi-arid positive NDVI change background layer from P1 (2005–2009) to P4 (2020–2024)
- extract annual NDVI and GWSA time series for representative regions
- export regional time-series tables for downstream plotting

Scripts in `python/05_plot_b_China_ThreeNorth.py` to `python/08_plot_e_MurrayDarling.py` are used to:

- plot dual-axis annual NDVI and GWSA time series
- add linear trend lines for both variables
- highlight years with incomplete GWSA monthly coverage

## Data sources

This study uses publicly available remote sensing, land surface, and climate / hydrology datasets, including:

- MODIS vegetation products
- MODIS surface reflectance products
- MODIS evapotranspiration products
- TerraClimate
- GRACE / GRACE-FO
- GLDAS
- ERA5-Land
- land-cover / cropland datasets
- global dryland mask based on aridity index derived from precipitation and PET

The exact product names, temporal coverage, and data access information are described in `docs/workflow.md` and in the associated manuscript.

## Requirements

The Python scripts were developed with the following packages:

- pandas
- numpy
- statsmodels
- scikit-learn
- matplotlib
- seaborn

Install dependencies with:

```bash
pip install -r requirements.txt
```

## How to use

### Google Earth Engine

1. Copy the scripts in the `gee/` folder into the Earth Engine Code Editor.
2. Update all asset paths using your own assets and region boundaries.
3. Run the scripts in workflow order:

- `01_ecofeatures`
- `02_sampling_rf`
- `03_trajectory`
- `04_attribution_prep`
- `05_global_context`

For `gee/05_global_context/`:

- `01_global_dryland_ndvi_greening_p4_minus_p1.js` generates the global dryland greening background layer
- `02_extract_roi_ndvi_gwsa_timeseries_template.js` provides a one-region template
- `03` to `06` are region-specific NDVI–GWSA extraction scripts for:
  - China Three-North
  - Ogallala
  - Orange-Senqu
  - Murray-Darling

### Python

Run the Python scripts after exporting the necessary sample tables from GEE:

```bash
python 01_vif_screening.py
python 02_logistic_regression.py
python 03_cluster_robust_logit.py
python 04_grid_aggregation_ols.py
python 05_plot_b_China_ThreeNorth.py
python 06_plot_c_Ogallala.py
python 07_plot_d_OrangeSenqu.py
python 08_plot_e_MurrayDarling.py
```

## Configuration

Do not directly use private asset paths in public scripts.

Use `config/gee_asset_paths_template.js` as a template and replace:

- region boundary asset path
- intermediate asset path
- exported table / image asset path

before running the scripts.

## Notes

- Large raw datasets are not stored in this repository.
- Public raw data should be downloaded from their original repositories.
- Private local paths and personal asset IDs should be replaced with templates before public release.
- This repository is intended to provide the minimum code needed to reproduce the main analytical workflow and the associated global / regional context analyses.

## Code availability

The custom Google Earth Engine and Python scripts used for ecohydrological feature construction, sample generation, Random Forest probability mapping, trajectory classification, attribution analysis, global dryland greening background mapping, and regional NDVI–GWSA co-variation analysis are provided in this repository.

## Contact

For questions about the code, please contact:

Aohan Bo  
boaohan@bjfu.edu.cn