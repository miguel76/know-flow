import { Algebra, toSparql, Factory } from 'sparqlalgebrajs';
import {Table, TableSync, Task, Action, TaskSequence, ForEach, Traverse, Join, Filter, QueryAndTask, Cascade, Let} from './task';
import {Generator, Variable, Wildcard} from 'sparqljs';
import { Bindings, BindingsStream } from '@comunica/types';
import * as RDF from '@rdfjs/types';
// let generator = new Generator(options);

let algebraFactory = new Factory();
let WILDCARD = new Wildcard();
let dataFactory = algebraFactory.dataFactory;

export function toSparqlFragment(op: Algebra.Operation, options = {}): string {
    let sparqlStr = toSparql(algebraFactory.createProject(op, [WILDCARD]), options);
    return sparqlStr.substring('SELECT * WHERE { '.length, sparqlStr.length - ' }'.length);
}

export function syncTable(table: Table): Promise<TableSync> {
    return new Promise<TableSync>((resolve, reject) => {
        let bindingsArray: {[varname: string]: any}[] = [];
        table.bindingsStream.on('data', (bindings) => {
            bindingsArray.push(Object.fromEntries(<any> bindings));
        });
        table.bindingsStream.on('end', () => {
            resolve({
                variables: table.variables,
                bindingsArray,
                canContainUndefs: table.canContainUndefs
            });
        });
        table.bindingsStream.on('error', (error) => {
            reject(error);
        });
    });
}

export async function fromTableToValuesOp(table: Table): Promise<Algebra.Values> {
    return algebraFactory.createValues(
            table.variables.map((varname) => (dataFactory.variable(varname.substr(1)))),
            (await syncTable(table)).bindingsArray);
}

export function stringifyTask<ReturnType>(task: Task<ReturnType>, options = {}) {
    const cases: { [index:string] : () => any } = {
        'action': () => task,
        'cascade': () => {
            let cascade = <Cascade<any, ReturnType>> task;
            return {
                task: stringifyTask(cascade.task, options),
                action: cascade.action
            };
        },
        'task-sequence': () => ({
                type: 'task-sequence',
                subtasks: (<TaskSequence<ReturnType[keyof ReturnType]>> task).subtasks.map(t => stringifyTask(t,options))
        }),
        'for-each': () => ({
            type: 'for-each',
            subtask: (<ForEach<ReturnType[keyof ReturnType]>> task).subtask
        }),
        'let': () => {
            let letTask = <Let<ReturnType>> task;
            return {
                type: 'let',
                currVarname: letTask.currVarname,
                newVarname: letTask.newVarname,
                hideCurrVar: letTask.hideCurrVar,
                next: stringifyTask(letTask.next, options)
            }
        },
        'join': () => {
            let join = <Join<ReturnType>> task;
            return {
                type: 'join',
                right: toSparqlFragment(join.right, options),
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