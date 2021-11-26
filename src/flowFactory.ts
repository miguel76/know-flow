import { Algebra, translate, Factory } from 'sparqlalgebrajs'
import * as RDF from 'rdf-js'
import { Table, TableSync } from './table'
import {
  Flow,
  ActionExecutor,
  ForEach,
  Join,
  Filter,
  Cascade,
  Let,
  ParallelTwo,
  ParallelThree,
  ParallelN,
  Action,
  Hide
} from './flow'
import { RDFToValueOrObject } from './toNative'
import * as Actions from './actions'

function isString(str: any): str is string {
  return typeof str === 'string'
}

function isPropertyPathSymbol(p: any): p is Algebra.PropertyPathSymbol {
  return [
    Algebra.types.ALT,
    Algebra.types.INV,
    Algebra.types.LINK,
    Algebra.types.NPS,
    Algebra.types.ONE_OR_MORE_PATH,
    Algebra.types.SEQ,
    Algebra.types.ZERO_OR_MORE_PATH,
    Algebra.types.ZERO_OR_ONE_PATH
  ].includes(p.type)
}

/**
 * Options object accepted by {@link sparqlalgebrajs#translate}
 */
interface TranslateOptions {
  dataFactory?: RDF.DataFactory
  quads?: boolean
  prefixes?: {
    [prefix: string]: string
  }
  baseIRI?: string
  blankToVariable?: boolean
  sparqlStar?: boolean
}

/**
 * Options object accepted by {@link sparqlalgebrajs#translate}, plus an
 * optional {@link sparqlalgebrajs#Factory} to build algebra objects.
 */
export interface FlowFactoryOptions extends TranslateOptions {
  algebraFactory?: Factory
}

/**
 * Something used to represent a simple property path (on the default graph): a
 * full property path ({@link sparqlalgebrajs#Algebra.PropertyPathSymbol}), a
 * single predicate ({@link rdf-js#Term}), or a string parseable as one of the
 * two (SPARQL/Turtle syntax).
 */
type PathParam = Algebra.PropertyPathSymbol | RDF.Term | string

/**
 * Something used to represent an RDF term: either a {@link rdf-js#Term} or a
 * string parseable as one.
 */
export type TermParam = string | RDF.Term

/**
 * Parameters used to specify a traversal.
 */
export type TraversalParam = {
  // Path specification
  path: PathParam
  // Optional graph name
  graphName?: TermParam
  // Name of the variable from which the path starts (defaults to `?_`)
  from?: string
  // Name of the variable to which the result is bound (defaults to `?_`)
  as?: string
}

/**
 * Parameters used to select a variable and possibly rename it
 */
export type SingleVariableParam =
  | {
      // The variable whose value is read
      var?: string
      // New name given to the variable
      // as?: string
    }
  | string
  | undefined

type CanonSingleVariableParam = {
  // The variable whose value is read
  var: string
  // New name given to the variable
  // as?: string
}

/**
 * Parameters used to select a single value
 */
export type SingleValueSelector = SingleVariableParam | TraversalParam

type CanonSingleValueSelector = CanonSingleVariableParam | TraversalParam

function canonSingleValuesSelector(
  selector: SingleValueSelector
): CanonSingleValueSelector {
  return selector === undefined
    ? { var: '?_' }
    : typeof selector === 'string'
    ? { var: selector }
    : 'path' in selector
    ? (selector as TraversalParam)
    : 'var' in selector
    ? (selector as CanonSingleVariableParam)
    : { var: '?_' }
}

/**
 * Parameters used to select all the variables in scope
 */
export type AllVariablesSelector = { allVars: true; distinct?: boolean }

/**
 * Parameters used to select a set of (named) values
 */
export type ValuesSelector =
  | SingleValueSelector
  | SingleValueSelector[]
  | AllVariablesSelector

type CanonValuesSelector = CanonSingleValueSelector[] | AllVariablesSelector

function canonValuesSelector(selector: ValuesSelector): CanonValuesSelector {
  return Array.isArray(selector)
    ? selector.map(canonSingleValuesSelector)
    : typeof selector === 'object' && 'allVars' in selector
    ? {
        allVars: true,
        distinct: 'distinct' in selector ? selector.distinct : false
      }
    : [canonSingleValuesSelector(selector)]
}

// function newVariablesFromSelector(selector: CanonValuesSelector) {
//   return 'allVars' in selector
//     ? []
//     : selector.map((s) => s.as).filter((v) => v !== undefined)
// }

