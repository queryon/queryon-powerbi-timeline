"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
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
// import { VisualSettings } from "./settings";

import {
  valueFormatter as vf,
} from "powerbi-visuals-utils-formattingutils";

import * as d3 from "d3";
import { IValueFormatter } from "powerbi-visuals-utils-formattingutils/lib/src/valueFormatter";
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

    this.container.selectAll("line").remove();
    let data = this.viewModel.dataPoints

    let minFromData = d3.min(data, function (d: any) { return d.date })
    let maxFromData = d3.max(data, function (d: any) { return d.date })

    if (this.viewModel.settings.axisSettings.manualScale) {

      if (this.viewModel.settings.axisSettings.barMin && this.viewModel.settings.axisSettings.barMin != "") {
        let minFromInput = new Date(this.viewModel.settings.axisSettings.barMin)

        if (Object.prototype.toString.call(minFromInput) === '[object Date]' && !isNaN(minFromInput.getTime())) {
          this.minVal = minFromInput
        } else {
          this.minVal = minFromData

        }
      }

      if (this.viewModel.settings.axisSettings.barMax && this.viewModel.settings.axisSettings.barMax != "") {
        let maxFromInput = new Date(this.viewModel.settings.axisSettings.barMax)

        if (Object.prototype.toString.call(maxFromInput) === '[object Date]' && !isNaN(maxFromInput.getTime())) {
          this.maxVal = maxFromInput
        } else {
          this.maxVal = maxFromData

        }

      }

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
    if (this.viewModel.settings.textSettings.dateFormat === "same"){
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

    data.forEach((dataPoint, i) => {
      dataPoint["formatted"] = valueFormatter.format(dataPoint["date"])
      dataPoint["labelText"] = `${dataPoint["formatted"]}${this.viewModel.settings.textSettings.separator} ${dataPoint["label"]}`
      // dataPoint["labelText"] = format //trick to capture format string from pbi desktop
      dataPoint["textColor"] = dataPoint.customFormat ? dataPoint.textColor : textColor
      dataPoint["fontFamily"] = dataPoint.customFormat ? dataPoint.fontFamily : fontFamily
      dataPoint["textSize"] = dataPoint.customFormat ? dataPoint.textSize : textSize
      dataPoint["top"] = dataPoint.customFormat ? dataPoint.top : top
      dataPoint["labelOrientation"] = dataPoint.customFormat ? dataPoint.labelOrientation : labelOrientation
      dataPoint["annotationStyle"] = dataPoint.customFormat ? dataPoint.annotationStyle : annotationStyle
      dataPoint["textWidth"] = this.getTextWidth(dataPoint["labelText"], dataPoint["textSize"], fontFamily)



      let textHeight, 
      titleHeight = this.getTextHeight(dataPoint["labelText"], dataPoint["textSize"], fontFamily)

      if(dataPoint.description){
        textHeight = titleHeight + this.getTextHeight(dataPoint["description"], dataPoint["textSize"], fontFamily) + 2
      } else {
        textHeight = titleHeight
      }


      if (this.viewModel.settings.textSettings.spacing < textHeight) {
        this.viewModel.settings.textSettings.spacing = textHeight
        if (dataPoint["top"]) {
          marginTopStagger += textHeight
        }
      }

      if (dataPoint["top"]) {
        this.marginTop = Math.max(this.marginTop, textHeight + 30)
      }


    })



    marginTopStagger += (data.filter(element => element.top).length * this.viewModel.settings.textSettings.spacing)

    

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


    let bar

    bar = this.container.append("line")
      .attr("x1", this.padding)
      .attr("y1", this.viewModel.settings.textSettings.stagger ? marginTopStagger : this.marginTop)
      .attr("x2", this.width - this.padding)
      .attr("y2", this.viewModel.settings.textSettings.stagger ? marginTopStagger : this.marginTop)
      .attr("stroke-width", 2)
      .attr("stroke", "black");

    //   .attr('y', this.marginTop)
    //   .attr('height', this.barHeight)
    // bar.exit().remove()

    //axis settings


    let axisFormat = this.viewModel.settings.axisSettings.dateFormat != "customJS" ? this.viewModel.settings.axisSettings.dateFormat : this.viewModel.settings.axisSettings.customJS

    console.log(axisFormat)
    let axisValueFormatter = axisFormat == "same" ? valueFormatter : createFormatter(axisFormat);

    let x_axis
    x_axis = d3.axisBottom(scale)
      .tickFormat(d => {
        return axisValueFormatter.format(new Date(<any>d))
      })

    // 
    //Append group and insert axis
    this.container.append("g")
      .attr("transform", "translate(" + this.padding + "," + (this.viewModel.settings.textSettings.stagger ? marginTopStagger : this.marginTop) + ")")
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

    let annotationsData, makeAnnotations
    let countTop = 0, countBottom = 0, counter

    data.forEach((element, i) => {

      if (element.top) {
        countTop++;
        counter = countTop
      } else {
        countBottom++;
        counter = countBottom
      }

      element["x"] = this.padding + scale(element["date"])


      if (this.viewModel.settings.textSettings.stagger) {
        element["dy"] = element.top ? this.viewModel.settings.textSettings.spacing * (-1 * (counter)) : this.viewModel.settings.textSettings.spacing * (counter)
      } else {
        element["dy"] = element.top ? -20 : 20
      }

      if (this.viewModel.settings.axisSettings.axis != "None" && !element.top) {
        element["dy"] += 20
      }

      element["alignment"] = {
        "className": "custom",
        "connector": { "end": "dot" },
        "note": { "align": "dynamic" }
      }

      if (element.labelOrientation !== "Auto") {
        element.alignment.note.align = element.labelOrientation
      } else {
        element.alignment.note.align = this.getAnnotationOrientation(element)
      }

      annotationsData = [{
        note: {
          wrap: 900,
          title: element.labelText,
          label: element.description,
          bgPadding: 10
        },
        x: element["x"],
        // scale(element.dateAsInt),
        y: this.viewModel.settings.textSettings.stagger ? marginTopStagger : this.marginTop,
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
              this.container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")

              d3.selectAll(`.annotation_selector_${element.label.replace(/\W/g, '')}_${element.dateAsInt}`).style('font-weight', "bold")
              d3.selectAll(`.annotation_selector_${element.label.replace(/\W/g, '')}_${element.dateAsInt}  .annotation-note-title `).style('font-weight', "bold")
             


              //Open link 
              if (element.URL) {
                this.host.launchUrl(element.URL)
              }


            } else {
              this.container.selectAll('.bar').style('fill-opacity', 1)
              this.container.selectAll('.annotationSelector').style('font-weight', "normal")
              this.container.selectAll('.annotationSelector .annotation-note-title').style('font-weight', "normal")
            }

          })
        })
    })


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

  private static parseSettings(dataView) {

    // return this.enumerateObjectInstances(this.options)
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
            labelOrientation: this.viewModel.settings.textSettings.labelOrientation,
            annotationStyle: this.viewModel.settings.textSettings.annotationStyle,
            top: this.viewModel.settings.textSettings.top,
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
    return textWidth
  }

  private getTextHeight(textString: string, textSize: number, fontFamily: string) {
    let textData = [textString]

    let textHeight

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
      //   let thisHeight = this.getBBox().height
      //   textHeight = thisHeight
      //   this.remove() // remove them just after displaying them
      // })
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
    textSettings: {
      stagger: true,
      spacing: 10,
      separator: ":",
      annotationStyle: "annotationLabel",
      labelOrientation: "Auto",
      fontFamily: "Arial",
      textSize: 12,
      textColor: { solid: { color: 'Black' } },
      top: false,
      dateFormat: "same",
      customJS: "mm/dd/yyyy"
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
  let labelData, dateData, linkData, descriptionData, labelColumn, dateColumn, linkColumn, descriptionColumn, category


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


  // let format, valueFormatter

  // if (dataViews[0].categorical.categories[0].source.roles["label"]) {
  // labelData = dataViews[0].categorical.categories[0].values
  // labelColumn = dataViews[0].categorical.categories[0].source.displayName
  // dateData = dataViews[0].categorical.categories[1].values
  // dateColumn = dataViews[0].categorical.categories[1].source.displayName
  // category = dataViews[0].categorical.categories[0]

  // format = options.dataViews[0].categorical.categories[1].source.format
  // } else {
  // dateData = dataViews[0].categorical.categories[0].values
  // dateColumn = dataViews[0].categorical.categories[0].source.displayName
  // labelData = dataViews[0].categorical.categories[1].values
  // labelColumn = dataViews[0].categorical.categories[1].source.displayName
  // category = dataViews[0].categorical.categories[1]

  // format = options.dataViews[0].categorical.categories[0].source.format
  // }


  // valueFormatter = createFormatter(format);

  for (let i = 0; i < Math.min(dateData.length, labelData.length); i++) {

    let element = {}
    element["label"] = labelData[i]
    element["date"] = new Date(dateData[i])
    element["URL"] = linkData[i]    
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

    element["annotationStyle"] = getCategoricalObjectValue(category, i, 'dataPoint', 'annotationStyle', 'textOnly')
    element["labelOrientation"] = getCategoricalObjectValue(category, i, 'dataPoint', 'labelOrientation', 'Auto')
    timelineDataPoints.push(element)
  }



  //dataViews[0].categorical.categories[0].source.roles



  // let dataValues = categorical.values;
  // let category, dataValue, highlightsArray


  // if (categorical.categories) {
  //   category = categorical.categories[0];
  //   dataValue = categorical.values[0];
  //   if (dataValue.highlights) {
  //     highlightsArray = categorical.values[0].highlights
  //   }
  // }

  let timelineSettings = {
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
      customJS: getValue(objects, 'textSettings', 'customJS', defaultSettings.textSettings.customJS)
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
