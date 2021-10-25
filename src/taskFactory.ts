import { Algebra, translate, Factory } from 'sparqlalgebrajs';
import * as RDF from "rdf-js";
import {Table, TableSync, Task, Action, ForEach, Join, Filter, Cascade, Let, Parallel} from './task';
import {Bindings, BindingsStream} from '@comunica/types';
import {syncTable, promisifyFromSync} from './utils';
import { ArrayIterator } from 'asynciterator';
import { Map } from 'immutable';
import { RDFToValueOrObject } from './toNative';

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
  
interface TranslateOptions {
    dataFactory?: RDF.DataFactory;
    quads?: boolean;
    prefixes?: {
        [prefix: string]: string;
    };
    baseIRI?: string;
    blankToVariable?: boolean;
    sparqlStar?: boolean;
}

export interface TaskFactoryOptions extends TranslateOptions {
    algebraFactory?: Factory;
}

export type PathParamType  = Algebra.PropertyPathSymbol | RDF.Term | string;

export default class TaskFactory {

    algebraFactory: Factory;
    dataFactory: RDF.DataFactory;
    defaultInput: RDF.Variable;
    defaultOutput: RDF.Variable;
    options: TaskFactoryOptions;

    constructor(options: TaskFactoryOptions = {}) {
        this.algebraFactory = options.algebraFactory || new Factory(options.dataFactory);
        this.dataFactory = this.algebraFactory.dataFactory;
        this.defaultInput = this.dataFactory.variable('_');
        this.defaultOutput = this.dataFactory.variable('_out');
        this.options = options;
    }

