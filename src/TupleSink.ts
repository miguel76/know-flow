import { Algebra } from 'sparqlalgebrajs';
import {Term} from "rdf-js";
import { Operation } from 'sparqlalgebrajs/lib/algebra';

export type TupleSink<Returns> = {
    hasDefaultInput: boolean,
    inputVarNames: string[],
    inputParamNames: string[]
};

export type Tuple = {
    default: Term,
    named: {[varName: string]: Term}
};

export type Action<Returns> = TupleSink<Returns> & {
    // do: (inputState: any, data: {inputs: Tuple[], params: {[varName: string]: Term}}) => any
    do: (data: {inputs: Tuple[], params: {[varName: string]: Term}}) => Returns
};

export type Sequence<ItemReturns,Returns> = TupleSink<Returns> & {
    tupleSinkSeq: TupleSink<ItemReturns>[],
    doAfter: (sequenceOutputs: ItemReturns[], data: {inputs: Tuple[], params: {[varName: string]: Term}}) => Returns
};

export type ForEach<ItemReturns,Returns> = TupleSink<Returns> & {
    tupleSinkItem: TupleSink<ItemReturns>,
    doAfter: (sequenceOutputs: ItemReturns[], data: {inputs: Tuple[], params: {[varName: string]: Term}}) => Returns
};

export type Query<Returns> = TupleSink<Returns> & {
    query: Operation,
    subTupleSink: TupleSink<Returns>
};