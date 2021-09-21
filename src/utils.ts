import { Algebra, toSparql, Factory } from 'sparqlalgebrajs';
import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter, QueryAndTask} from './task';
import {Generator, Wildcard} from 'sparqljs';
// let generator = new Generator(options);

let algebraFactory = new Factory();
let WILDCARD = new Wildcard();

function toSparqlFragment(op: Algebra.Operation, options = {}): string {
    let sparqlStr = toSparql(algebraFactory.createProject(op, [WILDCARD]), options);
    return sparqlStr.substring('SELECT * WHERE { '.length, sparqlStr.length - ' }'.length);
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
    // const cases: ([k:string]: () => Task) = {
    //     'action': () => task,
    // }:
    return cases[task.type]();

}