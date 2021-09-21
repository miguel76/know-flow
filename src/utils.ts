import { Algebra, toSparql, Factory } from 'sparqlalgebrajs';
import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter, QueryAndTask} from './task';
import {Generator, Wildcard} from 'sparqljs';
// let generator = new Generator(options);

let algebraFactory = new Factory();
let WILDCARD = new Wildcard();

function toSparqlFragment(op: Algebra.Operation, options = {}): string {
    let sparqlStr = toSparql(algebraFactory.createProject(op, [WILDCARD]), options);
    return sparqlStr.substring("SELECT * WHERE { ".length, sparqlStr.length - " }".length);
}

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
            right: toSparqlFragment((<Join> task).right, options),
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
    return cases[task.type]();

}