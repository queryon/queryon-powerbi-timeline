import powerbi from "powerbi-visuals-api";


export class Settings {
    public download: DownloadSettings;
    public textSettings: TextSettings;
    public axisSettings: AxisSettings;
    public styleSettings: StyleSettings;
    public imageSettings: ImageSettings;

    /** Constructs the default settings, and fills in and explicitly defined settings
     * @param dataObjects the data objects, or undefined if no data objects exist
     */
    public constructor(dataObjects?: powerbi.DataViewObjects) {
        this.download = DownloadSettings.FROMVIEWOBJECTS(dataObjects);
        this.textSettings = TextSettings.FROMVIEWOBJECTS(dataObjects);
        this.axisSettings = AxisSettings.FROMVIEWOBJECTS(dataObjects);
        this.styleSettings = StyleSettings.FROMVIEWOBJECTS(dataObjects);
        this.imageSettings = ImageSettings.FROMVIEWOBJECTS(dataObjects);
    }
}

// Base class for all settings 
export class SettingBase {
    public settingName: string = "";
    public settingList:string[];
    // Generates this setting object from the provided view objects. Typically called from child class, not external callers
    public static GENERATESETTINGSOBJ<TSetting extends SettingBase>(type: (new () => TSetting), objects?: powerbi.DataViewObjects, ) : TSetting {
        
        const settingsInstance = new type();
        const settingName = settingsInstance.settingName;

        // Objects[settingsName] keys corresponds the property values on the settings classes
        // Only continue if it is defined
        if(objects && objects[settingName]) {

            // Enumerate all properties, and check them against the DataViewObject keys
            for (let key of settingsInstance.settingList){
                if(objects[settingName][key] !== undefined) {
                    settingsInstance[key] = <any>objects[settingName][key]; // as any workaround for lack of type checking here
                }
            }
            // for(let key in settingsInstance) {
            //     if(objects[settingName][key] !== undefined) {
            //         settingsInstance[key] = <any>objects[settingName][key]; // as any workaround for lack of type checking here
            //     }
            // }
        }
        return settingsInstance;
    }
}

export class DownloadSettings extends SettingBase {
    settingName = "download";
    settingList = ['downloadCalendar', 'position', 'calendarName'];
    public downloadCalendar: boolean = false;
    public position: string = 'TOP,LEFT';
    public calendarName: string = '';

    public static FROMVIEWOBJECTS(objects?: powerbi.DataViewObjects) : DownloadSettings {
        return SettingBase.GENERATESETTINGSOBJ(DownloadSettings, objects);
    }
}

export class TextSettings extends SettingBase {
    settingName = "textSettings"    ;
    settingList = ['stagger', 'autoStagger', 'spacing','separator','boldTitles','annotationStyle','labelOrientation','fontFamily','textSize','textColor','top','dateFormat','customJS','wrap'];
    public stagger: boolean = true;
    public autoStagger: boolean =  true;
    public spacing: number =  0;
    public separator: string = ":";
    public boldTitles: boolean =  false;
    public annotationStyle: string =  "annotationLabel";
    public labelOrientation: string =  "Auto";
    public fontFamily: string =  "Arial";
    public textSize: number = 12;
    public textColor: powerbi.Fill = { solid: { color: 'Black' } };
    public top: boolean =  false;
    public dateFormat: string =  "same";
    public customJS: string =  "MM/dd/yyyy";
    public wrap: number = 400;

    public static FROMVIEWOBJECTS(objects?: powerbi.DataViewObjects) : TextSettings {
        return SettingBase.GENERATESETTINGSOBJ(TextSettings, objects);
    }
}

export class AxisSettings extends SettingBase {
    settingName = "axisSettings";    
    settingList = ['axis', 'dateFormat', 'manualScale','manualScalePixel','axisColor','fontSize','fontFamily','bold','barMin','barMax','customPixel','customJS'];
    public axis: string = "None";
    public dateFormat: string = "same";
    public manualScale: boolean = false;
    public manualScalePixel: boolean = false;
    public axisColor: powerbi.Fill = { solid: { color: 'gray' } };
    public fontSize: number = 12;
    public fontFamily: string = 'Arial';
    public bold: boolean = false;
    public barMin: string = "";
    public barMax: string = "";
    public customPixel: number = 0;
    public customJS: string = "MM/dd/yyyy"

    public static FROMVIEWOBJECTS(objects?: powerbi.DataViewObjects) : AxisSettings {
        return SettingBase.GENERATESETTINGSOBJ(AxisSettings,  objects);
    }
}

export class StyleSettings extends SettingBase {    
    settingName = "style";
    
    settingList = ['timelineStyle', 'lineColor', 'lineThickness','minimalistStyle','minimalistAxis','iconsColor','minimalistConnect','connectColor','minimalistSize','barColor','barHt','today','todayTop','todayColor'];
    public timelineStyle: string = "line";
    public lineColor: powerbi.Fill = { solid: { color: 'black' } };
    public lineThickness: number = 2;
    public minimalistStyle: string = "circle";
    public minimalistAxis: string = "bottom";
    public iconsColor: powerbi.Fill = { solid: { color: 'black' } };
    public minimalistConnect: boolean = false;
    public connectColor: powerbi.Fill = { solid: { color: 'gray' } };
    public minimalistSize: number = 2;
    public barColor: powerbi.Fill = { solid: { color: 'rgb(186;215;57)' } };
    public barHt: number = 30;
    public today: boolean = false;
    public todayTop: boolean = true;
    public todayColor: powerbi.Fill = { solid: { color: 'red' } }

    public static FROMVIEWOBJECTS(objects?: powerbi.DataViewObjects) : StyleSettings {
        return SettingBase.GENERATESETTINGSOBJ(StyleSettings, objects);
    }
}

export class ImageSettings extends SettingBase {
    settingName = "imageSettings";
    
    settingList = ['imagesHeight', 'imagesWidth', 'style'];
    public imagesHeight: number = 100;
    public imagesWidth: number = 100;
    public style: string = 'straight';

    public static FROMVIEWOBJECTS(objects?: powerbi.DataViewObjects) : ImageSettings {
        return SettingBase.GENERATESETTINGSOBJ(ImageSettings, objects);
    }
}
