"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import {BlobBuilder} from "blob"
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

const ics = require('ics')
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

    this.container.selectAll("line").remove();
    let data = this.viewModel.dataPoints

    console.log(this.viewModel.settings.download.downloadCalendar)
    //download calendar
    if(this.viewModel.settings.download.downloadCalendar){
      let events = []
          data.forEach(el => {
            // cal.addEvent(el.label, el.description, false, el.date, el.date);
          
            let startTime = [ el.date.getFullYear(), el.date.getMonth()+1, el.date.getDate(), el.date.getHours(), el.date.getMinutes() ];

            events.push({
              title: el.label,
              description: el.description,
              startInputType: 'utc',
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
          // if (navigator.userAgent.indexOf('MSIE 10') === -1) { // chrome or firefox
            blob = new Blob([value]);
          // } else { // ie
            // var bb = new BlobBuilder();
            // bb.append(value);
            // blob = bb.getBlob('text/x-vCalendar;charset=' + document.characterSet);
          // }
          FileSaver.saveAs(blob, "calendar.ics");
    
          this.host.persistProperties({
            merge: [
              {
                objectName: "download",
                selector: null,
                properties: {
                    downloadCalendar: false
                }
              }
            ]
        });
      // this.viewModel.settings.download.downloadCalendar= false;
    }


    //min label width from annotation plugin
    if (this.viewModel.settings.textSettings.wrap < 90) {
      this.viewModel.settings.textSettings.wrap = 90
    }

    let minFromData = d3.min(data, function (d: any) { return d.date })
    let maxFromData = d3.max(data, function (d: any) { return d.date })

    let imagesHeight = this.viewModel.settings.imageSettings.imagesHeight
    let imagesWidth = this.viewModel.settings.imageSettings.imagesWidth

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
    // let customColors = ["rgb(186,215,57)", "rgb(0, 188, 178)", "rgb(121, 118, 118)", "rgb(105,161,151)", "rgb(78,205,196)", "rgb(166,197,207)", "rgb(215,204,182)", "rgb(67,158,157)", "rgb(122,141,45)", "rgb(162,157,167)"]

    this.width = options.viewport.width;
    this.height = options.viewport.height;
    this.marginTop = 20
    // this.barHeight = 30
    // let spacing = 10,
    let marginTopStagger = 20;

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
    let filteredData

    //sort so staggering works in right order
    data = data.sort((a, b) => (a.date > b.date) ? 1 : -1)

    //filter data out of axis range, reverse order if axis is in decremental order
    if (this.minVal > this.maxVal) {
      filteredData = data.filter(element => element.date <= this.minVal && element.date >= this.maxVal)
      data.reverse()
    } else {
      filteredData = data.filter(element => element.date >= this.minVal && element.date <= this.maxVal)
    }

    let addToMargin = this.viewModel.settings.imageSettings.style == "alternate" ? (imagesHeight * 2) + 20 : imagesHeight + 20


    filteredData.forEach((dataPoint, i) => {
      dataPoint["formatted"] = valueFormatter.format(dataPoint["date"])
      dataPoint["labelText"] = `${dataPoint["formatted"]}${this.viewModel.settings.textSettings.separator} ${dataPoint["label"]}`
      dataPoint["textColor"] = dataPoint.customFormat ? dataPoint.textColor : textColor
      dataPoint["fontFamily"] = dataPoint.customFormat ? dataPoint.fontFamily : fontFamily
      dataPoint["textSize"] = dataPoint.customFormat ? dataPoint.textSize : textSize
      dataPoint["top"] = dataPoint.customFormat ? dataPoint.top : top
      dataPoint["labelOrientation"] = dataPoint.customFormat ? dataPoint.labelOrientation : labelOrientation
      dataPoint["annotationStyle"] = dataPoint.customFormat ? dataPoint.annotationStyle : annotationStyle
      dataPoint["textWidth"] = this.getTextWidth(dataPoint["labelText"], dataPoint["textSize"], fontFamily)


      // let textHeight, 
      dataPoint["textHeight"] = this.getTextHeight(dataPoint["labelText"], dataPoint["textSize"], fontFamily) + 10

      if (dataPoint.description) {
        dataPoint["textHeight"] += this.getTextHeight(dataPoint["description"], dataPoint["textSize"], fontFamily) + 2
      }

      if (dataPoint.image && this.viewModel.settings.imageSettings.style == "default") {
        dataPoint["textHeight"] += imagesHeight
        if (!dataPoint["top"]) {
          dataPoint["textHeight"] += 10
        }
      }

      if (this.viewModel.settings.textSettings.spacing < dataPoint["textHeight"]) {
        this.viewModel.settings.textSettings.spacing = dataPoint["textHeight"]
        if (dataPoint["top"]) {
          marginTopStagger += dataPoint["textHeight"]
        }
      }

      if (dataPoint["top"]) {
        this.marginTop = Math.max(this.marginTop, dataPoint["textHeight"] + 30)
      } else {

        if (dataPoint.image) {
          this.marginTop = Math.max(this.marginTop, addToMargin)

        }
      }


    })



    marginTopStagger += (data.filter(element => element.top).length * this.viewModel.settings.textSettings.spacing)

    // if (this.viewModel.settings.imageSettings.style == "stagger") {
    //   marginTopStagger += (data.filter(element => !element.top && element.image).length * imagesHeight)
    // }

    if (this.viewModel.settings.imageSettings.style !== "default" && data.filter(el => !el.top && el.image).length > 0) {

      marginTopStagger = Math.max(marginTopStagger, addToMargin)
    }

    this.finalMarginTop = this.viewModel.settings.textSettings.stagger ? marginTopStagger : this.marginTop


    //  data.reduce(function (a, b) { return a.date < b.date ? a : b; }).date; 

    // data.reduce(function (a, b) { return a.date > b.date ? a : b; }).date;

    // let scale = d3.scaleLinear()
    //   .domain([this.minVal, this.maxVal]) //min and max data from input
    //   .range([0, this.width - (this.padding * 2)]); //min and max width in px           

    let scale = d3.scaleTime()
      .domain([this.minVal, this.maxVal]) //min and max data from input
      .range([0, this.width - (this.padding * 2)]); //min and max width in px           

    this.svg.attr("width", this.width);
    this.svg.attr("height", this.height);

    if (this.viewModel.settings.imageSettings.style !== "image") {
      let bar

      bar = this.container.append("line")
        .attr("x1", this.padding)
        .attr("y1", this.finalMarginTop)
        .attr("x2", this.width - this.padding)
        .attr("y2", this.finalMarginTop)
        .attr("stroke-width", this.viewModel.settings.style.lineThickness)
        .attr("stroke", this.viewModel.settings.style.lineColor.solid.color);

      //   .attr('y', this.marginTop)
      //   .attr('height', this.barHeight)
      // bar.exit().remove()

      //axis settings



      let axisFormat = this.viewModel.settings.axisSettings.dateFormat != "customJS" ? this.viewModel.settings.axisSettings.dateFormat : this.viewModel.settings.axisSettings.customJS

      let axisValueFormatter = axisFormat == "same" ? valueFormatter : createFormatter(axisFormat);

      let x_axis
      x_axis = d3.axisBottom(scale)
        .tickFormat(d => {
          return axisValueFormatter.format(new Date(<any>d))
        })

      // 
      //Append group and insert axis
      this.container.append("g")
        .attr("transform", "translate(" + this.padding + "," + (this.finalMarginTop) + ")")
        .call(x_axis)
        .attr('class', 'axis')

        .attr('style', `color :${this.viewModel.settings.axisSettings.axisColor.solid.color}`)
        .attr('style', `stroke :${this.viewModel.settings.axisSettings.axisColor.solid.color}`)

      this.container.selectAll('path, line')
        .attr('style', `color :${this.viewModel.settings.axisSettings.axisColor.solid.color}`)

      if (this.viewModel.settings.axisSettings.bold) {
        this.container.classed("xAxis", false);
      } else {
        this.container.attr('class', 'xAxis')
      }
      if (this.viewModel.settings.axisSettings.axis === "None") {
        this.container.selectAll("text").remove()
      } else {
        this.container.selectAll("text").style('font-size', this.viewModel.settings.axisSettings.fontSize)
        this.container.selectAll("text").style('fill', this.viewModel.settings.axisSettings.axisColor.solid.color)
        this.container.selectAll("text").style('font-family', this.viewModel.settings.axisSettings.fontFamily)

      }
    }

    let annotationsData, makeAnnotations, dateStyle, dateType, datesData, makeDates
    let countTop = 0, countBottom = 0, counter
    let imgCountTop = 0, imgCountBottom = 0, imgCounter

    let pixelWidth = (this.width - this.padding * 2) / data.length

    data.forEach((element, i) => {
      let orientation
      if (element.top) {
        countTop++;
        counter = countTop
      } else {
        countBottom++;
        counter = countBottom
      }

      if (this.viewModel.settings.imageSettings.style == "image") {
        element["x"] = this.padding + pixelWidth * i
        element["dy"] = imagesHeight / 2 + 10
        orientation = "left"

        element["alignment"] = {
          "className": "custom",
          "connector": { "end": "dot" },
          "note": { "align": "dynamic" }
        }

        dateStyle = svgAnnotations['annotationLabel']
        dateType = new svgAnnotations.annotationCustomType(
          dateStyle,
          element.alignment
        )

        element.alignment.note.align = orientation
        datesData = [{
          note: {
            wrap: this.viewModel.settings.textSettings.wrap,
            title: element.formatted,
            bgPadding: 10
          },
          x: element["x"],
          y: this.finalMarginTop,
          dy: element["dy"] * -1,
          color: element.textColor,
          // id: element.selectionId
        }]

        makeDates = svgAnnotations.annotation()
          .annotations(datesData)
          .type(new svgAnnotations.annotationCustomType(dateType, element.alignment))

        makeDates
          .disable(["connector"])


      } else {
        element["x"] = this.padding + scale(element["date"])


        if (this.viewModel.settings.textSettings.stagger) {
          element["dy"] = element.top ? this.viewModel.settings.textSettings.spacing * (-1 * (counter)) : this.viewModel.settings.textSettings.spacing * (counter)
        } else {
          element["dy"] = element.top ? -20 : 20
        }

        if (this.viewModel.settings.axisSettings.axis != "None" && !element.top) {
          element["dy"] += 20
        }
        if (element.labelOrientation !== "Auto") {
          orientation = element.labelOrientation
        } else {
          orientation = this.getAnnotationOrientation(element)
        }

        element["alignment"] = {
          "className": "custom",
          "connector": { "end": "dot" },
          "note": { "align": "dynamic" }
        }
      }





      element.alignment.note.align = orientation
      annotationsData = [{
        note: {
          wrap: this.viewModel.settings.textSettings.wrap,
          title: element.labelText,
          label: element.description,
          bgPadding: 10
        },
        x: element["x"],
        // scale(element.dateAsInt),
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


      if (element.annotationStyle === 'textOnly') {
        makeAnnotations
          .disable(["connector"])

      }

      if (element.image) {
        if (element.top) {
          imgCountTop++
          imgCounter = imgCountTop
        } else {
          imgCountBottom++
          imgCounter = imgCountBottom
        }
        let imageY, imageX

        // if (this.viewModel.settings.imageSettings.style == "stagger") {

        //   let staggerDY = element.top ? imagesHeight * (-1 * (imgCounter)) : imagesHeight * (imgCounter)
        //   imageY = this.finalMarginTop - staggerDY - 20

        // } else 
        switch (this.viewModel.settings.imageSettings.style) {
          case "default":
            imageY = !element.top ? (this.finalMarginTop + element.dy) - 10 + (element.textHeight - imagesHeight) : (this.finalMarginTop + element.dy) - element.textHeight - 10

            if (orientation == "middle") { imageX = element.x - (imagesWidth / 2) }
            else if (orientation == "left") { imageX = element.x }
            else { imageX = element.x - imagesWidth }
            break;

          case "straight":
            imageY = element.top ? this.finalMarginTop + 20 : this.finalMarginTop - 20 - imagesHeight
            break;

          case "image":
            imageY = this.finalMarginTop - imagesHeight / 2
            imageX = element.x

            break;


          default:
            imageY = element.top ? this.finalMarginTop + 20 : 0
            if (imgCounter % 2 == 0) {
              imageY += imagesHeight
            }

        }

        imageX = !imageX ? element.x - (imagesWidth / 2) : imageX


        if (this.viewModel.settings.imageSettings.style != "default" && this.viewModel.settings.imageSettings.style != "image") {
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
          // .attr('x', element.labelOrientation !== "middle" ? element.x : element.x - (imagesWidth / 2))
          .attr('y', imageY)

          .on("click", () => {
            this.host.launchUrl(element.URL)
          });
      }


      this.container
        .append("g")
        // .attr('class', 'annotations')
        .attr('class', `annotation_selector_${element.label.replace(/\W/g, '')}_${element.dateAsInt} annotationSelector`)
        //.style('stroke', 'transparent')
        .style('font-size', element.textSize + "px")
        .style('font-family', element.fontFamily)
        .style('background-color', 'transparent')
        // .style('font-weight', () => {
        //   if (this.highlighted) {
        //     return element.highlight ? "none" : "bold";
        //   } else {
        //     return "none"
        //   }
        // })
        .call(makeAnnotations)
        .on('click', el => {
          this.selectionManager.select(element.selectionId).then((ids: ISelectionId[]) => {
            if (ids.length > 0) {
              this.container.selectAll('.bar').style('fill-opacity', 0.1)

              d3.select(`.selector_${element.label.replace(/\W/g, '')}_${element.dateAsInt}`).style('fill-opacity', 1)
              this.container.selectAll('.annotationSelector').style('font-weight', "normal")

              if (!this.viewModel.settings.textSettings.boldTitles) {
                this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
              }

              d3.selectAll(`.annotation_selector_${element.label.replace(/\W/g, '')}_${element.dateAsInt}`).style('font-weight', "bold")
              d3.selectAll(`.annotation_selector_${element.label.replace(/\W/g, '')}_${element.dateAsInt}  .annotation-note-title `).style('font-weight', "bold")



              //Open link 
              if (element.URL) {
                this.host.launchUrl(element.URL)
              }


            } else {
              this.container.selectAll('.bar').style('fill-opacity', 1)
              this.container.selectAll('.annotationSelector').style('font-weight', "normal")

              if (!this.viewModel.settings.textSettings.boldTitles) {
                this.container.selectAll('.annotationSelector .annotation-note-title').style('font-weight', "normal")
              }
            }

          })
        })
    })

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

      const mouseEvent: MouseEvent = d3.event as MouseEvent;
      const eventTarget: EventTarget = mouseEvent.target;
      let dataPoint: any = d3.select(<Element>eventTarget).datum();
      if (dataPoint) {
        this.selectionManager.select(dataPoint.selectionId).then((ids: ISelectionId[]) => {
          if (ids.length > 0) {
            this.container.selectAll('.bar').style('fill-opacity', 0.1)
            d3.select(<Element>eventTarget).style('fill-opacity', 1)
            this.container.selectAll('.annotationSelector').style('font-weight', "normal")
            d3.select(`.annotation_selector_${dataPoint.label.replace(/\W/g, '')}_${dataPoint.dateAsInt}`).style('font-weight', "bold")

          } else {
            this.container.selectAll('.bar').style('fill-opacity', 1)
            this.container.selectAll('.annotationSelector').style('font-weight', "normal")
          }
        })
      } else {

        this.selectionManager.clear().then(() => {

          this.container.selectAll('.bar').style('fill-opacity', 1)
          this.container.selectAll('.annotationSelector').style('font-weight', "normal")


          if (!this.viewModel.settings.textSettings.boldTitles) {
            this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
          }
        })
      }

    });

    this.svg.on('mouseover', el => {

      const mouseEvent: MouseEvent = d3.event as MouseEvent;
      const eventTarget: EventTarget = mouseEvent.target;

      //to-do grab data element based on annotation css class so hover works on annotation

      let args = []
      let dataPoint: any = d3.select(<Element>eventTarget).datum();
      // console.log(dataPoint)
      if (dataPoint && dataPoint.labelColumn) {

        args = [{
          displayName: dataPoint.dateColumn,
          value: dataPoint.date
        },
        {
          displayName: dataPoint.labelColumn,
          value: dataPoint.label
        }]
        this.tooltipServiceWrapper.addTooltip(d3.select(<Element>eventTarget),
          (tooltipEvent: TooltipEventArgs<number>) => args,
          (tooltipEvent: TooltipEventArgs<number>) => null);
      }
    })

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
      case 'download':
        objectEnumeration.push({
          objectName: objectName,
          properties: {
            downloadCalendar: this.viewModel.settings.download.downloadCalendar
          },
          selector: null
        });
        break;
      case 'textSettings':
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
              spacing: this.viewModel.settings.textSettings.spacing
            },
            selector: null
          });

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
            axisColor: this.viewModel.settings.axisSettings.axisColor,
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

            objectEnumeration.push({
              objectName: objectName,
              displayName: dataElement.label + " Label on top",
              properties: {
                top: dataElement.top
              },
              selector: dataElement.selectionId.getSelector()
            });

            objectEnumeration.push({
              objectName: objectName,
              displayName: dataElement.label + " Label style",
              properties: {
                annotationStyle: dataElement.annotationStyle
              },
              selector: dataElement.selectionId.getSelector()
            });


            objectEnumeration.push({
              objectName: objectName,
              displayName: dataElement.label + " Label orientation",
              properties: {
                labelOrientation: dataElement.labelOrientation
              },
              selector: dataElement.selectionId.getSelector()
            });

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
            lineColor: this.viewModel.settings.style.lineColor,
            lineThickness: this.viewModel.settings.style.lineThickness
          },
          selector: null
        });
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

  private getTextHeight(textString: string, textSize: number, fontFamily: string) {
    let textData = [textString]

    let textHeight

    // let styles =    {
    //   "font-family": fontFamily,
    //   "font-size": `${textSize}px`
    // }
    // let width = d3PlusText.textWidth(textString,styles)




    this.svg.append('g')
      .selectAll('.dummyText')
      .data(textData)
      .enter()
      .append("text")
      .attr("font-family", fontFamily)
      .attr("font-size", textSize)
      .text(function (d) { return d })
      // .call(wrap, this.viewModel.settings.textSettings.wrap)
      .attr("color", function (d) {
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
    download:{
      downloadCalendar: false
    },
    textSettings: {
      stagger: true,
      spacing: 10,
      separator: ":",
      boldTitles: false,
      annotationStyle: "annotationLabel",
      labelOrientation: "Auto",
      fontFamily: "Arial",
      textSize: 12,
      textColor: { solid: { color: 'Black' } },
      top: false,
      dateFormat: "same",
      customJS: "mm/dd/yyyy",
      wrap: 100
    },
    axisSettings: {
      axis: "None",
      dateFormat: "same",
      manualScale: false,
      axisColor: { solid: { color: 'gray' } },
      fontSize: 12,
      fontFamily: 'Arial',
      bold: false,
      barMin: "",
      barMax: "",
      customJS: "mm/dd/yyyy"

    },
    style: {
      lineColor: { solid: { color: 'black' } },
      lineThickness: 2
    },
    imageSettings: {
      imagesHeight: 100,
      imagesWidth: 100,
      style: 'default'
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
    element["label"] = labelData[i]
    element["date"] = new Date(dateData[i])
    element["URL"] = linkData[i]
    element["image"] = imageData[i]
    element["description"] = descriptionData[i]
    element["labelColumn"] = labelColumn
    element["dateColumn"] = dateColumn

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

    element["annotationStyle"] = getCategoricalObjectValue(category, i, 'dataPoint', 'annotationStyle', 'annotationLabel')
    element["labelOrientation"] = getCategoricalObjectValue(category, i, 'dataPoint', 'labelOrientation', 'Auto')

    if (element["date"]) {
      timelineDataPoints.push(element)
    }
  }


  let timelineSettings = {
    download:{
      downloadCalendar: getValue(objects, 'download', 'downloadCalendar', defaultSettings.download.downloadCalendar)
    },
    textSettings: {
      stagger: getValue(objects, 'textSettings', 'stagger', defaultSettings.textSettings.stagger),
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
      customJS: getValue(objects, 'axisSettings', 'customJS', defaultSettings.axisSettings.customJS)

    },
    style: {
      lineColor: getValue(objects, 'style', 'lineColor', defaultSettings.style.lineColor),
      lineThickness: getValue(objects, 'style', 'lineThickness', defaultSettings.style.lineThickness)
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



// export function getCategoricalObjectValue(category: any, index: number, objectName: string, propertyName: string, defaultValue) {
//   console.log(category)
//   let categoryObjects
//   if (!category.categories) {
//     categoryObjects = category.values;
//   }
//   else {
//     categoryObjects = category.categories[0].objects
//   }
//   if (categoryObjects) {
//     let categoryObject
//     categoryObject = categoryObjects[index];
//     if (categoryObject) {
//       let object
//       if (category.categories) {
//         object = categoryObject[objectName]
//       } else {
//         if (categoryObject.source.objects) {
//           object = categoryObject.source.objects[objectName];

//         }
//       }
//       if (object) {
//         let property = object[propertyName];

//         if (property !== undefined) {
//           return property;
//         }
//       }

//     }
//   }
declare function require(name: string);

//   return defaultValue;
// }

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
      lineHeight = 1.0,
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
