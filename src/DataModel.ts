
"use strict";

import "core-js/stable";
import 'regenerator-runtime/runtime'
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionIdBuilder = powerbi.extensibility.ISelectionIdBuilder;
import ISelectionId = powerbi.extensibility.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import {
    TooltipEventArgs,
    createTooltipServiceWrapper,
    ITooltipServiceWrapper,
} from 'powerbi-visuals-utils-tooltiputils'
import * as svgAnnotations from "d3-svg-annotation";
import {
    valueFormatter as vf,
} from "powerbi-visuals-utils-formattingutils";
import * as d3 from "d3";
import * as FileSaver from 'file-saver';
import { color, text, timeThursday } from "d3";
// import { image } from "d3";


import { ViewModel } from '@/interfaces';
import { AxisSettings, DownloadSettings, ImageSettings, Settings, StyleSettings, TextSettings } from "./settings";
import { DataPoint } from "./dataPoint";
import { DataPointAlignment } from "./dataPointAlignment";

type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;


// This is a known set of fields that facuilitates breaking things into separate functions
class ChartDrawingState {
    public data: DataPoint[] = [];
    public filteredData: DataPoint[] = [];
    public filteredWithImage: DataPoint[] = []; // FIltered data that have images

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

interface ICSEvent {
    title: string;
    description: string;
    start: number[];
    duration: { minutes: number };
}