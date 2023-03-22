"use strict";

// Importing required modules and styles
import "core-js/stable";
import "regenerator-runtime/runtime";
import "./../style/visual.less";
import * as svgAnnotations from "d3-svg-annotation";
import * as d3 from "d3";

// Importing DataModel, settings, and data structures
import { ChartDrawingState } from "./DataModel";
import { ImageSettings, StyleSettings, TextSettings } from "./settings";
import { DataPoint } from "./dataPoint";
import { DataPointAlignment } from "./dataPointAlignment";

import $ from "jquery";
import "jquery";


type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

/**
 * Gets the width of the specified text with the given font size and font face.
 */
function getWidth(text: string, fontSize: number, fontFace: string) {
    var canvas = document.createElement("canvas"),
        context = canvas.getContext("2d");
    context.font = fontSize + "px " + fontFace;
    var returnValue = context.measureText(text).width;
    canvas.remove();
    return returnValue;
}

/**
 * Gets the height of the specified text with the given font size and font face.
 */
function getTextHeight(text, fontSize, fontFamily, wrap = false, container) {
    let svg = container.append("text")
        .style("font-size", fontSize + "px")
        .style("font-family", fontFamily)
        .text(text);

    if (wrap) {
        wrapText(svg, wrap);
    }

    let returnValue = svg.node().getBBox().height;
    svg.remove();

    return returnValue;
}

/**
 * Calculates and returns the height of the annotation for the specified data point.
 */
function getAnnotationHeight(
    element: DataPoint,
    textSettings: TextSettings,
    container: Selection<SVGElement>
) {
    // Annotations config
    let annotationsData,
        makeAnnotations;

    element.alignment = new DataPointAlignment();

    annotationsData = [
        {
            note: {
                wrap: textSettings.wrap,
                title: element.labelText,
                label: element.description,
                bgPadding: 0,
            },
            x: 1,
            y: 1,
            dy: 0,
            color: element.textColor,
        },
    ];

    makeAnnotations = svgAnnotations
        .annotation()
        .annotations(annotationsData)
        .type(
            new svgAnnotations.annotationCustomType(
                svgAnnotations["annotationLabel"],
                element.alignment
            )
        );

    let anno = container
        .append("g")
        .attr(
            "class",
            `annotation_selector_${element.selectionId
                .getKey()
                .replace(/\W/g, "")} annotationSelector`
        )
        .style("font-size", element.textSize + "px")
        .style("font-family", element.fontFamily)
        .style("background-color", "transparent")
        .call(makeAnnotations);

    let result = anno.node().getBBox().height;
    anno.remove();

    return result;
}

/**
 * Wraps the specified text within a given width limit.
 */
function wrapText(textSelection, width) {
    textSelection.each(function () {
        let text = d3.select(this),
            words = text.text().split(/\s+/).reverse(),
            word,
            line = [],
            lineNumber = 0,
            lineHeight = 1.1, // ems
            y = text.attr("y"),
            dy = parseFloat(text.attr("dy")),
            tspan = text.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");

        while (word = words.pop()) {
            line.push(word);
            tspan.text(line.join(" "));
            if (tspan.node().getComputedTextLength() > width) {
                line.pop();
                tspan.text(line.join(" "));
                line = [word];
                tspan = text.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
            }
        }
    });
}

/**
 * Filters the data points based on the provided date range and processes them to apply the desired settings.
 */
export function filterAndProcessData(
    state: ChartDrawingState,
    textSettings: TextSettings,
    styleSettings: StyleSettings,
    minVal: any,
    maxVal: any,
    container: Selection<SVGElement>,
    imageSettings: ImageSettings,
    marginTop: number,
    fontHeightLib: any,
    svg: Selection<SVGElement>
): number {
    // Deconstruct settings for easier usage
    const {
        textSize,
        textColor,
        fontFamily,
        iconsColor,
        top,
        labelOrientation,
        annotationStyle,
    } = processSettings(textSettings, styleSettings);

    // Filter and process data points
    processDataPoints(
        state,
        minVal,
        maxVal,
        textSize,
        textColor,
        fontFamily,
        iconsColor,
        top,
        labelOrientation,
        annotationStyle,
        textSettings,
        styleSettings,
        imageSettings,
        container,
        fontHeightLib,
        svg,
        marginTop
    );

    

    // Calculate spacing and margins for data points
    return calculateSpacingAndMargins(
        state,
        styleSettings,
        textSettings,
        container,
        svg,

    );
    

    //marginTop = 500;
}

