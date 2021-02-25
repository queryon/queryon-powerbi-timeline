import { annotationCustomType } from "d3-svg-annotation";
import powerbi from "powerbi-visuals-api";
import { DataPointAlignment } from "./dataPointAlignment";
import * as svgAnnotations from "d3-svg-annotation";
import { stackOrderAscending } from "d3";
import { stringifyAsPrettyJSON } from "powerbi-visuals-utils-formattingutils/lib/src/stringExtensions";


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

    public isImageValid():boolean{
debugger;
        if (this.image.toString().length > 5 && this.image.toString().substring(0,5).toLowerCase() == "data:")
            return true;
        return false;
    }
}


