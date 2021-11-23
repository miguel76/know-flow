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
  Action
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
 * Something used to represent a property path: a full property path
 * ({@link sparqlalgebrajs#Algebra.PropertyPathSymbol}), a single predicate
 * ({@link rdf-js#Term}), or a string parseable as one of the two (SPARQL/Turtle
 * syntax).
 */
export type PathParam = Algebra.PropertyPathSymbol | RDF.Term | string

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
   * Creates a ForEach flow
   * @param config - Configuration object
   * @returns New ForEach instance
   */
  createForEach<EachReturnType>(
    config:
      | {
          subflow: Flow<EachReturnType>
          var?: string | string[]
          distinct?: boolean
        }
      | {
          subflow: Flow<EachReturnType>
          path: PathParam
          graph?: RDF.Term
          // var?: string
        }
      | Flow<EachReturnType>
  ): Flow<EachReturnType[]> {
    let subflow: Flow<EachReturnType>
    let path: PathParam | undefined
    let graph: RDF.Term | undefined
    let variablesOrDistinct: string[] | boolean
    if (config instanceof Flow) {
      subflow = config
    } else if ('path' in config) {
      subflow = config.subflow
      path = config.path
      graph = config.graph
      // variablesOrDistinct = [config.var || '?_'];
      variablesOrDistinct = ['?_']
    } else {
      subflow = config.subflow
      const v = config.var
      variablesOrDistinct =
        v === undefined ? !!config.distinct : Array.isArray(v) ? v : [v]
    }
    const forEach = new ForEach<EachReturnType>(subflow, variablesOrDistinct)
    return path
      ? this.createTraverse({
          path,
          graph,
          subflow: forEach
        })
      : forEach
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

  private buildTerm(input: RDF.Term | string): RDF.Term {
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

  createTraverse<ReturnType>(config: {
    subflow: Flow<ReturnType>
    path: PathParam
    graph?: RDF.Term
  }): Join<ReturnType> {
    const path = config.path
    if (isString(path)) {
      return this.createJoin({
        right: this.translateOp('?_ ' + path + ' ?_out'),
        newDefault: '?_out',
        hideCurrVar: true,
        subflow: config.subflow
      })
    }
    return this.createJoin({
      right: isPropertyPathSymbol(path)
        ? this.algebraFactory.createPath(
            this.defaultInput,
            path,
            this.defaultOutput,
            config.graph
          )
        : this.algebraFactory.createBgp([
            this.algebraFactory.createPattern(
              this.defaultInput,
              path,
              this.defaultOutput,
              config.graph
            )
          ]),
      newDefault: '?_out',
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

  createTermReader(
    config: {
      variable?: string
      path?: Algebra.PropertyPathSymbol | RDF.Term | string
      graph?: RDF.Term
      filter?: Algebra.Expression | string
      lang?: string
      datatype?: string
    } = {}
  ): Flow<RDF.Term> {
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
      config && config.path
        ? this.createTraverse({
            path: config.path,
            graph: config.graph,
            subflow: actionIfFilter
          })
        : actionIfFilter
    return config && config.variable
      ? this.createLet({
          subflow: actionAfterPathAndFilter,
          currVarname: config.variable
        })
      : actionAfterPathAndFilter
  }

  createValueReader(
    config: {
      variable?: string
      path?: Algebra.PropertyPathSymbol | RDF.Term | string
      graph?: RDF.Term
      filter?: Algebra.Expression | string
      lang?: string
      datatype?: string
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

  createStringReader(
    config: {
      variable?: string
      path?: Algebra.PropertyPathSymbol | RDF.Term | string
      graph?: RDF.Term
      filter?: Algebra.Expression | string
      lang?: string
      datatype?: string
    } = {}
  ): Flow<string> {
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