// function newVariablesFromTraversals(selector: CanonValuesSelector) {
//   return 'allVars' in selector
//     ? []
//     : selector
//         .filter((s) => 'path' in s)
//         .map((s: TraversalParam) => s.as)
//         .filter((v) => v !== undefined)
// }

function newVariablesFromTraversals(traversals: TraversalParam[]) {
  return traversals.map((t) => t.as).filter((v) => v !== undefined)
}

function variablesFromValuesSelector(selector: CanonValuesSelector) {
  return 'allVars' in selector
    ? undefined
    : [
        ...selector
          .filter((s) => 'var' in s)
          .map((s: CanonSingleVariableParam) => s.var),
        ...newVariablesFromTraversals(
          selector.filter((s) => 'path' in s) as TraversalParam[]
        )
      ]
}

// function renamingFromSelector(
//   selector: CanonValuesSelector
// ): SingleVarRenameConfig[] {
//   return 'allVars' in selector
//     ? []
//     : selector
//         .filter((s) => 'var' in s && 'as' in s)
//         .map((s: CanonSingleVariableParam) => ({
//           currVarname: s.var,
//           newVarname: s.as,
//           hideCurrVar: false
//         }))
// }

/**
 * Parameters used to define a ForEach: either the selection of a set of values
 * to iterate on or, if all the variables are considered, the 'distinct' flag
 * to decide if repeated tuples must be considered in the same repetition.
 */
export type ForEachParam = { select: ValuesSelector }

/**
 * Object used to specify a single term reader (or similar) action: either a
 * single variable or a traversal
 */
export type TermReaderParam = SingleValueSelector & {
  filter?: Algebra.Expression | string
  lang?: string
  datatype?: string
}

type SubflowAndParams<SubflowReturnType, ParamType> =
  | Flow<SubflowReturnType>
  | ({ subflow: Flow<SubflowReturnType> } & ParamType)

function getFlowConfig<SubflowReturnType, ParamType>(
  config: SubflowAndParams<SubflowReturnType, ParamType>
): { subflow: Flow<SubflowReturnType>; params: ParamType | {} } {
  return config instanceof Flow
    ? { subflow: config, params: {} }
    : { subflow: config.subflow, params: { ...config } }
}

/**
 * Factory used to build flow objects, based on a set of options (e.g., a set of
 * assigned prefixes).
 */
export default class FlowFactory {
  /** Factory for algebra objects. */
  algebraFactory: Factory
  /** Factory for RDF objects. */
  dataFactory: RDF.DataFactory
  /** Variable used as default. */
  defaultInput: RDF.Variable
  /** Variable used as temporary for the output (for traversal). */
  defaultOutput: RDF.Variable
  /** Options used translating SPARQL from textual notation to object notation
   * using {@link sparqlalgebrajs#translate}.
   */
  options: TranslateOptions

  /**
   * Creates a new FlowFactory
   * @param options Options used translating SPARQL from textual notation to
   * SPARQL algebra notation.
   * @param options.algebraFactory Factory to build SPARQL algebra objects
   */
  constructor(options: FlowFactoryOptions = {}) {
    this.algebraFactory =
      options.algebraFactory || new Factory(options.dataFactory)
    this.dataFactory = this.algebraFactory.dataFactory
    this.defaultInput = this.dataFactory.variable('_')
    this.defaultOutput = this.dataFactory.variable('_out')
    this.options = options
  }

  /**
   * Creates a Cascade flow.
   * @param config.subflow - Subflow to be executed before the action.
   * @param config.action - Function to be executed as action after the subflow.
   * @returns The new Cascade instance.
   */
  createCascade<SubflowReturnType, ActionReturnType>(config: {
    subflow: Flow<SubflowReturnType>
    action: Action<SubflowReturnType, ActionReturnType>
  }): Cascade<SubflowReturnType, ActionReturnType> {
    return new Cascade(config.subflow, config.action)
  }

  /**
   * Creates an ActionExecutor.
   * @param action - Action to be executed.
   * @returns The new ActionExecutor instance.
   */
  createActionExecutor<ReturnType>(
    action: Action<Table, ReturnType>
  ): ActionExecutor<ReturnType> {
    return new ActionExecutor(action)
  }

  /**
   * Creates a Parallel flow from an array of subflows.
   * @param subflows - Array of subflows to be executed.
   * @returns The new Parallel instance.
   */
  createParallel<EachReturnType>(
    subflows: Flow<EachReturnType>[]
  ): ParallelN<EachReturnType> {
    return new ParallelN(subflows)
  }

