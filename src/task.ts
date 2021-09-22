import { Algebra } from 'sparqlalgebrajs';
import * as rdfjs from "rdf-js";
import {BindingsStream} from '@comunica/types';

export interface Task<ReturnType> {
    type: string;
}

export interface Action<ReturnType> extends Task<ReturnType> {
    type: 'action';
    exec: (bindings: BindingsStream) => Promise<ReturnType>;
}

export interface Cascade<TaskReturnType, ActionReturnType> extends Task<ActionReturnType> {
    type: 'cascade';
    task: Task<TaskReturnType>;
    action: (taskResult: TaskReturnType) => Promise<ActionReturnType>;
}

export interface TaskSequence<SeqReturnType> extends Task<SeqReturnType[]> {
    type: 'task-sequence';
    subtasks: Task<SeqReturnType>[];
}

export interface ForEach<EachReturnType> extends Task<EachReturnType[]> {
    type: 'for-each';
    subtask: Task<EachReturnType>;
}

export interface QueryAndTask<ReturnType> extends Task<ReturnType> {
    next: Task<ReturnType>;
}

export interface Traverse<ReturnType> extends QueryAndTask<ReturnType> {
    type: 'traverse';
    predicate: Algebra.PropertyPathSymbol;
    graph: rdfjs.Term;
}

export interface Join<ReturnType> extends QueryAndTask<ReturnType> {
    type: 'join';
    right: Algebra.Operation;
    focus?: rdfjs.Term;
}

export interface Filter<ReturnType> extends QueryAndTask<ReturnType> {
    type: 'filter';
    expression: Algebra.Expression;
}