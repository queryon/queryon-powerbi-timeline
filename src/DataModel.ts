"use strict";

// Importing required modules and styles
import "core-js/stable";
import "regenerator-runtime/runtime";
import "./../style/visual.less";
import { valueFormatter as vf } from "powerbi-visuals-utils-formattingutils";
import * as d3 from "d3";

// Importing data point structure
import { DataPoint } from "./dataPoint";

/**
 * ChartDrawingState class is used to store the current state of the chart.
 * It includes data points, formatting options, and other settings.
 */
export class ChartDrawingState {
  public data: DataPoint[] = [];
  public filteredData: DataPoint[] = [];
  public filteredWithImage: DataPoint[] = []; // Filtered data that have images

  public dateValueFormatter: vf.IValueFormatter;

  public axisFormat: string;
  public axisValueFormatter: vf.IValueFormatter;

  public scale: d3.ScaleTime<number, number>;

  public axisMarginTop: number;
  public addToMargin: number;
  public enabledAnnotations: boolean;
  public axisPadding: number;
  public strokeColor: string;

  public finalMarginTop: number = 0;
  public marginTopStagger: number = 20;
  public svgHeightTracking: number = 0;
  public finalHeight: number = 0;
  public needScroll: boolean = false;

  public spacing: number = 0;
  public maxOffsetTop: number = 0;
  public maxOffsetBottom: number = 0;
  public ICSevents: ICSEvent[] = [];

  public width: number = 0;
  public bar: d3.Selection<SVGLineElement, any, any, any> | d3.Selection<SVGRectElement, any, any, any>;

  public downloadTop: boolean = false;
  public downloadBottom: boolean = false;
}

/**
 * ICSEvent interface represents an event with its title, description, start time, and duration.
 */
interface ICSEvent {
  title: string;
  description: string;
  start: number[];
  duration: { minutes: number };
}