am4core.useTheme(am4themes_animated);

class Chart {
  constructor(id, data) {
    this.chart = am4core.create(id, am4charts.XYChart);
    this.chart.data = data;
    this.chart.cursor = new am4charts.XYCursor();

    this.titleSize = 25;
    this.titleMargin = 30;
    this.green = '#00cc33';
    this.red = '#b32400';
  }

  setTitle(name, titleSize, titleMargin) {
    let title = this.chart.titles.create();
    title.text = name;
    title.fontSize = titleSize || this.titleSize;
    title.marginBottom = titleMargin || this.titleMargin;
  }

  setAxeX(am4axe) {
    return this.chart.xAxes.push(new am4axe());
  }

  setCategoryAxeX(category) {
    let axe = this.chart.xAxes.push(new am4charts.CategoryAxis());
    axe.dataFields.category = category;
    axe.renderer.grid.template.location = 0;
    axe.renderer.minGridDistance = 30;
    axe.renderer.labels.template.horizontalCenter = "right";
    axe.renderer.labels.template.verticalCenter = "middle";
    axe.renderer.labels.template.rotation = 270;
    axe.tooltip.disabled = true;
    axe.renderer.minHeight = 110;
    return axe;
  }

  setAxeY(am4axe) {
    return this.chart.yAxes.push(new am4axe());
  }

  setSerie(am4serie, nameX, valueX, valueY, width, tooltip, opacity) {
    let serie = this.chart.series.push(new am4serie());
    serie.dataFields.valueY = valueY;
    serie.dataFields[nameX] = valueX;
    serie.strokeWidth = width;
    serie.tooltipText = tooltip;
    serie.fillOpacity = opacity;
    return serie;
  }

  setRange(axis, serie, positive) {
    let range = axis.createSeriesRange(serie)
    range.value = 0;
    range.endValue = positive ? 1000000 : -1000000;
    range.contents.stroke = am4core.color(positive ? this.green : this.red);
    range.contents.fill = range.contents.stroke;
    range.contents.strokeOpacity = 0.7;
    range.contents.fillOpacity = 0.1;
  }

  setScrollBarX() {
    this.chart.scrollbarX = new am4core.Scrollbar();
  }
}

/////////////////////////////////////
//  BALANCE SUMMARY BY CURRENCY    //
/////////////////////////////////////
let sumBalanceByCurr = new Chart('sum_balance_by_currency', sumStocksBalanceByCurrency)
sumBalanceByCurr.setTitle('Balance summary by currency')
let sumBalAxeX = sumBalanceByCurr.setCategoryAxeX('currency')
let sumBalAxeY = sumBalanceByCurr.setAxeY(am4charts.ValueAxis)
sumBalAxeY.renderer.minWidth = 50;

let sumBalSerie = sumBalanceByCurr.setSerie(am4charts.ColumnSeries,
  'categoryX', 'currency', 'balance', 3, '[{categoryX}: bold]{valueY}[/]', 0.8)
sumBalSerie.sequencedInterpolation = true;
sumBalSerie.columns.template.strokeWidth = 0;
sumBalSerie.tooltip.pointerOrientation = "vertical";
sumBalSerie.columns.template.column.fillOpacity = 0.8;

let sumBalHoverState = sumBalSerie.columns.template.column.states.create("hover");
sumBalHoverState.properties.fillOpacity = 1;

sumBalanceByCurr.setRange(sumBalAxeY, sumBalSerie, true)
sumBalanceByCurr.setRange(sumBalAxeY, sumBalSerie, false)

let sumBalAxeY2 = sumBalanceByCurr.setAxeY(am4charts.ValueAxis)
sumBalAxeY2.renderer.opposite = true;

let priceSerie = sumBalanceByCurr.setSerie(am4charts.LineSeries,
  'categoryX', 'currency', 'percents', 3, "{valueY.formatNumber('#.0')}%[/]", 0)
priceSerie.sequencedInterpolation = true;
priceSerie.yAxis = sumBalAxeY2;
priceSerie.tooltip.pointerOrientation = "vertical";
priceSerie.bullets.push(new am4charts.CircleBullet());
priceSerie.strokeWidth = 0;

priceSerie.cursor = new am4charts.XYCursor();
priceSerie.cursor.behavior = "panX";

///////////////
//  STOCKS   //
///////////////
let stocks = new Chart('balance_by_stock', balanceByStockData);
stocks.setTitle('Stocks performance');
let stocksAxeX = stocks.setCategoryAxeX('name')
let stocksAxeY = stocks.setAxeY(am4charts.ValueAxis)
stocksAxeY.renderer.minWidth = 50;

let stocksSerie = stocks.setSerie(am4charts.ColumnSeries,
  'categoryX', 'name', 'balance', 3, '[{categoryX}: bold]{valueY}[/]', 0.8)
stocksSerie.sequencedInterpolation = true;
stocksSerie.columns.template.strokeWidth = 0;
stocksSerie.tooltip.pointerOrientation = "vertical";
stocksSerie.columns.template.column.fillOpacity = 0.8;

