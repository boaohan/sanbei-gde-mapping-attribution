// ==============================================================================
// 02_add_groundwater_grace_gldas.js
// Description:
// Calculate groundwater storage anomaly (GWSA) by combining:
//   GWSA = TWSA (GRACE) - LWSA (GLDAS-derived liquid water storage anomaly)
// Then merge groundwater metrics with the base eco-feature image for each period.
//
// Output bands added to each period image:
//   - GWSA_mm_mean
//   - GWSA_mm_trend
//
// Notes:
// - Replace all placeholder asset paths before running.
// - This script assumes the base eco-feature images were generated previously.
// ==============================================================================


// ==============================
// 0. USER SETTINGS
// ==============================

// Replace with your own region boundary asset.
var roiAsset = "YOUR_GEE_ASSET_PATH/TNRBoundary_noregion";

// Replace with your own asset roots.
var CORE_ASSET_ROOT = "YOUR_GEE_ASSET_PATH/sanbeiGDE";
var OUT_ASSET_ROOT  = "YOUR_GEE_ASSET_PATH/sanbeiGDE_withGW";

// Analysis range
var ANALYSIS_START = "2005-01-01";
var ANALYSIS_END_USER = "2025-01-01";

// Baseline period for anomaly alignment
var BASE_START = "2005-01-01";
var BASE_END   = "2010-01-01";

// Study periods
var PERIODS = [
  {label: "P1_2005_2009", start: "2005-01-01", end: "2010-01-01"},
  {label: "P2_2010_2014", start: "2010-01-01", end: "2015-01-01"},
  {label: "P3_2015_2019", start: "2015-01-01", end: "2020-01-01"},
  {label: "P4_2020_2024", start: "2020-01-01", end: "2025-01-01"}
];

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
function loadCoreImage(periodLabel) {
  return ee.Image(CORE_ASSET_ROOT + "/" + periodLabel);
}

function monthStart(dateObj) {
  var d = ee.Date(dateObj);
  return ee.Date.fromYMD(d.get("year"), d.get("month"), 1);
}

function emptyBandImage(bandName) {
  return ee.Image.constant(0).rename(bandName).updateMask(ee.Image.constant(0));
}

function exportMergedImage(image, periodLabel) {
  Export.image.toAsset({
    image: image.toFloat().clip(roi),
    description: "Asset_CorePlusGW_" + periodLabel,
    assetId: OUT_ASSET_ROOT + "/" + periodLabel,
    region: roi,
    scale: EXPORT_SCALE,
    maxPixels: EXPORT_MAXPIXELS
  });
}


// ==============================
// 3. GRACE: TWSA
// ==============================
// Dataset: NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI
// Band: lwe_thickness
//
// Original script multiplies by 10 to express values in mm.
// Keep that logic here for consistency with the manuscript workflow.
var graceRaw = ee.ImageCollection("NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI")
  .select("lwe_thickness")
  .filterDate(ANALYSIS_START, ANALYSIS_END_USER)
  .filterBounds(roi)
  .map(function(img) {
    var ms = monthStart(img.date());
    return img
      .multiply(10)
      .rename("TWSA_mm")
      .toFloat()
      .set("system:time_start", ms.millis())
      .set("year", ms.get("year"))
      .set("month", ms.get("month"));
  });

// Use the last available GRACE month to define the effective analysis end date.
var graceLast = ee.Date(graceRaw.aggregate_max("system:time_start"));
var ANALYSIS_END = graceLast.advance(1, "month");

print("Effective GRACE end date:", ANALYSIS_END);
print("Number of GRACE monthly images:", graceRaw.size());


// ==============================
// 4. GLDAS: MONTHLY LWS
// ==============================
// LWS = soil moisture + canopy water + snow water equivalent
var gldas3h = ee.ImageCollection("NASA/GLDAS/V021/NOAH/G025/T3H")
  .filterDate(ANALYSIS_START, ANALYSIS_END)
  .filterBounds(roi)
  .select([
    "SoilMoi0_10cm_inst",
    "SoilMoi10_40cm_inst",
    "SoilMoi40_100cm_inst",
    "SoilMoi100_200cm_inst",
    "CanopInt_inst",
    "SWE_inst"
  ]);

