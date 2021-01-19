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
        this.download = DownloadSettings.FromViewObjects(dataObjects);
        this.textSettings = TextSettings.FromViewObjects(dataObjects);
        this.axisSettings = AxisSettings.FromViewObjects(dataObjects);
        this.styleSettings = StyleSettings.FromViewObjects(dataObjects);
        this.imageSettings = ImageSettings.FromViewObjects(dataObjects);
    }
}

/** Base class for all settings */
export class SettingBase {
    public settingName: string = "";
    /** Generates this setting object from the provided view objects. Typically called from child class, not external callers */
    public static GenerateSettingsObj<TSetting extends SettingBase>(type: (new () => TSetting), objects?: powerbi.DataViewObjects, ) : TSetting {
        
        const settingsInstance = new type();
        const settingName = settingsInstance.settingName;

        // Objects[settingsName] keys corresponds the property values on the settings classes
        // Only continue if it is defined
        if(objects && objects[settingName]) {

            // Enumerate all properties, and check them against the DataViewObject keys
            for(let key in settingsInstance) {
                if(objects[settingName][key] !== undefined) {
                    settingsInstance[key] = objects[settingName][key] as any; // as any workaround for lack of type checking here
                }
            }
        }
        return settingsInstance;
    }
}

export class DownloadSettings extends SettingBase {
    settingName = "download"
    public downloadCalendar: boolean = false;
    public position: string = 'TOP,LEFT';
    public calendarName: string = '';

    public static FromViewObjects(objects?: powerbi.DataViewObjects) : DownloadSettings {
        return SettingBase.GenerateSettingsObj(DownloadSettings, objects);
    }
}

export class TextSettings extends SettingBase {
    settingName = "textSettings"
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

    public static FromViewObjects(objects?: powerbi.DataViewObjects) : TextSettings {
        return SettingBase.GenerateSettingsObj(TextSettings, objects);
    }
}

export class AxisSettings extends SettingBase {
    settingName = "axisSettings"
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

    public static FromViewObjects(objects?: powerbi.DataViewObjects) : AxisSettings {
        return SettingBase.GenerateSettingsObj(AxisSettings,  objects);
    }
}

export class StyleSettings extends SettingBase {    
    settingName = "style"
    public timelineStyle: string = "line";
    public lineColor: powerbi.Fill = { solid: { color: 'black' } };
    public lineThickness: number = 2;
    public minimalistStyle: string = "circle";
    public minimalistAxis: string = "bottom";
    public iconsColor: powerbi.Fill = { solid: { color: 'black' } };
    public minimalistConnect: boolean = false;
    public connectColor: powerbi.Fill = { solid: { color: 'gray' } };
    public minimalistSize: number = 2;
    public barColor: powerbi.Fill = { solid: { color: 'rgb(186,215,57)' } };
    public barHt: number = 30;
    public today: boolean = false;
    public todayTop: boolean = true;
    public todayColor: powerbi.Fill = { solid: { color: 'red' } }

    public static FromViewObjects(objects?: powerbi.DataViewObjects) : StyleSettings {
        return SettingBase.GenerateSettingsObj(StyleSettings, objects);
    }
}

export class ImageSettings extends SettingBase {
    settingName = "imageSettings"
    public imagesHeight: number = 100;
    public imagesWidth: number = 100;
    public style: string = 'straight';

    public static FromViewObjects(objects?: powerbi.DataViewObjects) : ImageSettings {
        return SettingBase.GenerateSettingsObj(ImageSettings, objects);
    }
}
