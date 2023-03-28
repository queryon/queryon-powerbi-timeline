"use strict";

import "core-js/stable";
import 'regenerator-runtime/runtime'
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import * as d3 from "d3";
import { ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";

type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

export function handleInteractions(svg: Selection<SVGElement>, selectionManager: ISelectionManager, styleSettings: any, textSettings: any, container: any, tooltipServiceWrapper: ITooltipServiceWrapper) {
    // Handle context menu - right click
    svg.on('contextmenu', () => {
        handleContextMenuRightClick(selectionManager);
    });

    // Handles click on/out bar
    svg.on('click', () => {
        handleSvgClick(selectionManager, styleSettings, textSettings, container);
    });

    // Handles mouseover
    svg.on('mouseover', () => {
        handleMouseOver(tooltipServiceWrapper);
    });
}


// Handle context menu - right click 
function handleContextMenuRightClick(selectionManager: ISelectionManager) {
    const mouseEvent: MouseEvent = <MouseEvent>d3.event;
    const eventTarget: EventTarget = mouseEvent.target;
    let dataPoint: any = d3.select(<Element>eventTarget).datum();
    selectionManager.showContextMenu(dataPoint ? dataPoint.selectionId : {}, {
        x: mouseEvent.clientX,
        y: mouseEvent.clientY
    });
    mouseEvent.preventDefault();
}

/**
 * Handles click event on the bar in the chart. If a data point is clicked, 
 * it does nothing. Otherwise, it clears the selection and resets the styling 
 * of the chart elements.
 * 
 * @param selectionManager - Instance of ISelectionManager used to manage selections.
 */
function handleSvgClick(selectionManager: ISelectionManager, styleSettings: any, textSettings: any, container: any) {
    // Get the mouse event and target element
    const mouseEvent: MouseEvent = <MouseEvent>d3.event;
    const eventTarget: EventTarget = mouseEvent.target;

    // Get the data point associated with the clicked element
    let dataPoint: any = d3.select(<Element>eventTarget).datum();

    // If a data point was clicked, do nothing
    if (dataPoint) {
        // Do nothing
    } 
    // Otherwise, clear the selection and reset the styling of chart elements
    else {
        selectionManager.clear().then(() => {
            if (styleSettings.timelineStyle == "minimalist") {
                d3.selectAll('.annotationSelector').style('opacity', 1)
                d3.selectAll('.minIconSelector').style('opacity', 1)
            } else {
                container.selectAll('.annotationSelector').style('font-weight', "normal")

                if (!textSettings.boldTitles) {
                    container.selectAll('.annotationSelector  .annotation-note-title ').style('font-weight', "normal")
                }
            }
        })
    }
}

function handleMouseOver(tooltipServiceWrapper: ITooltipServiceWrapper) {
    const mouseEvent: MouseEvent = <MouseEvent>d3.event;
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
        tooltipServiceWrapper.addTooltip(d3.select(<Element>eventTarget),
            () => args,
            () => null);
    }
}