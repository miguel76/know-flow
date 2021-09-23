import { Algebra, toSparql, Factory } from 'sparqlalgebrajs';
import {Table, TableSync, Task, Action, TaskSequence, ForEach, Traverse, Join, Filter, QueryAndTask, Cascade} from './task';
import {Generator, Variable, Wildcard} from 'sparqljs';
import { Bindings, BindingsStream } from '@comunica/types';
import * as RDF from '@rdfjs/types';
// let generator = new Generator(options);

let algebraFactory = new Factory();
let WILDCARD = new Wildcard();

function toSparqlFragment(op: Algebra.Operation, options = {}): string {
    let sparqlStr = toSparql(algebraFactory.createProject(op, [WILDCARD]), options);
    return sparqlStr.substring('SELECT * WHERE { '.length, sparqlStr.length - ' }'.length);
}

export function syncTable(table: Table): Promise<TableSync> {
    return new Promise<TableSync>((resolve, reject) => {
        let bindingsArray: Bindings[] = [];
        table.bindingsStream.on('data', (binding) => {
            bindingsArray.push(binding);
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

export function fromTableToValuesOp(table: Table): Promise<Algebra.Values> {
    return new Promise<Algebra.Values>((resolve, reject) => {
        syncTable(table).then((tableSync) => {
            resolve(algebraFactory.createValues(
                    table.variables.map((varname) => (<RDF.Variable> algebraFactory.createTerm('?' + varname))),
                    tableSync.bindingsArray.map((bindings) => Object.fromEntries(<any> bindings))));
        }, (error) => {
            reject(error);
        });
    });
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