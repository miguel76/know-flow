import {Task, Action, Parallel, ForEach, Join, Filter, Cascade, Table, Let, QueryAndTask} from './task';
import * as RDF from 'rdf-js';
import { Algebra, toSparql, Factory } from 'sparqlalgebrajs';
import {IQueryEngine, BindingsStream, Bindings, IActorQueryOperationOutputBindings} from '@comunica/types';
import {fromTableToValuesOp, NO_BINDING_SINGLETON_TABLE, oneTupleTable} from './utils';
import { Map } from 'immutable';
import { Wildcard } from 'sparqljs';

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

    async run<ReturnType>(
            config: {
                task: Task<ReturnType>,
                input?: Table
            } | Task<ReturnType>): Promise<ReturnType> {
        let task: Task<ReturnType>;
        let input: Table;
        if (config instanceof Task) {
            task = <Task<ReturnType>> config;
            input = NO_BINDING_SINGLETON_TABLE;
        } else {
            task = (<{task: Task<ReturnType>, input?: Table}> config).task;
            input = <Table> (<any> config).input || NO_BINDING_SINGLETON_TABLE;
        }
        if (task instanceof Action) {
            return task.exec(input);
        } else if (task instanceof Cascade) {
            let taskResult = await this.run({task: task.task, input});
            return await task.action(taskResult);
        } else if (task instanceof Parallel) {
            return <ReturnType> <unknown> await Promise.all(task.subtasks.map(
                    subtask => this.run({task: subtask, input})));
        } else if (task instanceof ForEach) {
            let forEach = task;
            return await new Promise<ReturnType>((resolve, reject) => {
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
        } else if (task instanceof QueryAndTask) {
            let query = task;
            let results;
            if (query instanceof Let) {
                let letTask = query;
                results = assignVar(input, letTask.currVarname, letTask.newVarname, letTask.hideCurrVar);
            } else {
                let inputOp = await fromTableToValuesOp(input);
                let queryOp;
                if (query instanceof Join) {
                    let join = query;
                    queryOp = (input === NO_BINDING_SINGLETON_TABLE) ?
                            join.right :
                            algebraFactory.createJoin(inputOp, join.right);
                } else if (query instanceof Filter) {
                    let filter = <Filter<ReturnType>> query;
                    queryOp = algebraFactory.createFilter(inputOp, filter.expression);
                } else {
                    throw new Error('Unrecognized query type')
                }
                results = await this.query(queryOp);
            }
            return await this.run({task: query.subtask, input: results});
        } else {
            throw new Error('Unrecognized task type')        
        }
    }

    // generateQuery<ReturnType>(task: Task<ReturnType>): void {
    //     switch(task.taskType) {
            
    //     }
    // }
}