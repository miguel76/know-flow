import { Algebra } from 'sparqlalgebrajs';
import {Term} from "rdf-js";

export interface GraphConsumer {}
export interface DatasetConsumer {}
export interface RDFTermConsumer {}
export interface RDFTermObserver {}

export class GraphSource {
    // [key:string]: any;
    type: string;
    consumers: GraphConsumer[] = [];

    addConsumer(consumer: GraphConsumer) {
        this.consumers.includes(this) || this.consumers.push(this);
    }

    removeConsumer(consumer: GraphConsumer) {
        const index = this.consumers.indexOf(consumer);
        (index > -1) && this.consumers.splice(index, 1);
    }
}

// export interface Graph extends GraphSource {
//     type: 'graph';
//     graph: RDFGraph;
// }

export class GraphSelector extends GraphSource implements DatasetConsumer {
    type: 'graphSelector';
    datasetSource: DatasetSource;
    graphName: Term;

    constructor(datasetSource: DatasetSource, graphName: Term) {
        super();
        this.datasetSource = datasetSource;
        this.graphName = graphName;
        this.datasetSource.addConsumer(this);
    }

    detache() {
        this.datasetSource.removeConsumer(this);
    }
}

export class ConstructQuery extends GraphSource implements DatasetConsumer {
    type: 'constructQuery';
    datasetSource: DatasetSource;
    construct: Algebra.Construct;

    constructor(datasetSource: DatasetSource, construct: Algebra.Construct) {
        super();
        this.datasetSource = datasetSource;
        this.construct = construct;
        this.datasetSource.addConsumer(this);
    }

    detache() {
        this.datasetSource.removeConsumer(this);
    }
}

export class DatasetSource {
    // [key:string]: any;
    type: string;
    consumers: DatasetConsumer[] = [];

    addConsumer(consumer: DatasetConsumer) {
        this.consumers.includes(this) || this.consumers.push(this);
    }

    removeConsumer(consumer: DatasetConsumer) {
        const index = this.consumers.indexOf(consumer);
        (index > -1) && this.consumers.splice(index, 1);
    }
}

export class DatasetBuilder extends DatasetSource implements GraphConsumer {
    type: 'datasetBuilder';
    defaultGraphSource: GraphSource;
    namedGraphSources: Map<RDFTerm, GraphSource>;

    constructor(defaultGraphSource: GraphSource, namedGraphSources: Map<RDFTerm, GraphSource>) {
        super();
        this.defaultGraphSource = defaultGraphSource;
        this.namedGraphSources = namedGraphSources;
        this.defaultGraphSource.addConsumer(this);
        Object.values(this.namedGraphSources).forEach(namedGraphSource => {
            namedGraphSource.addConsumer(this);
        });
    }

    detache() {
        this.defaultGraphSource.removeConsumer(this);
        Object.values(this.namedGraphSources).forEach(namedGraphSource => {
            namedGraphSource.removeConsumer(this);
        });
    }
}

export class SparqlEndpoint extends DatasetSource {
    type: 'sparqlEndpoint';
    baseURL: string;

    constructor(baseURL: string) {
        super();
        this.baseURL = baseURL;
    }
}

export class DefaultSparqlEndpoint extends DatasetSource {
    type: 'defaultSparqlEndpoint';
}

export class RDFTermSource {
    // [key:string]: any;
    type: string;
    consumers: RDFTermConsumer[] = [];
    observers: RDFTermObserver[] = [];

    addConsumer(consumer: RDFTermConsumer) {
        this.consumers.includes(this) || this.consumers.push(this);
    }

    removeConsumer(consumer: RDFTermConsumer) {
        const index = this.consumers.indexOf(consumer);
        (index > -1) && this.consumers.splice(index, 1);
    }

    addObserver(consumer: RDFTermConsumer) {
        this.observers.includes(this) || this.observers.push(this);
    }

    removeObserver(consumer: RDFTermConsumer) {
        const index = this.observers.indexOf(consumer);
        (index > -1) && this.observers.splice(index, 1);
    }

    hasObserver() {
        this.observers.length > 0;
    }

}

export class RDFTerm extends RDFTermSource {
    type: 'rdfTerm';
    rdfTerm: Term;

    constructor(rdfTerm: Term) {
        super();
        this.rdfTerm = rdfTerm;
    }
}

export class VarFromSelectQuery extends RDFTermSource implements DatasetConsumer, RDFTermConsumer {
    type: 'varFromSelect';
    varName: string;
    selectQuery: Algebra.Operation;
    datasetSource: DatasetSource;
    params: Map<string, RDFTermSource>;

    constructor(varName: string, selectQuery: Algebra.Operation, datasetSource: DatasetSource, params: Map<string, RDFTermSource>) {
        super();
        this.varName = varName;
        this.selectQuery = selectQuery;
        this.datasetSource = datasetSource;
        this.params = params;
        this.datasetSource.addConsumer(this);
        // this.params.values().forEach(x => x.addConsumer(this));
        for (let source of this.params.values()) {
            source.addConsumer(this);
        }
    }

    detache() {
        this.datasetSource.removeConsumer(this);
    }
}

export class AllTermsFromDatasetSource extends RDFTermSource implements DatasetConsumer {
    type: 'allTerms';
    datasetSource: DatasetSource;

    constructor(datasetSource: DatasetSource) {
        super();
        this.datasetSource = datasetSource;
        this.datasetSource.addConsumer(this);
    }

    detache() {
        this.datasetSource.removeConsumer(this);
    }
}

export interface NodeSource {
    graphSource: GraphSource;
    rdfTermSource: RDFTermSource;
}

export interface Context {
    nodeSource: NodeSource;
    rdfTermSource: RDFTermSource;
}