/**

Deconstruct settings for easier usage.
*/
function processSettings(
    textSettings: TextSettings,
    styleSettings: StyleSettings
) {
    return {
        textSize: textSettings.textSize,
        textColor: textSettings.textColor.solid.color,
        fontFamily: textSettings.fontFamily,
        iconsColor: styleSettings.iconsColor.solid.color,
        top: textSettings.top,
        labelOrientation: textSettings.labelOrientation,
        annotationStyle: textSettings.annotationStyle,
    };
}
/**

Filters data points based on the provided date range and processes them to apply the desired settings.
*/
function processDataPoints(
    state: ChartDrawingState,
    minVal: any,
    maxVal: any,
    textSize: number,
    textColor: string,
    fontFamily: string,
    iconsColor: string,
    top: boolean,
    labelOrientation: string,
    annotationStyle: string,
    textSettings: TextSettings,
    styleSettings: StyleSettings,
    imageSettings: ImageSettings,
    container: Selection<SVGElement>,
    fontHeightLib: any,
    svg: Selection<SVGElement>,
    marginTop: number
) {
    // Filter data out of axis range, reverse order if axis is in decremental order
    if (minVal > maxVal) {
        state.filteredData = state.data.filter(
            (element) => element.date <= minVal && element.date >= maxVal
        );
        // data.reverse() // Removed reverse so user can do their own sorting
    } else {
        state.filteredData = state.data.filter(
            (element) => element.date >= minVal && element.date <= maxVal
        );
    }
    // Process data points to apply settings
    state.filteredData.forEach((dataPoint) => {

        applySettingsToDataPoint(
            dataPoint,
            state,
            textSize,
            textColor,
            fontFamily,
            iconsColor,
            top,
            labelOrientation,
            annotationStyle,
            textSettings,
            styleSettings,
            imageSettings,
            container,
            fontHeightLib,
            svg,
            marginTop
        );
    });
}


/**

Applies the settings to the provided data point.
*/
function applySettingsToDataPoint(
    dataPoint: DataPoint,
    state: ChartDrawingState,
    textSize: number,
    textColor: string,
    fontFamily: string,
    iconsColor: string,
    top: boolean,
    labelOrientation: string,
    annotationStyle: string,
    textSettings: TextSettings,
    styleSettings: StyleSettings,
    imageSettings: ImageSettings,
    container: Selection<SVGElement>,
    fontHeightLib: any,
    svg: Selection<SVGElement>,
    marginTop: number
) {
    dataPoint["formatted"] = state.dateValueFormatter.format(dataPoint["date"]);
    dataPoint["labelText"] =
        styleSettings.timelineStyle != "image"
            ? `${dataPoint["formatted"]}${textSettings.separator} ${dataPoint["label"]}`
            : dataPoint["label"];
    dataPoint["textColor"] = dataPoint.customFormat
        ? dataPoint.textColor
        : textColor;
    dataPoint["iconColor"] = dataPoint.customFormat
        ? dataPoint.iconColor
        : iconsColor;
    dataPoint["fontFamily"] = dataPoint.customFormat
        ? dataPoint.fontFamily
        : fontFamily;
    dataPoint["textSize"] = dataPoint.customFormat
        ? dataPoint.textSize
        : textSize;
    dataPoint["top"] = dataPoint.customFormat ? dataPoint.top : top;
    dataPoint["labelOrientation"] = dataPoint.customFormat
        ? dataPoint.labelOrientation
        : labelOrientation;
    dataPoint["annotationStyle"] = dataPoint.customFormat
        ? dataPoint.annotationStyle
        : annotationStyle;
    dataPoint["textWidth"] =
        styleSettings.timelineStyle == "minimalist"
            ? 0
            : Math.min(
                textSettings.wrap,
                getWidth(dataPoint["labelText"], dataPoint["textSize"], fontFamily)
            );
    dataPoint["textHeight"] =
        styleSettings.timelineStyle == "minimalist"
            ? 0
            : getAnnotationHeight(dataPoint, textSettings, container);
    // Process data point for ICS event and increment image height
    processDataPointForICSEventAndImage(
        dataPoint,
        state,
        imageSettings,
        marginTop,
        fontHeightLib,
        svg,
        styleSettings
    );
}/**
 * Calculate spacing and margins for the chart based on data points and settings.
 */
