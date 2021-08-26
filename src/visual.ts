"use strict";

import "core-js/stable";
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
import { DataPoint, RowOfImage, SingleImage } from "./dataPoint";

import { DataPointAlignment } from "./dataPointAlignment";


type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

export class Visual implements IVisual {

    private readonly defaultPadding = 15; // Extracted implicitly from use
    private readonly maxPadding = 30; // Extracted implicitly from use
    private readonly defaultMarginTop = 10; // Extracted implicitly from use

    private events: IVisualEventService;

    private host: IVisualHost;
    private svg: Selection<SVGElement>;
    private container: Selection<SVGElement>;
    private padding: number = this.defaultPadding;
    private width: number;
    private height: number;
    private barHt: number;
    private marginTop: number = 10;
    private minVal: any;
    private maxVal: any;
    private viewModel: ViewModel;
    private selectionIdBuilder: ISelectionIdBuilder
    private selectionManager: ISelectionManager
    private tooltipServiceWrapper: ITooltipServiceWrapper;
    //private imagesWidth: number; // is this.imageSettings.imagesWidth
    private fontHeightLib: any;


    /* Settings Getters for cleaner and less verbose code */
    get settings(): Settings {
        return this.viewModel.settings;
    }

    get downloadSettings(): DownloadSettings {
        return this.settings.download;
    }

    get textSettings(): TextSettings {
        return this.settings.textSettings;
    }

    get axisSettings(): AxisSettings {
        return this.settings.axisSettings;
    }

    get styleSettings(): StyleSettings {
        return this.settings.styleSettings;
    }