function makeMonthlyLWS(startDate, endDate) {
  startDate = ee.Date(startDate);
  endDate = ee.Date(endDate);

  var nMonths = endDate.difference(startDate, "month");
  var monthSeq = ee.List.sequence(0, nMonths.subtract(1));

  return ee.ImageCollection.fromImages(
    monthSeq.map(function(i) {
      i = ee.Number(i);
      var ms = startDate.advance(i, "month");
      var me = ms.advance(1, "month");
      var sub = gldas3h.filterDate(ms, me);

      var mean = ee.Image(ee.Algorithms.If(
        sub.size().gt(0),
        sub.mean(),
        ee.Image.constant([0, 0, 0, 0, 0, 0]).rename([
          "SoilMoi0_10cm_inst",
          "SoilMoi10_40cm_inst",
          "SoilMoi40_100cm_inst",
          "SoilMoi100_200cm_inst",
          "CanopInt_inst",
          "SWE_inst"
        ]).updateMask(ee.Image.constant(0))
      ));

      var sm = mean.select("SoilMoi0_10cm_inst")
        .add(mean.select("SoilMoi10_40cm_inst"))
        .add(mean.select("SoilMoi40_100cm_inst"))
        .add(mean.select("SoilMoi100_200cm_inst"))
        .rename("SM_mm");

      var cw = mean.select("CanopInt_inst").rename("CW_mm");
      var swe = mean.select("SWE_inst").rename("SWE_mm");

      return sm.add(cw).add(swe)
        .rename("LWS_mm")
        .toFloat()
        .set("system:time_start", ms.millis())
        .set("year", ms.get("year"))
        .set("month", ms.get("month"));
    })
  );
}

var lwsMonthly = makeMonthlyLWS(ANALYSIS_START, ANALYSIS_END);

print("Number of monthly GLDAS LWS images:", lwsMonthly.size());


// ==============================
// 5. ALIGN BOTH SERIES TO BASELINE
// ==============================
var twsaBaseMean = graceRaw
  .filterDate(BASE_START, BASE_END)
  .mean();

var lwsaBaseMean = lwsMonthly
  .filterDate(BASE_START, BASE_END)
  .mean();

var twsaAligned = graceRaw.map(function(img) {
  return img.subtract(twsaBaseMean)
    .rename("TWSA_mm_aligned")
    .copyProperties(img, ["system:time_start", "year", "month"]);
});

var lwsaAligned = lwsMonthly.map(function(img) {
  return img.subtract(lwsaBaseMean)
    .rename("LWSA_mm_aligned")
    .copyProperties(img, ["system:time_start", "year", "month"]);
});


// ==============================
// 6. MONTHLY GWSA
// ==============================
var joinedGW = ee.Join.inner().apply(
  twsaAligned,
  lwsaAligned,
  ee.Filter.and(
    ee.Filter.equals({leftField: "year", rightField: "year"}),
    ee.Filter.equals({leftField: "month", rightField: "month"})
  )
);

var gwsaMonthly = ee.ImageCollection(joinedGW.map(function(f) {
  f = ee.Feature(f);

  var tws = ee.Image(f.get("primary"));
  var lws = ee.Image(f.get("secondary"));

  return tws.subtract(lws)
    .rename("GWSA_mm")
    .toFloat()
    .set("system:time_start", tws.get("system:time_start"))
    .set("year", tws.get("year"))
    .set("month", tws.get("month"));
}));

print("Number of monthly GWSA images:", gwsaMonthly.size());


// ==============================
// 7. LONG-TERM GWSA TREND
// ==============================
// Sen's slope across the full monthly GWSA time series
var t0 = ee.Date(ANALYSIS_START);

var icForTrend = gwsaMonthly.map(function(img) {
  var tYears = ee.Date(img.get("system:time_start")).difference(t0, "year");

  return ee.Image.cat([
    ee.Image.constant(tYears).rename("t").toFloat(),
    img.rename("GWSA_mm").toFloat()
  ]).copyProperties(img, ["system:time_start"]);
});

var sen = icForTrend.reduce(ee.Reducer.sensSlope());
var gwsaTrend = sen.select("slope").rename("GWSA_mm_trend").toFloat();

Map.addLayer(gwsaTrend.clip(roi), {min: -20, max: 20}, "GWSA_mm_trend");


// ==============================
// 8. MERGE GROUNDWATER METRICS WITH EACH PERIOD
// ==============================
PERIODS.forEach(function(p) {
  var core = loadCoreImage(p.label);

  var sub = gwsaMonthly.filterDate(ee.Date(p.start), ee.Date(p.end));

  var gMean = ee.Image(ee.Algorithms.If(
    sub.size().gt(0),
    sub.mean().rename("GWSA_mm_mean"),
    emptyBandImage("GWSA_mm_mean")
  ));

  // Add groundwater bands to the core eco-feature image.
  // Use bilinear resampling only at the stage of merging/export.
  var merged = core
    .addBands(gMean.resample("bilinear"))
    .addBands(gwsaTrend.resample("bilinear"))
    .toFloat();

  print("Exporting period:", p.label, merged.bandNames());

  exportMergedImage(merged, p.label);
});