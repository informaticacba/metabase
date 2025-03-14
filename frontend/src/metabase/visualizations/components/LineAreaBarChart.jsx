/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { iconPropTypes } from "metabase/components/Icon";

import CardRenderer from "./CardRenderer";
import LegendLayout from "./legend/LegendLayout";

import "./LineAreaBarChart.css";
import {
  LineAreaBarChartRoot,
  ChartLegendCaption,
} from "./LineAreaBarChart.styled";

import {
  isNumeric,
  isDate,
  isDimension,
  isMetric,
} from "metabase/lib/schema_metadata";
import { getFriendlyName, MAX_SERIES } from "metabase/visualizations/lib/utils";
import { addCSSRule } from "metabase/lib/dom";
import { formatValue } from "metabase/lib/formatting";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import {
  MinRowsError,
  ChartSettingsError,
} from "metabase/visualizations/lib/errors";

import _ from "underscore";
import cx from "classnames";

const MUTE_STYLE = "opacity: 0.25;";
for (let i = 0; i < MAX_SERIES; i++) {
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg.stacked .stack._${i} .area`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg.stacked .stack._${i} .line`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg.stacked .stack._${i} .bar`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg.stacked .dc-tooltip._${i} .dot`,
    MUTE_STYLE,
  );

  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .bar`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .line`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .dot`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .bubble`,
    MUTE_STYLE,
  );

  // row charts don't support multiseries
  addCSSRule(`.LineAreaBarChart.mute-${i} svg:not(.stacked) .row`, MUTE_STYLE);
}

import type { VisualizationProps } from "metabase-types/types/Visualization";
import { normal } from "metabase/lib/colors";

export default class LineAreaBarChart extends Component {
  props: VisualizationProps;

  static identifier: string;
  static renderer: (element: Element, props: VisualizationProps) => any;

  static noHeader = true;
  static supportsSeries = true;

  static minSize = { width: 4, height: 3 };

  static isSensible({ cols, rows }) {
    return (
      rows.length > 1 &&
      cols.length >= 2 &&
      cols.filter(isDimension).length > 0 &&
      cols.filter(isMetric).length > 0
    );
  }

  static isLiveResizable(series) {
    const totalRows = series.reduce((sum, s) => sum + s.data.rows.length, 0);
    return totalRows < 10;
  }

  static checkRenderable(series, settings) {
    if (series.length > this.maxMetricsSupported) {
      throw new Error(t`${this.uiName} chart does not support multiple series`);
    }

    const singleSeriesHasNoRows = ({ data: { cols, rows } }) => rows.length < 1;
    if (_.every(series, singleSeriesHasNoRows)) {
      throw new MinRowsError(1, 0);
    }

    const dimensions = (settings["graph.dimensions"] || []).filter(
      name => name,
    );
    const metrics = (settings["graph.metrics"] || []).filter(name => name);
    if (dimensions.length < 1 || metrics.length < 1) {
      throw new ChartSettingsError(
        t`Which fields do you want to use for the X and Y axes?`,
        { section: t`Data` },
        t`Choose fields`,
      );
    }
  }

  static seriesAreCompatible(initialSeries, newSeries) {
    const initialSettings = getComputedSettingsForSeries([initialSeries]);
    const newSettings = getComputedSettingsForSeries([newSeries]);

    const initialDimensions = getColumnsFromNames(
      initialSeries.data.cols,
      initialSettings["graph.dimensions"],
    );
    const newDimensions = getColumnsFromNames(
      newSeries.data.cols,
      newSettings["graph.dimensions"],
    );
    const newMetrics = getColumnsFromNames(
      newSeries.data.cols,
      newSettings["graph.metrics"],
    );

    // must have at least one dimension and one metric
    if (newDimensions.length === 0 || newMetrics.length === 0) {
      return false;
    }

    // all metrics must be numeric
    if (!_.all(newMetrics, isNumeric)) {
      return false;
    }

    // both or neither primary dimension must be dates
    if (isDate(initialDimensions[0]) !== isDate(newDimensions[0])) {
      return false;
    }

    // both or neither primary dimension must be numeric
    // a timestamp field is both date and number so don't enforce the condition if both fields are dates; see #2811
    if (
      isNumeric(initialDimensions[0]) !== isNumeric(newDimensions[0]) &&
      !(isDate(initialDimensions[0]) && isDate(newDimensions[0]))
    ) {
      return false;
    }

    return true;
  }

  static placeholderSeries = [
    {
      card: {
        display: "line",
        visualization_settings: {},
        dataset_query: { type: "null" },
      },
      data: {
        rows: _.range(0, 11).map(i => [i, i]),
        cols: [
          { name: "x", base_type: "type/Integer" },
          { name: "y", base_type: "type/Integer" },
        ],
      },
    },
  ];

  static transformSeries(series) {
    const newSeries = [].concat(
      ...series.map((s, seriesIndex) =>
        transformSingleSeries(s, series, seriesIndex),
      ),
    );
    if (_.isEqual(series, newSeries) || newSeries.length === 0) {
      return series;
    } else {
      return newSeries;
    }
  }

