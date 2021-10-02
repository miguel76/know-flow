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

export interface Task<ReturnType> {
    taskType: string;
}

export interface Action<ReturnType> extends Task<ReturnType> {
    taskType: 'action';
    exec: (input: Table) => Promise<ReturnType>;
}

export interface Cascade<TaskReturnType, ActionReturnType> extends Task<ActionReturnType> {
    taskType: 'cascade';
    task: Task<TaskReturnType>;
    action: (taskResult: TaskReturnType) => Promise<ActionReturnType>;
}

export interface Parallel<EachReturnType> extends Task<EachReturnType[]> {
    taskType: 'parallel';
    subtasks: Task<EachReturnType>[];
}

export interface ForEach<EachReturnType> extends Task<EachReturnType[]> {
    taskType: 'for-each';
    subtask: Task<EachReturnType>;
}

export interface QueryAndTask<ReturnType> extends Task<ReturnType> {
    taskType: 'query';
    queryType: string;
    next: Task<ReturnType>;
}

export interface Let<ReturnType> extends QueryAndTask<ReturnType> {
    queryType: 'let';
    currVarname: string;
    newVarname: string;
    hideCurrVar: boolean;
}

// export interface Traverse<ReturnType> extends QueryAndTask<ReturnType> {
//     queryType: 'traverse';
//     predicate: Algebra.PropertyPathSymbol;
//     graph: RDF.Term;
// }

export interface Join<ReturnType> extends QueryAndTask<ReturnType> {
    queryType: 'join';
    right: Algebra.Operation;
}

export interface Filter<ReturnType> extends QueryAndTask<ReturnType> {
    queryType: 'filter';
    expression: Algebra.Expression;
}

export interface Aggregate<ReturnType> extends QueryAndTask<ReturnType> {
    queryType: 'aggregate';
    aggregates: Algebra.BoundAggregate[];
}

export interface Slice<ReturnType> extends QueryAndTask<ReturnType> {
    queryType: 'slice';
    start: number;
    length?: number;
}
