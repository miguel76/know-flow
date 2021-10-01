import {Task, Action, Parallel, ForEach, Traverse, Join, Filter, Cascade, Table, Let} from './task';
import * as RDF from 'rdf-js';
import { Algebra, toSparql, Factory } from 'sparqlalgebrajs';
import {IQueryEngine, BindingsStream, Bindings, IActorQueryOperationOutputBindings} from '@comunica/types';
import {ArrayIterator, SingletonIterator, UnionIterator} from 'asynciterator';
import {fromTableToValuesOp, toSparqlFragment, stringifyTask} from './utils';
import { Map } from 'immutable';
import { Wildcard } from 'sparqljs';

let algebraFactory = new Factory();
let WILDCARD = new Wildcard();

function oneTupleTable(variables: string[], bindings: Bindings, canContainUndefs: boolean): Table {
    return {
        bindingsStream: new SingletonIterator<Bindings>(bindings),
        variables, canContainUndefs
    };
}

export const NO_BINDING_SINGLETON_TABLE = oneTupleTable([], Map<string, RDF.Term>({}), false);

function arrayUnion<T>(arrays: T[][]): T[] {
    return arrays.reduce((vars, newVars) => vars.concat(newVars.filter(v => !vars.includes(v))))
}

export function tableUnion(tables: Table[]): Table {
    return {
        bindingsStream: new UnionIterator<Bindings>(tables.map(t => t.bindingsStream)),
        variables: arrayUnion(tables.map(t => t.variables)),
        canContainUndefs: tables.some(t => t.canContainUndefs)
    };
}

export function tableFromArray(bindingsArray: {[varname: string]: RDF.Term}[]): Table {
    let variables = arrayUnion(bindingsArray.map(a => Object.keys(a)));
    return {
        variables,
        bindingsStream: new ArrayIterator(bindingsArray.map(obj => Map(obj))),
        canContainUndefs: bindingsArray.some(b => variables.some(v => !(v in b)))
    }

}

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

function collectPromises<T>(promises: Promise<T>[]): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
        var missing =  promises.length;
        var results: T[] = [];
        promises.forEach((promise, index) => {
            promise.then((result) => {
                results[index] = result;
                missing--;
                if (missing == 0) {
                    resolve(results);
                }
            }, (error) => {
                reject(error);
            })
        });
    });
}

export function executeTask<ReturnType>(
        task: Task<ReturnType>,
        input: Table,
        engine: IQueryEngine,
        queryContext: any = {}): Promise<ReturnType> {
    const cases: { [index:string] : () => Promise<ReturnType> } = {
        'action': () => (<Action<ReturnType>> task).exec(input),
        'cascade': async () => {
            let cascade = <Cascade<any, ReturnType>> task;
            let taskResult = await executeTask(cascade.task, input, engine, queryContext);
            return await cascade.action(taskResult);
        },
        'parallel': async () => {
            let parallel = <Parallel<unknown>> task;
            return <ReturnType> <unknown> await Promise.all(parallel.subtasks.map(
                    t => executeTask(t, input, engine, queryContext)));
        },
        'for-each': () => {
            let forEach = <ForEach<any>> task;
            // let subtask = (<ForEach<ReturnType[keyof ReturnType]>> task).subtask;
            return new Promise<ReturnType>((resolve, reject) => {
                var promises: Promise<unknown>[] = [];
                input.bindingsStream.on('data', (bindings) => {
                    promises.push(
                            executeTask(
                                    forEach.subtask,
                                    oneTupleTable(input.variables, bindings, input.canContainUndefs),
                                    engine, queryContext));
                });
                input.bindingsStream.on('end', () => {
                    Promise.all(promises).then((result) => {
                        resolve(<ReturnType> <unknown> result);
                    }, (error) => {
                        reject(error);
                    });
                });
                input.bindingsStream.on('error', (error) => {
                    reject(error);
                });
            });
        },
        'let': async () => {
            let letTask = <Let<ReturnType>> task;
            let res = assignVar(input, letTask.currVarname, letTask.newVarname, letTask.hideCurrVar);
            return await executeTask(letTask.next, res, engine, queryContext);
        },
        'join': async () => {
            let join = <Join<ReturnType>> task;
            const queryOp =
                    (input === NO_BINDING_SINGLETON_TABLE) ?
                            join.right :
                            algebraFactory.createJoin(await fromTableToValuesOp(input), join.right);
            const res = <IActorQueryOperationOutputBindings> await engine.query(queryOp, queryContext);
            return await executeTask(join.next, res, engine, queryContext);
        },
        'filter': async () => {
            let filter = <Filter<ReturnType>> task;
            const valuesOp = await fromTableToValuesOp(input);
            const queryOp = algebraFactory.createFilter(valuesOp, filter.expression);
            const res = <IActorQueryOperationOutputBindings> await engine.query(queryOp, queryContext);
            return await executeTask(filter.next, res, engine, queryContext);
        }
    };
    return cases[task.type]();
}

export function generateQuery<ReturnType>(task: Task<ReturnType>): void {
    switch(task.type) {
        
    }
}