import { Algebra } from 'sparqlalgebrajs';
import * as RDF from "rdf-js";
import {Bindings, BindingsStream} from '@comunica/types';

export interface Table {
    bindingsStream: BindingsStream;
    variables: string[];
    canContainUndefs: boolean;
}

export interface TableSync {
    bindingsArray: {[varname: string]: any}[];
    variables: string[];
    canContainUndefs: boolean;
}

export class Flow<ReturnType> {
    constructor() {}
}

export class Action<ReturnType> extends Flow<ReturnType> {
    exec: (input: Table) => Promise<ReturnType>;

    constructor(exec: (input: Table) => Promise<ReturnType>) {
        super();
        this.exec = exec;
    }
}

export class Cascade<SubflowReturnType, ActionReturnType> extends Flow<ActionReturnType> {
    subflow: Flow<SubflowReturnType>;
    action: (subflowResult: SubflowReturnType) => Promise<ActionReturnType>;

    constructor(
            subflow: Flow<SubflowReturnType>,
            action: (subflowResult: SubflowReturnType) => Promise<ActionReturnType>) {
        super();
        this.subflow = subflow;
        this.action = action;
    }
}

export class Parallel<EachReturnType> extends Flow<EachReturnType[]> {
    subflows: Flow<EachReturnType>[];

    constructor(subflows: Flow<EachReturnType>[]) {
        super();
        this.subflows = subflows;
    }
}

export class ForEach<EachReturnType> extends Flow<EachReturnType[]> {
    subflow: Flow<EachReturnType>;

    constructor(subflow: Flow<EachReturnType>) {
        super();
        this.subflow = subflow;
    }
}

export class DataOperation<ReturnType> extends Flow<ReturnType> {
    subflow: Flow<ReturnType>;

    constructor(subflow: Flow<ReturnType>) {
        super();
        this.subflow = subflow;
    }
}

export class Let<ReturnType> extends DataOperation<ReturnType> {
    currVarname: string;
    newVarname: string;
    hideCurrVar: boolean;

    constructor(
            subflow: Flow<ReturnType>,
            currVarname: string,
            newVarname: string,
            hideCurrVar: boolean) {
        super(subflow);
        this.currVarname = currVarname;
        this.newVarname = newVarname;
        this.hideCurrVar = hideCurrVar;
     }
}

export class Join<ReturnType> extends DataOperation<ReturnType> {
    right: Algebra.Operation;

    constructor(subflow: Flow<ReturnType>, right: Algebra.Operation) {
        super(subflow);
        this.right = right;
    }
}

export class Filter<ReturnType> extends DataOperation<ReturnType> {
    expression: Algebra.Expression;

    constructor(subflow: Flow<ReturnType>, expression: Algebra.Expression) {
        super(subflow);
        this.expression = expression;
    }
}

export class Aggregate<ReturnType> extends DataOperation<ReturnType> {
    aggregates: Algebra.BoundAggregate[];

    constructor(subflow: Flow<ReturnType>, aggregates: Algebra.BoundAggregate[]) {
        super(subflow);
        this.aggregates = aggregates;
    }
}

export class Slice<ReturnType> extends DataOperation<ReturnType> {
    start: number;
    length?: number;

    constructor(subflow: Flow<ReturnType>, start: number, length?: number) {
        super(subflow);
        this.start = start;
        this.length = length;
    }
}
