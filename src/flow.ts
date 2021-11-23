import { Algebra } from 'sparqlalgebrajs'
import { BindingsStream } from '@comunica/types'

export interface Table {
  bindingsStream: BindingsStream
  variables: string[]
  canContainUndefs: boolean
}

export interface TableSync {
  bindingsArray: { [varname: string]: any }[]
  variables: string[]
  canContainUndefs: boolean
}

export interface Grouping {
  groupingVariables: string[]
  inGroupVariables: string[]
  groups: {
    groupingBindings: { [varname: string]: any }
    inGroupBindings: { [varname: string]: any }[]
  }[]
}

/**
 * Base class for flows, which are networks of know-flow operations
 */
// eslint-disable-next-line no-unused-vars
export class Flow<ReturnType> {}

/**
 * Actions are flows composed of a single async function taking as input the
 * current stream of bindings.
 */
export class Action<ReturnType> extends Flow<ReturnType> {
  exec: (input: Table) => Promise<ReturnType>

  constructor(exec: (input: Table) => Promise<ReturnType>) {
    super()
    this.exec = exec
  }
}

/** Cascades are flows composed of a subflow and a follow up action, the latter
 * taking as input the output of the former.
 */
export class Cascade<
  SubflowReturnType,
  ActionReturnType
> extends Flow<ActionReturnType> {
  subflow: Flow<SubflowReturnType>
  action: (subflowResult: SubflowReturnType) => Promise<ActionReturnType>

  constructor(
    subflow: Flow<SubflowReturnType>,
    action: (subflowResult: SubflowReturnType) => Promise<ActionReturnType>
  ) {
    super()
    this.subflow = subflow
    this.action = action
  }
}

/**
 * Parallel flows are composed of an array of subflows executed in parallel.
 * The output is the array of the results of each subflow.
 */
export class Parallel<EachReturnType> extends Flow<EachReturnType[]> {
  subflows: Flow<EachReturnType>[]

  constructor(subflows: Flow<EachReturnType>[]) {
    super()
    this.subflows = subflows
  }
}

/**
 * ForEach flows consist of a subflow that is executed mutiple times, once for
 * each input binding of either all the variables or a subset of them.
 */
export class ForEach<EachReturnType> extends Flow<EachReturnType[]> {
  subflow: Flow<EachReturnType>
  variables: string[] | undefined
  distinct: boolean

  constructor(
    subflow: Flow<EachReturnType>,
    variablesOrDistinct: string[] | boolean
  ) {
    super()
    this.subflow = subflow
    if (Array.isArray(variablesOrDistinct)) {
      this.variables = variablesOrDistinct
      this.distinct = true
    } else {
      this.distinct = !!variablesOrDistinct
    }
  }
}

/**
 * Base class of data operations, which are the flows that are data aware.
 * Data operations manipulate in some way (depnding on the specific subclass)
 * the current stream of bindings, without side effects.
 */
export class DataOperation<ReturnType> extends Flow<ReturnType> {
  subflow: Flow<ReturnType>

  constructor(subflow: Flow<ReturnType>) {
    super()
    this.subflow = subflow
  }
}

/**
 * Let operations replace the value of a variable with the value taken from
 * another variable.
 * It optionally hides the variable originally holding the value
 */
export class Let<ReturnType> extends DataOperation<ReturnType> {
  currVarname: string
  newVarname: string
  hideCurrVar: boolean

  constructor(
    subflow: Flow<ReturnType>,
    currVarname: string,
    newVarname: string,
    hideCurrVar: boolean
  ) {
    super(subflow)
    this.currVarname = currVarname
    this.newVarname = newVarname
    this.hideCurrVar = hideCurrVar
  }
}

/**
 * Join operations perform a Join between the current stream of bindings and the
 * output of a SPARQL subquery.
 * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algJoin}
 */
export class Join<ReturnType> extends DataOperation<ReturnType> {
  right: Algebra.Operation

  constructor(subflow: Flow<ReturnType>, right: Algebra.Operation) {
    super(subflow)
    this.right = right
  }
}

/**
 * Filter operations perform a Filter over the current stream of bindings.
 * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algFilter}
 */
export class Filter<ReturnType> extends DataOperation<ReturnType> {
  expression: Algebra.Expression

  constructor(subflow: Flow<ReturnType>, expression: Algebra.Expression) {
    super(subflow)
    this.expression = expression
  }
}

export class Aggregate<ReturnType> extends DataOperation<ReturnType> {
  aggregates: Algebra.BoundAggregate[]

  constructor(subflow: Flow<ReturnType>, aggregates: Algebra.BoundAggregate[]) {
    super(subflow)
    this.aggregates = aggregates
  }
}

export class Slice<ReturnType> extends DataOperation<ReturnType> {
  start: number
  length?: number

  constructor(subflow: Flow<ReturnType>, start: number, length?: number) {
    super(subflow)
    this.start = start
    this.length = length
  }
}
