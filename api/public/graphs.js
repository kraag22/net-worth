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




///////////////
//  TODAY    //
///////////////
// Create chart instance
var today = am4core.create("today", am4charts.XYChart);
chart.scrollbarX = new am4core.Scrollbar();
let title3 = today.titles.create();
title3.text = "Today change " + todayTitle;
title3.fontSize = titleSize;
title3.marginBottom = titleMargin;

// Add data
today.data = todayChart;

// Create axes
var categoryAxis = today.xAxes.push(new am4charts.CategoryAxis());
categoryAxis.dataFields.category = "name";
categoryAxis.renderer.grid.template.location = 0;
categoryAxis.renderer.minGridDistance = 30;
categoryAxis.renderer.labels.template.horizontalCenter = "right";
categoryAxis.renderer.labels.template.verticalCenter = "middle";
categoryAxis.renderer.labels.template.rotation = 270;
categoryAxis.tooltip.disabled = true;
categoryAxis.renderer.minHeight = 110;

var valueAxis = today.yAxes.push(new am4charts.ValueAxis());
valueAxis.renderer.minWidth = 50;

// Create series
var series = today.series.push(new am4charts.ColumnSeries());
series.sequencedInterpolation = true;
series.dataFields.valueY = "balance";
series.dataFields.categoryX = "name";
series.tooltipText = "[{categoryX}: bold]{valueY}[/]";
series.columns.template.strokeWidth = 0;

series.tooltip.pointerOrientation = "vertical";

series.columns.template.column.cornerRadiusTopLeft = 10;
series.columns.template.column.cornerRadiusTopRight = 10;
series.columns.template.column.fillOpacity = 0.8;

// on hover, make corner radiuses bigger
let hoverState = series.columns.template.column.states.create("hover");
hoverState.properties.cornerRadiusTopLeft = 0;
hoverState.properties.cornerRadiusTopRight = 0;
hoverState.properties.fillOpacity = 1;

var range3 = valueAxis.createSeriesRange(series);
range3.value = 1000000;
range3.endValue = 0;
range3.contents.stroke = am4core.color(green);
range3.contents.fill = range3.contents.stroke;
range3.contents.strokeOpacity = 0.7;
range3.contents.fillOpacity = 0.1;

var range4 = valueAxis.createSeriesRange(series);
range4.value = -1000000;
range4.endValue = 0;
range4.contents.stroke = am4core.color(red);
range4.contents.fill = range4.contents.stroke;
range4.contents.strokeOpacity = 0.7;
range4.contents.fillOpacity = 0.1;

// Cursor
today.cursor = new am4charts.XYCursor();
