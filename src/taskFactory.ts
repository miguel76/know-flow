import { Algebra, translate, Factory } from 'sparqlalgebrajs';
import * as rdfjs from "rdf-js";
import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter} from './task';
import { Path } from 'sparqlalgebrajs/lib/algebra';

function isString(str: any): str is string {
    return typeof str === 'string';
}

function isPropertyPathSymbol(p: any): p is Algebra.PropertyPathSymbol {
    return p.type in [
            Algebra.types.ALT, Algebra.types.INV, Algebra.types.LINK,
            Algebra.types.NPS, Algebra.types.ONE_OR_MORE_PATH,
            Algebra.types.SEQ, Algebra.types.ZERO_OR_MORE_PATH,
            Algebra.types.ZERO_OR_ONE_PATH];
}

function isPath(op: Algebra.Operation): op is Algebra.Path {
    return op.type == Algebra.types.PATH;
}

function isBgp(op: Algebra.Operation): op is Algebra.Bgp {
    return op.type == Algebra.types.BGP;
}

export default class TaskFactory {

    algebraFactory: Factory;
    defaultInput: rdfjs.Term;
    defaultOutput: rdfjs.Term;

    constructor(algebraFactory?: Factory) {
        this.algebraFactory = algebraFactory || new Factory();
        this.defaultInput = this.algebraFactory.createTerm('$_');
        this.defaultOutput = this.algebraFactory.createTerm('$_out');
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
        return (<Algebra.Project> translate(this.selectEnvelope(patternStr))).input;
    }

    createTraverse(
            next: Task,
            predicate: Algebra.PropertyPathSymbol | rdfjs.Term | string,
            graph?: rdfjs.Term ): Join {
        if (isString(predicate)) {
            let op = this.translateOp('$_ ' + predicate + ' $_out');
            if (isPath(op)) {
                predicate = op.predicate;
            } else {
                predicate = (<Algebra.Bgp> op).patterns[0].predicate;
            }
        }
        return {
            type: 'join', next,
            right: (isPropertyPathSymbol(predicate)) ?
                    this.algebraFactory.createPath(
                            this.defaultInput, predicate, this.defaultOutput, graph):
                    this.algebraFactory.createBgp([
                            this.algebraFactory.createPattern(
                                    this.defaultInput, predicate, this.defaultOutput, graph)]),
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
