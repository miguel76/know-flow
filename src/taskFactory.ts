import { Algebra } from 'sparqlalgebrajs';
import * as rdfjs from "rdf-js";
import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter} from './task';

export function createAction(
        exec: ( variables: rdfjs.Variable[],
                bindings: {[key: string]: rdfjs.Term}[] ) => void): Action {
    return {
        type: 'action',
        exec
    };
}

export function createTaskSequence(subtasks: Task[]): TaskSequence {
    return {
        type: 'task-sequence',
        subtasks
    };
}

export function createForEach(subtask: Task): ForEach {
    return {
        type: 'for-each',
        subtask
    };
}

export function createTraverse(
        next: Task,
        predicate: Algebra.PropertyPathSymbol,
        graph: rdfjs.Term ): Traverse {
    return {
        type: 'traverse', next,
        predicate, graph
    };
}

export function createJoin(next: Task, rightPattern: Algebra.Operation, focus?: rdfjs.Term): Join {
    return {
        type: 'join', next,
        right: rightPattern,
        focus
    };
}

export function createFilter(next: Task, expression: Algebra.Expression ): Filter {
    return {
        type: 'filter', next,
        expression 
    };
}
