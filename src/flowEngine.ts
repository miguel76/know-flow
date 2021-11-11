import {Flow, Action, Parallel, ForEach, Join, Filter, Cascade, Table, Let, DataOperation} from './flow';
import * as RDF from 'rdf-js';
import { Algebra, toSparql, Factory } from 'sparqlalgebrajs';
import {IQueryEngine, BindingsStream, Bindings, IActorQueryOperationOutputBindings} from '@comunica/types';
import {fromTableToValuesOp, noBindingSingletonTable, oneTupleTable} from './utils';
import { Map } from 'immutable';
import { Wildcard } from 'sparqljs';

let algebraFactory = new Factory();
let WILDCARD = new Wildcard();

function assignVar(input: Table, currVarName: string, newVarName: string, hideCurrVar: boolean): Table {
    if (!input.variables.includes(currVarName)) {
        throw 'New focus ' + currVarName + ' not found among the variables (' + input.variables + ').';
    }
    let variables = hideCurrVar ?
            input.variables.filter(v => v !== currVarName) :
            input.variables;
    return {
        variables: variables.includes(newVarName) ?
                variables :
                variables.concat(newVarName),
        bindingsStream: input.bindingsStream.map(bindings => {
            let newBindings: {[key: string]: RDF.Term} = {};
            bindings.forEach((value, varname) => {
                if (varname === currVarName) {
                    newBindings[newVarName] = value;
                }
                if (varname !== newVarName && (varname !== currVarName || !hideCurrVar)) {
                    newBindings[varname] = value;
                }
            });
            return Map<string, RDF.Term>(newBindings);
        }),
        canContainUndefs: input.canContainUndefs
    };
}

export default class FlowEngine {

    engine: IQueryEngine;
    queryContext: any;

    constructor(config: {
        engine: IQueryEngine,
        queryContext?: any
    }) {
        this.engine = config.engine; // || newEngine();
        this.queryContext = config.queryContext || {};
    }

    private async query(queryOp: Algebra.Operation): Promise<IActorQueryOperationOutputBindings> {
        return <IActorQueryOperationOutputBindings>
                await this.engine.query(queryOp, this.queryContext);
    }

    async run<ReturnType>(
            config: {
                flow: Flow<ReturnType>,
                input?: Table
            } | Flow<ReturnType>): Promise<ReturnType> {
        let flow: Flow<ReturnType>;
        let input: Table;
        if (config instanceof Flow) {
            flow = <Flow<ReturnType>> config;
            input = noBindingSingletonTable();
        } else {
            flow = (<{flow: Flow<ReturnType>, input?: Table}> config).flow;
            input = <Table> (<any> config).input || noBindingSingletonTable();
        }
        if (flow instanceof Action) {
            return flow.exec(input);
        } else if (flow instanceof Cascade) {
            let flowResult = await this.run({flow: flow.subflow, input});
            return await flow.action(flowResult);
        } else if (flow instanceof Parallel) {
            return <ReturnType> <unknown> await Promise.all(flow.subflows.map(
                    subflow => this.run({flow: subflow, input})));
        } else if (flow instanceof ForEach) {
            let forEach = flow;
            return await new Promise<ReturnType>((resolve, reject) => {
                var promises: Promise<unknown>[] = [];
                input.bindingsStream.on('data', (bindings: Bindings) => {
                    promises.push(
                            this.run({
                                flow: forEach.subflow,
                                input: oneTupleTable(
                                        input.variables,
                                        bindings,
                                        input.canContainUndefs)
                            }));
                });
                input.bindingsStream.on('end', () => {
                    Promise.all(promises).then((result) => {
                        resolve(<ReturnType> <unknown> result);
                    }, (error) => {
                        reject(error);
                    });
                });
                input.bindingsStream.on('error', (error: any) => {
                    reject(error);
                });
            });
        } else if (flow instanceof DataOperation) {
            let query = flow;
            let results;
            if (query instanceof Let) {
                let letFlow = query;
                results = assignVar(input, letFlow.currVarname, letFlow.newVarname, letFlow.hideCurrVar);
            } else {
                let inputOp = await fromTableToValuesOp(input);
                let queryOp;
                if (query instanceof Join) {
                    let join = query;
                    queryOp = //(input === NO_BINDING_SINGLETON_TABLE) ?
                            //join.right :
                            algebraFactory.createJoin(inputOp, join.right);
                } else if (query instanceof Filter) {
                    let filter = <Filter<ReturnType>> query;
                    queryOp = algebraFactory.createFilter(inputOp, filter.expression);
                } else {
                    throw new Error('Unrecognized query type')
                }
                results = await this.query(queryOp);
            }
            return await this.run({flow: query.subflow, input: results});
        } else {
            throw new Error('Unrecognized flow type')        
        }
    }

}