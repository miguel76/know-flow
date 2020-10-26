import { Algebra } from 'sparqlalgebrajs';
import {Term} from "rdf-js";

export type DataType = "graph" | "dataset" | "bindings"; // "term" |

export type PortDirection = "in" | "out";

export type Port = {
    dir: PortDirection,
    dataType: DataType,
    parentComponent: QueryComponent,
    portName?: string, // undefined if is default port
    links: DataLink[]
};

export type InputPort = Port & {
    dir: "in",
    multiple: boolean
};

export type MultiInputPort = InputPort & {
    multiple: true
};

export type SingleInputPort = InputPort & {
    multiple: false,
    link?: DataLink
};

export type OutputPort = Port & {
    dir: "out"
};

export type PortMap<PortType> = {
    default?: PortType,
    named?: {[portName:string]: PortType},
};

export type PortMapByType<PortType> = {
    [type in DataType]?: PortMap<PortType>
};

export type RefTo<PortType, T> = PortType & {
    ref: T
};


// type InputPortMap = {
//     default?: InputPort,
//     named?: {[portName:string]: InputPort},
// };
//
// type InputPortMapByType = {
//     [type:string]: InputPortMap
// };
//
// type OutputPortMap = {
//     default?: OutputPort,
//     named?: {[portName:string]: InputPort},
// };
//
// type InputPortMapByType = {
//     [type:string]: InputPortMap
// };

export type DatasetMap<T> = {
    defaultGraph?: T,
    namedGraphs?: {[graphName:string]: T},
};

// export type GraphInDataset = {defaultGraph: boolean};
export type GraphInDataset = {defaultGraph: true} | {graphName: string};

export type QueryComponent = {
    queryComponenType: string,
    ports: {
        input?: PortMapByType<InputPort>,
        output?: PortMapByType<OutputPort>
    }
};

export type DataLink = {
    dataType: DataType,
    from: OutputPort,
    to: InputPort
};

// export type PortInternalMapping<InternalType> = {
//     portToInternal: {[port:Port]: PortMap<PortType>}
//     internalToPort:
// };

export type GraphSelector = QueryComponent & {
    queryComponenType: 'graphSelector',
    graphsToOutputPorts: DatasetMap<RefTo<OutputPort, GraphInDataset>>,
    ports: {
        input: {dataset: {default: SingleInputPort}},
        output: {graph: PortMap<RefTo<OutputPort, GraphInDataset>>}
    }
};

export type ConstructQuery = QueryComponent & {
    type: 'constructQuery',
    construct: Algebra.Construct,
    ports: {
        input: {dataset: {default: SingleInputPort}},
        output: {graph: {default: OutputPort}}
    }
};

export type GraphMerge = QueryComponent & {
    type: 'graphMerge',
    ports: {
        input: {graph: {default: MultiInputPort}},
        output: {graph: {default: OutputPort}}
    }
};

export type DatasetBuilder = QueryComponent & {
    type: 'datasetBuilder',
    graphsToInputPorts: DatasetMap<RefTo<SingleInputPort, GraphInDataset>>,
    ports: {
        input: {graph: PortMap<RefTo<SingleInputPort, GraphInDataset>>},
        output: {dataset: {default: OutputPort}}
    }
};

export type DatasetMerge = QueryComponent & {
    type: 'datasetMerge',
    ports: {
        input: {dataset: {default: MultiInputPort}},
        output: {dataset: {default: OutputPort}}
    }
};

export type SparqlEndpoint = QueryComponent & {
    type: 'sparqlEndpoint',
    baseURL: string,
    ports: {
        output: {dataset: {default: OutputPort}}
    }
};

export type DefaultSparqlEndpoint = QueryComponent & {
    type: 'defaultSparqlEndpoint',
    ports: {
        output: {dataset: {default: OutputPort}}
    }
};

export type AllTermsFromDataset = QueryComponent & {
    type: 'allTermsFromDataset';
    ports: {
        input: {dataset: {default: SingleInputPort}},
        output: {bindings: {default: OutputPort}}
    }
}

export type AllTermsFromGraph = QueryComponent & {
    type: 'allTermsFromDataset';
    ports: {
        input: {graph: {default: SingleInputPort}},
        output: {bindings: {default: OutputPort}}
    }
}

// export type NamedVarMapping = {name: string, nameInQuery: string};

export type QueryVarName = string;

export type BindingVarToQueryVar = {
    default?: QueryVarName;
    named: {[varName: string]: QueryVarName};
};

export type QueryVarToBindingVar = {
    [queryVarName in QueryVarName]: {varType: 'default'} | {varType: 'named', varName: string}
};

export type QueryPortVarMapping = {
    portToQuery: BindingVarToQueryVar,
    queryToPort: QueryVarToBindingVar
};

// export type SelectQuery = QueryComponent & {
//     type: 'selectQuery',
//     selectQuery: Algebra.Operation,
//     ports: {
//         input: {
//             dataset: {default: SingleInputPort},
//             term: PortMap<SingleInputPort> // PortMap<SingleInputPort>
//         },
//         output: {term: PortMap<OutputPort>}
//     }
// }

export type SelectQuery = QueryComponent & {
    type: 'selectQuery',
    selectQuery: Algebra.Operation,
    inputMap: QueryPortVarMapping,
    outputMap: QueryPortVarMapping,
    ports: {
        input: {
            dataset: {default: SingleInputPort},
            bindings: {default: SingleInputPort} // PortMap<SingleInputPort>
        },
        output: {bindings: {default: OutputPort}}
    }
}
