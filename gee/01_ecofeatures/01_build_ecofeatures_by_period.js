// ==============================================================================
// 01_build_ecofeatures_by_period.js
// Description:
// Build eco-hydrological predictor layers for one study period, including:
// 1) NDVI statistics
// 2) Drought-retention metrics
// 3) Water frequency (NDWI / MNDWI) and distance to water
// 4) ET / PET metrics
//
// Notes:
// - Replace all placeholder asset paths before running.
// - Designed for period-based reuse (e.g., P1, P2, P3, P4).
// ==============================================================================


// ==============================
// 0. USER SETTINGS
// ==============================

// Replace with your own region boundary asset.
var roiAsset = "YOUR_GEE_ASSET_PATH/TNRBoundary_noregion";

// Replace with your own export asset root.
var exportAssetRoot = "YOUR_GEE_ASSET_PATH/sanbeiGDE";

// Example period settings.
// Change these three lines for P1 / P2 / P3 / P4.
var P_START = "2020-01-01";
var P_END   = "2025-01-01";
var PERIOD_LABEL = "P4_2020_2024";

// Growing season settings
var GROW_START_MONTH = 4;
var GROW_END_MONTH   = 10;

// Drought settings
var PDSI_DROUGHT_THRESH = -2.0;
var MIN_VALID_MONTHS = 4;
var RETENTION_DENOM_MIN = 0.05;
var RETENTION_MIN = 0.0;
var RETENTION_MAX = 2.0;

// NDVI valid range
var NDVI_MIN_VALID = -0.2;
var NDVI_MAX_VALID = 1.0;

// Water settings
var NDWI_WATER_THRESH = 0.0;
var MNDWI_WATER_THRESH = 0.0;
var WATER_FREQ_THRESH = 0.1;   // for distance-to-water source mask

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
// 2. COMMON UTILS
// ==============================
function bitwiseExtract(value, fromBit, toBit) {
  toBit = (toBit === undefined) ? fromBit : toBit;
  var maskSize = ee.Number(1).add(toBit).subtract(fromBit);
  var mask = ee.Number(1).leftShift(maskSize).subtract(1);
  return value.rightShift(fromBit).bitwiseAnd(mask);
}

function monthlyCompositeMean(ic, startDate, endDate, emptyBandName) {
  startDate = ee.Date(startDate);
  endDate = ee.Date(endDate);

  var nMonths = endDate.difference(startDate, "month");
  var monthSeq = ee.List.sequence(0, nMonths.subtract(1));

  return ee.ImageCollection.fromImages(
    monthSeq.map(function(m) {
      m = ee.Number(m);
      var ms = startDate.advance(m, "month");
      var me = ms.advance(1, "month");
      var sub = ic.filterDate(ms, me);

      var img = ee.Image(ee.Algorithms.If(
        sub.size().gt(0),
        sub.mean(),
        ee.Image.constant(0).rename(emptyBandName).updateMask(ee.Image.constant(0))
      ));

      return img
        .set("system:time_start", ms.millis())
        .set("year", ms.get("year"))
        .set("month", ms.get("month"));
    })
  );
}


// ==============================
// 3. NDVI FUNCTIONS
// ==============================
function getNdviIC(startDate, endDate) {
  return ee.ImageCollection("MODIS/061/MOD13Q1")
    .filterDate(startDate, endDate)
    .filterBounds(roi)
    .map(function(img) {
      var qa = img.select("SummaryQA");
      var qaMask = bitwiseExtract(qa, 0, 1).lte(1); // good or marginal

      var ndviRaw = img.select("NDVI");
      var rawValid = ndviRaw.neq(-32768).and(ndviRaw.neq(32767));

      var ndvi = ndviRaw.multiply(0.0001).rename("NDVI");
      var rangeValid = ndvi.gte(NDVI_MIN_VALID).and(ndvi.lte(NDVI_MAX_VALID));

      return ndvi
        .updateMask(qaMask)
        .updateMask(rawValid)
        .updateMask(rangeValid)
        .copyProperties(img, ["system:time_start"]);
    });
}


// ==============================
// 4. PDSI FUNCTIONS
// ==============================
function getPDSI(startDate, endDate) {
  return ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE")
    .filterDate(startDate, endDate)
    .filterBounds(roi)
    .select("pdsi")
    .map(function(img) {
      return img
        .multiply(0.01)
        .rename("pdsi")
        .copyProperties(img, ["system:time_start"]);
    });
}


