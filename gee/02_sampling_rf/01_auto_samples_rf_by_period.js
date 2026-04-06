// ==============================================================================
// 01_auto_samples_rf_by_period.js
// Description:
// Rule-based high-confidence sample extraction and Random Forest probability
// mapping for groundwater-dependent ecosystems (GDEs) for one study period.
//
// Notes:
// - Replace all placeholder asset paths before running.
// - This version is aligned with the revised eco-feature outputs from:
//   01_build_ecofeatures_by_period.js
//   02_add_groundwater_grace_gldas.js
// ==============================================================================


// ==============================
// 0. USER SETTINGS
// ==============================

// Replace with your own region boundary asset.
var roiAsset = "YOUR_GEE_ASSET_PATH/TNRBoundary_noregion";

// Replace with your own asset roots.
var ECO_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/sanbeiGDE_withGW";
var OUT_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/gde_rfprob";

// Choose one period to run.
var PERIOD_LABEL = "P1_2005_2009";

// Land-cover year used for cropland mask
var LC_YEAR = 2007;

// Sampling settings
var Q_SCALE = 500;
var SAMPLE_SCALE = 500;
var RANDOM_POINTS_N = 12000;
var STRATIFIED_POINTS_PER_CLASS = 1500;
var TRAIN_RATIO = 0.7;
var SEED = 2025;

// RF settings
var N_TREES = 300;
var BAG_FRACTION = 0.7;

// Binary threshold for final GDE mask
var GDE_PROB_THRESH = 0.5;


// ==============================
// 1. LOAD ROI AND ECO-FEATURE IMAGE
// ==============================
var roi = ee.FeatureCollection(roiAsset).geometry();

var eco = ee.Image(ECO_ASSET_ROOT + "/" + PERIOD_LABEL);

// Feature bands aligned with the revised eco-feature scripts.
var featureBands = [
  "GWSA_mm_mean",
  "GWSA_mm_trend",

  "NDVI_grow_mean",
  "NDVI_grow_max",
  "NDVI_grow_min",
  "NDVI_grow_std",
  "NDVI_grow_amp",
  "NDVI_grow_cv",

  "NDVI_drought_mean",
  "NDVI_nondrought_mean",
  "NDVI_retention",
  "drought_month_count",
  "drought_valid_months",
  "nondrought_valid_months",

  "water_freq_ndwi",
  "water_freq_mndwi",
  "dist_to_water",

  "ET_mean",
  "PET_mean",
  "ET_PET_mean",
  "ET_std",
  "ET_PET_std"
];

var X = eco.select(featureBands).toFloat();

Map.centerObject(roi, 5);
print("Period:", PERIOD_LABEL);
print("Feature bands:", X.bandNames());


// ==============================
// 2. CROPLAND MASK
// ==============================
var lc = ee.ImageCollection("MODIS/061/MCD12Q1")
  .filter(ee.Filter.calendarRange(LC_YEAR, LC_YEAR, "year"))
  .first()
  .select("LC_Type1");

// IGBP cropland classes: 12 croplands, 14 cropland/natural vegetation mosaic
var crop = lc.eq(12).or(lc.eq(14)).selfMask();
var notCropMask = crop.unmask(0).eq(0);

var X_noCrop = X.updateMask(notCropMask);


// ==============================
// 3. QUANTILE POINTS
// ==============================
var qPts = ee.FeatureCollection.randomPoints({
  region: roi,
  points: RANDOM_POINTS_N,
  seed: SEED
});

function getQuantileFromPoints(img, band, q) {
  var fc = img.select(band)
    .sampleRegions({
      collection: qPts,
      scale: Q_SCALE,
      geometries: false,
      tileScale: 4
    })
    .filter(ee.Filter.notNull([band]));

  return ee.Number(
    fc.reduceColumns({
      reducer: ee.Reducer.percentile([q]).setOutputs(["p"]),
      selectors: [band]
    }).get("p")
  );
}


// ==============================
// 4. RULE-BASED HIGH-CONFIDENCE CLASSES
// ==============================
// Thresholds estimated from period-specific distributions
var ret_p60  = getQuantileFromPoints(X_noCrop, "NDVI_retention", 60);
var etp_p60  = getQuantileFromPoints(X_noCrop, "ET_PET_mean", 60);
var mnd_p50  = getQuantileFromPoints(X_noCrop, "water_freq_mndwi", 50);

var ndvi_p40 = getQuantileFromPoints(X, "NDVI_grow_mean", 40);
var etp_p40  = getQuantileFromPoints(X, "ET_PET_mean", 40);

print("ret_p60:", ret_p60);
print("etp_p60:", etp_p60);
print("mnd_p50:", mnd_p50);
print("ndvi_p40:", ndvi_p40);
print("etp_p40:", etp_p40);

