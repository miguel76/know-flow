import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter, Cascade, Table} from './task';
import * as RDF from 'rdf-js';
import { Algebra, toSparql, Factory } from 'sparqlalgebrajs';
import {IQueryEngine, BindingsStream, Bindings, IActorQueryOperationOutputBindings} from '@comunica/types';
import {ArrayIterator, SingletonIterator, UnionIterator} from 'asynciterator';
import {fromTableToValuesOp} from './utils';
import { Map } from 'immutable';

let algebraFactory = new Factory();

function oneTupleTable(variables: string[], bindings: Bindings, canContainUndefs: boolean): Table {
    return {
        bindingsStream: new SingletonIterator<Bindings>(bindings),
        variables, canContainUndefs
    };
}

export const NO_BINDING_SINGLETON_TABLE = oneTupleTable([], Map<string, RDF.Term>({}), false);

function arrayUnion<T>(arrays: T[][]): T[] {
    return arrays.reduce((vars, newVars) => vars.concat(newVars.filter(v => !(v in vars))))
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

function replaceFocus(input: Table, newFocus: string): Table {
    if (!(newFocus in input.variables)) {
        throw 'New focus ?' + newFocus + ' not found among the variables.';
    }
    return {
        variables: '_' in input.variables ? input.variables.concat('_') : input.variables,
        bindingsStream: input.bindingsStream.map(bindings => {
            let newBindings: {[key: string]: RDF.Term} = {};
            bindings.forEach((value, varname) => {
                if (varname === newFocus) {
                    newBindings['_'] = value;
                } else if (varname !== '_') {
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
        'cascade': () => {
            let cascade = <Cascade<any, ReturnType>> task;
            return executeTask(cascade.task, input, engine, queryContext)
                    .then(cascade.action);
        },
        'task-sequence': () => {
            let taskSequence = <TaskSequence<any>> task;
            return <Promise<ReturnType>> <unknown> collectPromises(
                    taskSequence.subtasks.map(t => executeTask(t, input, engine, queryContext)));
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
                    collectPromises(promises).then((result) => {
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
        'join': async () => {
            let join = <Join<ReturnType>> task;
            const valuesOp = await fromTableToValuesOp(input);
            const queryOp = algebraFactory.createJoin(valuesOp, join.right);
            const res = <IActorQueryOperationOutputBindings> await engine.query(queryOp);
            const resAfterFocus = join.focus ? replaceFocus(res, join.focus.value) : res;
            return await executeTask(join.next, resAfterFocus, engine, queryContext);
        },
        'filter': async () => {
            let filter = <Filter<ReturnType>> task;
            const valuesOp = await fromTableToValuesOp(input);
            const queryOp = algebraFactory.createFilter(valuesOp, filter.expression);
            const res = <IActorQueryOperationOutputBindings> await engine.query(queryOp);
            return await executeTask(filter.next, res, engine, queryContext);
        }
    };
    return cases[task.type]();
}

export function generateQuery<ReturnType>(task: Task<ReturnType>): void {
    switch(task.type) {
        
    }
}