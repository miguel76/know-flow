import { toSparql } from 'sparqlalgebrajs';
import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter} from './task';

export function stringifyTask(task: Task) {
    const cases: { [index:string] : () => any } = {
        'action': () => task,
        'task-sequence': () => ({
                type: 'task-sequence',
                subtasks: (<TaskSequence> task).subtasks.map(stringifyTask)
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
            right: toSparql((<Join> task).right),
            focus: (<Join> task).focus
        })
    };
    // const cases: ([k:string]: () => Task) = {
    //     'action': () => task,
    // }:
    cases[task.type]();

}