  static propTypes = {
    card: PropTypes.object.isRequired,
    series: PropTypes.array.isRequired,
    settings: PropTypes.object.isRequired,
    actionButtons: PropTypes.node,
    showTitle: PropTypes.bool,
    isDashboard: PropTypes.bool,
    headerIcon: PropTypes.shape(iconPropTypes),
  };

  static defaultProps = {};

  getHoverClasses() {
    const { hovered } = this.props;
    if (hovered && hovered.index != null) {
      const seriesClasses = _.range(0, MAX_SERIES)
        .filter(n => n !== hovered.index)
        .map(n => "mute-" + n);
      const axisClasses =
        hovered.axisIndex === 0
          ? "mute-yr"
          : hovered.axisIndex === 1
          ? "mute-yl"
          : null;
      return seriesClasses.concat(axisClasses);
    } else {
      return null;
    }
  }

  getFidelity() {
    const fidelity = { x: 0, y: 0 };
    const size = this.props.gridSize || { width: Infinity, height: Infinity };
    if (size.width >= 5) {
      fidelity.x = 2;
    } else if (size.width >= 4) {
      fidelity.x = 1;
    }
    if (size.height >= 5) {
      fidelity.y = 2;
    } else if (size.height >= 4) {
      fidelity.y = 1;
    }

    return fidelity;
  }

  getSettings() {
    const fidelity = this.getFidelity();

    const settings = { ...this.props.settings };

    // smooth interpolation at smallest x/y fidelity
    if (fidelity.x === 0 && fidelity.y === 0) {
      settings["line.interpolate"] = "cardinal";
    }

    // no axis in < 1 fidelity
    if (fidelity.x < 1 || fidelity.y < 1) {
      settings["graph.y_axis.axis_enabled"] = false;
    }

    // no labels in < 2 fidelity
    if (fidelity.x < 2 || fidelity.y < 2) {
      settings["graph.y_axis.labels_enabled"] = false;
    }

    return settings;
  }

  getLegendSettings() {
    const {
      card,
      series,
      settings,
      showTitle,
      actionButtons,
      onAddSeries,
      onEditSeries,
      onRemoveSeries,
      onChangeCardAndRun,
    } = this.props;

    const title = settings["card.title"] || card.name;
    const description = settings["card.description"];

    const rawSeries = series._raw || series;
    const cardIds = new Set(rawSeries.map(s => s.card.id));
    const hasTitle = showTitle && settings["card.title"];
    const hasBreakout = card._breakoutColumn != null;
    const canSelectTitle = cardIds.size === 1 && onChangeCardAndRun;

    const hasMultipleSeries = series.length > 1;
    const canChangeSeries = onAddSeries || onEditSeries || onRemoveSeries;
    const hasLegendButtons = !hasTitle && actionButtons;
    const hasLegend = hasMultipleSeries || canChangeSeries || hasLegendButtons;

    const seriesSettings =
      settings.series && series.map(single => settings.series(single));
    const labels = seriesSettings
      ? seriesSettings.map(s => s.title)
      : series.map(single => single.card.name);
    const colors = seriesSettings
      ? seriesSettings.map(s => s.color)
      : Object.values(normal);

    return {
      title,
      description,
      labels,
      colors,
      hasTitle,
      hasLegend,
      hasBreakout,
      canSelectTitle,
    };
  }

  handleSelectTitle = () => {
    const { card, onChangeCardAndRun } = this.props;

    if (onChangeCardAndRun) {
      onChangeCardAndRun({
        nextCard: card,
        seriesIndex: 0,
      });
    }
  };

  handleSelectSeries = (event, index) => {
    const {
      card,
      series,
      visualizationIsClickable,
      onEditSeries,
      onVisualizationClick,
      onChangeCardAndRun,
    } = this.props;

    const single = series[index];
    const hasBreakout = card._breakoutColumn != null;

    if (onEditSeries && !hasBreakout) {
      onEditSeries(event, index);
    } else if (single.clicked && visualizationIsClickable(single.clicked)) {
      onVisualizationClick({
        ...single.clicked,
        element: event.currentTarget,
      });
    } else if (onChangeCardAndRun) {
      onChangeCardAndRun({
        nextCard: single.card,
        seriesIndex: index,
      });
    }
  };

