am4core.useTheme(am4themes_animated);

var green = '#00cc33';
var red = '#b32400';
var titleSize = 25;
var titleMargin = 30;

///////////////
//  xyCHART  //
///////////////

var chart = am4core.create("chartdiv", am4charts.XYChart);
chart.hiddenState.properties.opacity = 0;
let title = chart.titles.create();
title.text = "Invested vs. actual";
title.fontSize = titleSize;
title.marginBottom = titleMargin;

chart.data = xyChart;

var dateAxis = chart.xAxes.push(new am4charts.DateAxis());

var valueAxis = chart.yAxes.push(new am4charts.ValueAxis());
valueAxis.tooltip.disabled = true;

var series = chart.series.push(new am4charts.LineSeries());
series.dataFields.dateX = "date";
series.dataFields.openValueY = "current";
series.dataFields.valueY = "invested";
series.tooltipText = "current: {openValueY.value} invested: {valueY.value}";
series.sequencedInterpolation = true;
series.fillOpacity = 0.3;
series.defaultState.transitionDuration = 1000;
series.tensionX = 0.8;

var series2 = chart.series.push(new am4charts.LineSeries());
series2.dataFields.dateX = "date";
series2.dataFields.valueY = "current";
series2.sequencedInterpolation = true;
series2.defaultState.transitionDuration = 1500;
series2.stroke = chart.colors.getIndex(6);
series2.tensionX = 0.8;

chart.cursor = new am4charts.XYCursor();
chart.cursor.xAxis = dateAxis;
chart.scrollbarX = new am4core.Scrollbar();


///////////////
//  BALANCE  //
///////////////
var balance = am4core.create("balance", am4charts.XYChart);
let title2 = balance.titles.create();
title2.text = "Balance";
title2.fontSize = titleSize;
title2.marginBottom = titleMargin;
balance.data = balanceChart;

// Create axes
var dateAxis = balance.xAxes.push(new am4charts.DateAxis());
dateAxis.startLocation = 0.5;
dateAxis.endLocation = 0.5;

// Create value axis
var valueAxis = balance.yAxes.push(new am4charts.ValueAxis());

// Create series
var series = balance.series.push(new am4charts.LineSeries());
series.dataFields.valueY = "balance";
series.dataFields.dateX = "date";
series.strokeWidth = 3;
series.tooltipText = "{valueY.value}";
series.fillOpacity = 0.1;

var range = valueAxis.createSeriesRange(series);
range.value = 0;
range.endValue = -1000000;
range.contents.stroke = am4core.color(red);
range.contents.fill = range.contents.stroke;
range.contents.strokeOpacity = 0.7;
range.contents.fillOpacity = 0.1;

var range2 = valueAxis.createSeriesRange(series);
range2.value = 1000000;
range2.endValue = 0;
range2.contents.stroke = am4core.color(green);
range2.contents.fill = range2.contents.stroke;
range2.contents.strokeOpacity = 0.7;
range2.contents.fillOpacity = 0.1;

// Add cursor
balance.cursor = new am4charts.XYCursor();
balance.cursor.xAxis = dateAxis;
balance.scrollbarX = new am4core.Scrollbar();
