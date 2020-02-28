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
  // TooltipEnabledDataPoint,
  createTooltipServiceWrapper,
  ITooltipServiceWrapper,
} from 'powerbi-visuals-utils-tooltiputils'
import * as svgAnnotations from "d3-svg-annotation";
import { VisualSettings } from "./settings";

import * as d3 from "d3";
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

export class Visual implements IVisual {
  //private target: HTMLElement;
  //private updateCount: number;
  private settings: VisualSettings;
  // private textNode: Text;
  private visualSettings: VisualSettings;
  private host: IVisualHost;
  private svg: Selection<SVGElement>;
  private container: Selection<SVGElement>;
  private circle: Selection<SVGElement>;
  private textValue: Selection<SVGElement>;
  private textLabel: Selection<SVGElement>;
  private padding: number;
  private width: number;
  private height: number;
  private barHeight: number;
  private marginTop: number;
  private minVal: number;
  private maxVal: number;
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
    //set empty canva
    this.container.selectAll("g").remove();
    this.container.selectAll("rect").remove();
    //parse data
    let dataView: DataView = options.dataViews[0];
    this.visualSettings = VisualSettings.parse<VisualSettings>(dataView);
  
    console.log(this.visualSettings)

    let data = []
    let customColors = ["rgb(186,215,57)", "rgb(0, 188, 178)", "rgb(121, 118, 118)", "rgb(105,161,151)", "rgb(78,205,196)", "rgb(166,197,207)", "rgb(215,204,182)", "rgb(67,158,157)", "rgb(122,141,45)", "rgb(162,157,167)"]
    let textSize = 12, fontFamily = "Arial"

    dataView.table.rows.forEach((row, i) => {
      let dataPoint = {}, stackedBarX, value, barValue = 0

      row.forEach((cell, l) => {
        //Store data
        dataPoint[Object.keys(dataView.table.columns[l].roles)[0]] = cell.toString();

        //Store column name for additional tooltip details
        dataPoint[`${Object.keys(dataView.table.columns[l].roles)[0]}Column`] = dataView.table.columns[l].displayName
      });
      //Parse date object
      value = Date.parse(dataPoint["date"]);
      dataPoint["dateAsInt"] = value

      for (let j = i; j >= 0; j--) {
        const previousElement = data[j];
        if (previousElement) {
          barValue += previousElement["dateAsInt"]
        }
      }

      dataPoint["selectionId"] = this.host.createSelectionIdBuilder()
        .withTable(dataView.table, i)


      dataPoint["barColor"] = !dataPoint["barColor"] ? customColors[i > 10 ? i % 10 : i] : dataPoint["barColor"]
      dataPoint["labelText"] = `${dataPoint["label"]}: ${dataPoint["date"]}`
      dataPoint["textWidth"] = this.getTextWidth(dataPoint["labelText"], textSize, fontFamily)

      data.push(dataPoint)
    })



    this.width = options.viewport.width;
    this.height = options.viewport.height;
    this.marginTop = 40,
      this.barHeight = 30
    this.minVal = d3.min(data, function (d) { return d.dateAsInt })
    this.maxVal = d3.max(data, function (d) { return d.dateAsInt })

    let scale = d3.scaleLinear()
      .domain([this.minVal, this.maxVal]) //min and max data from input
      .range([0, this.width - (this.padding * 2)]); //min and max width in px           

    this.svg.attr("width", this.width);
    this.svg.attr("height", this.height);


    let bar

    bar = this.container.selectAll('rect')
      .data(data.sort(function (a, b) { return b.dateAsInt - a.dateAsInt }))

    bar.enter()
      .append('rect')
      .merge(bar)
      // .attr('class', 'bar')
      .attr('width', d => {
        return scale(d.dateAsInt)

      })
      .attr('class', el => `bar selector_${el.label.replace(/\W/g, '')}_${el.dateAsInt}`)
      .attr('x', d => {
        // console.log(d.stackedBarX)
        return this.padding
        // + scale(d.stackedBarX)

      })
      .attr('fill', function (d, i) {

        return d.barColor
      })
      //.attr('fill-opacity', (d) => {
      // if (this.highlighted) {
      //   return d.highlight ? 1 : 0.1
      // } else {
      //   return 1
      // }
      //})
      .attr('y', this.marginTop)
      .attr('height', this.barHeight)
    bar.exit().remove()


