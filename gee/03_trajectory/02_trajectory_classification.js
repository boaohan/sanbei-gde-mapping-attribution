// ==============================================================================
// 02_trajectory_classification.js
// Description:
// Compute a 4-digit GDE trajectory code from four period-specific binary maps,
// then classify trajectories into major groups:
//
//   1 = persistent degradation
//   2 = persistent recovery
//   3 = stable GDE
//   4 = fluctuating / mixed trajectory
//
// Notes:
// - Replace all placeholder asset paths before running.
// - This script is aligned with:
//   01_auto_samples_rf_by_period.js
//   01_build_union_mask.js
// ==============================================================================


// ==============================
// 0. USER SETTINGS
// ==============================

// Replace with your own region boundary asset
var roiAsset = "YOUR_GEE_ASSET_PATH/TNRBoundary_noregion";

// Replace with your own RF output asset root
var RFPROB_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/gde_rfprob";

// Replace with your own trajectory asset root
var TRAJ_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/gde_trajectory";

// Input assets
var UNION_MASK_ASSET = TRAJ_ASSET_ROOT + "/GDE_Union_Mask_Consistent_2005_2024";

// Period labels
var P1_LABEL = "P1_2005_2009";
var P2_LABEL = "P2_2010_2014";
var P3_LABEL = "P3_2015_2019";
var P4_LABEL = "P4_2020_2024";

// Input band name from RF output
var BINARY_BAND = "GDE_binary";

// Export settings
var EXPORT_SCALE = 500;
var EXPORT_MAXPIXELS = 1e13;


// ==============================
// 1. LOAD ROI
// ==============================
var roiFc = ee.FeatureCollection(roiAsset);
var roi = roiFc.geometry();

Map.centerObject(roiFc, 5);


// ==============================
// 2. HELPERS
// ==============================
function loadBinary(periodLabel) {
  return ee.Image(RFPROB_ASSET_ROOT + "/" + periodLabel)
    .select(BINARY_BAND)
    .rename("gde")
    .toByte();
}


// ==============================
// 3. LOAD INPUT IMAGES
// ==============================
var unionMask = ee.Image(UNION_MASK_ASSET)
  .select("GDE_union")
  .rename("GDE_union")
  .toByte();

var imgP1 = loadBinary(P1_LABEL);
var imgP2 = loadBinary(P2_LABEL);
var imgP3 = loadBinary(P3_LABEL);
var imgP4 = loadBinary(P4_LABEL);

var col = ee.ImageCollection.fromImages([imgP1, imgP2, imgP3, imgP4]);

// Pixel must be valid in all four periods
var validInAllPeriods = col.map(function(img) {
  return img.mask().rename("valid");
}).min();


// ==============================
// 4. BUILD 4-DIGIT TRAJECTORY CODE
// Example:
//   1111 = stable GDE
//   1110 = late degradation
//   1100 = persistent degradation
//   0111 = persistent recovery
//   1010 = fluctuating
// ==============================
var trajectory = imgP1.multiply(1000)
  .add(imgP2.multiply(100))
  .add(imgP3.multiply(10))
  .add(imgP4)
  .updateMask(validInAllPeriods)
  .updateMask(unionMask)
  .rename("traj_code")
  .toInt16();

print("Trajectory band names:", trajectory.bandNames());


// ==============================
// 5. DEFINE TRAJECTORY GROUPS
// ==============================

// Persistent degradation:
// 1000, 1100, 1110
var degradationMask = trajectory.eq(1000)
  .or(trajectory.eq(1100))
  .or(trajectory.eq(1110));

// Persistent recovery:
// 0111, 0011, 0001
// Note: as integers they are 111, 11, 1
var recoveryMask = trajectory.eq(111)
  .or(trajectory.eq(11))
  .or(trajectory.eq(1));

// Stable GDE:
var stableGDEMask = trajectory.eq(1111);

// Fluctuating / mixed:
var fluctuationMask = trajectory.neq(1111)
  .and(degradationMask.not())
  .and(recoveryMask.not())
  .and(trajectory.mask());


// ==============================
// 6. BUILD GROUPED CLASS IMAGE
// Class codes:
//   1 = degradation
//   2 = recovery
//   3 = stable GDE
//   4 = fluctuation / mixed
// ==============================
var trajGroup = ee.Image.constant(0).rename("traj_group").toByte();

trajGroup = trajGroup
  .where(degradationMask, 1)
  .where(recoveryMask, 2)
  .where(stableGDEMask, 3)
  .where(fluctuationMask, 4)
  .updateMask(trajectory.mask())
  .toByte();


// ==============================
// 7. VISUAL CHECK
// ==============================
Map.addLayer(unionMask.clip(roi), {min: 0, max: 1}, "GDE_union");
Map.addLayer(trajectory.clip(roi), {}, "traj_code");
Map.addLayer(trajGroup.clip(roi), {min: 1, max: 4}, "traj_group");

print("Trajectory group codes:",
  ee.Dictionary({
    1: "degradation",
    2: "recovery",
    3: "stable_GDE",
    4: "fluctuation_or_mixed"
  })
);


// ==============================
// 8. EXPORT
// Export trajectory code image
// ==============================
Export.image.toAsset({
  image: trajectory.toInt16().clip(roi),
  description: "Asset_GDE_Trajectory_Code_2005_2024",
  assetId: TRAJ_ASSET_ROOT + "/GDE_Trajectory_Code_2005_2024",
  region: roi,
  scale: EXPORT_SCALE,
  maxPixels: EXPORT_MAXPIXELS,
  pyramidingPolicy: {".default": "mode"}
});

// Export grouped trajectory class image
Export.image.toAsset({
  image: trajGroup.toByte().clip(roi),
  description: "Asset_GDE_Trajectory_Group_2005_2024",
  assetId: TRAJ_ASSET_ROOT + "/GDE_Trajectory_Group_2005_2024",
  region: roi,
  scale: EXPORT_SCALE,
  maxPixels: EXPORT_MAXPIXELS,
  pyramidingPolicy: {".default": "mode"}
});