  /**
   * Creates a Parallel flow from a dictionary of subflows.
   * @param subflowsDict - Dictionary of subflows to be executed.
   * @returns The new Parallel instance.
   */
  createParallelDict<EachReturnType>(subflowsDict: {
    [key: string]: Flow<EachReturnType>
  }): Flow<{ [key: string]: EachReturnType }> {
    const keys: string[] = []
    const subflows: Flow<EachReturnType>[] = []
    Object.entries(subflowsDict).forEach(([key, subflow]) => {
      keys.push(key)
      subflows.push(subflow)
    })
    return this.createCascade({
      subflow: this.createParallel(subflows),
      action: (resultArray: EachReturnType[]) =>
        Object.fromEntries(
          resultArray.map((singleRes, index) => [keys[index], singleRes])
        )
    })
  }

  /**
   * Creates a Parallel flow from a JS object containing nested subflows.
   * @param obj - JS object containing nested subflows.
   * @returns The new Parallel instance.
   */
  createParallelFromObject(obj: any): Flow<any> {
    if (obj instanceof Flow) {
      return obj
    } else if (Array.isArray(obj)) {
      return this.createParallel(
        obj.map((e) => this.createParallelFromObject(e))
      )
    } else if (typeof obj === 'object' && obj !== null) {
      return this.createParallelDict(
        Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [
            k,
            this.createParallelFromObject(v)
          ])
        )
      )
    } else {
      return this.createActionExecutor(Actions.constant(obj))
    }
  }

  createParallelTwo<ReturnType1, ReturnType2>(
    subflows: [Flow<ReturnType1>, Flow<ReturnType2>]
  ): ParallelTwo<ReturnType1, ReturnType2> {
    return new ParallelTwo(subflows)
  }

  createParallelThree<ReturnType1, ReturnType2, ReturnType3>(
    config:
      | {
          subflows: [Flow<ReturnType1>, Flow<ReturnType2>, Flow<ReturnType3>]
        }
      | [Flow<ReturnType1>, Flow<ReturnType2>, Flow<ReturnType3>]
  ): ParallelThree<ReturnType1, ReturnType2, ReturnType3> {
    const subflows = Array.isArray(config) ? config : config.subflows
    return new ParallelThree(subflows)
  }

  /**
   * Creates a ForEach flow.
   * @param config - The subflow or an object with the subflow and the ForEach
   * parameters.
   * @returns New ForEach instance.
   */
  createForEach<EachReturnType>(
    inputConfig: SubflowAndParams<EachReturnType, ForEachParam>
  ): Flow<EachReturnType[]> {
    const config = getFlowConfig(inputConfig)
    const selector = canonValuesSelector(
      'select' in config.params ? config.params.select : {}
    )
    let variablesOrDistinct: string[] | boolean
    let traversals: TraversalParam[]
    let traversalUseDefault: boolean
    if ('allVars' in selector) {
      variablesOrDistinct = selector.distinct
      traversals = []
    } else {
      variablesOrDistinct = variablesFromValuesSelector(selector)
      traversals = selector.filter((s) => 'path' in s) as TraversalParam[]
      traversalUseDefault = !traversals.every((t) => t.as)
      if (traversalUseDefault && !variablesOrDistinct.includes('?_')) {
        variablesOrDistinct.push('?_')
      }
    }
    const forEach = new ForEach<EachReturnType>(
      config.subflow,
      variablesOrDistinct
    )
    if (traversals.length === 0) {
      return forEach
    } else {
      const join = this.createJoin({
        right: this.buildOpForTraversals(traversals),
        newDefault: traversalUseDefault ? '?_out' : undefined,
        hideCurrVar: true,
        subflow: forEach
      })
      return traversals.some((t) => t.as)
        ? this.createHide({
            variables: newVariablesFromTraversals(traversals),
            subflow: join
          })
        : join
    }
  }

  private selectEnvelope(patternStr: string): string {
    return 'SELECT * WHERE { ' + patternStr + ' }'
  }

  private translateOp(patternStr: string): Algebra.Operation {
    return (<Algebra.Project>(
      translate(this.selectEnvelope(patternStr), this.options)
    )).input
  }

  createLet<ReturnType>(config: {
    subflow: Flow<ReturnType>
    currVarname?: string
    newVarname?: string
    hideCurrVar?: boolean
  }): Let<ReturnType> {
    return new Let<ReturnType>(
      config.subflow,
      config.currVarname || '?_',
      config.newVarname || '?_',
      !!config.hideCurrVar
    )
  }

  createHide<ReturnType>(config: {
    subflow: Flow<ReturnType>
    variables: string[]
  }): Hide<ReturnType> {
    return new Hide<ReturnType>(config.subflow, config.variables)
  }

  private buildTerm(input: TermParam): RDF.Term {
    if (typeof input === 'string') {
      const op = <Algebra.Values>this.translateOp('VALUES ?_ {' + input + '}')
      return op.bindings[0]['?_']
    } else {
      return input
    }
  }

  private buildBindings(
    input: { [key: string]: RDF.Term | string } | RDF.Term | string
  ): { [key: string]: RDF.Term } {
    if (typeof input === 'string' || (<any>input).termType !== undefined) {
      return { '?_': this.buildTerm(<RDF.Term | string>input) }
    } else {
      return Object.fromEntries(
        (<any>input)
          .entries()
          .map((entry: [string, RDF.Term | string]) => [
            entry[0],
            this.buildTerm(entry[1])
          ])
      )
    }
  }

  private buildBindingsSeq(
    input:
      | { [key: string]: RDF.Term | string }[]
      | { [key: string]: RDF.Term | string }
      | (RDF.Term | string)[]
      | RDF.Term
      | string
  ): { [key: string]: RDF.Term }[] {
    if (Array.isArray(input)) {
      return input.map((i) => this.buildBindings(i))
    } else {
      return [this.buildBindings(input)]
    }
  }

  createValues<ReturnType>(config: {
    subflow: Flow<ReturnType>
    bindings:
      | { [key: string]: RDF.Term | string }[]
      | { [key: string]: RDF.Term | string }
      | (RDF.Term | string)[]
      | RDF.Term
      | string
  }): Join<ReturnType> {
    const bindings = this.buildBindingsSeq(config.bindings)
    const varnames = [...new Set(bindings.flatMap((b) => Object.keys(b)))]
    const valuesOp = this.algebraFactory.createValues(
      varnames.map((varname) => this.dataFactory.variable(varname.substr(1))),
      bindings
    )
    return this.createJoin({
      subflow: config.subflow,
      right: valuesOp
    })
  }

  buildOpForTraversal(traversal: TraversalParam): Algebra.Path | Algebra.Bgp {
    const from = traversal.from || '?_'
    const to = traversal.as || '?_out'
    if (isString(traversal.path)) {
      const op = this.translateOp(from + ' ' + traversal.path + ' ' + to)
      if (op.type === 'bgp') {
        const bgp = op as Algebra.Bgp
        if (traversal.graphName !== undefined) {
          bgp.patterns.forEach((pattern) => {
            pattern.graph = this.buildTerm(traversal.graphName)
          })
        }
        return bgp
      } else if (op.type === 'path') {
        const pathOp = op as Algebra.Path
        if (traversal.graphName !== undefined) {
          pathOp.graph = this.buildTerm(traversal.graphName)
        }
        return pathOp
      }
    } else {
      return isPropertyPathSymbol(traversal.path)
        ? this.algebraFactory.createPath(
            this.dataFactory.variable(from.substr(1)),
            traversal.path,
            this.dataFactory.variable(to.substr(1)),
            this.buildTerm(traversal.graphName)
          )
        : this.algebraFactory.createBgp([
            this.algebraFactory.createPattern(
              this.dataFactory.variable(from.substr(1)),
              traversal.path,
              this.dataFactory.variable(to.substr(1)),
              this.buildTerm(traversal.graphName)
            )
          ])
    }
  }

  buildJoin(operations: Algebra.Operation[]): Algebra.Operation {
    if (operations.length === 0) {
      return null
    } else if (operations.length === 1) {
      return operations[0]
    } else {
      return this.algebraFactory.createJoin(
        operations[0],
        this.buildJoin(operations.slice(1))
      )
    }
  }

  buildOpForTraversals(traversals: TraversalParam[]): Algebra.Operation {
    const ops = traversals.map((t) => this.buildOpForTraversal(t))
    const opsToBeJoined: Algebra.Operation[] = []
    const patterns = ops
      .filter((op) => op.type === 'bgp')
      .flatMap((bgp: Algebra.Bgp) => bgp.patterns)
    if (patterns.length > 0) {
      opsToBeJoined.push(this.algebraFactory.createBgp(patterns))
    }
    const paths = ops.filter((op) => op.type === 'path')
    opsToBeJoined.push(...paths)
    return this.buildJoin(opsToBeJoined)
  }

  createTraversals<ReturnType>(config: {
    subflow: Flow<ReturnType>
    traversals: TraversalParam[]
  }): Join<ReturnType> {
    return this.createJoin({
      right: this.buildOpForTraversals(config.traversals),
      newDefault: config.traversals.every((t) => t.as) ? undefined : '?_out',
      hideCurrVar: true,
      subflow: config.subflow
    })
  }

  createTraversal<ReturnType>(
    config: {
      subflow: Flow<ReturnType>
    } & TraversalParam
  ): Join<ReturnType> {
    return this.createJoin({
      right: this.buildOpForTraversal(config),
      newDefault: config.as ? undefined : '?_out',
      hideCurrVar: true,
      subflow: config.subflow
    })
  }

  createJoin<ReturnType>(config: {
    subflow: Flow<ReturnType>
    right: Algebra.Operation | string
    newDefault?: string
    hideCurrVar?: boolean
  }): Join<ReturnType> {
    let right = config.right
    if (isString(right)) {
      right = this.translateOp(right)
    }
    let subflow = config.subflow
    if (config.newDefault) {
      subflow = this.createLet({
        subflow,
        currVarname: config.newDefault,
        hideCurrVar: config.hideCurrVar
      })
    }
    return new Join<ReturnType>(subflow, right)
  }

  createFilter<ReturnType>(config: {
    subflow: Flow<ReturnType>
    expression: Algebra.Expression | string
  }): Filter<ReturnType> {
    let expression = config.expression
    if (isString(expression)) {
      expression = (<Algebra.Filter>(
        this.translateOp('FILTER(' + expression + ')')
      )).expression
    }
    return new Filter<ReturnType>(config.subflow, expression)
  }

  createTermReader(config: TermReaderParam = {}): Flow<RDF.Term> {
    const action = this.createActionExecutor(Actions.onFirstDefault((x) => x))
    const actionIfLang = config.lang
      ? this.createFilter({
          expression: 'langMatches( lang(?_), "' + config.lang + '" )',
          subflow: action
        })
      : action
    const actionIfTypeAndLang = config.datatype
      ? this.createFilter({
          expression: this.algebraFactory.createOperatorExpression('=', [
            this.algebraFactory.createOperatorExpression('datatype', [
              this.algebraFactory.createTermExpression(this.defaultInput)
            ]),
            this.algebraFactory.createTermExpression(
              this.buildTerm(config.datatype)
            )
          ]),
          subflow: actionIfLang
        })
      : actionIfLang
    const actionIfFilter = config.filter
      ? this.createFilter({
          expression: config.filter,
          subflow: actionIfTypeAndLang
        })
      : actionIfTypeAndLang
    const actionAfterPathAndFilter =
      'path' in config
        ? this.createTraversal({
            ...config,
            subflow: actionIfFilter
          })
        : actionIfFilter
    return 'var' in config
      ? this.createLet({
          subflow: actionAfterPathAndFilter,
          currVarname: config.var
        })
      : actionAfterPathAndFilter
  }

  createValueReader(
    config: TermReaderParam & {
      plainIDs?: boolean
    } = {}
  ): Flow<any> {
    // TODO: manage arrays of values too
    const plainIDs = config.plainIDs !== undefined ? config.plainIDs : true
    return this.createCascade({
      subflow: this.createTermReader(config),
      action: (term) => RDFToValueOrObject(term, plainIDs)
    })
  }

  createStringReader(config: TermReaderParam = {}): Flow<string> {
    // TODO: manage arrays of values too
    return this.createCascade({
      subflow: this.createTermReader(config),
      action: (term) => RDFToValueOrObject(term, true, false)
    })
  }

  logFlowCount: number = 0
  log<ReturnType>(next: Flow<ReturnType>, label?: string): Flow<ReturnType> {
    const logFlowId = ++this.logFlowCount
    let callCount = 0
    const loggingFlow = this.createActionExecutor(
      Actions.onAll((table: TableSync) => {
        const callId = ++callCount
        console.log(
          '# Input of node ' +
            logFlowId +
            (label ? ' (' + label + ')' : '') +
            ' call n. ' +
            callId
        )
        console.log(table.bindingsArray)
        console.log('')
        return callId
      })
    )
    const seq = this.createParallelTwo([loggingFlow as Flow<number>, next])
    return this.createCascade({
      subflow: seq as Flow<[number, ReturnType]>,
      action: (resSeq) => {
        const callId = resSeq[0]
        const actionRes = resSeq[1]
        console.log(
          '# Output of node ' +
            logFlowId +
            (label ? ' (' + label + ')' : '') +
            ' call n. ' +
            callId
        )
        console.log(actionRes)
        console.log('')
        return actionRes
      }
    })
  }
}
