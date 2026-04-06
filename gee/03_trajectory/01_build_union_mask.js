// ==============================================================================
// 01_build_union_mask.js
// Description:
// Build a consistent union mask from four period-specific GDE binary maps.
//
// Logic:
// 1) Load GDE_binary from each period
// 2) Keep only pixels valid in all four periods
// 3) Compute the union mask (pixel is GDE in at least one period)
// ==============================================================================


// ==============================
// 0. USER SETTINGS
// ==============================

// Replace with your own region boundary asset
var roiAsset = "YOUR_GEE_ASSET_PATH/TNRBoundary_noregion";

// Replace with your own RF output asset root
var RFPROB_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/gde_rfprob";

// Output asset root
var OUT_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/gde_trajectory";

// Period labels
var P1_LABEL = "P1_2005_2009";
var P2_LABEL = "P2_2010_2014";
var P3_LABEL = "P3_2015_2019";
var P4_LABEL = "P4_2020_2024";

// Band name to use from each RF output asset
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
// 3. LOAD PERIOD IMAGES
// ==============================
var imgP1 = loadBinary(P1_LABEL);
var imgP2 = loadBinary(P2_LABEL);
var imgP3 = loadBinary(P3_LABEL);
var imgP4 = loadBinary(P4_LABEL);

var col = ee.ImageCollection.fromImages([imgP1, imgP2, imgP3, imgP4]);


// ==============================
// 4. BUILD CONSISTENT UNION MASK
// ==============================
// validInAllPeriods: pixel must be valid in all four periods
var validInAllPeriods = col.map(function(img) {
  return img.mask().rename("valid");
}).min().rename("valid_all");

// gdeUnionRaw: pixel is GDE in at least one period
var gdeUnionRaw = col.max().rename("GDE_union_raw");

// Final union mask with consistent validity constraint
var gdeUnionFinal = gdeUnionRaw
  .updateMask(validInAllPeriods)
  .rename("GDE_union")
  .clip(roi);


// ==============================
// 5. VISUAL CHECK
// ==============================
Map.addLayer(validInAllPeriods.clip(roi), {min: 0, max: 1}, "valid_in_all_periods");
Map.addLayer(gdeUnionRaw.clip(roi), {min: 0, max: 1}, "GDE_union_raw");
Map.addLayer(gdeUnionFinal, {min: 0, max: 1}, "GDE_union_final");

print("P1 band names:", imgP1.bandNames());
print("Union mask band names:", gdeUnionFinal.bandNames());


// ==============================
// 6. EXPORT
// ==============================
Export.image.toAsset({
  image: gdeUnionFinal.toByte(),
  description: "Asset_GDE_UnionMask_Consistent_2005_2024",
  assetId: OUT_ASSET_ROOT + "/GDE_Union_Mask_Consistent_2005_2024",
  region: roi,
  scale: EXPORT_SCALE,
  maxPixels: EXPORT_MAXPIXELS
});