    createCascadeAsync<TaskReturnType, ActionReturnType>(
            config: {
                task: Task<TaskReturnType>,
                action: (taskResult: TaskReturnType) => Promise<ActionReturnType>
            }): Cascade<TaskReturnType, ActionReturnType> {
        return new Cascade<TaskReturnType, ActionReturnType> (config.task, config.action);
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
            } | ((input: Table) => Promise<ReturnType>)): Action<ReturnType> {
        let exec = <(input: Table) => Promise<ReturnType>> ((<any> config).exec || config);
        return new Action<ReturnType>(exec);
    }

    createAction<ReturnType>(
        config: {
            exec: (input: Table) => ReturnType
        } | ((input: Table) => ReturnType)): Action<ReturnType> {
        let exec = <(input: Table) => ReturnType> ((<any> config).exec || config);
        return this.createActionAsync({
            exec: promisifyFromSync(exec)
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
            } | ((input: TableSync) => Promise<ReturnType>)): Action<ReturnType> {
        let exec = <(input: TableSync) => Promise<ReturnType>> ((<any> config).exec || config);
        return this.createActionAsync( (table) => {
            return new Promise<ReturnType>((resolve, reject) => {
                syncTable(table).then((tableSync) => {
                    exec(tableSync).then((res) => {
                        resolve(res);
                    }, (error) => {
                        reject(error);
                    });
                }, (error) => {
                    reject(error);
                });
            });
        });
    }

    createActionOnAll<ReturnType>(
            config: {
                exec: (input: TableSync) => ReturnType
            } | ((input: TableSync) => ReturnType)): Action<ReturnType> {
        let exec = <(input: TableSync) => ReturnType> ((<any> config).exec || config);
        return this.createActionAsyncOnAll({
            exec: promisifyFromSync(exec)
        });
    }

    createActionAsyncOnFirst<ReturnType>(
            config: {
                exec: (bindings: Bindings) => Promise<ReturnType>,
                acceptEmpty?: boolean
            } | ((bindings: Bindings) => Promise<ReturnType>)): Action<ReturnType> {
        let exec = <(bindings: Bindings) => Promise<ReturnType>> ((<any> config).exec || config);
        let acceptEmpty = (<any> config).acceptEmpty !== undefined ? (<any> config).acceptEmpty : true;
        return this.createActionAsync( (table) => {
            return new Promise<ReturnType>((resolve, reject) => {
                let cb = (bindings: Bindings) => {
                    exec(bindings).then((res) => {
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
                    reject(e);
                });
            });
        });
    }

    createActionOnFirst<ReturnType>(
            config: {
                exec: (bindings: Bindings) => ReturnType
            } | ((bindings: Bindings) => ReturnType)): Action<ReturnType> {
        let exec = <(bindings: Bindings) => ReturnType> ((<any> config).exec || config);
        return this.createActionAsyncOnFirst({
            exec: promisifyFromSync(exec)
        });
    }

    createActionAsyncOnFirstDefault<ReturnType>(
            config: {
                exec: (term: RDF.Term) => Promise<ReturnType>
            } | ((term: RDF.Term) => Promise<ReturnType>)): Action<ReturnType> {
        let exec = <(term: RDF.Term) => Promise<ReturnType>> ((<any> config).exec || config);
        return this.createActionAsyncOnFirst({
            exec: (bindings: Bindings) => exec(bindings.get('?_'))
        });
    }

    createActionOnFirstDefault<ReturnType>(
            config: {
                exec: (term: RDF.Term) => ReturnType
            } | ((term: RDF.Term) => ReturnType)): Action<ReturnType> {
        let exec = <(term: RDF.Term) => ReturnType> ((<any> config).exec || config);
        return this.createActionOnFirst({
            exec: (bindings: Bindings) => exec(bindings.get('?_'))
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
        let subtasks = Array.isArray(config) ? config : config.subtasks;
        return new Parallel<EachReturnType>(subtasks);
    }

    createParallelDict<EachReturnType>(
            config: {
                subtasks: {[key: string] : Task<EachReturnType>}
            } | {[key: string] : Task<EachReturnType>}): Task<{[key: string]: EachReturnType}> {
        let values = Object.values(config);
        let subtasksMap = (!values.length || values[0] instanceof Task) ?
                    config : config.subtasks;
        let keys: string [] = [];
        let subtasks: Task<EachReturnType> [] = [];
        Object.entries(subtasksMap).forEach(([key, subtask]) => {
            keys.push(key);
            subtasks.push(subtask);
        });
        return this.createCascade({
            task: this.createParallel(subtasks),
            action: (resultArray: EachReturnType[]) => 
                    Object.fromEntries(
                            resultArray.map((singleRes, index) => [keys[index], singleRes]))
        });
    }

    createParallelFromObject(obj: any): Task<any> {
        if (obj instanceof Task) {
            return obj;
        } else if (Array.isArray(obj)) {
            return this.createParallel(obj.map(e => this.createParallelFromObject(e)));
        } else if (typeof obj === 'object' && obj !== null) {
            return this.createParallelDict(
                    Object.fromEntries(
                            Object.entries(obj).map(([k, v]) =>
                                    [k, this.createParallelFromObject(v)])));
        } else {
            return this.createConstant(obj);
        }
    }

    createForEach<EachReturnType>(
            config: {
                subtask: Task<EachReturnType>,
                predicate?: PathParamType,
                graph?: RDF.Term
            } | Task<EachReturnType>): Task<EachReturnType[]> {
        let subtask = (config instanceof Task) ? config : config.subtask;
        let forEach = new ForEach<EachReturnType>(subtask);
        return (<any> config).predicate ?
                this.createTraverse({
                    predicate: (<any> config).predicate,
                    graph: (<any> config).graph,
                    subtask: forEach
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
                subtask: Task<ReturnType>,
                currVarname?: string,
                newVarname?: string,
                hideCurrVar?: boolean
            }): Let<ReturnType> {
        return new Let<ReturnType>(
            config.subtask,
            config.currVarname || '?_',
            config.newVarname || '?_',
            !!config.hideCurrVar);
    }

    private buildTerm(input: RDF.Term | string): RDF.Term {
        if (typeof input === 'string') {
            let op = <Algebra.Values> this.translateOp('VALUES ?_ {' + input + '}');
            return op.bindings[0]['?_'];
        } else {
            return input;
        }
    }

    private buildBindings(
            input: {[key: string]: (RDF.Term | string)} | 
                    RDF.Term | string ): {[key: string]: RDF.Term} {
        if (typeof input === 'string' || (<any> input).termType !== undefined) {
            return {'?_': this.buildTerm(<RDF.Term | string> input)};
        } else {
            return Object.fromEntries((<any> input).entries().map(
                (entry: [string, RDF.Term | string]) => [entry[0], this.buildTerm(entry[1])]));
        }
    }

    private buildBindingsSeq(
            input:
                {[key: string]: RDF.Term | string}[] |
                {[key: string]: RDF.Term | string} | 
                (RDF.Term | string)[] |
                RDF.Term | string ): {[key: string]: RDF.Term}[] {
        if (Array.isArray(input)) {
            return input.map(i => this.buildBindings(i));
        } else {
            return [this.buildBindings(input)];
        }
    }

    createValues<ReturnType>(config: {
            subtask: Task<ReturnType>,
            bindings:
                {[key: string]: RDF.Term | string}[] |
                {[key: string]: RDF.Term | string} | 
                (RDF.Term | string)[] |
                RDF.Term | string
    }): Join<ReturnType> {
        let bindings = this.buildBindingsSeq(config.bindings);
        let varnames = [...new Set(bindings.flatMap(b => Object.keys(b)))];
        let valuesOp = this.algebraFactory.createValues(
                varnames.map(varname => this.dataFactory.variable(varname.substr(1))),
                bindings );
        return this.createJoin({
            subtask: config.subtask,
            right: valuesOp
        });
    }

    createTraverse<ReturnType>(
            config: {
                subtask: Task<ReturnType>,
                predicate: PathParamType,
                graph?: RDF.Term
            }): Join<ReturnType> {
        let predicate = config.predicate;
        if (isString(predicate)) {
            return this.createJoin({
                right: this.translateOp('?_ ' + predicate + ' ?_out'),
                newDefault: '?_out',
                hideCurrVar: true,
                subtask: config.subtask
            });
        }
        return this.createJoin({
            right: (isPropertyPathSymbol(predicate)) ?
            this.algebraFactory.createPath(
                    this.defaultInput, predicate, this.defaultOutput, config.graph):
            this.algebraFactory.createBgp([
                    this.algebraFactory.createPattern(
                            this.defaultInput, predicate, this.defaultOutput, config.graph)]),
            newDefault: '?_out',
            hideCurrVar: true,
            subtask: config.subtask
        });
    }

    createJoin<ReturnType>(
            config: {
                subtask: Task<ReturnType>,
                right: Algebra.Operation | string,
                newDefault?: string,
                hideCurrVar?: boolean
            }): Join<ReturnType> {
        let right = config.right;
        if (isString(right)) {
            right = this.translateOp(right);
        }
        let subtask = config.subtask;
        if (config.newDefault) {
            subtask = this.createLet({
                subtask,
                currVarname: config.newDefault,
                hideCurrVar: config.hideCurrVar
            });
        }
        return new Join<ReturnType>(subtask, right);
    }

    createFilter<ReturnType>(
            config: {
                subtask: Task<ReturnType>,
                expression: Algebra.Expression | string
            }): Filter<ReturnType> {
        let expression = config.expression;
        if (isString(expression)) {
            expression = (<Algebra.Filter> this.translateOp('FILTER(' + expression + ')')).expression;
        }
        return new Filter<ReturnType>(config.subtask, expression);
    }

    createTermReader(
            config?: {
                traverse?: Algebra.PropertyPathSymbol | RDF.Term | string,
                graph?: RDF.Term,
                filter?: Algebra.Expression | string,
                lang?: string,
                datatype?: string
            }): Task<RDF.Term> {
        let action = this.createActionOnFirstDefault({
            exec: x => x
        });
        let actionIfLang = config.lang ?
                this.createFilter({
                    expression: 'langMatches( lang(?_), "' + config.lang + '" )',
                    subtask: action
                }) : action;
        let actionIfTypeAndLang = config.datatype ?
                this.createFilter({
                    expression:
                            this.algebraFactory.createOperatorExpression(
                                    '=', [
                                        this.algebraFactory.createOperatorExpression(
                                            'datatype', [
                                                this.algebraFactory.createTermExpression(
                                                    this.defaultInput)
                                            ]
                                        ),
                                        this.algebraFactory.createTermExpression(
                                                this.buildTerm(config.datatype))
                                    ]),
                    subtask: actionIfLang
                }) : actionIfLang;
        let actionIfFilter = config.filter ?
                this.createFilter({
                    expression: config.filter,
                    subtask: actionIfTypeAndLang
                }) : actionIfTypeAndLang;
        return (config && config.traverse) ?
                this.createTraverse({
                    predicate: config.traverse,
                    graph: config.graph,
                    subtask: actionIfFilter
                }) :
                actionIfFilter;
    }

    createValueReader(
            config?: {
                traverse?: Algebra.PropertyPathSymbol | RDF.Term | string,
                graph?: RDF.Term,
                filter?: Algebra.Expression | string,
                lang?: string,
                datatype?: string
            }): Task<any> {
                
        // TODO: manage arrays of values too
        return this.createCascade({
            task: this.createTermReader(config),
            action: RDFToValueOrObject
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