    let annotationsData, makeAnnotations


    let type = svgAnnotations.annotationLabel
    let alignment = {
      "className": "custom",
      "note": { "align": "dynamic" }
    }

    data.forEach((element, i) => {
      element["x"] = this.padding + scale(element.dateAsInt)
      alignment.note.align = this.getAnnotationOrientation(element)
      //    element.x = this.padding + scale(element.x)
      annotationsData = [{
        note: {
          wrap: 900,
          label: element.labelText,
          bgPadding: 10
        },
        x: element.x,
        // scale(element.dateAsInt),
        y: this.marginTop + this.barHeight,
        dy: 10,
        color: element.barColor,
        id: element.selectionId
      }]

      makeAnnotations = svgAnnotations.annotation()
        .annotations(annotationsData)
        .type(new svgAnnotations.annotationCustomType(type, alignment))

      //   if (this.viewModel.settings.textFormatting.annotationStyle === 'textOnly') {
      makeAnnotations
        .disable(["connector"])

      //   }



      this.container
        .append("g")
        // .attr('class', 'annotations')
        .attr('class', `annotation_selector_${element.label.replace(/\W/g, '')}_${element.dateAsInt} annotationSelector`)
        //.style('stroke', 'transparent')
        .style('font-size', textSize + "px")
        .style('font-family', fontFamily)
        .style('background-color', 'transparent')
        // .style('text-decoration', () => {
        //   if (this.highlighted) {
        //     return element.highlight ? "none" : "line-through";
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
              this.container.selectAll('.annotationSelector').style('text-decoration', "line-through")
              d3.selectAll(`.annotation_selector_${element.label.replace(/\W/g, '')}_${element.dateAsInt}`).style('text-decoration', "none")


            } else {
              this.container.selectAll('.bar').style('fill-opacity', 1)
              this.container.selectAll('.annotationSelector').style('text-decoration', "none")

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

            this.container.selectAll('.annotationSelector').style('text-decoration', "line-through")
            d3.select(`.annotation_selector_${dataPoint.label.replace(/\W/g, '')}_${dataPoint.dateAsInt}`).style('text-decoration', "none")
            
          } else {
            this.container.selectAll('.bar').style('fill-opacity', 1)
            this.container.selectAll('.annotationSelector').style('text-decoration', "none")
          }
        })
      } else {

        this.selectionManager.clear().then(() => {

          this.container.selectAll('.bar').style('fill-opacity', 1)
          this.container.selectAll('.annotationSelector').style('text-decoration', "none")

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

    // this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
    // console.log('Visual update', options);
    // if (this.textNode) {
    //     this.textNode.textContent = (this.updateCount++).toString();
    // }
  }

  private static parseSettings(dataView: DataView): VisualSettings {
    return <VisualSettings>VisualSettings.parse(dataView);
  }

  /**
   * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
   * objects and properties you want to expose to the users in the property pane.
   *
   */
  public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
    const settings: VisualSettings = this.visualSettings || <VisualSettings>VisualSettings.getDefault();
    return VisualSettings.enumerateObjectInstances(settings, options);

  }


  private getTextWidth(textString: string, fontSize: number, fontFamily: string) {
    let textData = [textString]

    let textWidth

    //Measure text's width for correct positioning of annotation
    this.svg.append('g')
      .selectAll('.dummyText')
      .data(textData)
      .enter()
      .append("text")
      .attr("font-family", fontFamily)
      .attr("font-size", fontSize)
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

  private getTextHeight(textString: string, fontSize: number, fontFamily: string) {
    let textData = [textString]

    let textHeight

    //Measure text's width for correct positioning of annotation
    this.svg.append('g')
      .selectAll('.dummyText')
      .data(textData)
      .enter()
      .append("text")
      .attr("font-family", fontFamily)
      .attr("font-size", fontSize)
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
