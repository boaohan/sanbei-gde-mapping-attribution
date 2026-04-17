// ==============================================================================
// 01_export_attribution_samples.js
// Description:
// Export stratified samples for attribution analysis by combining:
//
// 1) trajectory-based response variable (persistent degradation vs stable GDE)
// 2) period-to-period slopes of ecohydrological drivers
// 3) long-term climate trends (ERA5-Land)
// 4) cropland-distance trend and current cropland proximity
//
// Output:
// CSV table for downstream Python regression analysis
// ==============================================================================


// ==============================
// 0. USER SETTINGS
// ==============================

// Replace with your own region boundary asset
var roiAsset = "YOUR_GEE_ASSET_PATH/TNRBoundary_noregion";

// Replace with your own asset roots
var ENV_ASSET_ROOT  = "YOUR_GEE_ASSET_PATH/sanbeiGDE_withGW";
var TRAJ_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/gde_trajectory";

// Trajectory code asset from the previous step
var TRAJECTORY_CODE_ASSET = TRAJ_ASSET_ROOT + "/GDE_Trajectory_Code_2005_2024";

// Period definitions
var PERIODS = [
  {label: "P1_2005_2009", midYear: 2007},
  {label: "P2_2010_2014", midYear: 2012},
  {label: "P3_2015_2019", midYear: 2017},
  {label: "P4_2020_2024", midYear: 2022}
];

