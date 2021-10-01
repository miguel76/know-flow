import { Algebra, translate, Factory } from 'sparqlalgebrajs';
import * as RDF from "rdf-js";
import {Table, TableSync, Task, Action, ForEach, Join, Filter, Cascade, Let, Parallel} from './task';
import {Bindings, BindingsStream} from '@comunica/types';
import {syncTable} from './utils';
import { ArrayIterator } from 'asynciterator';
import { Map } from 'immutable';

function isString(str: any): str is string {
    return typeof str === 'string';
}

function isPropertyPathSymbol(p: any): p is Algebra.PropertyPathSymbol {
    return [
            Algebra.types.ALT, Algebra.types.INV, Algebra.types.LINK,
            Algebra.types.NPS, Algebra.types.ONE_OR_MORE_PATH,
            Algebra.types.SEQ, Algebra.types.ZERO_OR_MORE_PATH,
            Algebra.types.ZERO_OR_ONE_PATH].includes(p.type);
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

function isPromise<Type>(value: Type | Promise<Type>):
        value is Promise<Type> {
    return value && typeof (<any> value).then === "function";
}

function asyncify<Domain, Range>(
        fn: (x: Domain) => Range | ((x: Domain) => Promise<Range> )):
        (x: Domain) => Promise<Range> {
    let isAsync = false;
    return (x: Domain) => {
        try {
            let value = fn(x);
            if (isPromise(value)) {
                return <Promise<Range>> value;
            } else {
                return new Promise<Range>((resolve, reject) => {
                    resolve(<Range> value);
                });
            }
        } catch(e) {
            return new Promise<Range>((resolve, reject) => {
                reject(e);
            });
        }
    };
}
  
export default class TaskFactory {

    algebraFactory: Factory;
    dataFactory: RDF.DataFactory;
    defaultInput: RDF.Variable;
    defaultOutput: RDF.Variable;
    options: {
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
        this.dataFactory = this.algebraFactory.dataFactory;
        this.defaultInput = this.dataFactory.variable('_');
        this.defaultOutput = this.dataFactory.variable('_out');
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

    createCascadeAsync<TaskReturnType, ActionReturnType>(
            config: {
                task: Task<TaskReturnType>,
                action: (taskResult: TaskReturnType) => Promise<ActionReturnType>
            }): Cascade<TaskReturnType, ActionReturnType> {
        return {
            type: 'cascade',
            task: config.task,
            action: config.action
        };
    }

    createCascade<TaskReturnType, ActionReturnType>(
            config: {
                task: Task<TaskReturnType>,
                action: (taskResult: TaskReturnType) => ActionReturnType
            }): Cascade<TaskReturnType, ActionReturnType> {
        return this.createCascadeAsync({
            task: config.task,
            action: promisifyFromSync(config.action)
        });
    }

    createActionAsync<ReturnType>(
        config: {
            exec: (input: Table) => Promise<ReturnType>
        }): Action<ReturnType> {
        return {type: 'action', exec: config.exec};
    }

    createAction<ReturnType>(
        config: {
            exec: (input: Table) => ReturnType
        }): Action<ReturnType> {
        return this.createActionAsync({
            exec: promisifyFromSync(config.exec)
        });
    }

    createConstant<ReturnType>(value: ReturnType): Action<ReturnType> {
        return this.createAction({
            exec: () => value
        });
    }

    createActionAsyncOnAll<ReturnType>(
            config: {
                exec: (input: TableSync) => Promise<ReturnType>
            }): Action<ReturnType> {
        return {
            type: 'action',
            exec: (table) => {
                return new Promise<ReturnType>((resolve, reject) => {
                    syncTable(table).then((tableSync) => {
                        config.exec(tableSync).then((res) => {
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

    createActionOnAll<ReturnType>(
            config: {
                exec: (input: TableSync) => ReturnType
            }): Action<ReturnType> {
        return this.createActionAsyncOnAll({
            exec: promisifyFromSync(config.exec)
        });
    }

    createActionAsyncOnFirst<ReturnType>(
            config: {
                exec: (bindings: Bindings) => Promise<ReturnType>,
                acceptEmpty?: boolean
            }): Action<ReturnType> {
        let acceptEmpty = config.acceptEmpty !== undefined ? config.acceptEmpty : true;
        return {
            type: 'action',
            exec: (table) => {
                return new Promise<ReturnType>((resolve, reject) => {
                    let cb = (bindings: Bindings) => {
                        config.exec(bindings).then((res) => {
                            resolve(res);
                        }, (err) => {
                            reject(err);
                        });
                    };
                    var firstTime = true;
                    table.bindingsStream.on('data', (binding) => {
                        if (firstTime) {
                            cb(binding);
                            firstTime = false;
                        }
                    });
                    table.bindingsStream.on('end', () => {
                        if (firstTime) {
                            if (acceptEmpty) {
                                cb(Map<string, RDF.Term>({}));
                            } else {
                                reject('Expected at least a value, zero found');
                            }
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

    createActionOnFirst<ReturnType>(
            config: {
                exec: (bindings: Bindings) => ReturnType
            }): Action<ReturnType> {
        return this.createActionAsyncOnFirst({
            exec: promisifyFromSync(config.exec)
        });
    }

    createActionAsyncOnFirstDefault<ReturnType>(
            config: {
                exec: (term: RDF.Term) => Promise<ReturnType>
            }): Action<ReturnType> {
        return this.createActionAsyncOnFirst({
            exec: (bindings: Bindings) => config.exec(bindings.get('?_'))
        });
    }

    createActionOnFirstDefault<ReturnType>(
            config: {
                exec: (term: RDF.Term) => ReturnType
            }): Action<ReturnType> {
        return this.createActionOnFirst({
            exec: (bindings: Bindings) => config.exec(bindings.get('?_'))
        });
    }

// createForEachAndAction<EachReturnType>(execForEach: (bindings: Bindings) => Promise<EachReturnType>): Action<EachReturnType[]> {
    //     return {
    //         type: 'action',
    //         exec: (table) => {
    //             return new Promise<EachReturnType[]>((resolve, reject) => {
    //                 let results: EachReturnType[] = [];
    //                 table.bindingsStream.on('data', (binding) => {
    //                     execForEach(binding).then((res) => {
    //                         results.push(res);
    //                     }, (err) => {
    //                         reject(err);
    //                     });
    //                 });
    //                 table.bindingsStream.on('end', () => {
    //                     resolve(results);
    //                 });
    //                 table.bindingsStream.on('error', (e) => {
    //                     if (this.onError) {
    //                         this.onError(e)
    //                     }
    //                     reject(e);
    //                 });
    //             });
    //         }
    //     }
    // }

    // createForEachAndSimpleAction<EachReturnType>(syncExecForEach: (bindings: Bindings) => EachReturnType): Action<EachReturnType[]> {
    //     return this.createForEachAndAction(promisifyFromSync(syncExecForEach));
    // }

    createParallel<EachReturnType>(
            config: {
                subtasks: Task<EachReturnType>[]
            }| Task<EachReturnType>[]): Parallel<EachReturnType> {
        let subtasks = <Task<EachReturnType>[]> ((<any> config).subtasks || config);
        return {
            type: 'parallel',
            subtasks: subtasks
        };
    }

    createParallelDict<EachReturnType>(
            config: {
                subtasks: {[key: string] : Task<EachReturnType>}
            } | {[key: string] : Task<EachReturnType>}): Task<{[key: string]: EachReturnType}> {
        let subtasksMap = <{[key: string] : Task<EachReturnType>}> ((<any> config).subtasks || config);
        let posToKeys: {[key: number] : string} = {};
        let subtasks: Task<EachReturnType> [];
        Object.keys(subtasksMap).forEach((key, index) => {
            posToKeys[index] = key;
            subtasks.push(subtasksMap[key]);
        });
        return this.createCascade({
            task: this.createParallel({subtasks}),
            action: (resultArray: EachReturnType[]) => 
                    Object.fromEntries(
                            resultArray.map((singleRes, index) => [posToKeys[index], singleRes]))
        });
    }

    createForEach<EachReturnType>(
            config: {
                subtask: Task<EachReturnType>,
                predicate?: Algebra.PropertyPathSymbol | RDF.Term | string,
                graph?: RDF.Term
            } | Task<EachReturnType>): Task<EachReturnType[]> {
        let subtask = <Task<EachReturnType>> ((<any> config).subtask || config);
        let forEach = <ForEach<EachReturnType>> {
            type: 'for-each',
            subtask: subtask
        };
        return (<any> config).predicate ?
                this.createTraverse({
                    predicate: (<any> config).predicate,
                    graph: (<any> config).graph,
                    next: forEach
                }) :
                forEach;
    }

    private selectEnvelope(patternStr: string): string {
        return 'SELECT * WHERE { ' + patternStr + ' }';
    }

    private translateOp(patternStr: string): Algebra.Operation {
        return (<Algebra.Project> translate(this.selectEnvelope(patternStr), this.options)).input;
    }

    createLet<ReturnType>(
            config: {
                next: Task<ReturnType>,
                currVarname?: string,
                newVarname?: string,
                hideCurrVar?: boolean
            }): Let<ReturnType> {
        return {
            type: 'let',
            next: config.next,
            currVarname: config.currVarname || '?_',
            newVarname: config.newVarname || '?_',
            hideCurrVar: !!config.hideCurrVar
        };
    }

    createTraverse<ReturnType>(
            config: {
                next: Task<ReturnType>,
                predicate: Algebra.PropertyPathSymbol | RDF.Term | string,
                graph?: RDF.Term
            }): Join<ReturnType> {
        let predicate = config.predicate;
        if (isString(predicate)) {
            let op = this.translateOp('?_ ' + predicate + ' ?_out');
            if (isPath(op)) {
                predicate = op.predicate;
            } else {
                predicate = (<Algebra.Bgp> op).patterns[0].predicate;
            }
        }
        let nextAfterRename = this.createLet({
            next: config.next,
            currVarname: '?_out',
            hideCurrVar: true
        });
        return {
            type: 'join', next: nextAfterRename,
            right: (isPropertyPathSymbol(predicate)) ?
                    this.algebraFactory.createPath(
                            this.defaultInput, predicate, this.defaultOutput, config.graph):
                    this.algebraFactory.createBgp([
                            this.algebraFactory.createPattern(
                                    this.defaultInput, predicate, this.defaultOutput, config.graph)])
        };
    }

    createJoin<ReturnType>(
            config: {
                next: Task<ReturnType>,
                right: Algebra.Operation | string,
                newDefault?: string,
                hideCurrVar?: boolean
            }): Join<ReturnType> {
        let right = config.right;
        if (isString(right)) {
            right = this.translateOp(right);
        }
        let next = config.next;
        if (config.newDefault) {
            next = this.createLet({
                next,
                currVarname: config.newDefault,
                hideCurrVar: config.hideCurrVar
            });
        }
        return {type: 'join', next, right};
    }

    createFilter<ReturnType>(
            config: {
                next: Task<ReturnType>,
                expression: Algebra.Expression | string
            }): Filter<ReturnType> {
        let expression = config.expression;
        if (isString(expression)) {
            expression = (<Algebra.Filter> this.translateOp('FILTER(' + expression + ')')).expression;
        }
        return {
            type: 'filter',
            next: config.next,
            expression 
        };
    }

    createTermReader(): Task<RDF.Term> {
        return this.createActionOnFirstDefault({
            exec: x => x
        });
    }

    createValueReader(): Task<any> {
        // TODO: convert to jsonld formats
        // TODO: manage arrays of values too
        return this.createActionOnFirstDefault({
            exec: x => x
        });
    }

    logTaskCount: number = 0;
    log<ReturnType>(next: Task<ReturnType>, label?: string): Task<ReturnType> {
        let logTaskId = ++this.logTaskCount;
        var callCount = 0
        let loggingTask = this.createActionOnAll({
            exec: (table: TableSync) => {
                let callId = ++callCount;
                console.log('# Input of node ' + logTaskId + (label ? ' (' + label + ')' : '') + ' call n. ' + callId);
                console.log(table.bindingsArray);
                console.log('');
                return callId;
            }
        });
        let seq = this.createParallel<any>({
            subtasks: [loggingTask, next]
        });
        return this.createCascade({
            task: seq,
            action: (resSeq:any) => {
                let callId = resSeq[0];
                let actionRes = resSeq[1];
                console.log('# Output of node ' + logTaskId + (label ? ' (' + label + ')' : '') + ' call n. ' + callId);
                console.log(actionRes);
                console.log('');
                return actionRes;
            }
        });
    }

}