// ==============================
// 5. WATER FUNCTIONS (MOD09A1)
// ==============================
function getSurfaceReflectanceIC(startDate, endDate) {
  return ee.ImageCollection("MODIS/061/MOD09A1")
    .filterDate(startDate, endDate)
    .filterBounds(roi)
    .map(function(img) {
      var state = img.select("StateQA");

      // Cloud state bits 0-1: 0 clear, 1 cloudy, 2 mixed, 3 not set
      var cloudState = bitwiseExtract(state, 0, 1);
      var cloudShadow = bitwiseExtract(state, 2, 2);

      var qaMask = cloudState.eq(0).and(cloudShadow.eq(0));

      var green = img.select("sur_refl_b04").multiply(0.0001).rename("green");
      var nir   = img.select("sur_refl_b02").multiply(0.0001).rename("nir");
      var swir1 = img.select("sur_refl_b06").multiply(0.0001).rename("swir1");

      var ndwi = green.subtract(nir)
        .divide(green.add(nir).max(ee.Image.constant(1e-6)))
        .rename("NDWI");

      var mndwi = green.subtract(swir1)
        .divide(green.add(swir1).max(ee.Image.constant(1e-6)))
        .rename("MNDWI");

      return ee.Image.cat([ndwi, mndwi])
        .updateMask(qaMask)
        .copyProperties(img, ["system:time_start"]);
    });
}


// ==============================
// 6. ET / PET FUNCTIONS
// ==============================
function getEtPetIC(startDate, endDate) {
  return ee.ImageCollection("MODIS/061/MOD16A2GF")
    .filterDate(startDate, endDate)
    .filterBounds(roi)
    .map(function(img) {
      var et = img.select("ET").multiply(0.1).rename("ET");
      var pet = img.select("PET").multiply(0.1).rename("PET");

      var valid = et.gte(0).and(pet.gt(0));

      var etpet = et.divide(pet.max(ee.Image.constant(1e-6))).rename("ET_PET");

      return ee.Image.cat([et, pet, etpet])
        .updateMask(valid)
        .copyProperties(img, ["system:time_start"]);
    });
}


// ==============================
// 7. NDVI STATISTICS
// ==============================
var ndviGrow = getNdviIC(P_START, P_END)
  .filter(ee.Filter.calendarRange(GROW_START_MONTH, GROW_END_MONTH, "month"));

var ndviMean = ndviGrow.mean().rename("NDVI_grow_mean");
var ndviMax  = ndviGrow.max().rename("NDVI_grow_max");
var ndviMin  = ndviGrow.min().rename("NDVI_grow_min");
var ndviStd  = ndviGrow.reduce(ee.Reducer.stdDev()).rename("NDVI_grow_std");
var ndviAmp  = ndviMax.subtract(ndviMin).rename("NDVI_grow_amp");
var ndviCV   = ndviStd.divide(ndviMean.max(ee.Image.constant(1e-6))).rename("NDVI_grow_cv");


// ==============================
// 8. DROUGHT RETENTION
// ==============================
var ndviMonthly = monthlyCompositeMean(
  getNdviIC(P_START, P_END),
  P_START,
  P_END,
  "NDVI"
).filter(ee.Filter.calendarRange(GROW_START_MONTH, GROW_END_MONTH, "month"));

var pdsiMonthly = getPDSI(P_START, P_END)
  .filter(ee.Filter.calendarRange(GROW_START_MONTH, GROW_END_MONTH, "month"));

var joined = ee.Join.inner().apply(
  ndviMonthly,
  pdsiMonthly,
  ee.Filter.equals({
    leftField: "system:time_start",
    rightField: "system:time_start"
  })
);

var paired = ee.ImageCollection(joined.map(function(f) {
  f = ee.Feature(f);

  var ndvi = ee.Image(f.get("primary")).rename("NDVI");
  var pdsi = ee.Image(f.get("secondary")).rename("pdsi");

  var droughtMask = pdsi.lte(PDSI_DROUGHT_THRESH);
  var nondroughtMask = pdsi.gt(PDSI_DROUGHT_THRESH);

  var ndviD = ndvi.updateMask(droughtMask).rename("NDVI_drought");
  var ndviN = ndvi.updateMask(nondroughtMask).rename("NDVI_nondrought");

  return ee.Image.cat([ndviD, ndviN])
    .set("system:time_start", ndvi.get("system:time_start"));
}));

var ndviDroughtMean = paired.select("NDVI_drought")
  .mean()
  .rename("NDVI_drought_mean");

