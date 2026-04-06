\# sanbei-gde-mapping-attribution



Code for mapping, trajectory analysis, and driver attribution of groundwater-dependent ecosystems (GDEs) in China’s Three-North region during 2005–2024.



\## Overview



This repository contains the Google Earth Engine (GEE) and Python code used to:



1\. build ecohydrological response features for multi-period GDE mapping;

2\. generate high-confidence training samples and train Random Forest models;

3\. classify multi-period GDE trajectories using a union mask framework; and

4\. identify the drivers of persistent degradation using regression-based attribution analysis.



The workflow was developed for regional-scale assessment of groundwater-dependent ecosystem dynamics in China’s Three-North region.



\## Repository structure



```text

sanbei-gde-mapping-attribution/

├─ README.md

├─ requirements.txt

├─ .gitignore

├─ gee/

│  ├─ 01\_ecofeatures/

│  │  ├─ 01\_build\_ecofeatures\_by\_period.js

│  │  └─ 02\_add\_groundwater\_grace\_gldas.js

│  ├─ 02\_sampling\_rf/

│  │  └─ 01\_auto\_samples\_rf\_by\_period.js

│  ├─ 03\_trajectory/

│  │  ├─ 01\_build\_union\_mask.js

│  │  └─ 02\_trajectory\_classification.js

│  └─ 04\_attribution\_prep/

│     └─ 01\_export\_attribution\_samples.js

├─ python/

│  ├─ 01\_vif\_screening.py

│  ├─ 02\_logistic\_regression.py

│  ├─ 03\_cluster\_robust\_logit.py

│  └─ 04\_grid\_aggregation\_ols.py

├─ config/

│  └─ gee\_asset\_paths\_template.js

└─ docs/

&#x20;  └─ workflow.md

Workflow

Step 1. Build ecohydrological response features in GEE



Scripts in gee/01\_ecofeatures/ are used to construct the predictor variables for each study period, including:



NDVI-based vegetation growth metrics

drought persistence / drought-retention metrics

surface-water frequency

distance to water bodies

evapotranspiration to potential evapotranspiration ratio (ET/PET)

groundwater-related constraints derived from GRACE and GLDAS

Step 2. Generate samples and train Random Forest models



Scripts in gee/02\_sampling\_rf/ are used to:



delineate high-confidence sample classes

define GDE\_W, GDE\_V, NonGDE, and Cropland rules

perform stratified sampling

split training and testing datasets

train Random Forest classifiers

export GDE probability and binary maps

Step 3. Classify multi-period trajectories



Scripts in gee/03\_trajectory/ are used to:



build the union mask across all periods

encode four-period trajectory combinations

classify persistent degradation, recovery, stability, and fluctuation patterns

Step 4. Export attribution samples and run statistical analysis



Scripts in gee/04\_attribution\_prep/ and python/ are used to:



export samples for driver analysis

test multicollinearity

run logistic regression models

estimate cluster-robust models

conduct grid-based spatial robustness analysis

Data sources



This study uses publicly available remote sensing, land surface, and climate/hydrology datasets, including:



MODIS vegetation products

MODIS surface reflectance products

MODIS evapotranspiration products

surface-water datasets

TerraClimate

GRACE / GRACE-FO

GLDAS

ERA5-Land

land-cover / cropland datasets



The exact product names, temporal coverage, and data access information can be described in docs/workflow.md and in the manuscript.



Requirements



The Python scripts were developed with the following packages:



pandas

numpy

statsmodels

scikit-learn

matplotlib



Install dependencies with:



pip install -r requirements.txt

How to use

Google Earth Engine

Copy the scripts in the gee/ folder into the Earth Engine Code Editor.

Update all asset paths using your own assets and region boundaries.

Run the scripts in workflow order:

01\_ecofeatures

02\_sampling\_rf

03\_trajectory

04\_attribution\_prep

Python



Run the Python scripts after exporting the necessary sample tables from GEE:



python 01\_vif\_screening.py

python 02\_logistic\_regression.py

python 03\_cluster\_robust\_logit.py

python 04\_grid\_aggregation\_ols.py

Configuration



Do not directly use private asset paths in public scripts.



Use config/gee\_asset\_paths\_template.js as a template and replace:



region boundary asset path

intermediate asset path

exported table/image asset path



before running the scripts.



Notes

Large raw datasets are not stored in this repository.

Public raw data should be downloaded from their original repositories.

Private local paths and personal asset IDs should be replaced with templates before public release.

This repository is intended to provide the minimum code needed to reproduce the main analytical workflow.

Code availability



The custom Google Earth Engine and Python scripts used for ecohydrological feature construction, sample generation, Random Forest probability mapping, trajectory classification, and attribution analysis are provided in this repository.

Contact



For questions about the code, please contact:



Aohan Bo

boaohan@bjfu.edu.cn

