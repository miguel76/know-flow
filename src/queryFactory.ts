import { DataLink, DatasetMap, DataType, GraphInDataset, GraphSelector, InputPort, OutputPort, Port, PortDirection, PortMap, PortMapByType, PortMapping, QueryComponent, RefTo } from "./query";

export function createPort(
    dir: PortDirection,
    dataType: DataType,
    parentComponent: QueryComponent,
    multiple?: boolean,
    portName?: string
): Port {
    return {
        dir, dataType, parentComponent, portName,
        multiple: dir === 'out' || multiple,
        links: [],
        connect: (link:DataLink) => {
            if (link.dataType !== this.dataType) {
                throw new Error("Tried to connect link to port with mismatching type");
            }
            if (this.multiple) {
                if (!this.links.includes(link)) {
                    this.links.push(link);
                }
            } else {
                if (this.links.length === 0) {
                    this.links.push(link);
                    this.link = link;
                } else {
                    throw new Error("Tried to connect link to already used single link port");
                }
            }
        },
        disconnect: (link:DataLink) => {
            const index = this.links.indexOf(link);
            if (index > -1) {
                this.links.splice(index, 1);
                if (!this.multiple) {
                    this.link = undefined;
                }
            }
        }
    };
}

export function createInputPort(
    dataType: DataType,
    parentComponent: QueryComponent,
    multiple?: boolean,
    portName?: string
): InputPort {
    return createPort("in", dataType, parentComponent, multiple, portName) as InputPort;
}

export function createOutputPort(
    dataType: DataType,
    parentComponent: QueryComponent,
    portName?: string
): OutputPort {
    return createPort("out", dataType, parentComponent, true, portName) as OutputPort;
}

export type PortData = {
    multiple?: boolean,
    ref?: any
};

// export type InputPortData = {
//     multiple: boolean,
//     ref?: any
// };

// export type OutputPortData = {
//     ref?: any
// };

export type PortDataMapping = {
    input?: PortMapByType<PortData>,
    output?: PortMapByType<PortData>
};

export function portsFromPortDataMap(
    portMap: PortMap<PortData>,
    parentComponent: QueryComponent,
    dir: PortDirection,
    dataType: DataType
): PortMap<Port> {
    return {
            ...(portMap.default !== undefined) ? {
                default: {
                    ...createPort(dir, dataType, parentComponent, portMap.default.multiple),
                    ...(portMap.default.ref !== undefined) ? {
                        ref: portMap.default.ref
                    } : {}
                },
            } : {},
            ...(portMap.named !== undefined) ? {
                named: (Object as any).fromEntries(Object.entries(portMap.named)
                        .map(([name, portData]) => [name, {
                            ...createPort(dir, dataType, parentComponent, portMap.default.multiple, name),
                            ...(portMap.default.ref !== undefined) ? {
                                ref: portMap.default.ref
                            } : {}
                        }]))
            } : {}
    };
}

export function portsFromPortDataMapByType(
    portMapByType: PortMapByType<PortData>,
    parentComponent: QueryComponent,
    dir: PortDirection
): PortMapByType<Port> {
    return (Object as any).fromEntries(Object.entries(portMapByType)
            .map(([dataType, portMap]) => [dataType,
                portsFromPortDataMap(portMap, parentComponent, dir, dataType as DataType)
            ])
    );
}

export function portsFromPortDataMapping(
    portDataMapping: PortDataMapping,
    parentComponent: QueryComponent
): PortMapping {
    return {
        ...(portDataMapping.input !== undefined) ? {
            input: <PortMapByType<InputPort>> 
                    portsFromPortDataMapByType(portDataMapping.input, parentComponent, "in")
        } : {},
        ...(portDataMapping.output !== undefined) ? {
            output: <PortMapByType<OutputPort>> 
                    portsFromPortDataMapByType(portDataMapping.output, parentComponent, "out")
        } : {}
    };
}

export function createDataLink(
    dataType: DataType,
    from: OutputPort,
    to: InputPort
): DataLink {
    const newLink = {dataType, from, to};
    from.connect(newLink);
    to.connect(newLink);
    return newLink;
};

export function createGraphSelector(
    ports: {
        input: {dataset: {default: PortData}},
        output: {graph: PortMap<RefTo<PortData, GraphInDataset>>}
    }
): GraphSelector {
    const newGraphSelector = {
        queryComponenType: 'graphSelector',
        ports: {}
    };
    const portMapping = portsFromPortDataMapping(ports, newGraphSelector);
    const outputPortMap = portMapping.output.graph as PortMap<RefTo<OutputPort, GraphInDataset>>;
    const outputPortsList = [
        ...outputPortMap.default !== undefined ? [outputPortMap.default] : [],
        ...outputPortMap.named !== undefined ? Object.values(outputPortMap.named) : []
    ];
    const portsForDefaultGraph = outputPortsList.filter(port => port.ref.graphName === undefined);
    if (portsForDefaultGraph.length > 1) {
        throw new Error("Too many ports reference default graph");
    }
    const portsForNamedGraphs = outputPortsList.filter(port => port.ref.graphName !== undefined);
    const graphsToOutputPorts: DatasetMap<RefTo<OutputPort, GraphInDataset>> = {
        ...portsForDefaultGraph.length === 1 ? {
            defaultGraph: portsForDefaultGraph[0]
        } : {},
        ...portsForNamedGraphs.length > 0 ? {
            namedGraphs: (<any>Object).fromEntries(portsForNamedGraphs.map(port => [port.ref.graphName, port]))
        } : {}
    }
    return Object.assign(newGraphSelector, {
        ports: portMapping,
        graphsToOutputPorts
    }) as GraphSelector;
}

// export type ConstructQuery = QueryComponent & {
//     type: 'constructQuery',
//     construct: Algebra.Construct,
//     ports: {
//         input: {dataset: {default: SingleInputPort}},
//         output: {graph: {default: OutputPort}}
//     }
// };

// export type GraphMerge = QueryComponent & {
//     type: 'graphMerge',
//     ports: {
//         input: {graph: {default: MultiInputPort}},
//         output: {graph: {default: OutputPort}}
//     }
// };