var ndviNonDroughtMean = paired.select("NDVI_nondrought")
  .mean()
  .rename("NDVI_nondrought_mean");

var droughtValidMonths = paired.select("NDVI_drought")
  .count()
  .rename("drought_valid_months");

var nondroughtValidMonths = paired.select("NDVI_nondrought")
  .count()
  .rename("nondrought_valid_months");

var retentionMask = droughtValidMonths.gte(MIN_VALID_MONTHS)
  .and(nondroughtValidMonths.gte(MIN_VALID_MONTHS))
  .and(ndviNonDroughtMean.gt(RETENTION_DENOM_MIN));

var ndviRetention = ndviDroughtMean
  .divide(ndviNonDroughtMean.max(ee.Image.constant(1e-6)))
  .rename("NDVI_retention")
  .updateMask(retentionMask);

ndviRetention = ndviRetention.updateMask(
  ndviRetention.gte(RETENTION_MIN).and(ndviRetention.lte(RETENTION_MAX))
);

var droughtMonthCount = pdsiMonthly
  .map(function(img) {
    return img.lte(PDSI_DROUGHT_THRESH).rename("drought");
  })
  .sum()
  .rename("drought_month_count");


// ==============================
// 9. WATER FREQUENCY + DISTANCE
// ==============================
var waterIC = getSurfaceReflectanceIC(P_START, P_END);

var waterMaskNdwi = waterIC.select("NDWI")
  .map(function(img) {
    return img.gt(NDWI_WATER_THRESH).rename("water_ndwi");
  });

var waterMaskMndwi = waterIC.select("MNDWI")
  .map(function(img) {
    return img.gt(MNDWI_WATER_THRESH).rename("water_mndwi");
  });

var waterFreqNdwi = waterMaskNdwi.mean().rename("water_freq_ndwi");
var waterFreqMndwi = waterMaskMndwi.mean().rename("water_freq_mndwi");

// Combined recurrent water source for distance calculation
var combinedWaterFreq = waterFreqNdwi.max(waterFreqMndwi).rename("water_freq_combined");
var waterSource = combinedWaterFreq.gte(WATER_FREQ_THRESH).selfMask();

var modisScale = ee.Number(waterFreqNdwi.projection().nominalScale());

var distToWater = waterSource.unmask(0)
  .fastDistanceTransform(256, "pixels", "squared_euclidean")
  .sqrt()
  .multiply(modisScale)
  .rename("dist_to_water");


// ==============================
// 10. ET / PET METRICS
// ==============================
var etpetIC = getEtPetIC(P_START, P_END);

var etMean = etpetIC.select("ET").mean().rename("ET_mean");
var petMean = etpetIC.select("PET").mean().rename("PET_mean");
var etpetMean = etpetIC.select("ET_PET").mean().rename("ET_PET_mean");

var etStd = etpetIC.select("ET").reduce(ee.Reducer.stdDev()).rename("ET_std");
var etpetStd = etpetIC.select("ET_PET").reduce(ee.Reducer.stdDev()).rename("ET_PET_std");


// ==============================
// 11. STACK FEATURES
// ==============================
var ecoFeatures = ee.Image.cat([
  // NDVI stats
  ndviMean,
  ndviMax,
  ndviMin,
  ndviStd,
  ndviAmp,
  ndviCV,

  // Drought-retention metrics
  ndviDroughtMean,
  ndviNonDroughtMean,
  ndviRetention,
  droughtMonthCount,
  droughtValidMonths,
  nondroughtValidMonths,

  // Water metrics
  waterFreqNdwi,
  waterFreqMndwi,
  distToWater,

  // ET / PET metrics
  etMean,
  petMean,
  etpetMean,
  etStd,
  etpetStd
]).toFloat();

print("Feature band names:", ecoFeatures.bandNames());
Map.addLayer(ndviMean.clip(roi), {min: 0, max: 0.8}, "NDVI_grow_mean");
Map.addLayer(waterFreqNdwi.clip(roi), {min: 0, max: 1}, "water_freq_ndwi");
Map.addLayer(distToWater.clip(roi), {min: 0, max: 5000}, "dist_to_water");


// ==============================
// 12. EXPORT
// ==============================
Export.image.toAsset({
  image: ecoFeatures.clip(roi),
  description: "Asset_EcoFeatures_" + PERIOD_LABEL,
  assetId: exportAssetRoot + "/" + PERIOD_LABEL,
  region: roi,
  scale: EXPORT_SCALE,
  maxPixels: EXPORT_MAXPIXELS
});