// GDE_W: water-associated GDEs
var gdeW = X.select("water_freq_mndwi").gt(0.20)
  .and(X.select("dist_to_water").lt(2000))
  .and(notCropMask)
  .selfMask();

// GDE_V: vegetation-dominated GDEs
var gdeV = X.select("NDVI_retention").gt(ret_p60)
  .and(X.select("ET_PET_mean").gt(etp_p60))
  .and(X.select("water_freq_mndwi").lt(mnd_p50))
  .and(X.select("NDVI_grow_mean").gt(0.10))
  .and(X.select("dist_to_water").gt(2000))
  .and(notCropMask)
  .selfMask();

// Non-GDE
var nonGDE = X.select("NDVI_grow_mean").lt(ndvi_p40)
  .and(X.select("ET_PET_mean").lt(etp_p40))
  .and(X.select("water_freq_mndwi").lt(0.05))
  .and(X.select("dist_to_water").gt(3000))
  .and(notCropMask)
  .selfMask();


// ==============================
// 5. LABEL IMAGE
// Class codes:
//   0 = NonGDE
//   1 = GDE_W
//   2 = GDE_V
//   3 = Cropland
// ==============================
var label = ee.Image.constant(-1).rename("class").toInt16();

label = label
  .where(crop, 3)
  .where(gdeW, 1)
  .where(gdeV, 2)
  .where(nonGDE, 0);

label = label.updateMask(label.gte(0)).toInt16();

Map.addLayer(label.clip(roi), {}, "class_label");


// ==============================
// 6. STRATIFIED SAMPLE EXTRACTION
// ==============================
var samples = X.addBands(label).stratifiedSample({
  numPoints: STRATIFIED_POINTS_PER_CLASS,
  classBand: "class",
  region: roi,
  scale: SAMPLE_SCALE,
  seed: SEED,
  geometries: false,
  tileScale: 4
});

print("Total samples:", samples.size());
print("Sample example:", samples.first());


// ==============================
// 7. TRAIN / TEST SPLIT
// ==============================
samples = samples.randomColumn("rand", SEED);

var trainSamples = samples.filter(ee.Filter.lt("rand", TRAIN_RATIO));
var testSamples  = samples.filter(ee.Filter.gte("rand", TRAIN_RATIO));

print("Train sample size:", trainSamples.size());
print("Test sample size:", testSamples.size());


// ==============================
// 8. TRAIN RANDOM FOREST
// ==============================
var rf = ee.Classifier.smileRandomForest({
  numberOfTrees: N_TREES,
  bagFraction: BAG_FRACTION,
  seed: SEED
}).train({
  features: trainSamples,
  classProperty: "class",
  inputProperties: featureBands
});


// ==============================
// 9. TEST ACCURACY
// ==============================
var testClassified = testSamples.classify(rf);

var confusionMatrix = testClassified.errorMatrix("class", "classification");
print("Confusion matrix:", confusionMatrix);
print("Overall accuracy:", confusionMatrix.accuracy());
print("Kappa:", confusionMatrix.kappa());


// ==============================
// 10. PROBABILITY MAPPING
// ==============================
var classImg = X.classify(rf).rename("GDE_class");

var rfProb = rf.setOutputMode("MULTIPROBABILITY");
var probArr = X.classify(rfProb);

// Keep class order consistent with the class codes above:
// 0 = NonGDE, 1 = GDE_W, 2 = GDE_V, 3 = Cropland
var probBands = probArr.arrayFlatten([[
  "NonGDE_p",
  "GDE_W_p",
  "GDE_V_p",
  "Cropland_p"
]]);

var gdeProb = probBands.select("GDE_W_p")
  .add(probBands.select("GDE_V_p"))
  .rename("GDE_prob");

var gdeBinary = gdeProb.gte(GDE_PROB_THRESH).rename("GDE_binary");


// ==============================
// 11. EXPORT
// ==============================
var exportImg = ee.Image.cat([
  classImg.toFloat(),
  probBands.toFloat(),
  gdeProb.toFloat(),
  gdeBinary.toFloat()
]).toFloat();

Map.addLayer(gdeProb.clip(roi), {min: 0, max: 1}, "GDE_prob");
Map.addLayer(gdeBinary.clip(roi), {min: 0, max: 1}, "GDE_binary");

Export.image.toAsset({
  image: exportImg.clip(roi),
  description: "Sanbei_GDE_RFprob_" + PERIOD_LABEL,
  assetId: OUT_ASSET_ROOT + "/" + PERIOD_LABEL,
  region: roi,
  scale: SAMPLE_SCALE,
  maxPixels: 1e13
});