function calculateSpacingAndMargins(
    state: ChartDrawingState,
    styleSettings: StyleSettings,
    textSettings: TextSettings,
    container: Selection<SVGElement>,
    svg: any,
): number {
    let marginTop = 0;
    let fontHeightLib = {};

    // Loop through each data point to adjust spacing and margins
    state.filteredData.forEach((dataPoint) => {
        marginTop = adjustMarginAndSpacing(dataPoint, state, styleSettings, marginTop, fontHeightLib, svg);
    });

    //state.marginTop = marginTop; // Add this line to update the state's marginTop

    return marginTop;
}

/**
 * Adjusts the margin and spacing based on the provided data point and settings.
 */
function adjustMarginAndSpacing(
    dataPoint: DataPoint,
    state: ChartDrawingState,
    styleSettings: StyleSettings,
    marginTop: number,
    fontHeightLib: any,
    svg: Selection<SVGElement>
): number {
    // Adjust spacing based on text height
    if (!state.spacing || state.spacing < dataPoint["textHeight"]) {
        state.spacing = dataPoint["textHeight"];
    }

    // Handle non-minimalist timeline styles
    if (styleSettings.timelineStyle !== "minimalist") {
        marginTop = handleNonMinimalistStyles(dataPoint, state, styleSettings, marginTop);
    } else {
        // Handle minimalist timeline style
        state.spacing = handleMinimalistStyle(dataPoint, state, fontHeightLib, svg);
    }

    return marginTop;
}
/**
 
Processes data point for ICS event and increments image height if necessary.
*/
function processDataPointForICSEventAndImage(
    dataPoint: DataPoint,
    state: ChartDrawingState,
    imageSettings: ImageSettings,
    marginTop: number,
    fontHeightLib: any,
    svg: Selection<SVGElement>,
    styleSettings: StyleSettings,
) {
    let startTime = [
        dataPoint.date.getFullYear(),
        dataPoint.date.getMonth() + 1,
        dataPoint.date.getDate(),
        dataPoint.date.getHours(),
        dataPoint.date.getMinutes(),
    ];
    state.ICSevents.push({
        title: dataPoint.label,
        description: dataPoint.description,
        start: startTime,
        duration: { minutes: 30 },
    });

    // Increment image height on staggered image view
    if (dataPoint.image && imageSettings.style == "default") {
        dataPoint["textHeight"] += imageSettings.imagesHeight + 2;
    }

    // Add heights to margin conditionally
    adjustMarginAndSpacing(
        dataPoint,
        state,
        styleSettings,
        marginTop,
        fontHeightLib,
        svg
    );
}


function handleNonMinimalistStyles(
    dataPoint: DataPoint,
    state: ChartDrawingState,
    styleSettings: StyleSettings,
    marginTop: number
): number {
    if (styleSettings.timelineStyle !== "image") {
        if (dataPoint["top"]) {
            marginTop = Math.max(marginTop, dataPoint["textHeight"] + 30);
            if (dataPoint.customVertical) {
                state.maxOffsetTop = Math.max(state.maxOffsetTop, dataPoint.verticalOffset);
            }
        } else {
            if (dataPoint.customVertical) {
                state.maxOffsetBottom = Math.max(state.maxOffsetBottom, dataPoint.verticalOffset);
            }
            // Add to margin in case text is bottom and image is on top (alternate and straight styles)
            if (dataPoint.image) {
                marginTop = Math.max(marginTop, state.addToMargin);
            }
        }
    }
    return marginTop;
}

function handleMinimalistStyle(
    dataPoint: DataPoint,
    state: ChartDrawingState,
    fontHeightLib: any,
    svg: Selection<SVGElement>
): number {
    let itemHeight;

    if (!fontHeightLib[`${dataPoint["textSize"]}${dataPoint["fontFamily"]}`]) {
        fontHeightLib[`${dataPoint["textSize"]}${dataPoint["fontFamily"]}`] = getTextHeight(
            dataPoint["labelText"],
            dataPoint["textSize"],
            dataPoint["fontFamily"],
            false,
            svg
        );
    }
    itemHeight = fontHeightLib[`${dataPoint["textSize"]}${dataPoint["fontFamily"]}`];
    return Math.max(itemHeight, state.spacing);
}