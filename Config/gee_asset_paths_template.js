// ==============================================================================
// gee_asset_paths_template.js
// Description:
// Template file for Google Earth Engine asset paths used in the
// sanbei-gde-mapping-attribution project.
//
// How to use:
// 1. Copy this file and rename it as:
//      config/gee_asset_paths.js
// 2. Replace all placeholder paths with your own GEE asset paths.
// 3. In each GEE script, either:
//      - directly paste the needed paths, or
//      - copy the variables from this file into the script.
// 4. Do NOT upload gee_asset_paths.js if it contains private asset paths.
// ==============================================================================


// ==============================
// 1. REGION BOUNDARY
// ==============================
var ROI_ASSET = "YOUR_GEE_ASSET_PATH/TNRBoundary_noregion";


// ==============================
// 2. ASSET ROOTS
// ==============================
// Base eco-feature outputs
var ECO_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/sanbeiGDE";

// Eco-feature outputs after adding groundwater metrics
var ECO_GW_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/sanbeiGDE_withGW";

// Random Forest probability outputs
var RFPROB_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/gde_rfprob";

// Trajectory outputs
var TRAJ_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/gde_trajectory";


// ==============================
// 3. PERIOD LABELS
// ==============================
var P1_LABEL = "P1_2005_2009";
var P2_LABEL = "P2_2010_2014";
var P3_LABEL = "P3_2015_2019";
var P4_LABEL = "P4_2020_2024";


// ==============================
// 4. INPUT / OUTPUT ASSETS
// ==============================

// ---- Eco-feature images after groundwater integration ----
var ECO_GW_P1 = ECO_GW_ASSET_ROOT + "/" + P1_LABEL;
var ECO_GW_P2 = ECO_GW_ASSET_ROOT + "/" + P2_LABEL;
var ECO_GW_P3 = ECO_GW_ASSET_ROOT + "/" + P3_LABEL;
var ECO_GW_P4 = ECO_GW_ASSET_ROOT + "/" + P4_LABEL;

// ---- RF probability outputs ----
var RFPROB_P1 = RFPROB_ASSET_ROOT + "/" + P1_LABEL;
var RFPROB_P2 = RFPROB_ASSET_ROOT + "/" + P2_LABEL;
var RFPROB_P3 = RFPROB_ASSET_ROOT + "/" + P3_LABEL;
var RFPROB_P4 = RFPROB_ASSET_ROOT + "/" + P4_LABEL;

// ---- Trajectory outputs ----
var UNION_MASK_ASSET = TRAJ_ASSET_ROOT + "/GDE_Union_Mask_Consistent_2005_2024";
var TRAJ_CODE_ASSET  = TRAJ_ASSET_ROOT + "/GDE_Trajectory_Code_2005_2024";
var TRAJ_GROUP_ASSET = TRAJ_ASSET_ROOT + "/GDE_Trajectory_Group_2005_2024";


// ==============================
// 5. OPTIONAL EXPORT SETTINGS
// ==============================
var EXPORT_SCALE = 500;
var EXPORT_MAXPIXELS = 1e13;


// ==============================
// 6. OPTIONAL REFERENCE YEARS
// ==============================
var LC_YEAR_P1 = 2007;
var LC_YEAR_P2 = 2012;
var LC_YEAR_P3 = 2017;
var LC_YEAR_P4 = 2022;


// ==============================
// 7. NOTES
// ==============================
// Example usage inside a GEE script:
//
// var roiAsset = ROI_ASSET;
// var ECO_ASSET_ROOT = ECO_GW_ASSET_ROOT;
// var PERIOD_LABEL = P1_LABEL;
//
// Or:
//
// var unionMask = ee.Image(UNION_MASK_ASSET);
// var imgP1 = ee.Image(RFPROB_P1).select("GDE_binary");
//
// Keep this template public if you want.
// Keep your real gee_asset_paths.js private if it contains personal asset paths.