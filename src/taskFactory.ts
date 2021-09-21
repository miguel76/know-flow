import { Algebra, translate, Factory } from 'sparqlalgebrajs';
import * as rdfjs from "rdf-js";
import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter} from './task';
import { Path } from 'sparqlalgebrajs/lib/algebra';

function isString(str: any): str is string {
    return typeof str === 'string';
}

export default class TaskFactory {

    algebraFactory: Factory;
    defaultInput: rdfjs.Term;
    defaultOutput: rdfjs.Term;

    constructor(algebraFactory?: Factory) {
        this.algebraFactory = algebraFactory || new Factory();
        this.defaultInput = algebraFactory.createTerm('$_');
        this.defaultOutput = algebraFactory.createTerm('$_out');
    }

    createAction(
            exec: ( variables: rdfjs.Variable[],
                    bindings: {[key: string]: rdfjs.Term}[] ) => void): Action {
        return {
            type: 'action',
            exec
        };
    }

    createTaskSequence(subtasks: Task[]): TaskSequence {
        return {
            type: 'task-sequence',
            subtasks
        };
    }

    createForEach(subtask: Task): ForEach {
        return {
            type: 'for-each',
            subtask
        };
    }

    private selectEnvelope(patternStr: string): string {
        return 'SELECT * WHERE { ' + patternStr + ' }';
    }

    private translateOp(patternStr: string): Algebra.Operation {
        return translate(this.selectEnvelope(patternStr));
    }

    createTraverse(
            next: Task,
            predicate: Algebra.PropertyPathSymbol | string,
            graph: rdfjs.Term ): Join {
        if (isString(predicate)) {
            predicate = (<Path> this.translateOp('$_ ' + predicate + ' $_out')).predicate;
        }
        return {
            type: 'join', next,
            right: this.algebraFactory.createPath(
                    this.defaultInput, predicate, this.defaultOutput, graph),
            focus: this.defaultOutput
        };
    }

    createJoin(next: Task, rightPattern: Algebra.Operation | string, focus?: rdfjs.Term): Join {
        if (isString(rightPattern)) {
            rightPattern = this.translateOp(rightPattern);
        }
        return {
            type: 'join', next,
            right: rightPattern,
            focus
        };
    }

    createFilter(next: Task, expression: Algebra.Expression | string): Filter {
        if (isString(expression)) {
            expression = (<Algebra.Filter> translate('SELECT * WHERE { FILTER(' + expression + ') }')).expression;
        }
        return {
            type: 'filter', next,
            expression 
        };
    }

}
