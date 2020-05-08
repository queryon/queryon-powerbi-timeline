"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import { BlobBuilder } from "blob"
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
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


type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

export class Visual implements IVisual {

  private host: IVisualHost;
  private svg: Selection<SVGElement>;
  private container: Selection<SVGElement>;
  private padding: number;
  private width: number;
  private height: number;
  private barHeight: number;
  private marginTop: number;
  private finalMarginTop: number;
  private minVal: any;
  private maxVal: any;
  private viewModel: any;
  private selectionIdBuilder: ISelectionIdBuilder
  private selectionManager: ISelectionManager
  private tooltipServiceWrapper: ITooltipServiceWrapper;

  constructor(options: VisualConstructorOptions) {
    options.element.style["overflow"] = 'auto';
    this.svg = d3.select(options.element)
      .append('svg')
    this.container = this.svg.append("g")
    this.padding = 15;
    this.host = options.host
    this.selectionIdBuilder = this.host.createSelectionIdBuilder();
    this.selectionManager = this.host.createSelectionManager();
    this.tooltipServiceWrapper = createTooltipServiceWrapper(
      options.host.tooltipService,
      options.element);

  }

  public update(options: VisualUpdateOptions) {
    this.viewModel = visualTransform(options, this.host)
    //set empty canva
    this.container.selectAll("g").remove();
    this.container.selectAll("rect").remove();
    this.container.selectAll("image").remove();
    this.container.selectAll(".symbol").remove();
    this.container.selectAll("line").remove();
    this.container.selectAll("text").remove();
    this.container.selectAll("circle").remove();
    this.padding = 15;

    let data = this.viewModel.dataPoints

    //min label width from annotation plugin
    if (this.viewModel.settings.textSettings.wrap < 90) {
      this.viewModel.settings.textSettings.wrap = 90
    }

    let minFromData = d3.min(data, function (d: any) { return d.date })
    let maxFromData = d3.max(data, function (d: any) { return d.date })

    let imagesHeight = this.viewModel.settings.imageSettings.imagesHeight
    let imagesWidth = this.viewModel.settings.imageSettings.imagesWidth
    let spacing

    if (this.viewModel.settings.axisSettings.manualScale) {
      if (this.viewModel.settings.axisSettings.barMin && this.viewModel.settings.axisSettings.barMin != "") {
        let minFromInput = new Date(this.viewModel.settings.axisSettings.barMin)

        if (Object.prototype.toString.call(minFromInput) === '[object Date]' && !isNaN(minFromInput.getTime())) {
          this.minVal = minFromInput
        }
      }

      if (this.viewModel.settings.axisSettings.barMax && this.viewModel.settings.axisSettings.barMax != "") {
        let maxFromInput = new Date(this.viewModel.settings.axisSettings.barMax)

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

      this.viewModel.settings.axisSettings.barMin = false;
      this.viewModel.settings.axisSettings.barMax = false;
    }

    let today
    if (this.viewModel.settings.style.today) {
      today = new Date
      if (today < this.minVal) {
        this.minVal = today
      }

      if (today > this.maxVal) {
        this.maxVal = today
      }
    }

    if (!this.viewModel.settings.axisSettings.manualScalePixel || !this.viewModel.settings.axisSettings.customPixel || isNaN(this.viewModel.settings.axisSettings.customPixel)) {
      this.width = options.viewport.width;
    } else {
      this.width = this.viewModel.settings.axisSettings.customPixel
    }

    this.height = options.viewport.height;
    this.marginTop = 10;
    this.barHeight = this.viewModel.settings.style.barHeight;
    let marginTopStagger = 20;
    let svgHeightTracking, finalHeight, needScroll = false;

    //Parse global formats
    let textSize = this.viewModel.settings.textSettings.textSize,
      fontFamily = this.viewModel.settings.textSettings.fontFamily,
      textColor = this.viewModel.settings.textSettings.textColor.solid.color,
      top = this.viewModel.settings.textSettings.top,
      labelOrientation = this.viewModel.settings.textSettings.labelOrientation,
      annotationStyle = this.viewModel.settings.textSettings.annotationStyle

    //date formatting
    let format, valueFormatter
    if (this.viewModel.settings.textSettings.dateFormat === "same") {
      options.dataViews[0].categorical.categories.forEach(category => {
        let categoryName = Object.keys(category.source.roles)[0]
        if (categoryName == "date") {
          format = category.source.format
        }
      })
    } else {
      format = this.viewModel.settings.textSettings.dateFormat != "customJS" ? this.viewModel.settings.textSettings.dateFormat : this.viewModel.settings.textSettings.customJS
    }
    valueFormatter = createFormatter(format);

    //sort so staggering works in right order
    // data = data.sort((a, b) => (a.date > b.date) ? 1 : -1)

    let filteredData

    //filter data out of axis range, reverse order if axis is in decremental order
    if (this.minVal > this.maxVal) {
      filteredData = data.filter(element => element.date <= this.minVal && element.date >= this.maxVal)
      // data.reverse() //removed reverse so user can do their own sorting
    } else {
      filteredData = data.filter(element => element.date >= this.minVal && element.date <= this.maxVal)
    }

    //stablish image margin addition 
    let addToMargin = 0
    if (this.viewModel.settings.imageSettings.style == "alternate") {
      addToMargin = (imagesHeight * 2) + 20
    } else if (this.viewModel.settings.imageSettings.style == "straight") {
      addToMargin = imagesHeight + 20
    }

    let maxOffsetTop = 0, maxOffsetBottom = 0

    filteredData.forEach((dataPoint, i) => {
      dataPoint["formatted"] = valueFormatter.format(dataPoint["date"])
      dataPoint["labelText"] = this.viewModel.settings.imageSettings.style != "image" ? `${dataPoint["formatted"]}${this.viewModel.settings.textSettings.separator} ${dataPoint["label"]}` : dataPoint["label"]
      dataPoint["textColor"] = dataPoint.customFormat ? dataPoint.textColor : textColor
      dataPoint["fontFamily"] = dataPoint.customFormat ? dataPoint.fontFamily : fontFamily
      dataPoint["textSize"] = dataPoint.customFormat ? dataPoint.textSize : textSize
      dataPoint["top"] = dataPoint.customFormat ? dataPoint.top : top
      dataPoint["labelOrientation"] = dataPoint.customFormat ? dataPoint.labelOrientation : labelOrientation
      dataPoint["annotationStyle"] = dataPoint.customFormat ? dataPoint.annotationStyle : annotationStyle
      dataPoint["textWidth"] = this.getTextWidth(dataPoint["labelText"], dataPoint["textSize"], fontFamily)
      dataPoint["textHeight"] = this.getTextHeight(dataPoint["labelText"], dataPoint["textSize"], fontFamily, true) + 3

      //increment text height (for calculation) with description height
      if (dataPoint.description) {
        dataPoint["textHeight"] += this.getTextHeight(dataPoint["description"], dataPoint["textSize"], fontFamily, true) + 2
      }

      //increment image height on staggered image view
      if (dataPoint.image && (this.viewModel.settings.imageSettings.style == "default")){// || this.viewModel.settings.imageSettings.style == "image")) {
        dataPoint["textHeight"] += (imagesHeight + 2)

      }

      //add heights to margin conditionally:
      if (this.viewModel.settings.style.timelineStyle !== "minimalist") {


        if (!spacing || spacing < dataPoint["textHeight"]) {
          spacing = dataPoint["textHeight"]
        }

        if (this.viewModel.settings.imageSettings.style !== "image") {
          if (dataPoint["top"]) {
            this.marginTop = Math.max(this.marginTop, dataPoint["textHeight"] + 30)

            if (dataPoint.customVertical) {
              maxOffsetTop = Math.max(maxOffsetTop, dataPoint.verticalOffset)
            }
          } else {
            if (dataPoint.customVertical) {
              maxOffsetBottom = Math.max(maxOffsetBottom, dataPoint.verticalOffset)
            }
            //add to margin case text is bottom and image is on top (alternate and straight styles)
            if (dataPoint.image) {
              this.marginTop = Math.max(this.marginTop, addToMargin)
            }
          }

        }
      }
      else {
        //if minimalist, disconsider margin and spacing is default to one line 
        spacing = this.getTextHeight(dataPoint["labelText"], dataPoint["textSize"], fontFamily, false) + 3
      }

    })


    if (this.viewModel.settings.textSettings.annotationStyle === 'annotationCallout' || this.viewModel.settings.textSettings.annotationStyle === 'annotationCalloutCurve') {
      //annotation styles that add to text height, increment spacing
      spacing += 10
    }

    //work around not limiting minimum spacing
    if (this.viewModel.settings.textSettings.autoStagger || !this.viewModel.settings.textSettings.spacing) {
      this.viewModel.settings.textSettings.spacing = spacing
      this.host.persistProperties({
        merge: [{
          objectName: 'textSettings',
          selector: null,
          properties: { spacing: spacing }
        }]
      });
    }

    marginTopStagger += ((filteredData.filter(element => element.top).length) * this.viewModel.settings.textSettings.spacing) + 20

    //case margintopstagger wasn't incremented - no top staggered items:
    marginTopStagger = Math.max(this.marginTop, marginTopStagger)


    if (this.viewModel.settings.imageSettings.style !== "default" && filteredData.filter(el => !el.top && el.image).length > 0) {
      marginTopStagger = Math.max(marginTopStagger, addToMargin)
    }

    //define "official" margin top to start drawing graph
    if (this.viewModel.settings.imageSettings.style !== "image") {
      this.finalMarginTop = !this.viewModel.settings.textSettings.stagger || this.viewModel.settings.style.timelineStyle == "minimalist" ? this.marginTop : marginTopStagger

      if (this.viewModel.settings.style.timelineStyle != "minimalist" && filteredData.filter(el => el.top & el.customVertical).length > 0) {
        //case user input offset is > than margin
        this.finalMarginTop = Math.max(this.finalMarginTop, maxOffsetTop + this.viewModel.settings.textSettings.spacing)
      }


    } else {
      this.finalMarginTop = 50 + imagesHeight / 2
    }



    //download calendar icon is enabled and positioned at top
    if (this.viewModel.settings.download.downloadCalendar && this.viewModel.settings.download.position.split(",")[0] == "TOP") {
      this.finalMarginTop += 35
    }



    //axis format
    let axisFormat = this.viewModel.settings.axisSettings.dateFormat != "customJS" ? this.viewModel.settings.axisSettings.dateFormat : this.viewModel.settings.axisSettings.customJS
    let axisValueFormatter = axisFormat == "same" ? valueFormatter : createFormatter(axisFormat);

    //increment padding based on image
    if (filteredData.filter(el => el.image).length > 0) {
      let dynamicPadding = Math.max(this.padding, imagesWidth / 2)
      this.padding = dynamicPadding
    }

    //increment padding based on values on axis
    if (this.viewModel.settings.axisSettings.axis === "Values" || this.viewModel.settings.style.timelineStyle == "minimalist") {
      let dynamicPadding = Math.max(this.padding, 30)
      this.padding = dynamicPadding
    }

    //increment padding in case scroll bar 
    if (this.finalMarginTop > this.height) {
      this.padding = Math.max(this.padding, 30)
    }

    let scale = d3.scaleTime()
      .domain([this.minVal, this.maxVal]) //min and max data 
      .range([0, this.width - (this.padding * 2)]); //min and max width in px           


    if (this.viewModel.settings.imageSettings.style !== "image") {
      //all styles, not image focus:
      let bar, axisMarginTop, enabledAnnotations, strokeColor, width, axisPadding


      this.svg.attr("width", this.width - 4);
      switch (this.viewModel.settings.style.timelineStyle) {
        case "line":
          axisMarginTop = this.finalMarginTop;
          enabledAnnotations = true;
          axisPadding = this.padding;
          strokeColor = this.viewModel.settings.axisSettings.axisColor.solid.color

          // svgHeightTracking = this.height
          svgHeightTracking = this.finalMarginTop + 20

          if (this.viewModel.settings.textSettings.stagger) {
            svgHeightTracking += (filteredData.filter(el => !el.top).length) * this.viewModel.settings.textSettings.spacing + 20
          } else {
            svgHeightTracking += this.viewModel.settings.textSettings.spacing
          }

          if (filteredData.filter(el => el.top && el.image).length > 0) {
            svgHeightTracking = Math.max(svgHeightTracking, axisMarginTop + addToMargin)
          }

          
          svgHeightTracking = Math.max(svgHeightTracking, axisMarginTop + maxOffsetBottom + this.viewModel.settings.textSettings.spacing)
          
          if (svgHeightTracking > this.height) {
            this.width -= 20
          }
          width = this.width
          

          bar = this.container.append("line")
            .attr("x1", this.padding)
            .attr("y1", this.finalMarginTop)
            .attr("x2", this.width - this.padding)
            .attr("y2", this.finalMarginTop)
            .attr("stroke-width", this.viewModel.settings.style.lineThickness)
            .attr("stroke", this.viewModel.settings.style.lineColor.solid.color);
          break;

        case "bar":
          axisMarginTop = this.finalMarginTop
          enabledAnnotations = true;
          strokeColor = "transparent"
          axisPadding = this.padding;
          svgHeightTracking = this.finalMarginTop + this.barHeight + 20;

          if (this.viewModel.settings.textSettings.stagger) {
            svgHeightTracking += (filteredData.filter(el => !el.top).length + 1) * this.viewModel.settings.textSettings.spacing
          } else {
            svgHeightTracking += this.viewModel.settings.textSettings.spacing
          }

          if (filteredData.filter(el => el.top && el.image).length > 0) {
            svgHeightTracking = Math.max(svgHeightTracking, axisMarginTop + this.barHeight + addToMargin)
          }

          svgHeightTracking = Math.max(svgHeightTracking, axisMarginTop + this.barHeight + maxOffsetBottom + this.viewModel.settings.textSettings.spacing)

          if (svgHeightTracking > this.height) {
            this.width -= 20
          }
          width = this.width

          bar = this.container.append('rect')
            .attr('width', this.width)
            .attr('x', 0)//this.padding)
            .attr('fill', this.viewModel.settings.style.barColor.solid.color)
            .attr('y', this.finalMarginTop)
            .attr('height', this.barHeight)
          bar.exit().remove()
          break;

        case "minimalist":
          enabledAnnotations = false;

          axisMarginTop = 10 + this.finalMarginTop + this.viewModel.settings.textSettings.spacing * (filteredData.length)
          svgHeightTracking = axisMarginTop + 30


          if (axisMarginTop > this.height) {
           this.width -= 20
            needScroll = true
            axisMarginTop = this.height - 40
          }

          if (this.viewModel.settings.download.downloadCalendar && this.viewModel.settings.download.position.split(",")[0] == "TOP") {
            axisMarginTop += 35
            svgHeightTracking += 35
          }
          strokeColor = this.viewModel.settings.axisSettings.axisColor.solid.color

          //split screen for minimalist view
          let newWidth = (this.width * 0.70)
          axisPadding = this.width - newWidth - this.padding;

          //re-do scale
          scale = d3.scaleTime()
            .domain([this.minVal, this.maxVal]) //min and max data 
            .range([0, newWidth]); //min and max width in px    


          //append points and annotations
          let textLateral = this.container.selectAll(".text-lateral")
            .data(filteredData)

          textLateral.exit().remove();

          var enter = textLateral.enter()
            .append("g").attr("class", "text-lateral");


          enter.append("text")
            .attr("x", 0)
            .attr("y", (element, i) => {
              let result = 10 + this.marginTop + this.viewModel.settings.textSettings.spacing * i
              if (this.viewModel.settings.download.downloadCalendar && this.viewModel.settings.download.position.split(",")[0] == "TOP") {
                result += 35
              }
              return result
            })
            .attr('font-family', element => element["fontFamily"])
            .attr('font-size', element => element["textSize"])

            .attr("id", (element) => element["selectionId"])
            .text(element => element["label"])
            .call(wrapAndCrop, this.width - newWidth - (this.padding * 2))
            .attr('class', element => `annotation_selector_${element["selectionId"].key.replace(/\W/g, '')} annotationSelector`)
            .on('click', element => {

              //manage highlighted formating and open links
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

          if (this.viewModel.settings.textSettings.boldTitles) {
            enter.attr("font-weight", "bold")
          }

          textLateral = textLateral.merge(enter);

          let minIcons = this.container.selectAll(".min-icons")
            .data(filteredData)
          minIcons.exit().remove();

          let enterIcons, shapeSize = 8

          //Add dots
          if (this.viewModel.settings.style.minimalistStyle !== "thinBar") {
            let size = 150 / this.viewModel.settings.style.minimalistSize
            let shapeOptions = {
              "diamond": d3.symbol().type(d3.symbolDiamond).size(size),
              "circle": d3.symbol().type(d3.symbolCircle).size(size),
              "square": d3.symbol().type(d3.symbolSquare).size(size),
              "dot": d3.symbol().type(d3.symbolCircle).size(10),
            }


            enterIcons = minIcons.enter()
              .append("g").attr("class", "min-icons");
            enterIcons.append('path')
              .attr("d", shapeOptions[this.viewModel.settings.style.minimalistStyle])
              .attr("transform", (element, i) => {
                let pointY = 10 + (this.marginTop + this.viewModel.settings.textSettings.spacing * i) - shapeSize
                if (this.viewModel.settings.download.downloadCalendar && this.viewModel.settings.download.position.split(",")[0] == "TOP") {
                  pointY += 35
                }
                return "translate(" + (axisPadding + scale(element["date"]) - shapeSize) + "," + pointY + ") rotate(180)"
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
              .attr("x", element => axisPadding + scale(element["date"]) - shapeSize)
              .attr("y", (element, i) => {
                let y = 10 + (this.marginTop + this.viewModel.settings.textSettings.spacing * i) - shapeSize
                if (this.viewModel.settings.download.downloadCalendar && this.viewModel.settings.download.position.split(",")[0] == "TOP") {
                  y += 35
                }
                return y
              })
              .attr("width", 2)
              .attr("height", this.viewModel.settings.textSettings.spacing)
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
            .style("fill", element => element["textColor"]);
          break;
      }

      finalHeight = Math.max(this.height - 4, svgHeightTracking)

      if (this.viewModel.settings.download.downloadCalendar) {
        // finalHeight += 35
      }
      this.svg.attr("height", finalHeight);

      //axis setup

      if (axisMarginTop) {
        let x_axis = d3.axisBottom(scale)
          .tickFormat(d => {
            return axisValueFormatter.format(new Date(<any>d))
          })


        let sandBox: any = d3.select('#sandbox-host')
        //Append group and insert axis
        let axisSVG = this.container.append("g")
          .attr("transform", "translate(" + axisPadding + "," + (needScroll ? axisMarginTop + sandBox.property("scrollTop") : axisMarginTop) + ")")
          .call(x_axis)
          .attr('class', 'axis')

          .attr('style', `color :${this.viewModel.settings.axisSettings.axisColor.solid.color}`)
          .attr('style', `stroke :${this.viewModel.settings.axisSettings.axisColor.solid.color}`)

        this.container.selectAll('path, line')
          .attr('style', `color :${strokeColor}`)

        if (this.viewModel.settings.axisSettings.bold) {
          this.container.classed("xAxis", false);
        } else {
          this.container.attr('class', 'xAxis')
        }

        if (this.viewModel.settings.axisSettings.axis === "None") {
          this.container.selectAll(".axis text").remove()
        }
        else {
          this.container.selectAll(".axis text").style('font-size', this.viewModel.settings.axisSettings.fontSize)
          this.container.selectAll(".axis text").style('fill', this.viewModel.settings.axisSettings.axisColor.solid.color)
          this.container.selectAll(".axis text").style('font-family', this.viewModel.settings.axisSettings.fontFamily)

        }

        if (needScroll) {
          //on scroll event delete and re-write axis on better position

          sandBox.on("scroll", (e) => {
            let firstXForm = axisSVG.property("transform").baseVal.getItem(0)
            axisSVG.remove()
            //Append group and insert axis
            axisSVG = this.container.append("g")
              .attr("transform", "translate(" + axisPadding + "," + (axisMarginTop + sandBox.property("scrollTop")) + ")")
              .call(x_axis)
              .attr('class', 'axis')

              .attr('style', `color :${this.viewModel.settings.axisSettings.axisColor.solid.color}`)
              .attr('style', `stroke :${this.viewModel.settings.axisSettings.axisColor.solid.color}`)

            this.container.selectAll('path, line')
              .attr('style', `color :${strokeColor}`)

            if (this.viewModel.settings.axisSettings.bold) {
              this.container.classed("xAxis", false);
            } else {
              this.container.attr('class', 'xAxis')
            }

            if (this.viewModel.settings.axisSettings.axis === "None") {
              this.container.selectAll(".axis text").remove()
            }
            else {
              this.container.selectAll(".axis text").style('font-size', this.viewModel.settings.axisSettings.fontSize)
              this.container.selectAll(".axis text").style('fill', this.viewModel.settings.axisSettings.axisColor.solid.color)
              this.container.selectAll(".axis text").style('font-family', this.viewModel.settings.axisSettings.fontFamily)

            }
            // }

            // Setting
            // axisSVG.attr("transform", "translate(" + axisPadding + "," + (this.height - sandBox.property("scrollTop")) + ")")


          })
        }

      }
      //append today icon
      if (this.viewModel.settings.style.today) {
        let todayIcon = this.container
          .append('path')
          .attr("d", d3.symbol().type(d3.symbolTriangle).size(150))
          .attr("class", "symbol today-symbol")
          .attr("transform", (d) => {
            let transformStr, todayIconY,
              todayMarginTop = axisMarginTop ? axisMarginTop : this.finalMarginTop,
              todayPadding = axisPadding ? axisPadding : this.padding

            if (this.viewModel.settings.style.todayTop) {
              todayIconY = todayMarginTop - 12
              transformStr = "translate(" + (todayPadding + scale(today)) + "," + (todayIconY) + ") rotate(180)"
            } else {
              todayIconY = this.viewModel.settings.style.timelineStyle == "bar" ? todayMarginTop + 12 + this.barHeight : todayMarginTop + 12

              transformStr = "translate(" + (todayPadding + scale(today)) + "," + (todayIconY) + ")"
            }

            return transformStr
          })
          .style("fill", this.viewModel.settings.style.todayColor.solid.color);

      }

      if (enabledAnnotations) {
        //annotations config
        let annotationsData, makeAnnotations
        let countTop = -1, countBottom = -1, counter

        // let countTop = 1, countBottom = 1, counter
        let imgCountTop = 0, imgCountBottom = 0, imgCounter

        // let pixelWidth = (this.width - this.padding * 2) / data.length

        filteredData.forEach((element, i) => {
          let orientation
          if (element.top) {
            countTop++;
            counter = countTop
          } else {
            countBottom++;
            counter = countBottom
          }

          element["x"] = this.padding + scale(element["date"])

          if (!element.customVertical) {
            if (this.viewModel.settings.textSettings.stagger) {
              if (counter > 0) {
                element["dy"] = element.top ? this.viewModel.settings.textSettings.spacing * (-1 * (counter)) - 20 : this.viewModel.settings.textSettings.spacing * (counter) + 20

              } else {
                element["dy"] = element.top ? -20 : 20
              }
              // element["dy"] = element.top ? this.viewModel.settings.textSettings.spacing * (-1 * countTop) : this.viewModel.settings.axisSettings.axis === "None" ? this.viewModel.settings.textSettings.spacing * countBottom : this.viewModel.settings.textSettings.spacing * countBottom + 20;
            }
            else {
              element["dy"] = element.top ? -20 : 20
            }

            if (this.viewModel.settings.axisSettings.axis != "None" && this.viewModel.settings.style.timelineStyle !== "bar" && !element.top) {
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

          element["alignment"] = {
            "className": "custom",
            "connector": { "end": "dot" },
            "note": { "align": "dynamic" }
          }

          element.alignment.note.align = orientation
          annotationsData = [{
            note: {
              wrap: this.viewModel.settings.textSettings.wrap,
              title: element.labelText,
              label: element.description,
              bgPadding: 0
            },
            x: element["x"],
            y: this.viewModel.settings.style.timelineStyle == "bar" && !element.top ? this.finalMarginTop + this.barHeight : this.finalMarginTop,
            dy: element["dy"],
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
            .type(new svgAnnotations.annotationCustomType(element.type, element.alignment))

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

            switch (this.viewModel.settings.imageSettings.style) {
              case "default":
                imageY = !element.top ? (this.finalMarginTop + element.dy) + element.textHeight - imagesHeight : (this.finalMarginTop + element.dy) - element.textHeight - 5


                if (this.viewModel.settings.style.timelineStyle == "bar" && !element.top) { imageY += this.barHeight }

                if (orientation == "middle") { imageX = element.x - (imagesWidth / 2) }
                else if (orientation == "left") { imageX = element.x }
                else { imageX = element.x - imagesWidth }
                break;

              case "straight":
                imageY = element.top ? this.finalMarginTop + 20 : this.finalMarginTop - 20 - imagesHeight

                if (this.viewModel.settings.style.timelineStyle == "bar" && element.top) { imageY += this.barHeight }
                break;

              // case "image":
              //   imageY = this.finalMarginTop - imagesHeight / 2
              //   imageX = element.x

              //   break;

              default:
                imageY = element.top ? this.finalMarginTop + 20 : 0
                if (this.viewModel.settings.download.downloadCalendar && this.viewModel.settings.download.position.split(",")[0] == "TOP") {
                  imageY += 35
                }
                if (imgCounter % 2 == 0) {
                  imageY += imagesHeight
                }

                if (this.viewModel.settings.style.timelineStyle == "bar" && element.top) { imageY += this.barHeight }

                break;

            }


            imageX = !imageX ? element.x - (imagesWidth / 2) : imageX


            if (this.viewModel.settings.imageSettings.style != "default") {
              let connector = this.container.append("line")
                .attr("x1", element.x)
                .attr("y1", this.finalMarginTop)
                .attr("x2", element.x)
                .attr("y2", element.top ? imageY : imageY + imagesHeight)
                .attr("stroke-width", 1)
                .attr("stroke", element.textColor);
            }

            let image = this.container.append('image')
              .attr('xlink:href', element.image)
              .attr('width', imagesWidth)
              .attr('height', imagesHeight)
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
            .attr('class', `annotation_selector_${element.selectionId.key.replace(/\W/g, '')} annotationSelector`)
            .style('font-size', element.textSize + "px")
            .style('font-family', element.fontFamily)
            .style('background-color', 'transparent')
            .call(makeAnnotations)
            .on('click', el => {
              //manage highlighted formating and open links
              this.selectionManager.select(element.selectionId).then((ids: ISelectionId[]) => {
                if (ids.length > 0) {
                  // this.container.selectAll('.bar').style('fill-opacity', 0.1)
                  d3.select(`.selector_${element.selectionId.key.replace(/\W/g, '')}`).style('fill-opacity', 1)
                  this.container.selectAll('.annotationSelector').style('font-weight', "normal")

                  if (!this.viewModel.settings.textSettings.boldTitles) {
                    this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
                  }

                  d3.selectAll(`.annotation_selector_${element.selectionId.key.replace(/\W/g, '')}`).style('font-weight', "bold")
                  d3.selectAll(`.annotation_selector_${element.selectionId.key.replace(/\W/g, '')}  .annotation-note-title `).style('font-weight', "bold")


                  //Open link 
                  if (element.URL) {
                    this.host.launchUrl(element.URL)
                  }

                } else {
                  // this.container.selectAll('.bar').style('fill-opacity', 1)
                  this.container.selectAll('.annotationSelector').style('font-weight', "normal")

                  if (!this.viewModel.settings.textSettings.boldTitles) {
                    this.container.selectAll('.annotationSelector .annotation-note-title').style('font-weight', "normal")
                  }
                }

              })
            })
        })
      }
    }
    else { //image focus config:    
      this.padding = 15
      let annotationsData, makeAnnotations, dateStyle, dateType, datesData, makeDates
      let countTop = 0, countBottom = 0, counter
      let imgCountTop = 0, imgCountBottom = 0, imgCounter

      finalHeight = this.finalMarginTop + (imagesHeight / 2 + 20) + spacing //+ 100
      if (this.viewModel.settings.download.downloadCalendar && this.viewModel.settings.download.position.split(",")[0] !== "TOP") {
        finalHeight += 35
      }
      this.width = Math.max(filteredData.filter(el => el.image).length * (imagesWidth + 10), this.width - 4)

      this.svg.attr("height", finalHeight);
      this.svg.attr("width", this.width);

      filteredData.forEach((element, i) => {
        let orientation
        if (element.top) {
          countTop++;
          counter = countTop
        } else {
          countBottom++;
          counter = countBottom
        }


        element["x"] = i == 0 ? this.padding : this.padding + ((imagesWidth + 10) * i)
        element["dy"] = imagesHeight / 2 + 10
        orientation = "left"


        element["alignment"] = {
          "className": "custom",
          "connector": { "end": "dot" },
          "note": { "align": "dynamic" }
        }
        element.alignment.note.align = orientation

        if (this.viewModel.settings.axisSettings.axis == "Values") {
          dateStyle = svgAnnotations['annotationLabel']
          dateType = new svgAnnotations.annotationCustomType(
            dateStyle,
            element.alignment
          )


          datesData = [{
            note: {
              wrap: this.viewModel.settings.textSettings.wrap,
              title: axisValueFormatter.format(element.date),
              bgPadding: 0
            },
            x: element["x"],
            y: this.finalMarginTop,
            dy: element["dy"] * -1,
            color: this.viewModel.settings.axisSettings.axisColor.solid.color
          }]

          makeDates = svgAnnotations.annotation()
            .annotations(datesData)
            .type(new svgAnnotations.annotationCustomType(dateType, element.alignment))

          makeDates
            .disable(["connector"])

          let newAxis = this.container
            .append("g")
            .style('font-size', this.viewModel.settings.axisSettings.fontSize + "px")
            .style('font-family', this.viewModel.settings.axisSettings.fontFamily)
            .style('background-color', 'transparent')
            .call(makeDates)


          if (this.viewModel.settings.axisSettings.bold) {
            newAxis.attr('class', 'bold')
            newAxis.classed('notBold', false)
          } else {
            newAxis.attr('class', 'notBold')
            newAxis.classed('bold', false)
          }

        }

        element["alignment"] = {
          "className": "custom",
          "connector": { "end": "dot" },
          "note": { "align": "dynamic" }
        }

        element.alignment.note.align = orientation
        annotationsData = [{
          note: {
            wrap: this.viewModel.settings.textSettings.wrap,
            title: element.labelText,
            label: element.description,
            bgPadding: 0
          },
          x: element["x"],
          y: this.finalMarginTop,
          dy: element["dy"],
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
          .type(new svgAnnotations.annotationCustomType(element.type, element.alignment))


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

          let imageY = this.finalMarginTop - imagesHeight / 2
          let imageX = element.x

          let image = this.container.append('image')
            .attr('xlink:href', element.image)
            .attr('width', imagesWidth)
            .attr('height', imagesHeight)
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
          .attr('class', `annotation_selector_${element.selectionId.key.replace(/\W/g, '')} annotationSelector`)
          .style('font-size', element.textSize + "px")
          .style('font-family', element.fontFamily)
          .style('background-color', 'transparent')
          .call(makeAnnotations)
          .on('click', el => {
            this.selectionManager.select(element.selectionId).then((ids: ISelectionId[]) => {
              if (ids.length > 0) {
                // this.container.selectAll('.bar').style('fill-opacity', 0.1)
                d3.select(`.selector_${element.selectionId.key.replace(/\W/g, '')}`).style('fill-opacity', 1)
                this.container.selectAll('.annotationSelector').style('font-weight', "normal")

                if (!this.viewModel.settings.textSettings.boldTitles) {
                  this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
                }

                d3.selectAll(`.annotation_selector_${element.selectionId.key.replace(/\W/g, '')}`).style('font-weight', "bold")
                d3.selectAll(`.annotation_selector_${element.selectionId.key.replace(/\W/g, '')}  .annotation-note-title `).style('font-weight', "bold")

                //Open link 
                if (element.URL) {
                  this.host.launchUrl(element.URL)
                }


              } else {
                // this.container.selectAll('.bar').style('fill-opacity', 1)
                this.container.selectAll('.annotationSelector').style('font-weight', "normal")
                if (!this.viewModel.settings.textSettings.boldTitles) {
                  this.container.selectAll('.annotationSelector .annotation-note-title').style('font-weight', "normal")
                }
              }

            })
          })
      })
    }

    //remove default bold if bold titles is off
    if (!this.viewModel.settings.textSettings.boldTitles) {
      this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
    }


    //Handle context menu - right click
    this.container.on('contextmenu', () => {
      const mouseEvent: MouseEvent = d3.event as MouseEvent;
      const eventTarget: EventTarget = mouseEvent.target;
      let dataPoint: any = d3.select(<Element>eventTarget).datum();
      this.selectionManager.showContextMenu(dataPoint ? dataPoint.selectionId : {}, {
        x: mouseEvent.clientX,
        y: mouseEvent.clientY
      });
      mouseEvent.preventDefault();
    });

    //Handles click on/out bar
    this.svg.on('click', () => {
      // console.log("test")
      const mouseEvent: MouseEvent = d3.event as MouseEvent;
      const eventTarget: EventTarget = mouseEvent.target;
      let dataPoint: any = d3.select(<Element>eventTarget).datum();
      if (dataPoint) {

        // this.selectionManager.select(dataPoint.selectionId).then((ids: ISelectionId[]) => {
        //   if (ids.length > 0) {
        //     console.log(dataPoint)
        //     // d3.select(<Element>eventTarget).style('fill-opacity', 1)
        //     this.container.selectAll('.annotationSelector').style('font-weight', "normal")
        //     d3.select(` annotation_selector_${dataPoint.selectionId.key.replace(/\W/g, '')}`).style('font-weight', "bold")
        //     // d3.select(`.annotation_selector_${dataPoint.label.replace(/\W/g, '')}_${dataPoint.dateAsInt}`).style('font-weight', "bold")

        //   } else {

        //     console.log("no ids", dataPoint)

        //     this.container.selectAll('.annotationSelector').style('font-weight', "normal")
        //     this.container.selectAll('.minIconSelector').style('opacity', 1)
        //     this.container.selectAll('.annotationSelector').style('opacity', 1)


        //   }
        // })
      } else {
        // console.log("no datapoint")
        this.selectionManager.clear().then(() => {
          if (this.viewModel.settings.style.timelineStyle == "minimalist") {
            d3.selectAll('.annotationSelector').style('opacity', 1)
            d3.selectAll('.minIconSelector').style('opacity', 1)
          } else {
            this.container.selectAll('.annotationSelector').style('font-weight', "normal")

            if (!this.viewModel.settings.textSettings.boldTitles) {
              this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
            }
          }
        })
      }

    });


    this.svg.on('mouseover', el => {

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
    })



    if (this.viewModel.settings.download.downloadCalendar) {

      const ics = require('ics')
      let orientationVertical = this.viewModel.settings.download.position.split(",")[0]
      let orientationHorizontal = this.viewModel.settings.download.position.split(",")[1]
      let calX
      if (orientationHorizontal == "LEFT") {
        calX = 2
      } else {
        calX = this.width - 35
        if (this.viewModel.settings.style.timelineStyle == "minimalist") {
          calX -= 20
        }
      }
      let calY = orientationVertical == "TOP" ? 2 : finalHeight - 35

      // let calY = orientationVertical == "TOP" ? 2 : this.height - 55 //increased case there's a scrollbar

      //append download icon
      let image = this.container.append('image')
        .attr('xlink:href', "https://queryon.com/wp-content/uploads/2020/04/time-and-date.png")
        .attr('width', 30)
        .attr('height', 30)
        .attr('x', calX)
        .attr('y', calY)
        .on("click", () => {
          let events = []
          filteredData.forEach(el => {
            let startTime = [el.date.getFullYear(), el.date.getMonth() + 1, el.date.getDate(), el.date.getHours(), el.date.getMinutes()];

            events.push({
              title: el.label,
              description: el.description,
              // startInputType: 'utc',
              start: startTime,
              duration: { minutes: 30 }
            })

            if (error) {
              // console.log(error)
              return
            }
          })

          const { error, value } = ics.createEvents(events)

          if (error) {
            console.log(error)
            return
          }

          var blob;

          blob = new Blob([value]);

          FileSaver.saveAs(blob, `${this.viewModel.settings.download.calendarName != "" ? this.viewModel.settings.download.calendarName : 'calendar'}.ics`);
        });
    }



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

        if (this.viewModel.settings.style.timelineStyle !== "minimalist") {
          objectEnumeration.push({
            objectName: objectName,
            properties: {
              stagger: this.viewModel.settings.textSettings.stagger
            },
            selector: null
          });

          if (this.viewModel.settings.textSettings.stagger) {

            objectEnumeration.push({
              objectName: objectName,
              properties: {
                autoStagger: this.viewModel.settings.textSettings.autoStagger
              },
              selector: null
            });

            if (!this.viewModel.settings.textSettings.autoStagger) {

              objectEnumeration.push({
                objectName: objectName,
                properties: {
                  spacing: this.viewModel.settings.textSettings.spacing
                },
                selector: null
              });

            }


          }

          objectEnumeration.push({
            objectName: objectName,
            properties: {
              separator: this.viewModel.settings.textSettings.separator,
              wrap: this.viewModel.settings.textSettings.wrap,
              labelOrientation: this.viewModel.settings.textSettings.labelOrientation,
              annotationStyle: this.viewModel.settings.textSettings.annotationStyle,
              top: this.viewModel.settings.textSettings.top,
              boldTitles: this.viewModel.settings.textSettings.boldTitles,
              fontFamily: this.viewModel.settings.textSettings.fontFamily,
              textSize: this.viewModel.settings.textSettings.textSize,
              textColor: this.viewModel.settings.textSettings.textColor,
              dateFormat: this.viewModel.settings.textSettings.dateFormat
            },
            selector: null
          });
        } else {
          objectEnumeration.push({
            objectName: objectName,
            properties: {
              boldTitles: this.viewModel.settings.textSettings.boldTitles,
              fontFamily: this.viewModel.settings.textSettings.fontFamily,
              textSize: this.viewModel.settings.textSettings.textSize,
              textColor: this.viewModel.settings.textSettings.textColor,
              dateFormat: this.viewModel.settings.textSettings.dateFormat
            },
            selector: null
          });
        }

        if (this.viewModel.settings.textSettings.dateFormat == "customJS") {
          objectEnumeration.push({
            objectName: objectName,
            properties: {
              customJS: this.viewModel.settings.textSettings.customJS
            },
            selector: null
          });

        }
        break;
      case 'axisSettings':
        objectEnumeration.push({
          objectName: objectName,
          properties: {
            axis: this.viewModel.settings.axisSettings.axis,
            axisColor: this.viewModel.settings.axisSettings.axisColor

          },
          selector: null
        });

        if (this.viewModel.settings.axisSettings.axis !== "None") {
          objectEnumeration.push({
            objectName: objectName,
            properties: {

              fontSize: this.viewModel.settings.axisSettings.fontSize,
              fontFamily: this.viewModel.settings.axisSettings.fontFamily,
              bold: this.viewModel.settings.axisSettings.bold,
              dateFormat: this.viewModel.settings.axisSettings.dateFormat
            },
            selector: null
          });

          objectEnumeration.push({
            objectName: objectName,
            properties: {
              manualScale: this.viewModel.settings.axisSettings.manualScale

            },
            selector: null
          });

          if (this.viewModel.settings.axisSettings.manualScale) {

            objectEnumeration.push({
              objectName: objectName,
              properties: {
                barMin: this.viewModel.settings.axisSettings.barMin,
                barMax: this.viewModel.settings.axisSettings.barMax
              },
              selector: null
            });


          }


          if (this.viewModel.settings.axisSettings.dateFormat == "customJS") {
            objectEnumeration.push({
              objectName: objectName,
              properties: {
                customJS: this.viewModel.settings.axisSettings.customJS
              },
              selector: null
            });

          }
        }

        objectEnumeration.push({
          objectName: objectName,
          properties: {
            manualScalePixel: this.viewModel.settings.axisSettings.manualScalePixel

          },
          selector: null
        });

        if (this.viewModel.settings.axisSettings.manualScalePixel) {

          objectEnumeration.push({
            objectName: objectName,
            properties: {
              customPixel: this.viewModel.settings.axisSettings.customPixel

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
            if (this.viewModel.settings.style.timelineStyle !== "minimalist") {
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
          }
        }
        break;

      case "style":
        objectEnumeration.push({
          objectName: objectName,
          properties: {
            timelineStyle: this.viewModel.settings.style.timelineStyle
          },
          selector: null
        });


        if (this.viewModel.settings.style.timelineStyle == "line") {
          objectEnumeration.push({
            objectName: objectName,
            properties: {
              lineColor: this.viewModel.settings.style.lineColor,
              lineThickness: this.viewModel.settings.style.lineThickness
            },
            selector: null
          });

        } else if (this.viewModel.settings.style.timelineStyle == "bar") {
          objectEnumeration.push({
            objectName: objectName,
            properties: {
              barColor: this.viewModel.settings.style.barColor,
              barHeight: this.viewModel.settings.style.barHeight
            },
            selector: null
          });
        } else if (this.viewModel.settings.style.timelineStyle == "minimalist") {
          objectEnumeration.push({
            objectName: objectName,
            properties: {
              minimalistStyle: this.viewModel.settings.style.minimalistStyle
            },
            selector: null
          });

          if (this.viewModel.settings.style.minimalistStyle !== "thinBar" && this.viewModel.settings.style.minimalistStyle !== "dot") {
            objectEnumeration.push({
              objectName: objectName,
              properties: {
                minimalistSize: this.viewModel.settings.style.minimalistSize
              },
              selector: null
            });
          }
        }


        objectEnumeration.push({
          objectName: objectName,
          properties: {
            today: this.viewModel.settings.style.today
          },
          selector: null
        });


        if (this.viewModel.settings.style.today) {
          objectEnumeration.push({
            objectName: objectName,
            properties: {
              todayColor: this.viewModel.settings.style.todayColor,
              todayTop: this.viewModel.settings.style.todayTop
            },
            selector: null
          });
        }
        break;
      case "imageSettings":
        objectEnumeration.push({
          objectName: objectName,
          properties: {
            imagesHeight: this.viewModel.settings.imageSettings.imagesHeight,
            imagesWidth: this.viewModel.settings.imageSettings.imagesWidth,
            style: this.viewModel.settings.imageSettings.style
          },
          selector: null
        });
        break;
      case 'download':
        objectEnumeration.push({
          objectName: objectName,
          properties: {
            downloadCalendar: this.viewModel.settings.download.downloadCalendar,
          },
          selector: null
        });

        if (this.viewModel.settings.download.downloadCalendar) {
          objectEnumeration.push({
            objectName: objectName,
            properties: {
              calendarName: this.viewModel.settings.download.calendarName,
              position: this.viewModel.settings.download.position
            },
            selector: null
          });
        }
        break;
    };

    return objectEnumeration;

  }


  private getTextWidth(textString: string, textSize: number, fontFamily: string) {
    let textData = [textString]

    let textWidth

    //Measure text's width for correct positioning of annotation
    this.svg.append('g')
      .selectAll('.dummyText')
      .data(textData)
      .enter()
      .append("text")
      .attr("font-family", fontFamily)
      .attr("font-size", textSize)
      .text(function (d) { return d })
      // .each(function (d, i) {
      //   let thisWidth = this.getComputedTextLength()
      //   textWidth = thisWidth
      //   this.remove() // remove them just after displaying them
      // })
      .attr("color", function (d) {
        //Irrelevant color. ".EACH" does not work on IE and we need to iterate over the elements after they have been appended to dom.
        let thisWidth = this.getBBox().width
        textWidth = thisWidth
        // this.remove()
        if (this.parentNode) {
          this.parentNode.removeChild(this);
        }


        return "white"
      })
    return Math.min(textWidth, this.viewModel.settings.textSettings.wrap)
  }

  private getTextHeight(textString: string, textSize: number, fontFamily: string, wrappedText: boolean) {
    let textData = [textString]

    let textHeight

    // let styles =    {
    //   "font-family": fontFamily,
    //   "font-size": `${textSize}px`
    // }
    // let width = d3PlusText.textWidth(textString,styles)




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
      txt.call(wrap, this.viewModel.settings.textSettings.wrap)
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
  private getAnnotationOrientation(element) {
    if (element.textWidth + element.x > this.width - this.padding * 2) {
      return "right"
    } else {
      return "left"
    }

  }



}

function visualTransform(options: VisualUpdateOptions, host: IVisualHost) {
  let dataViews = options.dataViews;

  let defaultSettings = {
    download: {
      downloadCalendar: false,
      position: "TOP,LEFT",
      calendarName: ""
    },
    textSettings: {
      stagger: true,
      autoStagger: true,
      spacing: false,
      separator: ":",
      boldTitles: false,
      annotationStyle: "annotationLabel",
      labelOrientation: "Auto",
      fontFamily: "Arial",
      textSize: 12,
      textColor: { solid: { color: 'Black' } },
      top: false,
      dateFormat: "same",
      customJS: "MM/dd/yyyy",
      wrap: 400
    },
    axisSettings: {
      axis: "None",
      dateFormat: "same",
      manualScale: false,
      manualScalePixel: false,
      axisColor: { solid: { color: 'gray' } },
      fontSize: 12,
      fontFamily: 'Arial',
      bold: false,
      barMin: "",
      barMax: "",
      customPixel: "",
      customJS: "MM/dd/yyyy"

    },
    style: {
      timelineStyle: "line",
      lineColor: { solid: { color: 'black' } },
      lineThickness: 2,
      minimalistStyle: "circle",
      minimalistSize: 2,
      barColor: { solid: { color: 'rgb(186,215,57)' } },
      barHeight: 30,
      today: false,
      todayTop: true,
      todayColor: { solid: { color: 'red' } }
    },
    imageSettings: {
      imagesHeight: 100,
      imagesWidth: 100,
      style: 'straight'
    }
  };

  let viewModel = {
    dataPoints: [],
    settings: defaultSettings
  };

  let timelineDataPoints = []

  let dataView: DataView = options.dataViews[0];
  let objects = dataViews[0].metadata.objects;

  let categorical = dataViews[0].categorical;
  let labelData, imageData, dateData, linkData, descriptionData, labelColumn, imageColumn, dateColumn, linkColumn, descriptionColumn, category


  //parse data
  if (!dataViews
    || !dataViews[0]
    || !dataViews[0].categorical
  ) {
    return viewModel;
  }

  let categoricalData = {}

  dataViews[0].categorical.categories.forEach(category => {
    let categoryName = Object.keys(category.source.roles)[0]
    categoricalData[categoryName] = category
  })

  category = categoricalData["label"]

  labelData = categoricalData["label"].values
  labelColumn = categoricalData["label"].source.displayName

  dateData = categoricalData["date"].values
  dateColumn = categoricalData["date"].source.displayName

  linkData = categoricalData["link"] ? categoricalData["link"].values : false
  linkColumn = categoricalData["link"] ? categoricalData["link"].source.displayName : false

  descriptionData = categoricalData["description"] ? categoricalData["description"].values : false
  descriptionColumn = categoricalData["description"] ? categoricalData["description"].source.displayName : false

  imageData = categoricalData["image_url"] ? categoricalData["image_url"].values : false
  imageColumn = categoricalData["image_url"] ? categoricalData["image_url"].source.displayName : false

  for (let i = 0; i < Math.min(dateData.length, labelData.length); i++) {
    let element = {}
    element["label"] = labelData[i] ? labelData[i].replace(/(\r\n|\n|\r)/gm, " ") : ""
    element["date"] = new Date(dateData[i])
    element["URL"] = linkData[i] ? linkData[i] : false
    element["image"] = imageData[i] ? imageData[i] : false
    element["description"] = descriptionData[i] ? descriptionData[i].replace(/(\r\n|\n|\r)/gm, " ") : ""
    element["labelColumn"] = labelColumn
    element["dateColumn"] = dateColumn
    element["descriptionColumn"] = descriptionColumn

    element["selectionId"] = host.createSelectionIdBuilder()
      .withCategory(category, i)
      .createSelectionId()

    let value = Date.parse(element["date"]);
    element["dateAsInt"] = value
    element["customFormat"] = getCategoricalObjectValue(category, i, 'dataPoint', 'customFormat', false)
    element["fontFamily"] = getCategoricalObjectValue(category, i, 'dataPoint', 'fontFamily', "Arial")
    element["textSize"] = getCategoricalObjectValue(category, i, 'dataPoint', 'textSize', 12)
    element["textColor"] = getCategoricalObjectValue(category, i, 'dataPoint', 'textColor', { "solid": { "color": "black" } }).solid.color
    element["top"] = getCategoricalObjectValue(category, i, 'dataPoint', 'top', false)

    element["customVertical"] = element["customFormat"] ? getCategoricalObjectValue(category, i, 'dataPoint', 'customVertical', false) : false
    element["verticalOffset"] = getCategoricalObjectValue(category, i, 'dataPoint', 'verticalOffset', 20)

    element["annotationStyle"] = getCategoricalObjectValue(category, i, 'dataPoint', 'annotationStyle', 'annotationLabel')
    element["labelOrientation"] = getCategoricalObjectValue(category, i, 'dataPoint', 'labelOrientation', 'Auto')

    if (element["date"]) {
      timelineDataPoints.push(element)
    }
  }


  let timelineSettings = {
    download: {
      downloadCalendar: getValue(objects, 'download', 'downloadCalendar', defaultSettings.download.downloadCalendar),
      position: getValue(objects, 'download', 'position', defaultSettings.download.position),
      calendarName: getValue(objects, 'download', 'calendarName', defaultSettings.download.calendarName)
    },
    textSettings: {
      stagger: getValue(objects, 'textSettings', 'stagger', defaultSettings.textSettings.stagger),
      autoStagger: getValue(objects, 'textSettings', 'autoStagger', defaultSettings.textSettings.autoStagger),
      separator: getValue(objects, 'textSettings', 'separator', defaultSettings.textSettings.separator),
      spacing: getValue(objects, 'textSettings', 'spacing', defaultSettings.textSettings.spacing),
      top: getValue(objects, 'textSettings', 'top', defaultSettings.textSettings.top),
      labelOrientation: getValue(objects, 'textSettings', 'labelOrientation', defaultSettings.textSettings.labelOrientation),
      annotationStyle: getValue(objects, 'textSettings', 'annotationStyle', defaultSettings.textSettings.annotationStyle),
      textColor: getValue(objects, 'textSettings', 'textColor', defaultSettings.textSettings.textColor),
      textSize: getValue(objects, 'textSettings', 'textSize', defaultSettings.textSettings.textSize),
      fontFamily: getValue(objects, 'textSettings', 'fontFamily', defaultSettings.textSettings.fontFamily),
      dateFormat: getValue(objects, 'textSettings', 'dateFormat', defaultSettings.textSettings.dateFormat),
      customJS: getValue(objects, 'textSettings', 'customJS', defaultSettings.textSettings.customJS),
      boldTitles: getValue(objects, 'textSettings', 'boldTitles', defaultSettings.textSettings.boldTitles),
      wrap: getValue(objects, 'textSettings', 'wrap', defaultSettings.textSettings.wrap),

    },
    axisSettings: {
      axis: getValue(objects, 'axisSettings', 'axis', defaultSettings.axisSettings.axis),
      axisColor: getValue(objects, 'axisSettings', 'axisColor', defaultSettings.axisSettings.axisColor),
      fontSize: getValue(objects, 'axisSettings', 'fontSize', defaultSettings.axisSettings.fontSize),
      fontFamily: getValue(objects, 'axisSettings', 'fontFamily', defaultSettings.axisSettings.fontFamily),
      bold: getValue(objects, 'axisSettings', 'bold', defaultSettings.axisSettings.bold),
      dateFormat: getValue(objects, 'axisSettings', 'dateFormat', defaultSettings.axisSettings.dateFormat),
      manualScale: getValue(objects, 'axisSettings', 'manualScale', defaultSettings.axisSettings.manualScale),
      barMin: getValue(objects, 'axisSettings', 'barMin', defaultSettings.axisSettings.barMin),
      barMax: getValue(objects, 'axisSettings', 'barMax', defaultSettings.axisSettings.barMax),
      customJS: getValue(objects, 'axisSettings', 'customJS', defaultSettings.axisSettings.customJS),
      manualScalePixel: getValue(objects, 'axisSettings', 'manualScalePixel', defaultSettings.axisSettings.manualScalePixel),
      customPixel: getValue(objects, 'axisSettings', 'customPixel', defaultSettings.axisSettings.customPixel)

    },
    style: {
      timelineStyle: getValue(objects, 'style', 'timelineStyle', defaultSettings.style.timelineStyle),
      lineColor: getValue(objects, 'style', 'lineColor', defaultSettings.style.lineColor),
      lineThickness: getValue(objects, 'style', 'lineThickness', defaultSettings.style.lineThickness),
      minimalistStyle: getValue(objects, 'style', 'minimalistStyle', defaultSettings.style.minimalistStyle),
      minimalistSize: getValue(objects, 'style', 'minimalistSize', defaultSettings.style.minimalistSize),
      barColor: getValue(objects, 'style', 'barColor', defaultSettings.style.barColor),
      barHeight: getValue(objects, 'style', 'barHeight', defaultSettings.style.barHeight),
      today: getValue(objects, 'style', 'today', defaultSettings.style.today),
      todayTop: getValue(objects, 'style', 'todayTop', defaultSettings.style.todayTop),
      todayColor: getValue(objects, 'style', 'todayColor', defaultSettings.style.todayColor)
    },
    imageSettings: {
      imagesHeight: getValue(objects, 'imageSettings', 'imagesHeight', defaultSettings.imageSettings.imagesHeight),
      imagesWidth: getValue(objects, 'imageSettings', 'imagesWidth', defaultSettings.imageSettings.imagesWidth),
      style: getValue(objects, 'imageSettings', 'style', defaultSettings.imageSettings.style)
    }
  }
  return {
    dataPoints: timelineDataPoints,
    settings: timelineSettings
  };
}

export function getValue(objects, objectName, propertyName, defaultValue) {

  //gets settings from global attributes in property pane.
  if (objects) {
    let object = objects[objectName];

    if (object) {

      let property = object[propertyName];
      if (property !== undefined) {

        return property;
      }
    }
  }
  return defaultValue;
}
export function getCategoricalObjectValue(category, index, objectName, propertyName, defaultValue) {

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