  render() {
    const {
      series,
      hovered,
      headerIcon,
      actionButtons,
      isFullscreen,
      isQueryBuilder,
      onHoverChange,
      onAddSeries,
      onRemoveSeries,
    } = this.props;

    const {
      title,
      description,
      labels,
      colors,
      hasTitle,
      hasLegend,
      hasBreakout,
      canSelectTitle,
    } = this.getLegendSettings();

    return (
      <LineAreaBarChartRoot
        className={cx(
          "LineAreaBarChart",
          this.getHoverClasses(),
          this.props.className,
        )}
        isQueryBuilder={isQueryBuilder}
      >
        {hasTitle && (
          <ChartLegendCaption
            title={title}
            description={description}
            icon={headerIcon}
            actionButtons={actionButtons}
            onSelectTitle={canSelectTitle ? this.handleSelectTitle : undefined}
          />
        )}
        <LegendLayout
          labels={labels}
          colors={colors}
          hovered={hovered}
          hasLegend={hasLegend}
          actionButtons={!hasTitle ? actionButtons : undefined}
          isFullscreen={isFullscreen}
          isQueryBuilder={isQueryBuilder}
          onHoverChange={onHoverChange}
          onAddSeries={!hasBreakout ? onAddSeries : undefined}
          onRemoveSeries={!hasBreakout ? onRemoveSeries : undefined}
          onSelectSeries={this.handleSelectSeries}
        >
          <CardRenderer
            {...this.props}
            series={series}
            settings={this.getSettings()}
            className="renderer flex-full"
            maxSeries={MAX_SERIES}
            renderer={this.constructor.renderer}
          />
        </LegendLayout>
      </LineAreaBarChartRoot>
    );
  }
}

function getColumnsFromNames(cols, names) {
  if (!names) {
    return [];
  }
  return names.map(name => _.findWhere(cols, { name }));
}

function transformSingleSeries(s, series, seriesIndex) {
  const { card, data } = s;

  // HACK: prevents cards from being transformed too many times
  if (data._transformed) {
    return [s];
  }

  const { cols, rows } = data;
  const settings = getComputedSettingsForSeries([s]);

  const dimensions = (settings["graph.dimensions"] || []).filter(
    d => d != null,
  );
  const metrics = (settings["graph.metrics"] || []).filter(d => d != null);
  const dimensionColumnIndexes = dimensions.map(dimensionName =>
    _.findIndex(cols, col => col.name === dimensionName),
  );
  const metricColumnIndexes = metrics.map(metricName =>
    _.findIndex(cols, col => col.name === metricName),
  );
  const bubbleColumnIndex =
    settings["scatter.bubble"] &&
    _.findIndex(cols, col => col.name === settings["scatter.bubble"]);
  const extraColumnIndexes =
    bubbleColumnIndex != null && bubbleColumnIndex >= 0
      ? [bubbleColumnIndex]
      : [];

  if (dimensions.length > 1) {
    const [dimensionColumnIndex, seriesColumnIndex] = dimensionColumnIndexes;
    const rowColumnIndexes = [dimensionColumnIndex].concat(
      metricColumnIndexes,
      extraColumnIndexes,
    );

    const breakoutValues = [];
    const breakoutRowsByValue = new Map();

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const seriesValue = row[seriesColumnIndex];

      let seriesRows = breakoutRowsByValue.get(seriesValue);
      if (!seriesRows) {
        breakoutRowsByValue.set(seriesValue, (seriesRows = []));
        breakoutValues.push(seriesValue);
      }

      const newRow = rowColumnIndexes.map(columnIndex => row[columnIndex]);
      newRow._origin = { seriesIndex, rowIndex, row, cols };
      seriesRows.push(newRow);
    }

    return breakoutValues.map(breakoutValue => ({
      card: {
        ...card,
        // if multiseries include the card title as well as the breakout value
        name: [
          // show series title if it's multiseries
          series.length > 1 && card.name,
          // always show grouping value
          formatValue(breakoutValue, { column: cols[seriesColumnIndex] }),
        ]
          .filter(n => n)
          .join(": "),
        _breakoutValue: breakoutValue,
        _breakoutColumn: cols[seriesColumnIndex],
      },
      data: {
        rows: breakoutRowsByValue.get(breakoutValue),
        cols: rowColumnIndexes.map(i => cols[i]),
        _rawCols: cols,
        _transformed: true,
      },
      // for when the legend header for the breakout is clicked
      clicked: {
        dimensions: [
          {
            value: breakoutValue,
            column: cols[seriesColumnIndex],
          },
        ],
      },
    }));
  } else {
    // dimensions.length <= 1
    const dimensionColumnIndex = dimensionColumnIndexes[0];
    return metricColumnIndexes.map(metricColumnIndex => {
      const col = cols[metricColumnIndex];
      const rowColumnIndexes = [dimensionColumnIndex].concat(
        metricColumnIndex,
        extraColumnIndexes,
      );
      const name = [
        // show series title if it's multiseries
        series.length > 1 && card.name,
        // show column name if there are multiple metrics or sigle series
        (metricColumnIndexes.length > 1 || series.length === 1) &&
          col &&
          getFriendlyName(col),
      ]
        .filter(n => n)
        .join(": ");

      return {
        card: {
          ...card,
          name: name,
          _seriesIndex: seriesIndex,
          // use underlying column name as the seriesKey since it should be unique
          // EXCEPT for dashboard multiseries, so check seriesIndex == 0
          _seriesKey: seriesIndex === 0 && col ? col.name : name,
        },
        data: {
          rows: rows.map((row, rowIndex) => {
            const newRow = rowColumnIndexes.map(i => row[i]);
            newRow._origin = { seriesIndex, rowIndex, row, cols };
            return newRow;
          }),
          cols: rowColumnIndexes.map(i => cols[i]),
          _transformed: true,
          _rawCols: cols,
        },
      };
    });
  }
}
