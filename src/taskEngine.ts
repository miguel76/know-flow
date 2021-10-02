import {Task, Action, Parallel, ForEach, Join, Filter, Cascade, Table, Let, QueryAndTask} from './task';
import * as RDF from 'rdf-js';
import { Algebra, toSparql, Factory } from 'sparqlalgebrajs';
import {IQueryEngine, BindingsStream, Bindings, IActorQueryOperationOutputBindings} from '@comunica/types';
import {fromTableToValuesOp, NO_BINDING_SINGLETON_TABLE, oneTupleTable} from './utils';
import { Map } from 'immutable';
import { Wildcard } from 'sparqljs';
// import {newEngine} from '@comunica/actor-init-sparql';

let algebraFactory = new Factory();
let WILDCARD = new Wildcard();

function assignVar(input: Table, currVarName: string, newVarName: string, hideCurrVar: boolean): Table {
    if (!input.variables.includes(currVarName)) {
        throw 'New focus ' + currVarName + ' not found among the variables (' + input.variables + ').';
    }
    let variables = hideCurrVar ?
            input.variables.filter(v => v !== currVarName) :
            input.variables;
    return {
        variables: variables.includes(newVarName) ?
                variables :
                variables.concat(newVarName),
        bindingsStream: input.bindingsStream.map(bindings => {
            let newBindings: {[key: string]: RDF.Term} = {};
            bindings.forEach((value, varname) => {
                if (varname === currVarName) {
                    newBindings[newVarName] = value;
                }
                if (varname !== newVarName && (varname !== currVarName || !hideCurrVar)) {
                    newBindings[varname] = value;
                }
            });
            return Map<string, RDF.Term>(newBindings);
        }),
        canContainUndefs: input.canContainUndefs
    };
}

export default class TaskEngine {

    engine: IQueryEngine;
    queryContext: any;

    constructor(config: {
        engine: IQueryEngine,
        queryContext?: any
    }) {
        this.engine = config.engine; // || newEngine();
        this.queryContext = config.queryContext || {};
    }

    private async query(queryOp: Algebra.Operation): Promise<IActorQueryOperationOutputBindings> {
        return <IActorQueryOperationOutputBindings>
                await this.engine.query(queryOp, this.queryContext);
    }

    run<ReturnType>(
            config: {
                task: Task<ReturnType>,
                input?: Table
            } | Task<ReturnType>): Promise<ReturnType> {
        let task: Task<ReturnType>;
        let input: Table;
        if ((<Task<ReturnType>> config).taskType === undefined) {
            task = (<{task: Task<ReturnType>, input?: Table}> config).task;
            input = <Table> (<any> config).input || NO_BINDING_SINGLETON_TABLE;
        } else {
            task = <Task<ReturnType>> config;
            input = NO_BINDING_SINGLETON_TABLE;
        }
        const cases: { [index:string] : () => Promise<ReturnType> } = {
            'action': () => (<Action<ReturnType>> task).exec(input),
            'cascade': async () => {
                let cascade = <Cascade<any, ReturnType>> task;
                let taskResult = await this.run({task: cascade.task, input});
                return await cascade.action(taskResult);
            },
            'parallel': async () => {
                let parallel = <Parallel<unknown>> task;
                return <ReturnType> <unknown> await Promise.all(parallel.subtasks.map(
                        subtask => this.run({task: subtask, input})));
            },
            'for-each': () => {
                let forEach = <ForEach<any>> task;
                // let subtask = (<ForEach<ReturnType[keyof ReturnType]>> task).subtask;
                return new Promise<ReturnType>((resolve, reject) => {
                    var promises: Promise<unknown>[] = [];
                    input.bindingsStream.on('data', (bindings: Bindings) => {
                        promises.push(
                                this.run({
                                    task: forEach.subtask,
                                    input: oneTupleTable(
                                            input.variables,
                                            bindings,
                                            input.canContainUndefs)
                                }));
                    });
                    input.bindingsStream.on('end', () => {
                        Promise.all(promises).then((result) => {
                            resolve(<ReturnType> <unknown> result);
                        }, (error) => {
                            reject(error);
                        });
                    });
                    input.bindingsStream.on('error', (error: any) => {
                        reject(error);
                    });
                });
            },
            'query': async () => {
                let query = <QueryAndTask<ReturnType>> task;
                let results;
                if (query.queryType === 'let') {
                    let letTask = <Let<ReturnType>> query;
                    results = assignVar(input, letTask.currVarname, letTask.newVarname, letTask.hideCurrVar);
                } else {
                    const opBuilders: { [queryType:string] : (inputOp: Algebra.Operation) => Algebra.Operation} = {
                        'join': (inputOp: Algebra.Operation) => {
                            let join = <Join<ReturnType>> query;
                            return (input === NO_BINDING_SINGLETON_TABLE) ?
                                    join.right :
                                    algebraFactory.createJoin(inputOp, join.right);
                        },
                        'filter': (inputOp: Algebra.Operation) => {
                            let filter = <Filter<ReturnType>> query;
                            return algebraFactory.createFilter(inputOp, filter.expression);
                        }
                    }
                    let inputOp = await fromTableToValuesOp(input);
                    let queryOp = opBuilders[query.queryType](inputOp)
                    results = await this.query(queryOp);
                }
                return await this.run({task: query.next, input: results});
            }
        };
        return cases[task.taskType]();
    }

    // generateQuery<ReturnType>(task: Task<ReturnType>): void {
    //     switch(task.taskType) {
            
    //     }
    // }
}