import { Algebra, translate, Factory } from 'sparqlalgebrajs';
import * as RDF from "rdf-js";
import {Table, TableSync, Task, Action, TaskSequence, ForEach, Traverse, Join, Filter, Cascade} from './task';
import {Bindings, BindingsStream} from '@comunica/types';
import {syncTable} from './utils';

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

function promisifyFromSync<Domain, Range>(f: (x: Domain) => Range):
        (x: Domain) => Promise<Range> {
    return (x: Domain) => (
        new Promise<Range>((resolve, reject) => {
            try {
                resolve(f(x));
            } catch(e) {
                reject(e);
            }
        })
    );
}

export default class TaskFactory {

    algebraFactory: Factory;
    defaultInput: RDF.Variable;
    defaultOutput: RDF.Variable;
    options: {
        dataFactory?: RDF.DataFactory,
        algebraFactory?: Factory,
        quads?: boolean,
        prefixes?: {[prefix: string]: string},
        baseIRI?: string,
        blankToVariable?: boolean,
        sparqlStar?: boolean
    };
    onError: (error: any) => void;

    constructor(options: {
            dataFactory?: RDF.DataFactory,
            algebraFactory?: Factory,
            quads?: boolean,
            prefixes?: {[prefix: string]: string},
            baseIRI?: string,
            blankToVariable?: boolean,
            sparqlStar?: boolean,
            onError?: (error: any) => void } = {}) {
        this.algebraFactory = options.algebraFactory || new Factory(options.dataFactory);
        this.defaultInput = <RDF.Variable> this.algebraFactory.createTerm('$_');
        this.defaultOutput = <RDF.Variable> this.algebraFactory.createTerm('$_out');
        this.options = options;
        this.onError = options.onError || ((e) => {console.error(e);});
    }

    // createAction(
    //         exec: BindingsStream => void | {[key: string]: rdfjs.Term}[] => void): Action {
    //     return {
    //         type: 'action',
    //         exec
    //     };
    // }

    createCascade<TaskReturnType, ActionReturnType>(
                task: Task<TaskReturnType>,
                action: (taskResult: TaskReturnType) => Promise<ActionReturnType>
            ): Cascade<TaskReturnType, ActionReturnType> {
        return {type: 'cascade', task, action};
    }

    createSimpleCascade<TaskReturnType, ActionReturnType>(
                task: Task<TaskReturnType>,
                syncAction: (taskResult: TaskReturnType) => ActionReturnType
            ): Cascade<TaskReturnType, ActionReturnType> {
        return this.createCascade(task, promisifyFromSync(syncAction));
    }

    createAction<ReturnType>(exec: (input: Table) => Promise<ReturnType>): Action<ReturnType> {
        return {type: 'action', exec};
    }

    createSimpleAction<ReturnType>(syncExec: (input: Table) => ReturnType): Action<ReturnType> {
        return this.createAction(promisifyFromSync(syncExec));
    }

    createConstant<ReturnType>(value: ReturnType): Action<ReturnType> {
        return this.createSimpleAction(() => value);
    }

    createActionOnAll<ReturnType>(execOnAll: (input: TableSync) => Promise<ReturnType>): Action<ReturnType> {
        return {
            type: 'action',
            exec: (table) => {
                return new Promise<ReturnType>((resolve, reject) => {
                    syncTable(table).then((tableSync) => {
                        execOnAll(tableSync).then((res) => {
                            resolve(res);
                        }, (error) => {
                            reject(error);
                        });
                    }, (error) => {
                        reject(error);
                    });
                });
            }
        }
    }

    createSimpleActionOnAll<ReturnType>(syncExecOnAll: (input: TableSync) => ReturnType): Action<ReturnType> {
        return this.createActionOnAll(promisifyFromSync(syncExecOnAll));
    }

    createActionOnFirst<ReturnType>(execOnFirst: (bindings: Bindings) => Promise<ReturnType>): Action<ReturnType> {
        return {
            type: 'action',
            exec: (table) => {
                return new Promise<ReturnType>((resolve, reject) => {
                    var firstTime = true;
                    table.bindingsStream.on('data', (binding) => {
                        if (firstTime) {
                            execOnFirst(binding).then((res) => {
                                resolve(res);
                            }, (err) => {
                                reject(err);
                            });
                            firstTime = false;
                        }
                    });
                    table.bindingsStream.on('error', (e) => {
                        if (this.onError) {
                            this.onError(e)
                        }
                        reject(e);
                    });
                });
            }
        }
    }

    createSimpleActionOnFirst<ReturnType>(syncExecOnFirst: (bindings: Bindings) => ReturnType): Action<ReturnType> {
        return this.createActionOnFirst(promisifyFromSync(syncExecOnFirst));
    }

    createForEachAndAction<EachReturnType>(execForEach: (bindings: Bindings) => Promise<EachReturnType>): Action<EachReturnType[]> {
        return {
            type: 'action',
            exec: (table) => {
                return new Promise<EachReturnType[]>((resolve, reject) => {
                    let results: EachReturnType[] = [];
                    table.bindingsStream.on('data', (binding) => {
                        execForEach(binding).then((res) => {
                            results.push(res);
                        }, (err) => {
                            reject(err);
                        });
                    });
                    table.bindingsStream.on('end', () => {
                        resolve(results);
                    });
                    table.bindingsStream.on('error', (e) => {
                        if (this.onError) {
                            this.onError(e)
                        }
                        reject(e);
                    });
                });
            }
        }
    }

    createForEachAndSimpleAction<EachReturnType>(syncExecForEach: (bindings: Bindings) => EachReturnType): Action<EachReturnType[]> {
        return this.createForEachAndAction(promisifyFromSync(syncExecForEach));
    }

    createTaskSequence<SeqReturnType>(subtasks: Task<SeqReturnType>[]): TaskSequence<SeqReturnType> {
        return {
            type: 'task-sequence',
            subtasks
        };
    }

    createForEach<EachReturnType>(subtask: Task<EachReturnType>): ForEach<EachReturnType> {
        return {
            type: 'for-each',
            subtask
        };
    }

    private selectEnvelope(patternStr: string): string {
        return 'SELECT * WHERE { ' + patternStr + ' }';
    }

    private translateOp(patternStr: string): Algebra.Operation {
        return (<Algebra.Project> translate(this.selectEnvelope(patternStr), this.options)).input;
    }

    createTraverse<ReturnType>(
            next: Task<ReturnType>,
            predicate: Algebra.PropertyPathSymbol | RDF.Term | string,
            graph?: RDF.Term ): Join<ReturnType> {
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

    createJoin<ReturnType>(
            next: Task<ReturnType>,
            rightPattern: Algebra.Operation | string,
            focus?: RDF.Variable): Join<ReturnType> {
        if (isString(rightPattern)) {
            rightPattern = this.translateOp(rightPattern);
        }
        return {
            type: 'join', next,
            right: rightPattern,
            focus
        };
    }

    createFilter<ReturnType>(next: Task<ReturnType>, expression: Algebra.Expression | string): Filter<ReturnType> {
        if (isString(expression)) {
            console.log(this.translateOp('FILTER(' + expression + ')'));
            expression = (<Algebra.Filter> this.translateOp('FILTER(' + expression + ')')).expression;
        }
        return {
            type: 'filter', next,
            expression 
        };
    }

}
