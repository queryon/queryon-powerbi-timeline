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



// Quickly formed data model to handle the mess of state-tracking variables scattered about
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

function getWidth(text: string, fontSize: number, fontFace: string) {
    var canvas = document.createElement('canvas'),
        context = canvas.getContext('2d');
    context.font = fontSize + 'px ' + fontFace;
    var returnValue = context.measureText(text).width;
    canvas.remove();
    return returnValue;
}


function getAnnotationHeight(element: DataPoint, textSettings: TextSettings, container: Selection<SVGElement>) {
    //annotations config
    let annotationsData, makeAnnotations

    element.alignment = new DataPointAlignment();

    // element.alignment.note.align = orientation
    annotationsData = [{
        note: {
            wrap: textSettings.wrap,
            title: element.labelText,
            label: element.description,
            bgPadding: 0
        },
        x: 1,
        y: 1,
        dy: 0,
        color: element.textColor
    }]

    makeAnnotations = svgAnnotations.annotation()
        .annotations(annotationsData)
        .type(new svgAnnotations.annotationCustomType(svgAnnotations['annotationLabel'], element.alignment))


    let anno = container
        .append("g")
        .attr('class', `annotation_selector_${element.selectionId.getKey().replace(/\W/g, '')} annotationSelector`)
        .style('font-size', element.textSize + "px")
        .style('font-family', element.fontFamily)
        .style('background-color', 'transparent')
        .call(makeAnnotations)

    let result = anno.node().getBBox().height
    anno.remove()

    return result
}

export function filterAndProcessData(
    state: ChartDrawingState,
    textSettings: TextSettings,
    styleSettings: StyleSettings,
    minVal: any,
    maxVal: any,
    container: Selection<SVGElement>,
    imageSettings: ImageSettings,
    marginTop: number,) {


    const textSize = textSettings.textSize;
    const textColor = textSettings.textColor.solid.color;
    const fontFamily = textSettings.fontFamily;
    const iconsColor = styleSettings.iconsColor.solid.color;
    const top = textSettings.top;
    const labelOrientation = textSettings.labelOrientation;
    const annotationStyle = textSettings.annotationStyle;


    console.log("YADA YADA YADA");

    //filter data out of axis range, reverse order if axis is in decremental order
    if (minVal > maxVal) {
        state.filteredData = state.data.filter(element => element.date <= minVal && element.date >= maxVal)
        // data.reverse() //removed reverse so user can do their own sorting
    } else {
        state.filteredData = state.data.filter(element => element.date >= minVal && element.date <= maxVal)
    }
    state.filteredData.forEach((dataPoint, i) => {
        dataPoint["formatted"] = state.dateValueFormatter.format(dataPoint["date"])
        dataPoint["labelText"] = styleSettings.timelineStyle != "image" ? `${dataPoint["formatted"]}${textSettings.separator} ${dataPoint["label"]}` : dataPoint["label"]
        dataPoint["textColor"] = dataPoint.customFormat ? dataPoint.textColor : textColor
        dataPoint["iconColor"] = dataPoint.customFormat ? dataPoint.iconColor : iconsColor
        dataPoint["fontFamily"] = dataPoint.customFormat ? dataPoint.fontFamily : fontFamily
        dataPoint["textSize"] = dataPoint.customFormat ? dataPoint.textSize : textSize
        dataPoint["top"] = dataPoint.customFormat ? dataPoint.top : top
        dataPoint["labelOrientation"] = dataPoint.customFormat ? dataPoint.labelOrientation : labelOrientation
        dataPoint["annotationStyle"] = dataPoint.customFormat ? dataPoint.annotationStyle : annotationStyle
        dataPoint["textWidth"] = styleSettings.timelineStyle == "minimalist" ? 0 : Math.min(textSettings.wrap, getWidth(dataPoint["labelText"], dataPoint["textSize"], fontFamily));  // this.getTextWidth(dataPoint["labelText"], dataPoint["textSize"], fontFamily)
        // dataPoint["textHeight"] = this.getTextHeight(dataPoint["labelText"], dataPoint["textSize"], fontFamily, true) + 3
        dataPoint["textHeight"] = styleSettings.timelineStyle == "minimalist" ? 0 : getAnnotationHeight(dataPoint, textSettings, container)

        let startTime = [dataPoint.date.getFullYear(), dataPoint.date.getMonth() + 1, dataPoint.date.getDate(), dataPoint.date.getHours(), dataPoint.date.getMinutes()];

        state.ICSevents.push({
            title: dataPoint.label,
            description: dataPoint.description,
            // startInputType: 'utc',
            start: startTime,
            duration: { minutes: 30 }
        })

        //increment image height on staggered image view
        if (dataPoint.image && (imageSettings.style == "default")) {// || imageSettings.style == "image")) {
            dataPoint["textHeight"] += (imageSettings.imagesHeight + 2)

        }

        //add heights to margin conditionally:
        if (styleSettings.timelineStyle !== "minimalist") {
            if (!state.spacing || state.spacing < dataPoint["textHeight"]) {
                state.spacing = dataPoint["textHeight"]
            }
            if (styleSettings.timelineStyle !== "image") {
                if (dataPoint["top"]) {
                    marginTop = Math.max(marginTop, dataPoint["textHeight"] + 30)

                    if (dataPoint.customVertical) {
                        state.maxOffsetTop = Math.max(state.maxOffsetTop, dataPoint.verticalOffset)
                    }
                } else {
                    if (dataPoint.customVertical) {
                        state.maxOffsetBottom = Math.max(state.maxOffsetBottom, dataPoint.verticalOffset)
                    }
                    //add to margin case text is bottom and image is on top (alternate and straight styles)
                    if (dataPoint.image) {
                        marginTop = Math.max(marginTop, state.addToMargin)
                    }
                }

            }
        }
        else {
            //if minimalist, disconsider margin and spacing is default to one line 
            let itemHeight

            if (!this.fontHeightLib[`${dataPoint["textSize"]}${fontFamily}`]) {
                this.fontHeightLib[`${dataPoint["textSize"]}${fontFamily}`] = this.getTextHeight(dataPoint["labelText"], dataPoint["textSize"], fontFamily, false) + 3
            }
            itemHeight = this.fontHeightLib[`${dataPoint["textSize"]}${fontFamily}`]
            state.spacing = Math.max(itemHeight, state.spacing)
        }

    });
}