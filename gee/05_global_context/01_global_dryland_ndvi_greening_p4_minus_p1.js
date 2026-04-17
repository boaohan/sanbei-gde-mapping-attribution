// 01_global_dryland_ndvi_greening_p4_minus_p1.js
// Description:
// Generate and export the positive NDVI change layer (P4 - P1) over global
// arid and semi-arid regions using MOD13C1 native 0.05° NDVI.
//
// Output:
//   panelA_dNDVI_pos_P4minusP1_native05deg
// ==============================================================================


// ===============================
// 0. Parameters
// ===============================
var CRS = 'EPSG:4326';
var WORLD = ee.Geometry.Rectangle([-180, -60, 180, 85], null, false);
var FOLDER = 'GEE_PanelA_Global_NDVI_Background';

// P1 and P4
var P1_START = '2005-01-01';
var P1_END   = '2010-01-01';   // exclusive
var P4_START = '2020-01-01';
var P4_END   = '2025-01-01';   // exclusive


// ===============================
// 1. MOD13C1 native 0.05° NDVI
// ===============================
var mod13c1 = ee.ImageCollection('MODIS/061/MOD13C1');
var modRef = ee.Image(mod13c1.first()).select('NDVI');
var modProj = modRef.projection();

function getPeriodNdvi(startDate, endDate) {
  return mod13c1
    .filterDate(startDate, endDate)
    .filter(ee.Filter.calendarRange(4, 10, 'month'))   // growing season
    .map(function(img) {
      var qa = img.select('SummaryQA');
      var ndvi = img.select('NDVI')
        .multiply(0.0001)
        .updateMask(qa.lte(1))
        .rename('ndvi');
      return ndvi;
    })
    .mean()
    .rename('ndvi');
}

var ndviP1 = getPeriodNdvi(P1_START, P1_END).rename('ndvi_p1');
var ndviP4 = getPeriodNdvi(P4_START, P4_END).rename('ndvi_p4');


// ===============================
// 2. Dryland mask from TerraClimate
//    AI = P / PET ; arid + semi-arid = AI <= 0.5
// ===============================
var tc = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
  .filterDate('2005-01-01', '2025-01-01');

var prSum = tc.select('pr').sum();
var petSum = tc.select('pet').sum().max(1);
var ai = prSum.divide(petSum).rename('AI');

// Reproject to MOD13C1 native grid
var dryMask05 = ai.lte(0.5)
  .reproject(modProj)
  .rename('drymask');


// ===============================
// 3. ΔNDVI background
// ===============================
var dNDVI = ndviP4.subtract(ndviP1).rename('dndvi');

// Keep greening only
var dNDVI_pos = dNDVI.max(0).rename('dndvi_pos');

// Suppress bare/noisy pixels
var vegMask = ndviP1.gte(0.10).or(ndviP4.gte(0.10));

// Final output
var panelA_dNDVI_pos_P4minusP1_native05deg = dNDVI_pos
  .updateMask(dryMask05.and(vegMask))
  .clip(WORLD)
  .toFloat();


// ===============================
// 4. Preview
// ===============================
Map.setOptions('SATELLITE');
Map.centerObject(ee.Geometry.Point([80, 20]), 2);

Map.addLayer(
  panelA_dNDVI_pos_P4minusP1_native05deg,
  {
    min: 0,
    max: 0.20,
    palette: ['f7fcf5', 'e5f5e0', 'c7e9c0', 'a1d99b', '74c476']
  },
  'panelA_dNDVI_pos_P4minusP1_native05deg'
);


// ===============================
// 5. Export final raster
// ===============================
Export.image.toDrive({
  image: panelA_dNDVI_pos_P4minusP1_native05deg,
  description: 'panelA_dNDVI_pos_P4minusP1_native05deg',
  folder: FOLDER,
  fileNamePrefix: 'panelA_dNDVI_pos_P4minusP1_native05deg',
  region: WORLD,
  crs: CRS,
  scale: 5600,
  maxPixels: 1e13
});