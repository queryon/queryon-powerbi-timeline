"use strict";

import "core-js/stable";
import 'regenerator-runtime/runtime'
import "./../style/visual.less";
import * as svgAnnotations from "d3-svg-annotation";
import * as d3 from "d3";

import { ChartDrawingState } from './DataModel';



import { ImageSettings, StyleSettings, TextSettings } from "./settings";
import { DataPoint } from "./dataPoint";
import { DataPointAlignment } from "./dataPointAlignment";

type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

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
    marginTop: number,
    fontHeightLib: any,
    svg: Selection<SVGElement>,
    ) {


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
    state.filteredData.forEach((dataPoint) => {
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

            if (!fontHeightLib[`${dataPoint["textSize"]}${fontFamily}`]) {
                fontHeightLib[`${dataPoint["textSize"]}${fontFamily}`] = getTextHeight(dataPoint["labelText"], dataPoint["textSize"], fontFamily, false, svg), + 3
            }
            itemHeight = fontHeightLib[`${dataPoint["textSize"]}${fontFamily}`]
            state.spacing = Math.max(itemHeight, state.spacing)
        }

    });
}

function getTextHeight(textString: string, textSize: number, fontFamily: string, wrappedText: boolean, svg: Selection<SVGElement>
    ) {
    let textData = [textString]

    let textHeight


    let txt = svg.append('g')
        .selectAll('.dummyText')
        .data(textData)
        .enter()
        .append("text")
        .attr("font-family", fontFamily)
        .attr("font-size", textSize)
        .text(d => { return d; })
        .attr("y", 1)
        .attr("x", 1)
    if (wrappedText) {
        txt.call(wrap, this.textSettings.wrap)
    }
    txt.attr("color", function () {
        //Irrelevant color. ".EACH" does not work on IE and we need to iterate over the elements after they have been appended to dom.
        let thisHeight = this.getBBox().height
        textHeight = thisHeight
        // this.remove()
        if (this.parentNode) {
            this.parentNode.removeChild(this);
        }


        return "white"
    })


    return textHeight
}


function wrap(text, width) {
    text.each(function () {

        var text = d3.select(this)
        var words = text.text().split(/\s+/).reverse()
        var word,
            line = [],
            lineNumber = 0,
            lineHeight = 1,
            // lineHeight = 1.1, // ems
            x = text.attr("x"),
            y = text.attr("y"),
            dy = 0, //parseFloat(text.attr("dy")),
            tspan = text.text(null)

                .append("tspan")

                // .attr("font-family", fontFamily)
                // .attr("font-size", textSize)
                .attr("x", x)
                .attr("y", y)
                .attr("dy", dy + "em");
        while (word = words.pop()) {
            line.push(word);
            tspan.text(line.join(" "));
            if (tspan.node().getComputedTextLength() > width) {
                line.pop();
                tspan.text(line.join(" "));
                line = [word];
                tspan = text.append("tspan")
                    .attr("x", x)
                    .attr("y", y)
                    .attr("dy", ++lineNumber * lineHeight + dy + "em")
                    .text(word);
            }
        }
    });
}