import { Algebra } from 'sparqlalgebrajs';
import * as rdfjs from "rdf-js";

export interface Task {
    type: string;
}

export interface Action extends Task {
    type: 'action';
    exec: ( variables: rdfjs.Variable[],
            bindings: {[key: string]: rdfjs.Term}[] ) => void;
}

export interface TaskSequence extends Task {
    type: 'task-sequence';
    subtasks: Task[];
}

export interface ForEach extends Task {
    type: 'for-each';
    subtask: Task;
}

export interface QueryAndTask extends Task {
    next: Task;
}

export interface Traverse extends QueryAndTask {
    type: 'traverse';
    predicate: Algebra.PropertyPathSymbol;
    graph: rdfjs.Term;
}

export interface Join extends QueryAndTask {
    type: 'join';
    right: Algebra.Operation;
    focus?: rdfjs.Term;
}

export interface Filter extends QueryAndTask {
    type: 'filter';
    expression: Algebra.Expression;
}
