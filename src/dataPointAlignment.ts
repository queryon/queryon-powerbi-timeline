// Extracted from code usage of these structures:
/*
    element["alignment"] = {
        "className": "custom",
        "connector": { "end": "dot" },
        "note": { "align": "dynamic" }
    }
 */
// This may be a type that already exists in D3 or some other lib that I am not aware of
// naming is putely based on the usage
// default values extracted from the above usage examples, all examples where the same

export class DataPointAlignment {
    public className: string = 'custom';
    public connector: DataPointAlignmentConnector = new DataPointAlignmentConnector();
    public note: DataPointAlignmentNote = new DataPointAlignmentNote();
}

export class DataPointAlignmentConnector {
    public end: string = 'dot';
}

export class DataPointAlignmentNote {
    public align: string = 'dynamic';
}