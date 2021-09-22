import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter, Cascade} from './task';
import * as rdfjs from 'rdf-js';
import {IQueryEngine, BindingsStream, Bindings} from '@comunica/types';
import {SingletonIterator} from 'asynciterator';

function oneTupleBindingsStream(bindings: Bindings): BindingsStream {
    return new SingletonIterator<Bindings>(bindings);
}

export function executeTask<ReturnType>(
        task: Task<ReturnType>,
        bindingsStream: BindingsStream,
        engine: IQueryEngine,
        queryContext: any = {}): Promise<ReturnType> {
    const cases: { [index:string] : () => any } = {
        'action': () => (<Action<ReturnType>> task).exec(bindingsStream),
        'cascade': () => {
            let innerTask = (<any> task).task;
            let cascade = <Cascade<typeof innerTask, ReturnType>> task;
            return new Promise<ReturnType>((resolve, reject) => {
                executeTask(cascade.task, bindingsStream, engine, queryContext).then((taskResult) => {
                    cascade.action(taskResult).then((actionResult) => {
                        resolve(actionResult);
                    }, (error) => {
                        reject(error);
                    });
                }, (error) => {
                    reject(error);
                })
            });
        },
        'task-sequence': () => {
            (<TaskSequence<ReturnType[keyof ReturnType]>> task).subtasks.forEach(t => executeTask(t, bindingsStream, engine, queryContext));
        },
        'for-each': () => {
            let subtask = (<ForEach<ReturnType[keyof ReturnType]>> task).subtask;
            bindingsStream.on('data', (bindings) => {
                executeTask(subtask, oneTupleBindingsStream(bindings), engine, queryContext);
            });
        },
        // 'traverse': () => ({
        //     type: 'traverse',
        //     predicate: (<Traverse> task).predicate,
        //     graph: (<Traverse> task).graph
        // }),
        'join': () => {
            let join = <Join<ReturnType>> task;
            return {
                type: 'join',
                right: toSparqlFragment(join.right, options),
                focus: join.focus && new Generator(options).createGenerator().toEntity(join.focus),
                next: stringifyTask(join.next, options)
            }
        },
        'filter': () => {
            let filter = <Filter<ReturnType>> task;
            let filterSparql = toSparqlFragment(
                        algebraFactory.createFilter(algebraFactory.createBgp([]), filter.expression), options);
            return {
                type: 'filter',
                expression: filterSparql.substring('FILTER('.length, filterSparql.length - ')'.length),
                next: stringifyTask(filter.next, options)
            }
        }
    };
    return cases[task.type]();
}

export function executeCascade<TaskReturnType, ActionReturnType>(
        task: Cascade<TaskReturnType, ActionReturnType>,
        bindingsStream: BindingsStream,
        engine: IQueryEngine,
        queryContext: any = {}): Promise<ActionReturnType> {
    return new Promise<ActionReturnType>((resolve, reject) => {

    });
        // executeTask(task.task, bindingsStream, engine, queryContext)
}

export function generateQuery<ReturnType>(task: Task<ReturnType>): void {
    switch(task.type) {
        
    }
}