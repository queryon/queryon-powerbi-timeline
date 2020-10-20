import powerbi from "powerbi-visuals-api";


export class DataPoint {
    public label: string = '';
    public date: Date;
    public URL: string | boolean = false;
    public image: string | boolean = false;
    public description: string = '';
    public labelColumn: string;
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

    
}