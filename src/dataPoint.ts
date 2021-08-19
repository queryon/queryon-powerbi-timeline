import { annotationCustomType } from "d3-svg-annotation";
import powerbi from "powerbi-visuals-api";
import { DataPointAlignment } from "./dataPointAlignment";
import * as svgAnnotations from "d3-svg-annotation";


export class DataPoint {
    public label: string = '';
    public date: Date;
    public URL: string = '';
    public image: string | boolean = false;
    public description: string = '';
    public labelColumn: string = '';
    public labelText: string = '';
    public dateColumn: string;
    public descriptionColumn: string | boolean;

    public selectionId: powerbi.visuals.ISelectionId;
    public dateAsInt: number;

    public customFormat: boolean = false;
    public fontFamily: string = "Arial";
    public textSize: number = 12;
    public textColor: string = 'black';
    public iconColor: string = 'black';
    public top: boolean = false;
    public customVertical: boolean = false;
    public verticalOffset: number = 20;
    public annotationStyle: string = 'annotationLabel';
    public labelOrientation: string = 'Auto';

    public style: typeof svgAnnotations.Type;

    public alignment: DataPointAlignment = new DataPointAlignment();

    public textWidth: number = 0;
    public textHeight: number = 0;
    
    public x: number = 0; // ??
    public dy: number = 0; // ??
}

export class RowOfImage //Class that holds info on a list of ImageData
{
    public rowData_dateAsInt: number
    public rowData_firstImageY: number
    public rowData_numberOfImages: number
    public rowData_lastImageY: number
    public rowData_shouldAlternate: boolean

    constructor(rowData_dateAsInt: number, rowData_firstImageY: number, rowData_numberOfImages: number, rowData_lastImageY: number, rowData_shouldAlternate: boolean) {
        this.rowData_dateAsInt       = rowData_dateAsInt;
        this.rowData_firstImageY     = rowData_firstImageY;
        this.rowData_numberOfImages  = rowData_numberOfImages;
        this.rowData_lastImageY      = rowData_lastImageY;
        this.rowData_shouldAlternate = rowData_shouldAlternate;
    }
}

export class SingleImage
{
    public imageData_label: string
    public imageData_x: number
    public imageData_y: number
    public imageData_dateAsInt: number

    public imageData_image: any

    public imageData_imageOnTop: boolean

    constructor(imageData_label: string, imageData_x: number, imageData_y: number, imageData_dateAsInt: number, imageData_image: any, imageData_imageOnTop: boolean)
    {
        this.imageData_label     = imageData_label
        this.imageData_x         = imageData_x
        this.imageData_y         = imageData_y
        this.imageData_dateAsInt = imageData_dateAsInt

        this.imageData_image = imageData_image

        this.imageData_imageOnTop = imageData_imageOnTop
    }
}


