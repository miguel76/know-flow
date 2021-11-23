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
 * A flow take implicitly as input a sequence of RDF bindings and a knowledge
 * graph, performs some data operations which may involve querying the knowledge
 * graph, performs some data-driven actions, and finally returning some output.
 * Flows can be composed of other flows (called subflows).
 */
// eslint-disable-next-line no-unused-vars
export abstract class Flow<ReturnType> {}

/**
 * Actions are flows composed of a single async function taking as input the
 * current sequence of bindings.
 */
export class Action<ReturnType> extends Flow<ReturnType> {
  /** Async function to be excuted */
  exec: (input: Table) => Promise<ReturnType>

  /**
   * Creates a new action
   * @param exec - Async function to be excuted
   */
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
  /** Subflow to be executed before the action */
  subflow: Flow<SubflowReturnType>
  /** Function to be executed as action after the subflow */
  action: (subflowResult: SubflowReturnType) => Promise<ActionReturnType>

  /**
   * Creates a new cascade
   * @param subflow - Subflow to be executed before the action
   * @param action - Function to be executed as action after the subflow
   */
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
export class Parallel<ReturnType> extends Flow<ReturnType> {
  /** Array of subflows to be executed in parallel */
  subflows: Flow<any>[]

  /**
   * Creates a new Parallel
   * @param subflows - Array of subflows to be executed in parallel
   */
  constructor(subflows: Flow<any>[]) {
    super()
    this.subflows = subflows
  }
}

/**
 * ParallelN flows are composed of an array of subflows executed in parallel,
 * having all the same return type.
 * The output is the array of the results of each subflow.
 * ParallelN, ParallelTwo and ParallelThree are subclasses of Parallel defined
 * to have more control on return types (using typescript) than using directly
 * Parallel.
 */
export class ParallelN<EachReturnType> extends Parallel<EachReturnType[]> {
  subflows: Flow<EachReturnType>[]
}

/**
 * ParallelTwo flows are composed of two subflows executed in parallel.
 * The output is the array of the results of each subflow.
 * ParallelN, ParallelTwo and ParallelThree are subclasses of Parallel defined
 * to have more control on return types (using typescript) than using directly
 */
export class ParallelTwo<ReturnType1, ReturnType2> extends Parallel<
  [ReturnType1, ReturnType2]
> {
  subflows: [Flow<ReturnType1>, Flow<ReturnType2>]
}

/**
 * ParallelThree flows are composed of three subflows executed in parallel.
 * The output is the array of the results of each subflow.
 * ParallelN, ParallelTwo and ParallelThree are subclasses of Parallel defined
 * to have more control on return types (using typescript) than using directly
 */
export class ParallelThree<
  ReturnType1,
  ReturnType2,
  ReturnType3
> extends Parallel<[ReturnType1, ReturnType2, ReturnType3]> {
  subflows: [Flow<ReturnType1>, Flow<ReturnType2>, Flow<ReturnType3>]
}

/**
 * ForEach flows consist of a subflow that is executed mutiple times (in
 * parallel), once for each input binding of either all the variables or a
 * subset of them.
 */
export class ForEach<EachReturnType> extends Flow<EachReturnType[]> {
  /** Subflow to be executed each time */
  subflow: Flow<EachReturnType>
  /** Optionally, set of variables used for the iteration. If undefined all the
   * variables in the input sequence of bindings are considered. */
  variables: string[] | undefined
  /** In the case all the variables are selected for iteration, decides if
   * multiple indentical bindings are considered in the same iteration or not. */
  distinct: boolean

  /**
   * Creates a new ForEach
   * @param subflow - Optionally, set of variables used for the iteration. If
   * undefined all the variables in the input sequence of bindings are
   * considered.
   * @param variablesOrDistinct - In the case all the variables are selected for
   * iteration, decides if multiple indentical bindings are considered in the
   * same iteration or not
   */
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
 * the current sequence of bindings, without side effects.
 */
export abstract class DataOperation<ReturnType> extends Flow<ReturnType> {
  /** Subflow executed after the operation. */
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
  /** Name of the variable whose value is used. */
  currVarname: string
  /** Name of the variable to which the value is assigned. */
  newVarname: string
  /** If true, the original variable (`currVarname`) is hidden.  */
  hideCurrVar: boolean

  /**
   * Creates a new Let
   * @param subflow - Subflow executed after the operation.
   * @param currVarname - Name of the variable whose value is used.
   * @param newVarname - Name of the variable to which the value is assigned.
   * @param hideCurrVar - If true, the original variable (`currVarname`) is
   * hidden.
   */
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
 * Join operations perform a Join between the current sequence of bindings and
 * the output of a SPARQL subquery.
 * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algJoin}
 */
export class Join<ReturnType> extends DataOperation<ReturnType> {
  /** SPARQL subquery which is joined with the current sequence of bindings. */
  right: Algebra.Operation

  /**
   * Creates a new Join
   * @param subflow - Subflow executed after the operation.
   * @param right - SPARQL subquery which is joined with the current sequence of
   * bindings.
   */
  constructor(subflow: Flow<ReturnType>, right: Algebra.Operation) {
    super(subflow)
    this.right = right
  }
}

/**
 * Filter operations perform a Filter over the current sequence of bindings.
 * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algFilter}
 */
export class Filter<ReturnType> extends DataOperation<ReturnType> {
  /** Expression used for filter the current sequence of bindings. */
  expression: Algebra.Expression

  /**
   * Creates a new Filter
   * @param subflow - Subflow executed after the operation.
   * @param expression - Expression used for filter the current sequence of
   * bindings.
   */
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