    get imageSettings(): ImageSettings {
        return this.settings.imageSettings;
    }

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        options.element.style["overflow"] = 'auto';
        this.svg = d3.select(options.element)
            .append('svg')
        this.container = this.svg.append("g")
        this.host = options.host
        this.selectionIdBuilder = this.host.createSelectionIdBuilder();
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipServiceWrapper = createTooltipServiceWrapper(
            options.host.tooltipService,
            options.element);
        this.fontHeightLib = {}
    }

    /** Handle context menu - right click */
    private handleContextMenuRightClick() {
        const mouseEvent: MouseEvent = d3.event as MouseEvent;
        const eventTarget: EventTarget = mouseEvent.target;
        let dataPoint: any = d3.select(<Element>eventTarget).datum();
        this.selectionManager.showContextMenu(dataPoint ? dataPoint.selectionId : {}, {
            x: mouseEvent.clientX,
            y: mouseEvent.clientY
        });
        mouseEvent.preventDefault();
    }

    /** Handle click on/out bar  */
    private handleSvgClick() {
        const mouseEvent: MouseEvent = d3.event as MouseEvent;
        const eventTarget: EventTarget = mouseEvent.target;
        let dataPoint: any = d3.select(<Element>eventTarget).datum();
        if (dataPoint) {

        } else {
            this.selectionManager.clear().then(() => {
                if (this.styleSettings.timelineStyle == "minimalist") {
                    d3.selectAll('.annotationSelector').style('opacity', 1)
                    d3.selectAll('.minIconSelector').style('opacity', 1)
                } else {
                    this.container.selectAll('.annotationSelector').style('font-weight', "normal")

                    if (!this.textSettings.boldTitles) {
                        this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
                    }
                }
            })
        }
    }

    private handleMouseOver() {
        const mouseEvent: MouseEvent = d3.event as MouseEvent;
        const eventTarget: EventTarget = mouseEvent.target;
        let args = []
        let dataPoint: any = d3.select(<Element>eventTarget).datum();

        if (dataPoint && dataPoint.labelColumn) {

            args = [{
                displayName: dataPoint.dateColumn,
                value: dataPoint.formatted
            },
            {
                displayName: dataPoint.labelColumn,
                value: dataPoint.label
            }]

            if (dataPoint.description) {
                args.push({
                    displayName: dataPoint.descriptionColumn,
                    value: dataPoint.description
                })
            }
            this.tooltipServiceWrapper.addTooltip(d3.select(<Element>eventTarget),
                (tooltipEvent: TooltipEventArgs<number>) => args,
                (tooltipEvent: TooltipEventArgs<number>) => null);
        }
    }


    // Douglas 2020-10-20: Unknown what the purpose of this is, just refactored it out of update()
    /** Empties the canvas to remove lingering elements */
    private setEmptyCanvas() {
        this.container.selectAll("g").remove();
        this.container.selectAll("rect").remove();
        this.container.selectAll("image").remove();
        this.container.selectAll(".symbol").remove();
        this.container.selectAll("line").remove();
        this.container.selectAll("text").remove();
        this.container.selectAll("circle").remove();
        this.container.selectAll("path").remove();
        this.svg.selectAll("clipPath").remove();
        // this.svg.selectAll("defs").remove();
    }

    private setPadding(state: ChartDrawingState) {
        //increment padding based on image
        if (state.filteredWithImage.length > 0 && this.styleSettings.timelineStyle !== "minimalist") {
            let dynamicPadding = Math.max(this.padding, this.imageSettings.imagesWidth / 2)
            this.padding = dynamicPadding
        }

        //increment padding based on values on axis
        if (this.axisSettings.axis === "Values" || this.styleSettings.timelineStyle == "minimalist") {
            let dynamicPadding = Math.max(this.padding, this.maxPadding)
            this.padding = dynamicPadding
        }

        //increment padding in case scroll bar 
        if (state.finalMarginTop > this.height) {
            this.padding = Math.max(this.padding, this.maxPadding)
        }
    }

    private getAdditionalMargin() {
        //stablish image margin addition 
        if (this.imageSettings.style == "alternate") {
            return (this.imageSettings.imagesHeight * 2) + 20
        } else if (this.imageSettings.style == "straight") {
            return this.imageSettings.imagesHeight + 20
        }
        return this.imageSettings.imagesHeight + 20 
    }

    /** Determines the Date format and generated a formatter for it */
    private createDateFormatter(options: VisualUpdateOptions) {
        let format;
        if (this.textSettings.dateFormat === "same") {
            options.dataViews[0].categorical.categories.forEach(category => {
                let categoryName = Object.keys(category.source.roles)[0];
                if (categoryName == "date") {
                    format = category.source.format;
                }
            })
        } else {
            format = this.textSettings.dateFormat != "customJS" ? this.textSettings.dateFormat : this.textSettings.customJS;
        }

        return createFormatter(format);
    }

    /** Determines the Min & Max date or numeric values for the timeline */
    private setDataRange(data: DataPoint[]) {
        let minFromData = d3.min(data, function (d: any) { return d.date })
        let maxFromData = d3.max(data, function (d: any) { return d.date })

        if (this.axisSettings.manualScale) {
            if (this.axisSettings.barMin && this.axisSettings.barMin != "") {
                let minFromInput = new Date(this.axisSettings.barMin)

                if (Object.prototype.toString.call(minFromInput) === '[object Date]' && !isNaN(minFromInput.getTime())) {
                    this.minVal = minFromInput
                }
            }

            if (this.axisSettings.barMax && this.axisSettings.barMax != "") {
                let maxFromInput = new Date(this.axisSettings.barMax)

                if (Object.prototype.toString.call(maxFromInput) === '[object Date]' && !isNaN(maxFromInput.getTime())) {
                    this.maxVal = maxFromInput
                }
            }

            this.maxVal = !this.maxVal ? maxFromData : this.maxVal
            this.minVal = !this.minVal ? minFromData : this.minVal
        }
        else {
            this.minVal = minFromData
            this.maxVal = maxFromData

            this.axisSettings.barMin = '';
            this.axisSettings.barMax = '';
        }
    }

    private filterAndProcessData(state: ChartDrawingState) {
        const textSize = this.textSettings.textSize;
        const textColor = this.textSettings.textColor.solid.color;
        const fontFamily = this.textSettings.fontFamily;
        const iconsColor = this.styleSettings.iconsColor.solid.color;
        const top = this.textSettings.top;
        const labelOrientation = this.textSettings.labelOrientation;
        const annotationStyle = this.textSettings.annotationStyle;

        //filter data out of axis range, reverse order if axis is in decremental order
        if (this.minVal > this.maxVal) {
            state.filteredData = state.data.filter(element => element.date <= this.minVal && element.date >= this.maxVal)
            // data.reverse() //removed reverse so user can do their own sorting
        } else {
            state.filteredData = state.data.filter(element => element.date >= this.minVal && element.date <= this.maxVal)
        }
        state.filteredData.forEach((dataPoint, i) => {
            dataPoint["formatted"] = state.dateValueFormatter.format(dataPoint["date"])
            dataPoint["labelText"] = this.styleSettings.timelineStyle != "image" ? `${dataPoint["formatted"]}${this.textSettings.separator} ${dataPoint["label"]}` : dataPoint["label"]
            dataPoint["textColor"] = dataPoint.customFormat ? dataPoint.textColor : textColor
            dataPoint["iconColor"] = dataPoint.customFormat ? dataPoint.iconColor : iconsColor
            dataPoint["fontFamily"] = dataPoint.customFormat ? dataPoint.fontFamily : fontFamily
            dataPoint["textSize"] = dataPoint.customFormat ? dataPoint.textSize : textSize
            dataPoint["top"] = dataPoint.customFormat ? dataPoint.top : top
            dataPoint["labelOrientation"] = dataPoint.customFormat ? dataPoint.labelOrientation : labelOrientation
            dataPoint["annotationStyle"] = dataPoint.customFormat ? dataPoint.annotationStyle : annotationStyle
            dataPoint["textWidth"] = this.styleSettings.timelineStyle == "minimalist" ? 0 : Math.min(this.textSettings.wrap, BrowserText.getWidth(dataPoint["labelText"], dataPoint["textSize"], fontFamily));  // this.getTextWidth(dataPoint["labelText"], dataPoint["textSize"], fontFamily)
            // dataPoint["textHeight"] = this.getTextHeight(dataPoint["labelText"], dataPoint["textSize"], fontFamily, true) + 3
            dataPoint["textHeight"] = this.styleSettings.timelineStyle == "minimalist" ? 0 : this.getAnnotationHeight(dataPoint)

            let startTime = [dataPoint.date.getFullYear(), dataPoint.date.getMonth() + 1, dataPoint.date.getDate(), dataPoint.date.getHours(), dataPoint.date.getMinutes()];

            state.ICSevents.push({
                title: dataPoint.label,
                description: dataPoint.description,
                // startInputType: 'utc',
                start: startTime,
                duration: { minutes: 30 }
            })

            //increment image height on staggered image view
            if (dataPoint.image && (this.imageSettings.style == "default")) {// || this.imageSettings.style == "image")) {
                dataPoint["textHeight"] += (this.imageSettings.imagesHeight + 2)

            }

            //add heights to margin conditionally:
            if (this.styleSettings.timelineStyle !== "minimalist") {
                if (!state.spacing || state.spacing < dataPoint["textHeight"]) {
                    state.spacing = dataPoint["textHeight"]
                }
                if (this.styleSettings.timelineStyle !== "image") {
                    if (dataPoint["top"]) {
                        this.marginTop = Math.max(this.marginTop, dataPoint["textHeight"] + 30)

                        if (dataPoint.customVertical) {
                            state.maxOffsetTop = Math.max(state.maxOffsetTop, dataPoint.verticalOffset)
                        }
                    } else {
                        if (dataPoint.customVertical) {
                            state.maxOffsetBottom = Math.max(state.maxOffsetBottom, dataPoint.verticalOffset)
                        }
                        //add to margin case text is bottom and image is on top (alternate and straight styles)
                        if (dataPoint.image) {
                            this.marginTop = Math.max(this.marginTop, state.addToMargin)
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

    /** If the data size is too large for the view type, this notified the user 
     * @returns True if the size is too large. False if it's fine.
    */
    private validateDataSizeConstraints(data: DataPoint[], options: VisualUpdateOptions) {
        if (data.length > 100 && this.styleSettings.timelineStyle !== "minimalist") {
            this.svg.attr("width", options.viewport.width - 4)
            this.svg.attr("height", options.viewport.height - 4)

            this.container
                .append("text")
                .text("Dataset is too large. Waterfall Style is recommended.")
                .attr("y", 20)
                .attr("width", this.width);

            return true;
        }

        return false;
    }

    private configureLineChart(state: ChartDrawingState) {
        state.axisMarginTop = state.finalMarginTop;
        state.enabledAnnotations = true;
        state.axisPadding = this.padding;
        state.strokeColor = this.axisSettings.axisColor.solid.color

        // svgHeightTracking = this.height
        state.svgHeightTracking = state.finalMarginTop + 20

        if (this.textSettings.stagger) {
            state.svgHeightTracking += (state.filteredData.filter(el => !el.top).length) * this.textSettings.spacing + 20
        } else {
            state.svgHeightTracking += this.textSettings.spacing
        }

        if (state.filteredData.filter(el => el.top && el.image).length > 0) {
            state.svgHeightTracking = Math.max(state.svgHeightTracking, state.axisMarginTop + state.addToMargin)
        }


        state.svgHeightTracking = Math.max(state.svgHeightTracking, state.axisMarginTop + state.maxOffsetBottom + this.textSettings.spacing)

        if (state.svgHeightTracking > this.height) {
            // this.width -= 20
        }
        state.width = this.width


        state.bar = this.container.append("line")
            .attr("x1", this.padding)
            .attr("y1", state.finalMarginTop)
            .attr("x2", this.width - this.padding)
            .attr("y2", state.finalMarginTop)
            .attr("stroke-width", this.styleSettings.lineThickness)
            .attr("stroke", this.styleSettings.lineColor.solid.color);
    }

    private configureBarChart(state: ChartDrawingState) {
        state.axisMarginTop = state.finalMarginTop
        state.enabledAnnotations = true;
        state.strokeColor = "transparent"
        state.axisPadding = this.padding;
        state.svgHeightTracking = state.finalMarginTop + this.barHt + 20;

        if (this.textSettings.stagger) {
            state.svgHeightTracking += (state.filteredData.filter(el => !el.top).length) * this.textSettings.spacing
        } else {
            state.svgHeightTracking += this.textSettings.spacing
        }

        if (state.filteredData.filter(el => el.top && el.image).length > 0) {
            // svgHeightTracking = Math.max(svgHeightTracking, axisMarginTop + this.barHt + addToMargin)
            state.svgHeightTracking = Math.max(state.svgHeightTracking, state.axisMarginTop + state.addToMargin)

        }

        state.svgHeightTracking = Math.max(state.svgHeightTracking, state.axisMarginTop + this.barHt + state.maxOffsetBottom + this.textSettings.spacing)


        if (state.svgHeightTracking > this.height) {
            // this.width -= 20
        }
        state.width = this.width

        state.bar = this.container.append('rect')
            .attr('width', this.width)
            .attr('x', 0)//this.padding)
            .attr('fill', this.styleSettings.barColor.solid.color)
            .attr('y', state.finalMarginTop)
            .attr('height', this.barHt)
            state.bar.exit().remove()
    }

    private configureMinimalistView(state: ChartDrawingState) {
        state.enabledAnnotations = false;

        if (this.styleSettings.minimalistAxis == "bottom") {
            state.axisMarginTop = 10 + state.finalMarginTop + this.textSettings.spacing * (state.filteredData.length)
            state.svgHeightTracking = state.axisMarginTop + 30

            if (state.svgHeightTracking > this.height) {
                //  this.width -= 20
                state.needScroll = true
                state.axisMarginTop = this.height - 40


            }
        } else {
            state.axisMarginTop = state.finalMarginTop
            state.svgHeightTracking = state.finalMarginTop + this.textSettings.spacing * (state.filteredData.length)

            if (state.svgHeightTracking > this.height) {
                state.needScroll = true
            }
        }




        if (state.downloadTop) {

            state.svgHeightTracking += 35
            if (!state.needScroll) {
                state.axisMarginTop += 35
            }
        }
        state.strokeColor = this.axisSettings.axisColor.solid.color

        //split screen for minimalist view
        let newWidth = (this.width * 0.70)
        state.axisPadding = this.width - newWidth - this.padding;

        //re-do scale
        state.scale = d3.scaleTime()
            .domain([this.minVal, this.maxVal]) //min and max data 
            .range([0, newWidth]); //min and max width in px    

        this.svg.append("defs").append("clipPath")
            .attr("id", "clip")
            .append("rect")
            .attr("width", this.width - newWidth - this.padding - 10)
            .attr("height", state.svgHeightTracking);

        //append points and annotations
        let textLateral = this.container.selectAll(".text-lateral")
            .data(state.filteredData)

        textLateral.exit().remove();

        var enter = textLateral.enter()
            .append("g").attr("class", "text-lateral")
            .attr("clip-path", "url(#clip)")

        enter.append("text")
            .attr("x", 0)
            .attr("y", (element, i) => {
                let result = 10 + this.marginTop + this.textSettings.spacing * i
                if (state.downloadTop) {
                    result += 35
                }
                return result
            })
            .attr('font-family', element => element.fontFamily)
            .attr('font-size', element => element.textSize)
            .attr("fill", el => el.textColor)

            .attr("id", (element) => element.selectionId.getKey())
            .text(element => element.label)
            .attr('class', element => `annotation_selector_${element.selectionId.getKey().replace(/\W/g, '')} annotationSelector`)
            .on('click', element => {

                //manage highlighted formating and open links
                this.selectionManager.select(element.selectionId).then((ids: ISelectionId[]) => {
                    if (ids.length > 0) {
                        d3.selectAll('.annotationSelector').style('opacity', "0.1")
                        d3.selectAll('.minIconSelector').style('opacity', "0.1")

                        d3.selectAll(`.annotation_selector_${element["selectionId"].getKey().replace(/\W/g, '')}`).style('opacity', "1")
                        d3.selectAll(`.min_icon_selector_${element["selectionId"].getKey().replace(/\W/g, '')}`).style('opacity', "1")

                        //Open link 
                        if (element.URL) {
                            this.host.launchUrl(element.URL)
                        }

                    }
                })
            })

        if (this.textSettings.boldTitles) {
            enter.attr("font-weight", "bold")
        }

        textLateral = textLateral.merge(enter);

        let minIcons = this.container.selectAll(".min-icons")
            .data(state.filteredData)
        minIcons.exit().remove();

        let enterIcons, shapeSize = 8

        //Add dots
        if (this.styleSettings.minimalistStyle !== "thinBar") {
            let size = 150 / this.styleSettings.minimalistSize
            let shapeOptions = {
                "diamond": d3.symbol().type(d3.symbolDiamond).size(size),
                "circle": d3.symbol().type(d3.symbolCircle).size(size),
                "square": d3.symbol().type(d3.symbolSquare).size(size),
                "dot": d3.symbol().type(d3.symbolCircle).size(10),
            }


            enterIcons = minIcons.enter()
                .append("g").attr("class", "min-icons");
            enterIcons.append('path')
                .attr("d", shapeOptions[this.styleSettings.minimalistStyle])
                .attr("transform", (element, i) => {
                    let pointY = 10 + (this.marginTop + this.textSettings.spacing * i) - shapeSize
                    if (state.downloadTop) {
                        pointY += 35
                    }
                    return "translate(" + (state.axisPadding + state.scale(element["date"])) + "," + pointY + ") rotate(180)"

                    // return "translate(" + (axisPadding + scale(element["date"]) - shapeSize) + "," + pointY + ") rotate(180)"
                })

                .attr("class", element => `minIconSelector min_icon_selector_${element["selectionId"].key.replace(/\W/g, '')}`)
                .attr("id", element => element["selectionId"])

                .on("click", (element) => {
                    this.selectionManager.select(element["selectionId"]).then((ids: ISelectionId[]) => {
                        if (ids.length > 0) {
                            d3.selectAll('.annotationSelector').style('opacity', "0.1")
                            d3.selectAll('.minIconSelector').style('opacity', "0.1")

                            d3.selectAll(`.annotation_selector_${element["selectionId"].key.replace(/\W/g, '')}`).style('opacity', "1")
                            d3.selectAll(`.min_icon_selector_${element["selectionId"].key.replace(/\W/g, '')}`).style('opacity', "1")

                            //Open link 
                            if (element["URL"]) {
                                this.host.launchUrl(element["URL"])
                            }

                        }
                    })
                })


        } else {
            enterIcons = minIcons.enter()
                .append("g").attr("class", "min-icons");
            enterIcons.append('rect')
                .attr("x", element => state.axisPadding + state.scale(element["date"]))

                // .attr("x", element => axisPadding + scale(element["date"]) - shapeSize)
                .attr("y", (element, i) => {
                    let y = 10 + (this.marginTop + this.textSettings.spacing * i) - shapeSize
                    if (state.downloadTop) {
                        y += 35
                    }
                    return y
                })
                .attr("width", 2)
                .attr("height", this.textSettings.spacing)
                .attr("class", element => `minIconSelector min_icon_selector_${element["selectionId"].key.replace(/\W/g, '')}`)
                .attr("id", element => element["selectionId"])
                .on("click", (element) => {
                    this.selectionManager.select(element["selectionId"]).then((ids: ISelectionId[]) => {
                        if (ids.length > 0) {
                            d3.selectAll('.annotationSelector').style('opacity', "0.1")
                            d3.selectAll('.minIconSelector').style('opacity', "0.1")

                            d3.selectAll(`.annotation_selector_${element["selectionId"].key.replace(/\W/g, '')}`).style('opacity', "1")
                            d3.selectAll(`.min_icon_selector_${element["selectionId"].key.replace(/\W/g, '')}`).style('opacity', "1")

                            //Open link 
                            if (element["URL"]) {
                                this.host.launchUrl(element["URL"])
                            }

                        }
                    })
                })

        }



        minIcons = minIcons.merge(enterIcons)
            .style("fill", element => element["iconColor"]);

        //Add line
        if (this.styleSettings.minimalistConnect) {
            this.container.append("path")
                .datum(state.filteredData)
                .attr("fill", "none")
                .attr("stroke", this.styleSettings.connectColor.solid.color)//"#69b3a2")
                .attr("stroke-width", 1)
                .attr("d", d3.line()
                    .x(element => state.axisPadding + state.scale(element["date"]))
                    .y((el, i) => {
                        let y = 10 + (this.marginTop + this.textSettings.spacing * (i)) - shapeSize
                        if (state.downloadTop) {
                            y += 35
                        }
                        return y
                    }) as any) //TODO: The any cast is a workaround to avoid this showing as an error due to d3.Line<[number, number]> not bing a valid type here
        }


    }

    
    private isImageOverlapping(firstImageXValue, firstImageYValue, compareImageXValue, compareImageYValue)
    {
        
        const intersection = require("rectangle-overlap");

        let firstRect   = {x: firstImageXValue, y: firstImageYValue, width: this.imageSettings.imagesWidth, height: this.imageSettings.imagesHeight};
        let compareRect = {x: compareImageXValue, y: compareImageYValue, width: this.imageSettings.imagesWidth, height: this.imageSettings.imagesHeight};

        if(compareRect !== undefined) //Is the compare variable undifined 
        {
            const overlap = intersection(firstRect, compareRect);
        
            if (firstRect.x === compareRect.x) //if touching they are technically overlapping.
            {
                return false;
                //console.log("The rectangles do not overlap AND ARE TOUCHING ");
            }

            else if (overlap) 
            {
                console.log(`The rectangles overlap over an area of ${overlap.area}`);
                console.log(
                    `Intersection coordinates: x=${overlap.x}, y=${overlap.y}, width=${overlap.width}, height=${overlap.height}`,
                  )
                return true;

                //console.log("overlap")
                
                //imageY -= this.imageSettings.imagesHeight // Need to find a way to use recurrion to go through
                //i = i - 1;
            } 
            else 
            {
                return false;
                //console.log("The rectangles do not overlap");
            }
        }
        return false;

        /*
        const intersection = require("rectangle-overlap");
        
        let currentRect = {x: imageXValues[i], y: imageYValues[i], width: this.imageSettings.imagesWidth, height: this.imageSettings.imagesHeight};
        let lastRect    = {x: imageXValues[i - 1], y: imageYValues[i - 1], width: this.imageSettings.imagesWidth, height: this.imageSettings.imagesHeight};
        
        if(imageXValues[i - 1] !== undefined) //Is the compare variable undifined 
        {
            const overlap = intersection(currentRect, lastRect);
        
            if (imageXValues[i] === imageXValues[i - 1]) //if touching they are technically overlapping.
            {
                return false;
                //console.log("The rectangles do not overlap AND ARE TOUCHING ");
            }

            else if (overlap) 
            {
                return true;
                //console.log("overlap")
                
                //imageY -= this.imageSettings.imagesHeight // Need to find a way to use recurrion to go through
                //i = i - 1;
            } 
            else 
            {
                return false;
                //console.log("The rectangles do not overlap");
            }
        }
        return false;
        */

    }

    private canImageMoveDown(firstImageXValue, firstImageYValue)
    {
        
        const intersection = require("rectangle-overlap");

        let firstRect   = {x: firstImageXValue, y: firstImageYValue, width: this.imageSettings.imagesWidth, height: this.imageSettings.imagesHeight};
        let compareRect = {x: firstImageXValue - this.imageSettings.imagesWidth, y: firstImageYValue - this.imageSettings.imagesHeight, width: this.imageSettings.imagesWidth, height: this.imageSettings.imagesHeight};

        if(compareRect !== undefined) //Is the compare variable undifined 
        {
            const overlap = intersection(firstRect, compareRect);
        
            if (firstRect.x === compareRect.x) //if touching they are technically overlapping.
            {
                console.log("Can move doen")
                return true;
                //console.log("The rectangles do not overlap AND ARE TOUCHING ");
            }

            else if (overlap) 
            {
                console.log("OVERLAPPPP DONT MOVE DONW")
                return false;

                //console.log("overlap")
                
                //imageY -= this.imageSettings.imagesHeight // Need to find a way to use recurrion to go through
                //i = i - 1;
            } 
            else 
            {
                console.log("Can move doen")
                return true;
                //console.log("The rectangles do not overlap");
            }
        }
        return false;
    }

    // Configures the non-image timeline annotations
    private configureTimelineAnnotations(state: ChartDrawingState) {
        //annotations config
        let annotationsData, makeAnnotations
        let countTop = -1, countBottom = -1, counter

        // let countTop = 1, countBottom = 1, counter
        let imgCountTop = 0, imgCountBottom = 0, imgCounter

        let last_dateasint
        let current_dateasint

        let levelOfAlternate = 0;

        let RowDataArray: RowOfImage[] = [];
        let singleImageArray: SingleImage[] = []

        let designStyle


        // let pixelWidth = (this.width - this.padding * 2) / data.length

        state.filteredData.forEach((element, i) => {
            let orientation
            if (element.top) {
                countTop++;
                counter = countTop
            } else {
                countBottom++;
                counter = countBottom
            }

            element["x"] = this.padding + state.scale(element["date"])

            if (!element.customVertical) {
                if (this.textSettings.stagger) {
                    if (counter > 0) {
                        element["dy"] = element.top ? this.textSettings.spacing * (-1 * (counter)) - 20 : this.textSettings.spacing * (counter) + 20

                    } else {
                        element["dy"] = element.top ? -20 : 20
                    }
                    // element["dy"] = element.top ? this.textSettings.spacing * (-1 * countTop) : this.axisSettings.axis === "None" ? this.textSettings.spacing * countBottom : this.textSettings.spacing * countBottom + 20;
                }
                else {
                    element["dy"] = element.top ? -20 : 20
                }

                if (this.axisSettings.axis != "None" && this.styleSettings.timelineStyle !== "bar" && !element.top) {
                    element["dy"] += 20
                }
            } else {
                element["dy"] = element.top ? element.verticalOffset * -1 : element.verticalOffset
            }


            if (element.labelOrientation !== "Auto") {
                orientation = element.labelOrientation
            } else {
                orientation = this.getAnnotationOrientation(element)
            }



            // svgHeightTracking = Math.max(svgHeightTracking, element["y"] + element["dy"])

            element.alignment = new DataPointAlignment();

            element.alignment.note.align = orientation
            annotationsData = [{
                note: {
                    wrap: this.textSettings.wrap,
                    title: element.labelText,
                    label: element.description,
                    bgPadding: 0
                },
                x: element["x"],
                y: this.styleSettings.timelineStyle == "bar" && !element.top ? state.finalMarginTop + this.barHt : state.finalMarginTop,
                dy: element["dy"],
                color: element.textColor,
                id: element.selectionId
            }]

            element.style = element.annotationStyle !== "textOnly" ? svgAnnotations[element.annotationStyle] : svgAnnotations['annotationLabel']

            makeAnnotations = svgAnnotations.annotation()
                .annotations(annotationsData)
                .type(new svgAnnotations.annotationCustomType(element.style, element.alignment)) //NOTE: THis used to be (element.type, element.alignment) for some reason, which is an error?

            if (element.annotationStyle === 'textOnly') {
                makeAnnotations
                    .disable(["connector"])
            }
            

            //append images
            if (element.image) {
                if (element.top) {
                    imgCountTop++
                    imgCounter = imgCountTop
                } else {
                    imgCountBottom++
                    imgCounter = imgCountBottom
                }
                let imageY, imageX
                switch (this.imageSettings.style) {
                    case "default":
                        designStyle = "staggered"
                    
                        imageY = !element.top ? (state.finalMarginTop + element.dy) + element.textHeight - this.imageSettings.imagesHeight : (state.finalMarginTop + element.dy) - element.textHeight - 5


                        if (this.styleSettings.timelineStyle == "bar" && !element.top) { imageY += this.barHt }

                        if (orientation == "middle") { imageX = element.x - (this.imageSettings.imagesWidth / 2) }
                        else if (orientation == "left") { imageX = element.x }
                        else { imageX = element.x - this.imageSettings.imagesWidth }
                        break;

                    case "straight":
                        designStyle = "straight"
                        imageY = element.top ? state.finalMarginTop + 20 : state.finalMarginTop - 20 - this.imageSettings.imagesHeight

                        if (this.styleSettings.timelineStyle == "bar" && element.top) { imageY += this.barHt }
                        break;

                    case "alternate":
                        designStyle = "alternate"
                        
                        imageY = element.top ? state.finalMarginTop + 20 : 0
                        if (state.downloadTop) {
                            imageY += 35
                        }
                        if (imgCounter % 2 == 0) {
                            imageY += this.imageSettings.imagesHeight
                        }

                        if (this.styleSettings.timelineStyle == "bar" && element.top) { imageY += this.barHt }

                        break;
                        
                    default:

                        designStyle = "alternateVertical"

                        imageX = element.x - (this.imageSettings.imagesWidth / 2)

                        current_dateasint = element.dateAsInt
                        if (this.styleSettings.timelineStyle == "bar" && element.top) { imageY += this.barHt }
                        if(current_dateasint === last_dateasint) // Then go up and dont do alternate design
                        {

                            imageY = element.top ? state.finalMarginTop + 20 : state.finalMarginTop - 20 - this.imageSettings.imagesHeight
                            for(var i:number = 0; i < RowDataArray.length; i++)
                            {
                                if(current_dateasint === RowDataArray[i].rowData_dateAsInt)
                                {
                                    
                                    RowDataArray[i].rowData_numberOfImages = RowDataArray[i].rowData_numberOfImages + 1

                                    if(element.top)
                                    {
                                        imageY = RowDataArray[i].rowData_firstImage.imageData_y - (RowDataArray[i].rowData_numberOfImages * this.imageSettings.imagesHeight) + this.imageSettings.imagesHeight
                                    }
                                    else
                                    {
                                        imageY = RowDataArray[i].rowData_firstImage.imageData_y - (RowDataArray[i].rowData_numberOfImages * this.imageSettings.imagesHeight) + this.imageSettings.imagesHeight
                                    }

                                    

                                    let lastImageTemp = new SingleImage(element.label, element["x"], imageY, element.dateAsInt, element.image, element.top)

                                    RowDataArray[i].rowData_lastImage = lastImageTemp
                                    RowDataArray[i].rowData_shouldAlternate = false
                                    
                                }
                            }

                            
               
                        }
                        else
                        {

                            imageY = element.top ? state.finalMarginTop + 20 : state.finalMarginTop - 20 - this.imageSettings.imagesHeight
                              
                            if (state.downloadTop) { imageY += 35 }
                            //if(!element.top) { imageY -= this.imageSettings.imagesHeight }                  
                            if (this.styleSettings.timelineStyle == "bar" && element.top) { imageY += this.barHt }
                            
                            let highImage = false

                            for(var i:number = 0; i < singleImageArray.length; i++)
                            {

                                if(this.isImageOverlapping(element["x"], imageY, singleImageArray[i].imageData_x, singleImageArray[i].imageData_y))
                                {

                                    imageY = imageY - this.imageSettings.imagesHeight
                                    highImage = true
                                    
                                }
                            }

                            
                            //console.log(RowDataArray)
                            if(highImage === true)
                            {
                                let firstImageTemp = new SingleImage(element.label, element["x"], imageY, element.dateAsInt, element.image, element.top) // -50 is for temp center
                                RowDataArray.push(new RowOfImage(element.dateAsInt, firstImageTemp, 1, firstImageTemp, false)) // Start New Row Without Alternate
                            }
                            else
                            {
                                let firstImageTemp = new SingleImage(element.label, element["x"], imageY, element.dateAsInt, element.image, element.top) // -50 is for temp center
                                RowDataArray.push(new RowOfImage(element.dateAsInt, firstImageTemp, 1, firstImageTemp, true)) // Start New Row With Alternate
                            }
                            
                            

                        }

                        singleImageArray.push(new SingleImage(element.label, element["x"], imageY, element.dateAsInt, element.image, element.top))

                        last_dateasint = current_dateasint

                        break;
                    }

                imageX = !imageX ? element.x - (this.imageSettings.imagesWidth / 2) : imageX
                
                if(designStyle === "staggered" || designStyle === "straight" || designStyle === "alternate")
            {
                if (this.imageSettings.style != "default") {

                    if(!element.image)
                    {
                        
                    }
                    else
                    {
                        let connector = this.container.append("line")
                        .attr("x1", element.x)
                        .attr("y1", () => {
                            let result = state.finalMarginTop
                            if (this.styleSettings.timelineStyle == "bar" && element.top) {
                                result += this.barHt
                            }
                            return result
                        })
                        .attr("x2", element.x)
                        .attr("y2", element.top ? imageY : imageY + this.imageSettings.imagesHeight)
                        .attr("stroke-width", 1)
                        .attr("stroke", element.textColor);
                    }

                }

                let image = this.container.append('image')
                    .attr('xlink:href', element.image)
                    .attr('width', this.imageSettings.imagesWidth)
                    .attr('height', this.imageSettings.imagesHeight)
                    .attr('x', imageX)
                    .attr('y', imageY)

                    .on("click", () => {
                        if (element.URL) {
                            this.host.launchUrl(element.URL)
                        }

                    });
                }

                this.container
                    .append("g")
                    .attr('class', `annotation_selector_${element.selectionId.getKey().replace(/\W/g, '')} annotationSelector`)
                    .style('font-size', element.textSize + "px")
                    .style('font-family', element.fontFamily)
                    .style('background-color', 'transparent')
                    .call(makeAnnotations)
                    .on('click', el => {
                        //manage highlighted formating and open links
                        this.selectionManager.select(element.selectionId).then((ids: ISelectionId[]) => {
                            if (ids.length > 0) {
                                // this.container.selectAll('.bar').style('fill-opacity', 0.1)
                                d3.select(`.selector_${element.selectionId.getKey().replace(/\W/g, '')}`).style('fill-opacity', 1)
                                this.container.selectAll('.annotationSelector').style('font-weight', "normal")

                                if (!this.textSettings.boldTitles) {
                                    this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
                                }

                                d3.selectAll(`.annotation_selector_${element.selectionId.getKey().replace(/\W/g, '')}`).style('font-weight', "bold")
                                d3.selectAll(`.annotation_selector_${element.selectionId.getKey().replace(/\W/g, '')}  .annotation-note-title `).style('font-weight', "bold")


                                //Open link 
                                if (element.URL) {
                                    this.host.launchUrl(element.URL)
                                }

                            } else {
                                // this.container.selectAll('.bar').style('fill-opacity', 1)
                                this.container.selectAll('.annotationSelector').style('font-weight', "normal")

                                if (!this.textSettings.boldTitles) {
                                    this.container.selectAll('.annotationSelector .annotation-note-title').style('font-weight', "normal")
                                }
                            }

                        })
                    })
                }
            })

            
            
            
            if(designStyle === "alternateVertical")
            {
                for(var i:number = 0; i < RowDataArray.length; i++)
                {
                
                    if(RowDataArray[i].rowData_shouldAlternate === true)
                    {
                    

                        let moveUpDate = RowDataArray[i].rowData_dateAsInt
                        for(var j:number = 0; j < singleImageArray.length; j++)
                            {
                                if(singleImageArray[j].imageData_imageOnTop === true)
                            {
                            
                            }
                            else
                            {
                                if(singleImageArray[j].imageData_dateAsInt === moveUpDate)
                                {
                                    //singleImageArray[j].imageData_y = singleImageArray[j].imageData_y - 100
                                }
                            }

                        }
                    }  
                }

            
            for(var h:number = 0; h < RowDataArray.length; h++)
            {
                let connector = this.container.append("line")
                .attr("x1", RowDataArray[h].rowData_lastImage.imageData_x) //TOP
                //.attr("y1", RowDataArray[h].rowData_lastImage.imageData_y) //TOP

                .attr("y1", () => {let result = state.finalMarginTop
                    if (this.styleSettings.timelineStyle == "bar" && RowDataArray[h].rowData_lastImage.imageData_imageOnTop) {result += this.barHt}
                    return result})

                .attr("x2", RowDataArray[h].rowData_firstImage.imageData_x) //Bottom
                .attr("y2", RowDataArray[h].rowData_lastImage.imageData_imageOnTop ? RowDataArray[h].rowData_lastImage.imageData_y  : RowDataArray[h].rowData_lastImage.imageData_y + this.imageSettings.imagesHeight) //BOTTOM
                .attr("stroke-width", 1)
                .attr("stroke", "Black");
            }

            for(var p:number = 0; p < singleImageArray.length; p++)
            {

                let image = this.container.append('image')
                .attr('xlink:href', singleImageArray[p].imageData_image)
                .attr('width', this.imageSettings.imagesWidth)
                .attr('height', this.imageSettings.imagesHeight)
                .attr('x', singleImageArray[p].imageData_x - 50)

                .attr('y', singleImageArray[p].imageData_y)

            }
        }
    }

    private configureImagesTimeline(state: ChartDrawingState) {
        this.padding = this.defaultPadding;
        let annotationsData, makeAnnotations, dateStyle, dateType, datesData, makeDates
        let countTop = 0, countBottom = 0, counter
        let imgCountTop = 0, imgCountBottom = 0, imgCounter


        state.finalHeight = state.filteredWithImage.length > 0 ? state.finalMarginTop + this.imageSettings.imagesHeight + 30 + state.spacing : state.finalMarginTop + 30 + state.spacing

        if (state.downloadBottom) {
            state.finalHeight += 35
        }

        this.width = Math.max(state.filteredData.length * (this.textSettings.wrap + 10) + 20, this.width - 4)

        this.svg.attr("height", state.finalHeight);
        this.svg.attr("width", this.width);

        state.filteredData.forEach((element, i) => {
            let orientation
            if (element.top) {
                countTop++;
                counter = countTop
            } else {
                countBottom++;
                counter = countBottom
            }


            element["x"] = i == 0 ? this.padding : this.padding + ((this.textSettings.wrap + 10) * i)
            element["dy"] = this.imageSettings.imagesHeight / 2 + 10
            orientation = "left"


            element.alignment = new DataPointAlignment();
            element.alignment.note.align = orientation

            if (this.axisSettings.axis == "Values") {
                dateStyle = svgAnnotations['annotationLabel']
                dateType = new svgAnnotations.annotationCustomType(
                    dateStyle,
                    element.alignment
                )


                datesData = [{
                    note: {
                        wrap: this.textSettings.wrap,
                        title: state.axisValueFormatter.format(element.date),
                        bgPadding: 0
                    },
                    x: element["x"],
                    y: state.finalMarginTop,
                    dy: 1,
                    color: this.axisSettings.axisColor.solid.color
                }]

                makeDates = svgAnnotations.annotation()
                    .annotations(datesData)
                    .type(new svgAnnotations.annotationCustomType(dateType, element.alignment))

                makeDates
                    .disable(["connector"])

                let newAxis = this.container
                    .append("g")
                    .style('font-size', this.axisSettings.fontSize + "px")
                    .style('font-family', this.axisSettings.fontFamily)
                    .style('background-color', 'transparent')
                    .call(makeDates)


                if (this.axisSettings.bold) {
                    newAxis.attr('class', 'bold')
                    newAxis.classed('notBold', false)
                } else {
                    newAxis.attr('class', 'notBold')
                    newAxis.classed('bold', false)
                }

            }

            element.alignment = new DataPointAlignment();
            element.alignment.note.align = orientation
            annotationsData = [{
                note: {
                    wrap: this.textSettings.wrap,
                    title: element.labelText,
                    label: element.description,
                    bgPadding: 0
                },
                x: element["x"],
                y: element.image ? state.finalMarginTop + this.imageSettings.imagesHeight : state.finalMarginTop,
                dy: 30,
                color: element.textColor,
                id: element.selectionId
            }]

            element["style"] = element.annotationStyle !== "textOnly" ? svgAnnotations[element.annotationStyle] : svgAnnotations['annotationLabel']

            element["type"] = new svgAnnotations.annotationCustomType(
                element.style,
                element.alignment
            )

            makeAnnotations = svgAnnotations.annotation()
                .annotations(annotationsData)
                .type(new svgAnnotations.annotationCustomType(element.style, element.alignment))


            makeAnnotations
                .disable(["connector"])

            if (element.image) {
                if (element.top) {
                    imgCountTop++
                    imgCounter = imgCountTop
                } else {
                    imgCountBottom++
                    imgCounter = imgCountBottom
                }

                // let imageY = this.finalMarginTop - imagesHeight / 2
                let imageY = state.finalMarginTop + 25
                let imageX = element.x

                let image = this.container.append('image')
                    .attr('xlink:href', element.image)
                    .attr('width', this.imageSettings.imagesWidth)
                    .attr('height', this.imageSettings.imagesHeight)
                    .attr('x', imageX)
                    // .attr('x', element.labelOrientation !== "middle" ? element.x : element.x - (imagesWidth / 2))
                    .attr('y', imageY)

                    .on("click", () => {
                        if (element.URL) {
                            this.host.launchUrl(element.URL)
                        }
                    });
            }

            this.container
                .append("g")
                .attr('class', `annotation_selector_${element.selectionId.getKey().replace(/\W/g, '')} annotationSelector`)
                .style('font-size', element.textSize + "px")
                .style('font-family', element.fontFamily)
                .style('background-color', 'transparent')
                .call(makeAnnotations)
                .on('click', el => {
                    this.selectionManager.select(element.selectionId).then((ids: ISelectionId[]) => {
                        if (ids.length > 0) {
                            // this.container.selectAll('.bar').style('fill-opacity', 0.1)
                            d3.select(`.selector_${element.selectionId.getKey().replace(/\W/g, '')}`).style('fill-opacity', 1)
                            this.container.selectAll('.annotationSelector').style('font-weight', "normal")

                            if (!this.textSettings.boldTitles) {
                                this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
                            }

                            d3.selectAll(`.annotation_selector_${element.selectionId.getKey().replace(/\W/g, '')}`).style('font-weight', "bold")
                            d3.selectAll(`.annotation_selector_${element.selectionId.getKey().replace(/\W/g, '')}  .annotation-note-title `).style('font-weight', "bold")

                            //Open link 
                            if (element.URL) {
                                this.host.launchUrl(element.URL)
                            }


                        } else {
                            // this.container.selectAll('.bar').style('fill-opacity', 1)
                            this.container.selectAll('.annotationSelector').style('font-weight', "normal")
                            if (!this.textSettings.boldTitles) {
                                this.container.selectAll('.annotationSelector .annotation-note-title').style('font-weight', "normal")
                            }
                        }

                    })
                })
        })
    }

    /** Sets the defalt global values, executed on every update() call */
    private setDefaultGlobals() {
        this.marginTop = this.defaultMarginTop;
        this.padding = this.defaultPadding
    }


    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options); // Rendering Events API START

        this.viewModel = generateViewModel(options, this.host)
        const state: ChartDrawingState = new ChartDrawingState();
        state.data = this.viewModel.dataPoints

        if(this.validateDataSizeConstraints(state.data, options)) { // Short circuit if data size is too large for view type
            this.events.renderingFailed(options); // Rendering Events API FAIL
            return;
        }

        this.setEmptyCanvas();
        this.setDefaultGlobals();
        this.setDataRange(this.viewModel.dataPoints); // Set the date range of the timeline based on the data

        state.addToMargin = this.getAdditionalMargin();
        state.dateValueFormatter = this.createDateFormatter(options);
        this.filterAndProcessData(state);
        state.filteredWithImage = state.filteredData.filter(el => el.image)

        const filteredData = state.filteredData; // Array Refernece used to reduce call length

        //min label width from annotation plugin
        if (this.textSettings.wrap < 90) {
            this.textSettings.wrap = 90
        }

        if (!this.axisSettings.manualScalePixel || !this.axisSettings.customPixel || isNaN(this.axisSettings.customPixel)) {
            this.width = options.viewport.width - 20;
        } else {
            this.width = this.axisSettings.customPixel
        }

        this.height = options.viewport.height;
        this.barHt = this.styleSettings.barHt;

        //sort so staggering works in right order
        // data = data.sort((a, b) => (a.date > b.date) ? 1 : -1)

        if (this.textSettings.annotationStyle === 'annotationCallout' || this.textSettings.annotationStyle === 'annotationCalloutCurve') {
            //annotation styles that add to text height, increment spacing
            state.spacing += 10
        }
        
        //work around not limiting minimum spacing
        if (this.textSettings.autoStagger || !this.textSettings.spacing) {
            this.textSettings.spacing = state.spacing
            this.host.persistProperties({
                merge: [{
                    objectName: 'textSettings',
                    selector: null,
                    properties: { spacing: state.spacing }
                }]
            });
        }

        state.marginTopStagger += ((filteredData.filter(element => element.top && !element.customVertical).length) * this.textSettings.spacing) + 20

        //case margintopstagger wasn't incremented - no top staggered items:
        state.marginTopStagger = Math.max(this.marginTop, state.marginTopStagger)


        if (this.imageSettings.style !== "default" && filteredData.filter(el => !el.top && el.image).length > 0) {
            state.marginTopStagger = Math.max(state.marginTopStagger, state.addToMargin)
        }
        //define "official" margin top to start drawing graph
        if (this.styleSettings.timelineStyle !== "image") {
            state.finalMarginTop = !this.textSettings.stagger || this.styleSettings.timelineStyle == "minimalist" ? this.marginTop : state.marginTopStagger

            if (this.styleSettings.timelineStyle != "minimalist" && filteredData.filter(el => el.top && el.customVertical).length > 0) {
                //case user input offset is > than margin
                state.finalMarginTop = Math.max(state.finalMarginTop, state.maxOffsetTop + this.textSettings.spacing)
            }

        } else {
            state.finalMarginTop = 20 //+ imagesHeight / 2
        }


        state.downloadTop = this.downloadSettings.downloadCalendar && this.downloadSettings.position.split(",")[0] == "TOP";
        state.downloadBottom = this.downloadSettings.downloadCalendar && this.downloadSettings.position.split(",")[0] !== "TOP"

        //download calendar icon is enabled and positioned at top
        if (state.downloadTop) {
            state.finalMarginTop += 35
        }

        //axis format
        state.axisFormat = this.axisSettings.dateFormat != "customJS" ? this.axisSettings.dateFormat : this.axisSettings.customJS;
        state.axisValueFormatter = state.axisFormat == "same" ? state.dateValueFormatter : createFormatter(state.axisFormat);      

        this.setPadding(state);

        state.scale = d3.scaleTime()
            .domain([this.minVal, this.maxVal]) //min and max data 
            .range([0, this.width - (this.padding * 2)]); //min and max width in px 
            
        let last_date
        let current_date
        let pictureHeight = 1;
        
        if(this.imageSettings.style === "alternateVertical") 
        {
              
            state.filteredData.forEach((element, i) => //if datapoints have the same date then add margin
            {
                current_date = element["dateAsInt"]

                if(current_date === last_date)
                {
                    state.finalMarginTop = state.finalMarginTop + this.imageSettings.imagesHeight;
                    pictureHeight = pictureHeight + 1                 
                }
//
                last_date = element["dateAsInt"]
            })

            if(pictureHeight < 2) // if its one image
            { state.finalMarginTop = state.finalMarginTop + this.imageSettings.imagesHeight; }

            state.finalMarginTop = state.finalMarginTop - this.imageSettings.imagesHeight + 100 + 500; // alternate starts at 2 high.
        }           

        if (this.styleSettings.timelineStyle !== "image") {
            //all styles, not image focus:
            //let bar, axisMarginTop, enabledAnnotations, strokeColor, width, axisPadding


            this.svg.attr("width", this.width - 4);
            switch (this.styleSettings.timelineStyle) {
                case "line":
                    this.configureLineChart(state);
                    break;

                case "bar":
                    this.configureBarChart(state);
                    break;

                case "minimalist":
                    this.configureMinimalistView(state);
                    break;
            }

            state.finalHeight = Math.max(this.height - 4, state.svgHeightTracking)

            this.svg.attr("height", state.finalHeight);

            let transparentContainer
            if (state.needScroll && this.styleSettings.minimalistAxis == "bottom") {
                transparentContainer = this.container.append('rect')
                    .attr('width', this.width)
                    .attr('x', 0)//this.padding)
                    .attr('fill', "white")
                    .attr('y', state.axisMarginTop)
                    .attr('height', this.height)
            }
            //axis setup

            if (state.axisMarginTop) {
                let x_axis = d3.axisBottom(state.scale)
                    .tickFormat(d => {
                        return state.axisValueFormatter.format(new Date(<any>d))
                    })


                let sandBox: any = d3.select('#sandbox-host')
                //Append group and insert axis
                let axisSVG = this.container.append("g")
                    .attr("transform", "translate(" + state.axisPadding + "," + (state.needScroll ? state.axisMarginTop + sandBox.property("scrollTop") : state.axisMarginTop) + ")")
                    .call(x_axis)
                    .attr('class', 'axis')

                    .attr('style', `color :${this.axisSettings.axisColor.solid.color}`)
                    .attr('style', `stroke :${this.axisSettings.axisColor.solid.color}`)

                this.container.selectAll('path, line')
                    .attr('style', `color :${state.strokeColor}`)

                if (this.axisSettings.bold) {
                    this.container.classed("xAxis", false);
                } else {
                    this.container.attr('class', 'xAxis')
                }

                if (this.axisSettings.axis === "None") {
                    this.container.selectAll(".axis text").remove()
                }
                else {
                    this.container.selectAll(".axis text").style('font-size', this.axisSettings.fontSize)
                    this.container.selectAll(".axis text").style('fill', this.axisSettings.axisColor.solid.color)
                    this.container.selectAll(".axis text").style('font-family', this.axisSettings.fontFamily)

                }

                if (state.needScroll) {
                    //on scroll event delete and re-write axis on better position
                    // https://github.com/wbkd/d3-extended
                    d3.selection.prototype.moveToFront = function () {
                        return this.each(function () {
                            this.parentNode.appendChild(this);
                        });
                    };
                    sandBox.on("scroll", (e) => {
                        let firstXForm = axisSVG.property("transform").baseVal.getItem(0)
                        axisSVG.remove()
                        if (this.styleSettings.minimalistAxis == "bottom") {
                            transparentContainer.remove()
                            //Appent transparent container
                            transparentContainer = this.container.append('rect')
                                .attr('width', this.width)
                                .attr('x', 0)//this.padding)
                                .attr('fill', "white")
                                .attr('y', state.axisMarginTop + sandBox.property("scrollTop"))
                                .attr('height', this.height)
                        }
                        //Append group and insert axis
                        axisSVG = this.container.append("g")
                            .attr("transform", "translate(" + state.axisPadding + "," + (state.axisMarginTop + sandBox.property("scrollTop")) + ")")
                            .call(x_axis)
                            .attr('class', 'axis')

                            .attr('style', `color :${this.axisSettings.axisColor.solid.color}`)
                            .attr('style', `stroke :${this.axisSettings.axisColor.solid.color}`)

                        this.container.selectAll('path, line')
                            .attr('style', `color :${state.strokeColor}`)

                        if (this.axisSettings.bold) {
                            this.container.classed("xAxis", false);
                        } else {
                            this.container.attr('class', 'xAxis')
                        }

                        if (this.axisSettings.axis === "None") {
                            this.container.selectAll(".axis text").remove()
                        }
                        else {
                            this.container.selectAll(".axis text").style('font-size', this.axisSettings.fontSize)
                            this.container.selectAll(".axis text").style('fill', this.axisSettings.axisColor.solid.color)
                            this.container.selectAll(".axis text").style('font-family', this.axisSettings.fontFamily)

                        }
                        // }

                        // Setting
                        // axisSVG.attr("transform", "translate(" + axisPadding + "," + (this.height - sandBox.property("scrollTop")) + ")")



                        let cal: any = d3.select("#calendar-icon")
                        cal.moveToFront()

                    })
                }

            }
            //append today icon
            let today = new Date
            if (this.styleSettings.today && today >= this.minVal && today <= this.maxVal) {
                let todayIcon = this.container
                    .append('path')
                    .attr("d", d3.symbol().type(d3.symbolTriangle).size(150))
                    .attr("class", "symbol today-symbol")
                    .attr("transform", (d) => {
                        let transformStr, todayIconY,
                            todayMarginTop = state.axisMarginTop ? state.axisMarginTop : state.finalMarginTop,
                            todayPadding = state.axisPadding ? state.axisPadding : this.padding

                        if (this.styleSettings.todayTop) {
                            todayIconY = todayMarginTop - 12
                            transformStr = "translate(" + (todayPadding + state.scale(today)) + "," + (todayIconY) + ") rotate(180)"
                        } else {
                            todayIconY = this.styleSettings.timelineStyle == "bar" ? todayMarginTop + 12 + this.barHt : todayMarginTop + 12

                            transformStr = "translate(" + (todayPadding + state.scale(today)) + "," + (todayIconY) + ")"
                        }

                        return transformStr
                    })
                    .style("fill", this.styleSettings.todayColor.solid.color);

            }

            if (state.enabledAnnotations) {
                this.configureTimelineAnnotations(state);
            }
        }
        else { //image focus config:    
            this.configureImagesTimeline(state);
        }

        //remove default bold if bold titles is off
        if (!this.textSettings.boldTitles) {
            this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
        }


        //Handle context menu - right click
        this.svg.on('contextmenu', contextFunction => { this.handleContextMenuRightClick() } );
        //Handles click on/out bar
        this.svg.on('click', this.handleSvgClick);
        this.svg.on('mouseover', this.handleMouseOver)



        if (this.downloadSettings.downloadCalendar) {

            const ics = require('ics')
            // let orientationVertical = this.downloadSettings.position.split(",")[0]
            let orientationHorizontal = this.downloadSettings.position.split(",")[1]
            let calX
            if (orientationHorizontal == "LEFT") {
                calX = 2
            } else {
                calX = this.width - 35
                if (this.styleSettings.timelineStyle == "minimalist") {
                    calX -= 20
                }
            }
            let calY = state.downloadTop ? 2 : state.finalHeight - 35





            //append download icon
            let calendarIcon = this.container.append('image')
                .attr('xlink:href', "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAQAAACROWYpAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAAmJLR0QAAKqNIzIAAAAJcEhZcwAADsQAAA7EAZUrDhsAAAAHdElNRQfkBg8SOTSmsBjTAAAC8ElEQVQ4y53UbWjVZRgG8N/Ozs7aOZMtWSuTs2UMEvZlK2kp9kogytiLxdyoYJCGYKkEITb6ELE06INpYkFfVviWJEsC8QUN0lJWzGKR5UrTZnNTZyxkL2fn34cdT3s5Luj6dD33c1//57mf+7r/ZMJK3bqt9D9Q5LgGDY4rmjkxlCGyQFwgELcgw/4EZE1Z32e1xX5Uhm7lTvjAhduLcxULp8582st6bdWlCFeVW2uO7Y5IgoQrRiaK31cpAbLdI+yyYSEBsiTluldCrzEQccRbRv8VX/CiXyYUEaTfIjklxgPe1OjSLXFYQjea5PvbnhnZbuckUiWmxCQ1qXZUtSQzMHZPfrDx70Sd8aEiMWZg0cx97lRljyqdGdkZC+1VpXNqY8PIdtCfZhn0PXqnsB+M+E6xXJfNniwPY8wyG90U1YqWSSzPDn+pVipHlhylnnTVoFRv12qzzHXr3K/AnEnsVfO9Yq5vfGKndiedV6/O7+PtGhfP95jZFuky6vE0e9Rcj9jhDV/K1qDcKYd9ocBr+p0dv3bILkmzHLAXUizwkGartYMmSxGy2Q1bXPS6Pl+HM4xHIKbYWbk2paTEHEMstdqvxAbNoZRJaoypscIKNQIhgSXyfHzbCWyTozaTST4y6po1DhlIJ0cNCibYZMAhyzOZZJe3xZXoSKfWqveHHnVq07EOZZlNcl2WiL50Yr5hXZKG5Kdj/SKZTDLkZ9smVbtPiS3Yad/0wahwWqsWlThts1wJo4qdQ9jdeM95HHAXrkig2EgmkxR6zpiYiFOos12jYcdcVO9djfr9hGcUjtc81STfOuqGl7QZUOGETms8j6htKlXY705LfBo2pEWPQCBmFcYE8qxS4EEv2GpE1Fd+E8GIHotdQ7NR7VkWeUqu6Qjc4QmtLtkkaiz1S8x200YlWqx30oyoddo688TFlSoVFzfPeh2WT3f1dCy0QcRBHfpQ7GFLjXpn/NT/ElOoxrPK5Mgy4lef+fyWbf8BTNASSGAMJiEAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjAtMDYtMTVUMTg6NTc6NTItMDQ6MDC+fJWTAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDIwLTA2LTE1VDE4OjU3OjUyLTA0OjAwzyEtLwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAAASUVORK5CYII=")
                .attr('width', 30)
                .attr('height', 30)
                .attr("id", "calendar-icon")
                .attr('x', calX)
                .attr('y', calY)
                .on("click", () => {
                    const { error, value } = ics.createEvents(state.ICSevents)

                    if (error) {
                        return
                    }
                    var blob;

                    blob = new Blob([value]);

                    FileSaver.saveAs(blob, `${this.downloadSettings.calendarName != "" ? this.downloadSettings.calendarName : 'calendar'}.ics`);
                });
        }

        this.events.renderingFinished(options); // Rendering Events API FINISH
    }

    /**
     * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
     * objects and properties you want to expose to the users in the property pane.
     *
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {

        let objectName: string = options.objectName;
        let objectEnumeration: VisualObjectInstance[] = [];


        switch (objectName) {
            case 'textSettings':

                if (this.styleSettings.timelineStyle !== "minimalist" && this.styleSettings.timelineStyle !== "image") {
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            stagger: this.textSettings.stagger
                        },
                        selector: null
                    });

                    if (this.textSettings.stagger) {

                        objectEnumeration.push({
                            objectName: objectName,
                            properties: {
                                autoStagger: this.textSettings.autoStagger
                            },
                            selector: null
                        });

                        if (!this.textSettings.autoStagger) {

                            objectEnumeration.push({
                                objectName: objectName,
                                properties: {
                                    spacing: this.textSettings.spacing
                                },
                                selector: null
                            });

                        }


                    }

                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            wrap: this.textSettings.wrap,
                            separator: this.textSettings.separator,
                            labelOrientation: this.textSettings.labelOrientation,
                            top: this.textSettings.top,
                            annotationStyle: this.textSettings.annotationStyle,
                            boldTitles: this.textSettings.boldTitles,
                            fontFamily: this.textSettings.fontFamily,
                            textSize: this.textSettings.textSize,
                            textColor: this.textSettings.textColor,
                            dateFormat: this.textSettings.dateFormat
                        },
                        selector: null
                    });
                } else {
                    if (this.styleSettings.timelineStyle == "image") {
                        objectEnumeration.push({
                            objectName: objectName,
                            properties: {
                                wrap: this.textSettings.wrap,
                                annotationStyle: this.textSettings.annotationStyle
                            },
                            selector: null
                        });
                    }

                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            boldTitles: this.textSettings.boldTitles,
                            fontFamily: this.textSettings.fontFamily,
                            textSize: this.textSettings.textSize,
                            textColor: this.textSettings.textColor,
                            dateFormat: this.textSettings.dateFormat
                        },
                        selector: null
                    });


                }

                if (this.textSettings.dateFormat == "customJS") {
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            customJS: this.textSettings.customJS
                        },
                        selector: null
                    });

                }
                break;
            case 'axisSettings':
                objectEnumeration.push({
                    objectName: objectName,
                    properties: {
                        axis: this.axisSettings.axis,
                        axisColor: this.axisSettings.axisColor

                    },
                    selector: null
                });

                if (this.axisSettings.axis !== "None") {
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {

                            fontSize: this.axisSettings.fontSize,
                            fontFamily: this.axisSettings.fontFamily,
                            bold: this.axisSettings.bold,
                            dateFormat: this.axisSettings.dateFormat
                        },
                        selector: null
                    });

                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            manualScale: this.axisSettings.manualScale

                        },
                        selector: null
                    });

                    if (this.axisSettings.manualScale) {

                        objectEnumeration.push({
                            objectName: objectName,
                            properties: {
                                barMin: this.axisSettings.barMin,
                                barMax: this.axisSettings.barMax
                            },
                            selector: null
                        });


                    }


                    if (this.axisSettings.dateFormat == "customJS") {
                        objectEnumeration.push({
                            objectName: objectName,
                            properties: {
                                customJS: this.axisSettings.customJS
                            },
                            selector: null
                        });

                    }
                }

                objectEnumeration.push({
                    objectName: objectName,
                    properties: {
                        manualScalePixel: this.axisSettings.manualScalePixel

                    },
                    selector: null
                });

                if (this.axisSettings.manualScalePixel) {

                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            customPixel: this.axisSettings.customPixel

                        },
                        selector: null
                    });
                }


                break


            case "dataPoint":
                for (let dataElement of this.viewModel.dataPoints) {//.sort((a, b) => (a.value > b.value) ? 1 : -1)) {
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: dataElement.label + " custom format",
                        properties: {
                            customFormat: dataElement.customFormat
                        },
                        selector: dataElement.selectionId.getSelector()
                    });



                    if (dataElement.customFormat) {
                        if (this.styleSettings.timelineStyle !== "minimalist") {
                            objectEnumeration.push({
                                objectName: objectName,
                                displayName: dataElement.label + " Text on top",
                                properties: {
                                    top: dataElement.top
                                },
                                selector: dataElement.selectionId.getSelector()
                            });

                            objectEnumeration.push({
                                objectName: objectName,
                                displayName: dataElement.label + " Text style",
                                properties: {
                                    annotationStyle: dataElement.annotationStyle
                                },
                                selector: dataElement.selectionId.getSelector()
                            });


                            objectEnumeration.push({
                                objectName: objectName,
                                displayName: dataElement.label + " Text orientation",
                                properties: {
                                    labelOrientation: dataElement.labelOrientation
                                },
                                selector: dataElement.selectionId.getSelector()
                            });


                            objectEnumeration.push({
                                objectName: objectName,
                                displayName: dataElement.label + " Custom Vertical Offset",
                                properties: {
                                    customVertical: dataElement.customVertical
                                },
                                selector: dataElement.selectionId.getSelector()
                            });

                            if (dataElement.customVertical) {
                                objectEnumeration.push({
                                    objectName: objectName,
                                    displayName: dataElement.label + " Vertical Offset in px",
                                    properties: {
                                        verticalOffset: dataElement.verticalOffset
                                    },
                                    selector: dataElement.selectionId.getSelector()
                                });
                            }

                        } else {

                            objectEnumeration.push({
                                objectName: objectName,
                                displayName: dataElement.label + " Icon Color",
                                properties: {
                                    iconColor: dataElement.iconColor
                                },
                                selector: dataElement.selectionId.getSelector()
                            });
                        }

                        objectEnumeration.push({
                            objectName: objectName,
                            displayName: dataElement.label + " Font Family",
                            properties: {
                                fontFamily: dataElement.fontFamily
                            },
                            selector: dataElement.selectionId.getSelector()
                        });

                        objectEnumeration.push({
                            objectName: objectName,
                            displayName: dataElement.label + " Text Size",
                            properties: {
                                textSize: dataElement.textSize
                            },
                            selector: dataElement.selectionId.getSelector()
                        });

                        objectEnumeration.push({
                            objectName: objectName,
                            displayName: dataElement.label + " Text Color",
                            properties: {
                                textColor: dataElement.textColor
                            },
                            selector: dataElement.selectionId.getSelector()
                        });



                    }
                }
                break;

            case "style":
                objectEnumeration.push({
                    objectName: objectName,
                    properties: {
                        timelineStyle: this.styleSettings.timelineStyle
                    },
                    selector: null
                });


                if (this.styleSettings.timelineStyle == "line") {
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            lineColor: this.styleSettings.lineColor,
                            lineThickness: this.styleSettings.lineThickness
                        },
                        selector: null
                    });

                } else if (this.styleSettings.timelineStyle == "bar") {
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            barColor: this.styleSettings.barColor,
                            barHt: this.styleSettings.barHt
                        },
                        selector: null
                    });
                } else if (this.styleSettings.timelineStyle == "minimalist") {
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            minimalistAxis: this.styleSettings.minimalistAxis,
                            iconsColor: this.styleSettings.iconsColor,
                            minimalistStyle: this.styleSettings.minimalistStyle,
                            minimalistConnect: this.styleSettings.minimalistConnect
                        },
                        selector: null
                    });

                    if (this.styleSettings.minimalistConnect) {
                        objectEnumeration.push({
                            objectName: objectName,
                            properties: {
                                connectColor: this.styleSettings.connectColor
                            },
                            selector: null
                        });
                    }

                    if (this.styleSettings.minimalistStyle !== "thinBar" && this.styleSettings.minimalistStyle !== "dot") {
                        objectEnumeration.push({
                            objectName: objectName,
                            properties: {
                                minimalistSize: this.styleSettings.minimalistSize
                            },
                            selector: null
                        });
                    }
                }


                objectEnumeration.push({
                    objectName: objectName,
                    properties: {
                        today: this.styleSettings.today
                    },
                    selector: null
                });


                if (this.styleSettings.today) {
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            todayColor: this.styleSettings.todayColor,
                            todayTop: this.styleSettings.todayTop
                        },
                        selector: null
                    });
                }
                break;
            case "imageSettings":
                objectEnumeration.push({
                    objectName: objectName,
                    properties: {
                        imagesHeight: this.imageSettings.imagesHeight,
                        imagesWidth: this.imageSettings.imagesWidth,
                        // style: this.imageSettings.style
                    },
                    selector: null
                });

                if (this.styleSettings.timelineStyle !== "minimalist" && this.styleSettings.timelineStyle !== "image") {
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {

                            style: this.imageSettings.style
                        },
                        selector: null
                    });

                }
                break;
            case 'download':
                objectEnumeration.push({
                    objectName: objectName,
                    properties: {
                        downloadCalendar: this.downloadSettings.downloadCalendar,
                    },
                    selector: null
                });

                if (this.downloadSettings.downloadCalendar) {
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            calendarName: this.downloadSettings.calendarName,
                            position: this.downloadSettings.position
                        },
                        selector: null
                    });
                }
                break;
        };

        return objectEnumeration;

    }


    // private getTextWidth(textString: string, textSize: number, fontFamily: string) {
    //   let textData = [textString]

    //   let textWidth

    //   //Measure text's width for correct positioning of annotation
    //   this.svg.append('g')
    //     .selectAll('.dummyText')
    //     .data(textData)
    //     .enter()
    //     .append("text")
    //     .attr("font-family", fontFamily)
    //     .attr("font-size", textSize)
    //     .text(function (d) { return d })
    //     // .each(function (d, i) {
    //     //   let thisWidth = this.getComputedTextLength()
    //     //   textWidth = thisWidth
    //     //   this.remove() // remove them just after displaying them
    //     // })
    //     .attr("color", function (d) {
    //       //Irrelevant color. ".EACH" does not work on IE and we need to iterate over the elements after they have been appended to dom.
    //       let thisWidth = this.getBBox().width
    //       textWidth = thisWidth
    //       // this.remove()
    //       if (this.parentNode) {
    //         this.parentNode.removeChild(this);
    //       }


    //       return "white"
    //     })
    //   return Math.min(textWidth, this.textSettings.wrap)
    // }

    private getAnnotationHeight(element: DataPoint) {
        //annotations config
        let annotationsData, makeAnnotations

        element.alignment = new DataPointAlignment();

        // element.alignment.note.align = orientation
        annotationsData = [{
            note: {
                wrap: this.textSettings.wrap,
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


        let anno = this.container
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
    private getTextHeight(textString: string, textSize: number, fontFamily: string, wrappedText: boolean) {
        let textData = [textString]

        let textHeight


        let txt = this.svg.append('g')
            .selectAll('.dummyText')
            .data(textData)
            .enter()
            .append("text")
            .attr("font-family", fontFamily)
            .attr("font-size", textSize)
            .text(function (d) { return d })
            .attr("y", 1)
            .attr("x", 1)
        if (wrappedText) {
            txt.call(wrap, this.textSettings.wrap)
        }
        txt.attr("color", function (d) {
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
    private getAnnotationOrientation(element: DataPoint) {
        if (element.textWidth + element.x > this.width - this.padding * 2) {
            return "right"
        } else {
            return "left"
        }

    }



}

function generateViewModel(options: VisualUpdateOptions, host: IVisualHost) {
    const dataViews = options.dataViews;
    const dataObjects = dataViews[0].metadata.objects;


    const viewModel: ViewModel = {
        dataPoints: [],
        settings: new Settings(dataObjects)
    };

    // If no data views, return early
    if (!dataViews || !dataViews[0] || !dataViews[0].categorical) {
        return viewModel;
    }

    let categoricalData: Record<string, powerbi.DataViewCategoryColumn> = {}

    dataViews[0].categorical.categories.forEach(category => {
        let categoryName = Object.keys(category.source.roles)[0]
        categoricalData[categoryName] = category
    })

    const category = categoricalData["label"]

    const labelData = categoricalData["label"].values
    const labelColumn = categoricalData["label"].source.displayName

    const dateData = categoricalData["date"].values
    const dateColumn = categoricalData["date"].source.displayName

    const linkData = categoricalData["link"] ? categoricalData["link"].values : false
    const linkColumn = categoricalData["link"] ? categoricalData["link"].source.displayName : false

    const descriptionData = categoricalData["description"] ? categoricalData["description"].values : false
    const descriptionColumn = categoricalData["description"] ? categoricalData["description"].source.displayName : false

    const imageData = categoricalData["image_url"] ? categoricalData["image_url"].values : false
    const imageColumn = categoricalData["image_url"] ? categoricalData["image_url"].source.displayName : false

    const dataLength = Math.min(dateData.length, labelData.length);
    for (let i = 0; i < dataLength; i++) {
        let element: DataPoint = new DataPoint();
        const selectionId = host.createSelectionIdBuilder()
            .withCategory(category, i)
            .createSelectionId();

        element.label = labelData[i] ? (labelData[i] as string).replace(/(\r\n|\n|\r)/gm, " ") : element.label;
        element.date = new Date(dateData[i] as any); //any because primitive can be a boolean
        element.URL = linkData[i] ? linkData[i] : element.URL;
        element.image = imageData[i] ? imageData[i] : element.image;
        element.description = descriptionData[i] ? descriptionData[i].replace(/(\r\n|\n|\r)/gm, " ") : element.description;
        element.labelColumn = labelColumn;
        element.dateColumn = dateColumn;
        element.descriptionColumn = descriptionColumn;

        element.selectionId = selectionId;
        element.dateAsInt = element.date.getTime();
        element.customFormat = getCategoricalObjectValue(category, i, 'dataPoint', 'customFormat', element.customFormat);
        element.fontFamily = getCategoricalObjectValue(category, i, 'dataPoint', 'fontFamily', element.fontFamily);
        element.textSize = getCategoricalObjectValue(category, i, 'dataPoint', 'textSize', element.textSize);
        element.textColor = getCategoricalObjectValue(category, i, 'dataPoint', 'textColor', { "solid": { "color": "black" } }).solid.color;
        element.iconColor = getCategoricalObjectValue(category, i, 'dataPoint', 'iconColor', { "solid": { "color": "black" } }).solid.color;
        element.top = getCategoricalObjectValue(category, i, 'dataPoint', 'top', element.top);
        element.customVertical = getCategoricalObjectValue(category, i, 'dataPoint', 'customVertical', element.customVertical);

        element.verticalOffset = getCategoricalObjectValue(category, i, 'dataPoint', 'verticalOffset', element.verticalOffset);

        element.annotationStyle = getCategoricalObjectValue(category, i, 'dataPoint', 'annotationStyle', element.annotationStyle);
        element.labelOrientation = getCategoricalObjectValue(category, i, 'dataPoint', 'labelOrientation', element.labelOrientation);

        if (element.date) {
            viewModel.dataPoints.push(element)
        }        
    }

    return viewModel;
}


/** Gets the settings value 
 * @param objects The powerbi.DataViewObjects
 * @param sectionKey The name/key of the parent settings section
 * @param settingKey The name/key of the specific setting in the parent section
 * @param defaultValue The defualt value for this setting
*/
export function getSettingsValue(objects: powerbi.DataViewObjects, sectionKey: string, settingKey: string, defaultValue: string | number | boolean | object) {

    //gets settings from global attributes in property pane.
    if (objects) {
        let object = objects[sectionKey];

        if (object) {

            let property = object[settingKey];
            if (property !== undefined) {

                return property;
            }
        }
    }
    return defaultValue;
}


export function getCategoricalObjectValue(
    category: powerbi.DataViewCategoryColumn,
    index: number,
    objectName: string,
    propertyName: string,
    defaultValue: any) {

    let categoryObjects = category.objects

    if (categoryObjects) {
        let categoryObject

        categoryObject = categoryObjects[index];

        if (categoryObject) {
            let object
            // if (category.categories) {
            object = categoryObject[objectName]


            if (object) {
                let property = object[propertyName];

                if (property !== undefined) {
                    return property;
                }
            }

        }
    }

    return defaultValue;
}


declare function require(name: string);


function createFormatter(format, precision?: any, value?: number) {
    let valueFormatter = {}
    valueFormatter["format"] = format;
    valueFormatter["value"] = value

    if (precision !== false) {
        valueFormatter["precision"] = precision
    }

    return vf.create(valueFormatter)
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


function wrapAndCrop(text, width) {
    text.each(function () {

        var text = d3.select(this),
            words = text.text().split(/\s+/).reverse(),
            word,
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
                line.pop();
                tspan.text(line.join(" ") + "...");

                break;
                // line = [word];
                // tspan = text.append("tspan")
                //   .attr("x", x)
                //   .attr("y", y)
                //   .attr("dy", ++lineNumber * lineHeight + dy + "em")
                //   .text(word);
            }
        }
    });

}

var BrowserText = (function () {
    var canvas = document.createElement('canvas'),
        context = canvas.getContext('2d');

    /**
     * Measures the rendered width of arbitrary text given the font size and font face
     * @param {string} text The text to measure
     * @param {number} fontSize The font size in pixels
     * @param {string} fontFace The font face ("Arial", "Helvetica", etc.)
     * @returns {number} The width of the text
     **/
    function getWidth(text, fontSize, fontFace) {
        context.font = fontSize + 'px ' + fontFace;
        return context.measureText(text).width;
    }

    return {
        getWidth: getWidth
    };
})();

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
    duration: {minutes: number};
}