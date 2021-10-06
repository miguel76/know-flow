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

export class Task<ReturnType> {
    constructor() {}
}

export class Action<ReturnType> extends Task<ReturnType> {
    exec: (input: Table) => Promise<ReturnType>;

    constructor(exec: (input: Table) => Promise<ReturnType>) {
        super();
        this.exec = exec;
    }
}

export class Cascade<TaskReturnType, ActionReturnType> extends Task<ActionReturnType> {
    task: Task<TaskReturnType>;
    action: (taskResult: TaskReturnType) => Promise<ActionReturnType>;

    constructor(
            task: Task<TaskReturnType>,
            action: (taskResult: TaskReturnType) => Promise<ActionReturnType>) {
        super();
        this.task = task;
        this.action = action;
    }
}

export class Parallel<EachReturnType> extends Task<EachReturnType[]> {
    subtasks: Task<EachReturnType>[];

    constructor(subtasks: Task<EachReturnType>[]) {
        super();
        this.subtasks = subtasks;
    }
}

export class ForEach<EachReturnType> extends Task<EachReturnType[]> {
    subtask: Task<EachReturnType>;

    constructor(subtask: Task<EachReturnType>) {
        super();
        this.subtask = subtask;
    }
}

export class QueryAndTask<ReturnType> extends Task<ReturnType> {
    next: Task<ReturnType>;

    constructor(next: Task<ReturnType>) {
        super();
        this.next = next;
    }
}

export class Let<ReturnType> extends QueryAndTask<ReturnType> {
    currVarname: string;
    newVarname: string;
    hideCurrVar: boolean;

    constructor(
            next: Task<ReturnType>,
            currVarname: string,
            newVarname: string,
            hideCurrVar: boolean) {
        super(next);
        this.currVarname = currVarname;
        this.newVarname = newVarname;
        this.hideCurrVar = hideCurrVar;
     }
}

export class Join<ReturnType> extends QueryAndTask<ReturnType> {
    right: Algebra.Operation;

    constructor(next: Task<ReturnType>, right: Algebra.Operation) {
        super(next);
        this.right = right;
    }
}

export class Filter<ReturnType> extends QueryAndTask<ReturnType> {
    expression: Algebra.Expression;

    constructor(next: Task<ReturnType>, expression: Algebra.Expression) {
        super(next);
        this.expression = expression;
    }
}

export class Aggregate<ReturnType> extends QueryAndTask<ReturnType> {
    aggregates: Algebra.BoundAggregate[];

    constructor(next: Task<ReturnType>, aggregates: Algebra.BoundAggregate[]) {
        super(next);
        this.aggregates = aggregates;
    }
}

export class Slice<ReturnType> extends QueryAndTask<ReturnType> {
    start: number;
    length?: number;

    constructor(next: Task<ReturnType>, start: number, length?: number) {
        super(next);
        this.start = start;
        this.length = length;
    }
}
