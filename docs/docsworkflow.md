\# Workflow



\## Project overview



This repository contains the Google Earth Engine (GEE) and Python workflow used to map groundwater-dependent ecosystems (GDEs), analyze their multi-period trajectories, and identify the drivers of persistent degradation in China’s Three-North region during 2005–2024.



The workflow consists of four main components:



1\. ecohydrological feature construction in GEE  

2\. high-confidence sample generation and Random Forest probability mapping  

3\. multi-period trajectory analysis  

4\. attribution analysis using Python  



\---



\## Study periods



The analysis is conducted for four multi-year periods:



\- \*\*P1:\*\* 2005–2009

\- \*\*P2:\*\* 2010–2014

\- \*\*P3:\*\* 2015–2019

\- \*\*P4:\*\* 2020–2024



These four periods are used consistently throughout feature construction, probability mapping, trajectory coding, and attribution analysis.



\---



\## Folder structure



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

Step 1. Build ecohydrological features in GEE

Script



gee/01\_ecofeatures/01\_build\_ecofeatures\_by\_period.js



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



NDVI\_grow\_mean

NDVI\_grow\_max

NDVI\_grow\_min

NDVI\_grow\_std

NDVI\_grow\_amp

NDVI\_grow\_cv

NDVI\_drought\_mean

NDVI\_nondrought\_mean

NDVI\_retention

drought\_month\_count

drought\_valid\_months

nondrought\_valid\_months

water\_freq\_ndwi

water\_freq\_mndwi

dist\_to\_water

ET\_mean

PET\_mean

ET\_PET\_mean

ET\_std

ET\_PET\_std

Main data sources



Typical data sources include:



MOD13Q1

MOD09A1

MOD16A2GF

TerraClimate

Notes



Run this script once for each period by updating:



P\_START

P\_END

PERIOD\_LABEL

Step 2. Add groundwater metrics from GRACE and GLDAS

Script



gee/01\_ecofeatures/02\_add\_groundwater\_grace\_gldas.js



Purpose



This script calculates groundwater storage anomaly using:



GWSA = TWSA (GRACE) - LWSA (GLDAS-derived liquid water storage anomaly)



It then merges groundwater metrics with the base eco-feature image for each period.



Main outputs



Additional groundwater-related bands include:



GWSA\_mm\_mean

GWSA\_mm\_trend

Main data sources

GRACE / GRACE-FO mascon product

GLDAS Noah

Notes



This script should be run after the base eco-feature images have already been created.



Step 3. Generate high-confidence samples and Random Forest probability maps

Script



gee/02\_sampling\_rf/01\_auto\_samples\_rf\_by\_period.js



Purpose



This script identifies high-confidence samples for four classes:



NonGDE

GDE\_W

GDE\_V

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

split data into training and testing subsets

train Random Forest classifier

output class map and probability layers

Main outputs



Typical output bands include:



GDE\_class

NonGDE\_p

GDE\_W\_p

GDE\_V\_p

Cropland\_p

GDE\_prob

GDE\_binary

Notes



Run this script separately for each period.



Step 4. Build a union mask across periods

Script



gee/03\_trajectory/01\_build\_union\_mask.js



Purpose



This script combines the four period-specific GDE\_binary maps and builds a consistent union mask.



Logic

load GDE\_binary from P1–P4

keep only pixels valid in all four periods

assign a pixel as part of the union mask if it is classified as GDE in at least one period

Main output

GDE\_union

Step 5. Compute trajectory code and grouped trajectory classes

Script



gee/03\_trajectory/02\_trajectory\_classification.js



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

traj\_code

traj\_group

Step 6. Export attribution samples

Script



gee/04\_attribution\_prep/01\_export\_attribution\_samples.js



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



python/01\_vif\_screening.py



Purpose



This script evaluates multicollinearity among candidate predictors using Variance Inflation Factor (VIF).



Output

printed VIF table

vif\_results.csv

Step 8. Standardized logistic regression

Script



python/02\_logistic\_regression.py



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



slope\_GWSA\_mm\_trend

slope\_NDVI\_retention

slope\_dist\_to\_water

slope\_ET\_PET\_mean

slope\_Precip

slope\_Temp

slope\_Dist\_Cropland\_m

Dist\_Cropland\_2022\_m

Step 9. Cluster-robust logit

Script



python/03\_cluster\_robust\_logit.py



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



python/04\_grid\_aggregation\_ols.py



Purpose



This script performs a grid-level robustness analysis by aggregating samples to 0.25-degree grids.



Response variable



The dependent variable is the proportion of persistent degradation within each grid.



Output

grid-level OLS coefficient table

Recommended running order



Run the workflow in the following order:



gee/01\_ecofeatures/01\_build\_ecofeatures\_by\_period.js

gee/01\_ecofeatures/02\_add\_groundwater\_grace\_gldas.js

gee/02\_sampling\_rf/01\_auto\_samples\_rf\_by\_period.js

gee/03\_trajectory/01\_build\_union\_mask.js

gee/03\_trajectory/02\_trajectory\_classification.js

gee/04\_attribution\_prep/01\_export\_attribution\_samples.js

python/01\_vif\_screening.py

python/02\_logistic\_regression.py

python/03\_cluster\_robust\_logit.py

python/04\_grid\_aggregation\_ols.py

Important notes for public release

Do not upload private GEE asset paths directly in public scripts.

Use config/gee\_asset\_paths\_template.js as a public template.

Do not upload large raw raster files to this repository.

Public source datasets should be accessed from their original repositories.

Keep code, documentation, and variable names consistent across GEE and Python scripts.

