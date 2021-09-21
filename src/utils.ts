import { toSparql } from 'sparqlalgebrajs';
import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter, QueryAndTask} from './task';
import {Generator} from 'sparqljs';
// let generator = new Generator(options);


export function stringifyTask(task: Task, options = {}) {
    const cases: { [index:string] : () => any } = {
        'action': () => task,
        'task-sequence': () => ({
                type: 'task-sequence',
                subtasks: (<TaskSequence> task).subtasks.map(t => stringifyTask(t,options))
        }),
        'for-each': () => ({
            type: 'for-each',
            subtask: (<ForEach> task).subtask
        }),
        // 'traverse': () => ({
        //     type: 'traverse',
        //     predicate: (<Traverse> task).predicate,
        //     graph: (<Traverse> task).graph
        // }),
        'join': () => ({
            type: 'join',
            right: toSparql((<Join> task).right, options),
            focus: new Generator(options).createGenerator().toEntity((<Join> task).focus),
            next: stringifyTask((<QueryAndTask> task).next, options)
        }),
        'filter': () => ({
            type: 'filter',
            expression: new Generator(options).createGenerator().toExpression((<Filter> task).expression),
            next: stringifyTask((<QueryAndTask> task).next, options)
        })
    };
    // const cases: ([k:string]: () => Task) = {
    //     'action': () => task,
    // }:
    cases[task.type]();

}