let stocksHoverState = stocksSerie.columns.template.column.states.create("hover");
stocksHoverState.properties.fillOpacity = 1;

stocks.setRange(stocksAxeY, stocksSerie, false)
stocks.setRange(stocksAxeY, stocksSerie, true)

////////////////
//  INVESTED  //
////////////////
let invested = new Chart('invested_vs_value', sumByCurrencyData);
invested.setTitle('Invested vs. current value');
invested.setScrollBarX();
invested.chart.hiddenState.properties.opacity = 0;

let investedAxeX = invested.setAxeX(am4charts.DateAxis)
let investedAxeY = invested.setAxeY(am4charts.ValueAxis);
investedAxeY.tooltip.disabled = true;

let investedSerie = invested.setSerie(am4charts.LineSeries, 'dateX', 'date',
  'invested', 1, 'current: {openValueY.value} invested: {valueY.value}', 0.3)
investedSerie.dataFields.openValueY = "current";
investedSerie.sequencedInterpolation = true;
investedSerie.defaultState.transitionDuration = 1500;
investedSerie.tensionX = 0.8;

let investedCurrentSerie = invested.setSerie(am4charts.LineSeries, 'dateX', 'date',
  'current', 2, '', 0)

investedCurrentSerie.sequencedInterpolation = true;
investedCurrentSerie.defaultState.transitionDuration = 1500;
investedCurrentSerie.stroke = invested.chart.colors.getIndex(6);
investedCurrentSerie.tensionX = 0.8;

invested.chart.cursor.xAxis = investedAxeX;


///////////////
//  BALANCE  //
///////////////
let balance = new Chart('balance', balanceData);
balance.setTitle('Gains/loses');
balance.setScrollBarX();
let balanceAxeX = balance.setAxeX(am4charts.DateAxis)
balanceAxeX.startLocation = 0.5;
balanceAxeX.endLocation = 0.5;
let balanceAxeY = balance.setAxeY(am4charts.ValueAxis);
let balanceSerie = balance.setSerie(am4charts.LineSeries,
  'dateX', 'date', 'balance', 3, '{valueY.value}', 0.1)
balance.setRange(balanceAxeY, balanceSerie, false)
balance.setRange(balanceAxeY, balanceSerie, true)
balance.chart.cursor.xAxis = balanceAxeX;


///////////////////////
// CURRENCY BALANCE  //
///////////////////////
let currencyBalance = new Chart('currency_balance', currencyBalanceData);
currencyBalance.setTitle('Currency balance');
currencyBalance.setScrollBarX();
let currencyBalanceAxeX = currencyBalance.setAxeX(am4charts.DateAxis)
currencyBalanceAxeX.startLocation = 0.5;
currencyBalanceAxeX.endLocation = 0.5;
let currencyBalanceAxeY = currencyBalance.setAxeY(am4charts.ValueAxis);

let currencyBalanceSerie = currencyBalance.setSerie(am4charts.LineSeries,
  'dateX', 'date', 'balance', 3, '{valueY.value} CZK (all)', 0.1)
currencyBalance.setRange(currencyBalanceAxeY, currencyBalanceSerie, false)
currencyBalance.setRange(currencyBalanceAxeY, currencyBalanceSerie, true)

currencyBalance.setSerie(am4charts.LineSeries,
  'dateX', 'date', 'usd_balance', 1, '{valueY.value} CZK ($)', 0)
currencyBalance.setSerie(am4charts.LineSeries,
  'dateX', 'date', 'eur_balance', 1, '{valueY.value} CZK (€)', 0)

currencyBalance.chart.cursor.xAxis = currencyBalanceAxeX;


/////////////////////////
//  SUM BY CURRENCY    //
/////////////////////////
let stocksByCurrency = new Chart('sum_by_currency', sumByCurrencyData);
stocksByCurrency.setTitle('Sum by currency');
stocksByCurrency.setScrollBarX();

let stocksByCurrencyAxeX = stocksByCurrency.setAxeX(am4charts.DateAxis)
stocksByCurrencyAxeX.startLocation = 0.5;
stocksByCurrencyAxeX.endLocation = 0.5;
let stocksByCurrencyAxeY = stocksByCurrency.setAxeY(am4charts.ValueAxis);

stocksByCurrency.setSerie(am4charts.LineSeries,
  'dateX', 'date', 'current', 3, '{valueY.value} CZK (all)', 0)

stocksByCurrency.setSerie(am4charts.LineSeries,
  'dateX', 'date', 'usd_value', 2, '{valueY.value} CZK ($)', 0)

stocksByCurrency.setSerie(am4charts.LineSeries,
  'dateX', 'date', 'eur_value', 2, '{valueY.value} CZK (€)', 0)

stocksByCurrency.setSerie(am4charts.LineSeries,
  'dateX', 'date', 'other_value', 2, '{valueY.value} CZK (other)', 0)

stocksByCurrency.chart.cursor.xAxis = stocksByCurrencyAxeX;
