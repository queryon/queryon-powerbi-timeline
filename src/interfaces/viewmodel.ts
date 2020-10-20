import { DataPoint } from "../dataPoint";
import { Settings } from "../settings";

/** The View Model containing the data and settings for the Timeline */
export interface ViewModel {
    dataPoints: DataPoint[];
    settings: Settings
}