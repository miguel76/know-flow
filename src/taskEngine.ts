import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter} from './task';
import * as rdfjs from 'rdf-js';
import {IQueryEngine, BindingsStream, Bindings} from '@comunica/types';
import {SingletonIterator} from 'asynciterator';

function oneTupleBindingsStream(bindings: Bindings): BindingsStream {
    return new SingletonIterator<Bindings>(bindings);
}

export function executeTask(
        task: Task,
        bindingsStream: BindingsStream,
        engine: IQueryEngine,
        queryContext: any = {}): void {
    const cases: { [index:string] : () => any } = {
        'action': () => {(<Action> task).exec(bindingsStream);},
        'task-sequence': () => {
            (<TaskSequence> task).subtasks.forEach(t => executeTask(t, bindingsStream, engine, queryContext));
        },
        'for-each': () => {
            let subtask = (<ForEach> task).subtask;
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
            let join = <Join> task;
            return {
                type: 'join',
                right: toSparqlFragment(join.right, options),
                focus: join.focus && new Generator(options).createGenerator().toEntity(join.focus),
                next: stringifyTask(join.next, options)
            }
        },
        'filter': () => {
            let filter = <Filter> task;
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

export function generateQuery(task: Task): void {
    switch(task.type) {
        
    }
}