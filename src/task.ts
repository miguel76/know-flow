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
    type: string;
}

export interface Action<ReturnType> extends Task<ReturnType> {
    type: 'action';
    exec: (input: Table) => Promise<ReturnType>;
}

export interface Cascade<TaskReturnType, ActionReturnType> extends Task<ActionReturnType> {
    type: 'cascade';
    task: Task<TaskReturnType>;
    action: (taskResult: TaskReturnType) => Promise<ActionReturnType>;
}

export interface Parallel<EachReturnType> extends Task<EachReturnType[]> {
    type: 'parallel';
    subtasks: Task<EachReturnType>[];
}

export interface ForEach<EachReturnType> extends Task<EachReturnType[]> {
    type: 'for-each';
    subtask: Task<EachReturnType>;
}

export interface QueryAndTask<ReturnType> extends Task<ReturnType> {
    next: Task<ReturnType>;
}

export interface Let<ReturnType> extends QueryAndTask<ReturnType> {
    type: 'let';
    currVarname: string;
    newVarname: string;
    hideCurrVar: boolean;
}

export interface Traverse<ReturnType> extends QueryAndTask<ReturnType> {
    type: 'traverse';
    predicate: Algebra.PropertyPathSymbol;
    graph: RDF.Term;
}

export interface Join<ReturnType> extends QueryAndTask<ReturnType> {
    type: 'join';
    right: Algebra.Operation;
}

export interface Filter<ReturnType> extends QueryAndTask<ReturnType> {
    type: 'filter';
    expression: Algebra.Expression;
}

export interface Values<ReturnType> extends QueryAndTask<ReturnType> {
    type: 'values';
    bindings: {[key: string]: RDF.Term}[];
}

export interface Aggregate<ReturnType> extends QueryAndTask<ReturnType> {
    type: 'aggregate';
    aggregates: Algebra.BoundAggregate[];
}

export interface Slice<ReturnType> extends QueryAndTask<ReturnType> {
    type: 'slice';
    start: number;
    length?: number;
}
