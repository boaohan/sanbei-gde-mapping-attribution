// 02_extract_roi_ndvi_gwsa_timeseries_template.js
// Description:
// Extract annual NDVI and GWSA time series for ONE ROI.
//
// Output:
//   one CSV table for one region
//
// How to use:
//   Copy this script and replace ONLY the 4 lines in section A.
// ==============================================================================


// ==============================
// A. MODIFY ONLY THESE 4 LINES
// ==============================
var ASSET_ID = 'YOUR_GEE_ASSET_PATH/your_roi_fc';
var REGION_CODE = 'x';
var REGION_NAME = 'Your_Region_Name';
var OUT_PREFIX = 'timeseries_your_region_2005_2024';


// ==============================
// B. Common settings
// ==============================
var EXPORT_FOLDER = 'GEE_Region_TimeSeries';
var START_YEAR = 2005;
var END_YEAR   = 2024;

// LWS anomaly baseline
var BASELINE_START = '2004-01-01';
var BASELINE_END   = '2011-01-01';   // exclusive

// reduceRegion scales
var NDVI_SCALE = 1000;     // m
var GWSA_SCALE = 55660;    // m, close to GRACE scale


// ==============================
// C. Load ROI
// ==============================
var roiFc = ee.FeatureCollection(ASSET_ID);
var roi = roiFc.geometry();

Map.centerObject(roi, 5);
Map.addLayer(
  roiFc.style({
    color: '#d95f0e',
    fillColor: '00000000',
    width: 2
  }),
  {},
  'ROI'
);


// ==============================
// D. Helpers
// ==============================
function monthStarts(startStr, endStr) {
  var start = ee.Date(startStr);
  var end = ee.Date(endStr);
  var nMonths = end.difference(start, 'month');

  return ee.List.sequence(0, nMonths.subtract(1)).map(function(i) {
    return start.advance(i, 'month');
  });
}

function annualYears(startYear, endYear) {
  return ee.List.sequence(startYear, endYear);
}


// ==============================
// E. Annual NDVI (MOD13Q1, Apr-Oct mean)
// ==============================
var mod13 = ee.ImageCollection('MODIS/061/MOD13Q1');

function annualNdvi(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  var ndvi = mod13
    .filterDate(start, end)
    .filter(ee.Filter.calendarRange(4, 10, 'month'))
    .map(function(img) {
      var qa = img.select('SummaryQA');
      var ndvi = img.select('NDVI')
        .multiply(0.0001)
        .updateMask(qa.lte(1))
        .rename('ndvi');
      return ndvi;
    })
    .mean()
    .rename('ndvi')
    .set('year', year);

  return ndvi;
}


// ==============================
// F. GLDAS monthly LWS
// ==============================
var gldasBands = [
  'CanopInt_inst',
  'SWE_inst',
  'SoilMoi0_10cm_inst',
  'SoilMoi10_40cm_inst',
  'SoilMoi40_100cm_inst',
  'SoilMoi100_200cm_inst'
];

var gldas = ee.ImageCollection('NASA/GLDAS/V021/NOAH/G025/T3H')
  .filterDate(BASELINE_START, (END_YEAR + 1) + '-01-01')
  .select(gldasBands);

function monthlyLws(dateObj) {
  var d = ee.Date(dateObj);
  var d2 = d.advance(1, 'month');

  var m = gldas.filterDate(d, d2).mean();

  var lws = m.select('CanopInt_inst')
    .add(m.select('SWE_inst'))
    .add(m.select('SoilMoi0_10cm_inst'))
    .add(m.select('SoilMoi10_40cm_inst'))
    .add(m.select('SoilMoi40_100cm_inst'))
    .add(m.select('SoilMoi100_200cm_inst'))
    .rename('lws_mm')
    .set('system:time_start', d.millis())
    .set('ym', d.format('YYYY-MM'));

  return lws;
}

// baseline LWS mean over 2004–2010
var baseMonths = monthStarts(BASELINE_START, BASELINE_END);
var lwsBaseIC = ee.ImageCollection.fromImages(baseMonths.map(monthlyLws));
var lwsBase = lwsBaseIC.mean().rename('lws_base_mm');


// ==============================
// G. Monthly GWSA = TWSA - LWSA
// ==============================
var grace = ee.ImageCollection('NASA/GRACE/MASS_GRIDS_V04/MASCON')
  .filterDate(START_YEAR + '-01-01', (END_YEAR + 1) + '-01-01')
  .select('lwe_thickness');

var monthlyGwsaIC = grace.map(function(img) {
  var d = ee.Date(img.get('system:time_start'));

  var twsa = img.select('lwe_thickness')
    .multiply(10.0)   // cm -> mm
    .rename('twsa_mm');

  var lws = monthlyLws(d);
  var lwsa = lws.subtract(lwsBase).rename('lwsa_mm');

  var gwsa = twsa.subtract(lwsa)
    .rename('gwsa_mm')
    .set('system:time_start', d.millis())
    .set('year', d.get('year'))
    .set('month', d.get('month'));

  return gwsa;
});


// ==============================
// H. Build annual table
// ==============================
var years = annualYears(START_YEAR, END_YEAR);

var outTable = ee.FeatureCollection(
  years.map(function(y) {
    y = ee.Number(y);

    var ndviImg = annualNdvi(y);

    var gwsaYearCol = monthlyGwsaIC.filter(ee.Filter.calendarRange(y, y, 'year'));
    var gwsaImg = ee.Image(gwsaYearCol.mean()).rename('gwsa_mm');
    var nGwsaMonths = gwsaYearCol.size();

    var ndviMean = ndviImg.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: roi,
      scale: NDVI_SCALE,
      bestEffort: true,
      maxPixels: 1e13,
      tileScale: 4
    }).get('ndvi');

    var gwsaMean = gwsaImg.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: roi,
      scale: GWSA_SCALE,
      bestEffort: true,
      maxPixels: 1e13,
      tileScale: 4
    }).get('gwsa_mm');

    return ee.Feature(null, {
      year: y,
      rid: REGION_CODE,
      region: REGION_NAME,
      ndvi: ndviMean,
      gwsa_mm: gwsaMean,
      gwsa_n_months: nGwsaMonths
    });
  })
);

print('Preview table', outTable.limit(10));


// ==============================
// I. Export CSV
// ==============================
Export.table.toDrive({
  collection: outTable,
  description: OUT_PREFIX,
  folder: EXPORT_FOLDER,
  fileNamePrefix: OUT_PREFIX,
  fileFormat: 'CSV'
});