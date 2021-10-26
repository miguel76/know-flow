import { Algebra, toSparql, Factory } from 'sparqlalgebrajs';
import {Table, TableSync, Flow, Action, Parallel, ForEach, Join, Filter, DataOperation, Cascade, Let} from './flow';
import {Generator, Variable, Wildcard} from 'sparqljs';
import { Bindings, BindingsStream } from '@comunica/types';
import * as RDF from '@rdfjs/types';
import {ArrayIterator, SingletonIterator, UnionIterator} from 'asynciterator';
import { Map } from 'immutable';

let algebraFactory = new Factory();
let WILDCARD = new Wildcard();
let dataFactory = algebraFactory.dataFactory;

export function promisifyFromSync<Domain, Range>(f: (x: Domain) => Range):
        (x: Domain) => Promise<Range> {
    return (x: Domain) => (
        new Promise<Range>((resolve, reject) => {
            try {
                resolve(f(x));
            } catch(e) {
                reject(e);
            }
        })
    );
}

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

export function oneTupleTable(variables: string[], bindings: Bindings, canContainUndefs: boolean): Table {
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

export function stringifyFlow<ReturnType>(flow: Flow<ReturnType>, options = {}): any {
    if (flow instanceof Action) {
        return {type: "action"};
    } else if (flow instanceof Cascade) {
        let cascade = flow;
        return {
            type: 'cascade',
            subflow: stringifyFlow(cascade.subflow, options),
            action: cascade.action
        };
    } else if (flow instanceof Parallel) {
        return {
            type: 'parallel',
            subflows: flow.subflows.map(t => stringifyFlow(t,options))
        };
    } else if (flow instanceof ForEach) {
         return {
            type: 'for-each',
            subflow: stringifyFlow(flow.subflow)
        };
    } else if (flow instanceof Let) {
        let letFlow = flow;
        return {
            type: 'let',
            currVarname: letFlow.currVarname,
            newVarname: letFlow.newVarname,
            hideCurrVar: letFlow.hideCurrVar,
            subflow: stringifyFlow(letFlow.subflow, options)
        };
    } else if (flow instanceof Filter) {
        let filter = flow;
        let filterSparql = toSparqlFragment(
            algebraFactory.createFilter(algebraFactory.createBgp([]), filter.expression), options);
        return {
            type: 'filter',
            expression: filterSparql.substring('FILTER('.length, filterSparql.length - ')'.length),
            subflow: stringifyFlow(filter.subflow, options)
        };
    } else if (flow instanceof Join) {
        let join = flow;
        return {
            type: 'join',
            right: toSparqlFragment(join.right, options),
            subflow: stringifyFlow(join.subflow, options)
        }
    } else {
        throw new Error('Unrecognized flow type');     
    }
}