// Eco-feature band names aligned with the revised upstream scripts
var bandNames = [
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

// Sampling settings
var SAMPLE_SCALE = 1000;
var SAMPLES_PER_CLASS = 3000;
var SEED = 2025;

// Drive export
var DRIVE_FOLDER = "Sanbei_GDE_Analysis";
var DRIVE_DESC = "GDE_Attribution_Analysis_Samples_v2";


// ==============================
// 1. LOAD ROI
// ==============================
var roiFc = ee.FeatureCollection(roiAsset);
var roi = roiFc.geometry();

Map.centerObject(roiFc, 5);


// ==============================
// 2. HELPERS
// ==============================
function loadEnvImage(periodLabel) {
  return ee.Image(ENV_ASSET_ROOT + "/" + periodLabel);
}

function buildPeriodCollection() {
  return ee.ImageCollection.fromImages(
    PERIODS.map(function(p) {
      return loadEnvImage(p.label)
        .set("year", p.midYear)
        .set("period_label", p.label);
    })
  );
}

function calculatePeriodSlope(envCol, bandName, refYear) {
  var singleBandCol = envCol.map(function(img) {
    var yearOffset = ee.Number(img.get("year")).subtract(refYear);
    return ee.Image.constant(yearOffset).float().rename("t")
      .addBands(img.select(bandName).toFloat());
  });

  return singleBandCol
    .reduce(ee.Reducer.linearFit())
    .select("scale")
    .rename("slope_" + bandName)
    .toFloat();
}

function getAnnualClimateCollection(startYear, endYear, bandName, reducerType, outBandName) {
  var monthly = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
    .filterDate(ee.Date.fromYMD(startYear, 1, 1), ee.Date.fromYMD(endYear + 1, 1, 1))
    .filterBounds(roi)
    .select(bandName);

  var years = ee.List.sequence(startYear, endYear);

  return ee.ImageCollection.fromImages(
    years.map(function(y) {
      y = ee.Number(y);
      var sub = monthly.filter(ee.Filter.calendarRange(y, y, "year"));

      var annual = ee.Image(ee.Algorithms.If(
        ee.String(reducerType).compareTo("sum").eq(0),
        sub.sum(),
        sub.mean()
      ));

      annual = ee.Image(annual).rename(outBandName);

      return annual
        .set("year", y)
        .set("system:time_start", ee.Date.fromYMD(y, 1, 1).millis());
    })
  );
}

function calculateClimateSlope(climateCol, outBandName, refYear) {
  var forFit = climateCol.map(function(img) {
    var yearOffset = ee.Number(img.get("year")).subtract(refYear);
    return ee.Image.constant(yearOffset).float().rename("t")
      .addBands(img.select(outBandName).toFloat());
  });

  return forFit
    .reduce(ee.Reducer.linearFit())
    .select("scale")
    .rename("slope_" + outBandName)
    .toFloat();
}

function getCroplandMask(year) {
  var lc = ee.ImageCollection("MODIS/061/MCD12Q1")
    .filter(ee.Filter.calendarRange(year, year, "year"))
    .first()
    .select("LC_Type1");

  // IGBP classes: 12 croplands, 14 cropland/natural vegetation mosaic
  return lc.eq(12).or(lc.eq(14));
}

function getCroplandDistance(year) {
  var cropMask = getCroplandMask(year);
  var scale = ee.Number(cropMask.projection().nominalScale());

  var dist = cropMask.selfMask().unmask(0)
    .fastDistanceTransform(256, "pixels", "squared_euclidean")
    .sqrt()
    .multiply(scale)
    .rename("Dist_Cropland_m");

  return dist.toFloat().set("year", year);
}

function calculateCroplandDistanceSlope(yearList, refYear) {
  var cropDistCol = ee.ImageCollection.fromImages(
    yearList.map(function(y) {
      y = ee.Number(y);
      return getCroplandDistance(y).set("year", y);
    })
  );

  var forFit = cropDistCol.map(function(img) {
    var yearOffset = ee.Number(img.get("year")).subtract(refYear);
    return ee.Image.constant(yearOffset).float().rename("t")
      .addBands(img.select("Dist_Cropland_m").toFloat());
  });

  return forFit
    .reduce(ee.Reducer.linearFit())
    .select("scale")
    .rename("slope_Dist_Cropland_m")
    .toFloat();
}


// ==============================
// 3. LOAD TRAJECTORY RESPONSE VARIABLE
// ==============================
var trajectory = ee.Image(TRAJECTORY_CODE_ASSET)
  .select("traj_code")
  .rename("traj_code")
  .toInt16();

// Persistent degradation
var degradationMask = trajectory.eq(1000)
  .or(trajectory.eq(1100))
  .or(trajectory.eq(1110));

// Stable GDE
var stableMask = trajectory.eq(1111);

// status:
//   0 = stable GDE
//   1 = persistent degradation
var statusBand = ee.Image.constant(0)
  .where(degradationMask, 1)
  .updateMask(stableMask.or(degradationMask))
  .rename("status")
  .toByte();

Map.addLayer(statusBand.clip(roi), {min: 0, max: 1}, "status");


// ==============================
// 4. ECOHYDROLOGICAL DRIVER SLOPES
// ==============================
var envCol = buildPeriodCollection();

var driversSlope = ee.ImageCollection.fromImages(
  bandNames.map(function(name) {
    return calculatePeriodSlope(envCol, name, 2007);
  })
).toBands().rename(
  bandNames.map(function(name) {
    return "slope_" + name;
  })
);

print("Ecohydrological slope bands:", driversSlope.bandNames());


// ==============================
// 5. CLIMATE TRENDS
// ==============================
// Precipitation: annual sum, converted from m to mm
var precipAnnual = getAnnualClimateCollection(
  2005, 2024,
  "total_precipitation_sum",
  "sum",
  "Precip_annual"
).map(function(img) {
  return img.multiply(1000)
    .rename("Precip_annual")
    .copyProperties(img, ["year", "system:time_start"]);
});

// Temperature: annual mean, converted from K to °C
var tempAnnual = getAnnualClimateCollection(
  2005, 2024,
  "temperature_2m",
  "mean",
  "Temp_annual"
).map(function(img) {
  return img.subtract(273.15)
    .rename("Temp_annual")
    .copyProperties(img, ["year", "system:time_start"]);
});

var slopePrecip = calculateClimateSlope(precipAnnual, "Precip_annual", 2005)
  .rename("slope_Precip");

var slopeTemp = calculateClimateSlope(tempAnnual, "Temp_annual", 2005)
  .rename("slope_Temp");


// ==============================
// 6. CROPLAND PROXIMITY SIGNALS
// ==============================
// Trend across four representative years aligned with the four study periods
var cropYears = [2007, 2012, 2017, 2022];

var slopeDistCropland = calculateCroplandDistanceSlope(cropYears, 2007);

// Current / latest cropland distance for gradient analysis
var distCroplandCurrent = getCroplandDistance(2022)
  .rename("Dist_Cropland_2022_m");


// ==============================
// 7. BUILD ANALYSIS STACK
// ==============================
var lonLat = ee.Image.pixelLonLat()
  .select(["longitude", "latitude"])
  .rename(["lon", "lat"]);

var driverStack = ee.Image.cat([
  driversSlope,
  slopePrecip,
  slopeTemp,
  slopeDistCropland,
  distCroplandCurrent
]).toFloat();

var analysisStack = ee.Image.cat([
  statusBand,
  trajectory,
  lonLat,
  driverStack
]).updateMask(statusBand.mask());

print("Analysis stack bands:", analysisStack.bandNames());


// ==============================
// 8. STRATIFIED SAMPLE EXPORT
// ==============================
var samples = analysisStack.stratifiedSample({
  numPoints: SAMPLES_PER_CLASS,
  classBand: "status",
  classValues: [0, 1],
  classPoints: [SAMPLES_PER_CLASS, SAMPLES_PER_CLASS],
  region: roi,
  scale: SAMPLE_SCALE,
  seed: SEED,
  geometries: true,
  dropNulls: true,
  tileScale: 16
});

print("Sample size:", samples.size());
print("Sample example:", samples.first());

var exportColumns = ee.List([
  "status",
  "traj_code",
  "lon",
  "lat",
  ".geo"
]).cat(driverStack.bandNames());

Export.table.toDrive({
  collection: samples,
  description: DRIVE_DESC,
  folder: DRIVE_FOLDER,
  fileFormat: "CSV",
  selectors: exportColumns
});