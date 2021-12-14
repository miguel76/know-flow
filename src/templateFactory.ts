import { Algebra, Factory } from 'sparqlalgebrajs'
import * as RDF from 'rdf-js'
import { TableSync } from './table'
import { Flow } from './flow'
import { RDFToValueOrObject } from './toNative'
import * as Actions from './actions'
import {
  canonValuesSelector,
  newVariablesFromTraversals,
  SingleValueSelector,
  TermParam,
  TraversalParam,
  ValuesSelector,
  variablesFromValuesSelector
} from './selectors'
import FlowFactory, { FlowFactoryOptions } from './flowFactory'
import { getFlowConfig, SubflowAndParams } from './paramUtils'

type literalOrNamedNodeParam = RDF.Literal | RDF.NamedNode | string

/**
 * Parameters used to define a For: either the selection of a set of values
 * to iterate on or, if all the variables are considered, the 'distinct' flag
 * to decide if repeated tuples must be considered in the same repetition.
 */
export type ForParam = { select: ValuesSelector }

/**
 * Object used to specify a single term reader (or similar) action: either a
 * single variable or a traversal
 */
export type TermReaderParam = SingleValueSelector & {
  filter?: Algebra.Expression | string
  lang?: string
  datatype?: string
}

/**
 * Parameter used to build a TemplateFactory: either a {@link FlowFactory} or
 * the options to be used to create one.
 */
export type TemplateFactoryParam = FlowFactory | FlowFactoryOptions

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
 * Factory used to build flow objects in a template oriented fashion.
 */
export default class TemplateFactory {
  /** Factory for basic flow objects */
  flowFactory: FlowFactory
  /** SPARQL Algebra Factory */
  algebraFactory: Factory
  /** Factory for RDF objects. */
  dataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>
  /** Variable used as default. */
  defaultInput: RDF.Variable
  /** Variable used as temporary for the output (for traversal). */
  defaultOutput: RDF.Variable

  /**
   * Creates a new TemplateFactory
   * @param param Either a {@link FlowFactory} or the options to be used to
   * create one.
   */
  constructor(param: TemplateFactoryParam = {}) {
    if (param instanceof FlowFactory) {
      this.flowFactory = param
    } else {
      this.flowFactory = new FlowFactory(param)
    }
    this.algebraFactory = this.flowFactory.algebraFactory
    this.dataFactory = this.flowFactory.dataFactory
    this.defaultInput = this.dataFactory.variable('_')
    this.defaultOutput = this.dataFactory.variable('_out')
  }

  /**
   * Creates a for-each block.
   * @param config - The subflow or an object with the subflow and the For
   * parameters.
   * @returns New For instance.
   */
  createForEach<EachReturnType>(
    inputConfig: SubflowAndParams<EachReturnType, ForParam>
  ): Flow<EachReturnType[]> {
    const config = getFlowConfig(inputConfig)
    const selector = canonValuesSelector(
      'select' in config.params ? config.params.select : config.params
    )
    if ('allVars' in selector) {
      return this.flowFactory.createForEach(inputConfig)
    } else {
      const variables = variablesFromValuesSelector(selector)
      const traversals = selector.filter((s) => 'path' in s) as TraversalParam[]
      const traversalUseDefault = !traversals.every((t) => t.as)
      if (traversalUseDefault && !variables.includes('?_')) {
        variables.push('?_')
      }
      const forEach = this.flowFactory.createForEach({
        subflow: config.subflow,
        select: variables
      })
      if (traversals.length === 0) {
        return forEach
      } else {
        const join = this.flowFactory.createJoin({
          input: this.buildOpsForTraversals(traversals),
          newDefault: traversalUseDefault ? '?_out' : undefined,
          hideCurrVar: true,
          subflow: forEach
        })
        return traversals.some((t) => t.as)
          ? this.flowFactory.createHide({
              variables: newVariablesFromTraversals(traversals),
              subflow: join
            })
          : join
      }
    }
  }

  // compose<
  //   FlowReturnType,
  //   SubflowsType extends
  //     | Flow<FlowReturnType>
  //     | Flow<FlowReturnType>[]
  //     | { [key: string]: Flow<FlowReturnType> },
  //   FlowsReturnType extends SubflowsType extends {
  //     [key: string]: Flow<FlowReturnType>
  //   }
  //     ? { [key: string]: FlowReturnType }
  //     : SubflowsType extends Flow<FlowReturnType>[]
  //     ? FlowReturnType[]
  //     : FlowReturnType
  // >(subflows: SubflowsType): Flow<FlowsReturnType>

  // compose<
  //   FlowReturnType,
  //   SubflowsType extends
  //     | Flow<FlowReturnType>
  //     | Flow<FlowReturnType>[]
  //     | { [key: string]: Flow<FlowReturnType> },
  //   FlowsReturnType extends SubflowsType extends {
  //     [key: string]: Flow<FlowReturnType>
  //   }
  //     ? { [key: string]: FlowReturnType }
  //     : SubflowsType extends Flow<FlowReturnType>[]
  //     ? FlowReturnType[]
  //     : FlowReturnType,
  //   ActionReturnType
  // >(
  //   subflows: SubflowsType,
  //   action: (input: FlowsReturnType) => ActionReturnType
  // ): Flow<ActionReturnType>

  compose<FlowReturnType, ActionReturnType>(
    subflows: Flow<FlowReturnType>,
    action: (input: FlowReturnType) => ActionReturnType
  ): Flow<ActionReturnType>

  compose<FlowReturnType, ActionReturnType>(
    subflows: Flow<FlowReturnType>[],
    action: (input: FlowReturnType[]) => ActionReturnType
  ): Flow<ActionReturnType>

  compose<FlowReturnType, ActionReturnType>(
    subflows: { [key: string]: Flow<FlowReturnType> },
    action: (input: { [key: string]: FlowReturnType }) => ActionReturnType
  ): Flow<ActionReturnType>

  compose<FlowReturnType>(subflows: Flow<FlowReturnType>): Flow<FlowReturnType>

  compose<FlowReturnType>(
    subflows: Flow<FlowReturnType>[]
  ): Flow<FlowReturnType>

  compose<FlowReturnType>(subflows: {
    [key: string]: Flow<FlowReturnType>
  }): Flow<FlowReturnType>

  // compose<
  //   FlowReturnType,
  //   SubflowsType extends
  //     | Flow<FlowReturnType>
  //     | Flow<FlowReturnType>[]
  //     | { [key: string]: Flow<FlowReturnType> },
  //   FlowsReturnType extends SubflowsType extends {
  //     [key: string]: Flow<FlowReturnType>
  //   }
  //     ? { [key: string]: FlowReturnType }
  //     : SubflowsType extends Flow<FlowReturnType>[]
  //     ? FlowReturnType[]
  //     : FlowReturnType,
  //   ActionReturnType = FlowsReturnType
  // >(
  //   subflows: SubflowsType,
  //   action: (input: FlowsReturnType) => ActionReturnType = (x) =>
  //     x as unknown as ActionReturnType
  // ): Flow<ActionReturnType>

  compose<
    FlowReturnType,
    SubflowsType extends
      | Flow<FlowReturnType>
      | Flow<FlowReturnType>[]
      | { [key: string]: Flow<FlowReturnType> },
    FlowsReturnType,
    ActionReturnType = FlowsReturnType
  >(
    subflows: SubflowsType,
    action: (input: FlowsReturnType) => ActionReturnType = (x) =>
      x as unknown as ActionReturnType
  ): Flow<ActionReturnType> {
    if (subflows instanceof Flow) {
      return this.flowFactory.createCascade({
        subflow: subflows,
        action: action as unknown as (input: FlowReturnType) => ActionReturnType
      })
    } else if (Array.isArray(subflows)) {
      return this.flowFactory.createCascade({
        subflow: this.flowFactory.createParallel(subflows),
        action: action as (input: FlowsReturnType) => ActionReturnType
      })
    } else {
      return this.flowFactory.createCascade({
        subflow: this.flowFactory.createParallelDict(
          subflows as { [key: string]: Flow<FlowReturnType> }
        ),
        action: action as unknown as (input: {
          [key: string]: FlowReturnType
        }) => ActionReturnType
      })
    }
  }

  private buildTerm(input: TermParam): RDF.Term {
    if (typeof input === 'string') {
      const op = <Algebra.Bgp>(
        this.flowFactory.translateOperation('?s ?p ' + input)
      )
      return op.patterns[0].object
    } else {
      return input
    }
  }

  private buildLiteralOrNamedNode(
    input: literalOrNamedNodeParam
  ): RDF.Literal | RDF.NamedNode {
    if (typeof input === 'string') {
      const op = <Algebra.Values>(
        this.flowFactory.translateOperation('VALUES ?_ {' + input + '}')
      )
      return op.bindings[0]['?_']
    } else {
      return input
    }
  }

  private buildBindings(
    input: { [key: string]: literalOrNamedNodeParam } | literalOrNamedNodeParam
  ): { [key: string]: RDF.Literal | RDF.NamedNode } {
    if (typeof input === 'string' || 'termType' in input) {
      return {
        '?_': this.buildLiteralOrNamedNode(input as literalOrNamedNodeParam)
      }
    } else {
      return Object.fromEntries(
        (<any>input)
          .entries()
          .map((entry: [string, literalOrNamedNodeParam]) => [
            entry[0],
            this.buildLiteralOrNamedNode(entry[1])
          ])
      )
    }
  }

  private buildBindingsSeq(
    input:
      | { [key: string]: literalOrNamedNodeParam }[]
      | { [key: string]: literalOrNamedNodeParam }
      | literalOrNamedNodeParam[]
      | literalOrNamedNodeParam
  ): { [key: string]: RDF.Literal | RDF.NamedNode }[] {
    if (Array.isArray(input)) {
      return input.map((i) => this.buildBindings(i))
    } else {
      return [this.buildBindings(input)]
    }
  }

  /**
   * Creates a Values flow.
   * @param config - The subflow and the bindings to add.
   * @returns New Values instance.
   */
  createValues<ReturnType>(config: {
    subflow: Flow<ReturnType>
    bindings:
      | { [key: string]: literalOrNamedNodeParam }[]
      | { [key: string]: literalOrNamedNodeParam }
      | literalOrNamedNodeParam[]
      | literalOrNamedNodeParam
  }): Flow<ReturnType> {
    const bindings = this.buildBindingsSeq(config.bindings)
    const varnames = [...new Set(bindings.flatMap((b) => Object.keys(b)))]
    const valuesOp = this.algebraFactory.createValues(
      varnames.map((varname) => this.dataFactory.variable(varname.substr(1))),
      bindings
    )
    return this.flowFactory.createJoin({
      subflow: config.subflow,
      input: valuesOp
    })
  }

  buildOpForTraversal(traversal: TraversalParam): Algebra.Path | Algebra.Bgp {
    const from = traversal.from || '?_'
    const to = traversal.as || '?_out'
    if (typeof traversal.path === 'string') {
      const op = this.flowFactory.translateOperation(
        from + ' ' + traversal.path + ' ' + to
      )
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

  buildOpsForTraversals(traversals: TraversalParam[]): Algebra.Operation[] {
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
    return opsToBeJoined
    // return this.algebraFactory.createJoin(opsToBeJoined)
  }

  createTraversals<ReturnType>(config: {
    subflow: Flow<ReturnType>
    traversals: TraversalParam[]
  }): Flow<ReturnType> {
    return this.flowFactory.createJoin({
      input: this.buildOpsForTraversals(config.traversals),
      newDefault: config.traversals.every((t) => t.as) ? undefined : '?_out',
      hideCurrVar: true,
      subflow: config.subflow
    })
  }

  createTraversal<ReturnType>(
    config: {
      subflow: Flow<ReturnType>
    } & TraversalParam
  ): Flow<ReturnType> {
    return this.flowFactory.createJoin({
      input: this.buildOpForTraversal(config),
      newDefault: config.as ? undefined : '?_out',
      hideCurrVar: true,
      subflow: config.subflow
    })
  }

  createTermReader(config: TermReaderParam = {}): Flow<RDF.Term> {
    const action = this.flowFactory.createActionExecutor(
      Actions.onFirstDefault((x) => x)
    )
    const actionIfLang = config.lang
      ? this.flowFactory.createFilter({
          expression: 'langMatches( lang(?_), "' + config.lang + '" )',
          subflow: action
        })
      : action
    const actionIfTypeAndLang = config.datatype
      ? this.flowFactory.createFilter({
          expression: this.algebraFactory.createOperatorExpression('=', [
            this.algebraFactory.createOperatorExpression('datatype', [
              this.algebraFactory.createTermExpression(this.defaultInput)
            ]),
            this.algebraFactory.createTermExpression(
              this.buildLiteralOrNamedNode(config.datatype)
            )
          ]),
          subflow: actionIfLang
        })
      : actionIfLang
    const actionIfFilter = config.filter
      ? this.flowFactory.createFilter({
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
      ? this.flowFactory.createRename({
          subflow: actionAfterPathAndFilter,
          renamings: [{ currVarname: config.var }]
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
    return this.flowFactory.createCascade({
      subflow: this.createTermReader(config),
      action: (term) => RDFToValueOrObject(term, plainIDs)
    })
  }

  createStringReader(config: TermReaderParam = {}): Flow<string> {
    // TODO: manage arrays of values too
    return this.flowFactory.createCascade({
      subflow: this.createTermReader(config),
      action: (term) => RDFToValueOrObject(term, true, false)
    })
  }

  logFlowCount: number = 0
  log<ReturnType>(next: Flow<ReturnType>, label?: string): Flow<ReturnType> {
    const logFlowId = ++this.logFlowCount
    let callCount = 0
    const loggingFlow = this.flowFactory.createActionExecutor(
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
    const seq = this.flowFactory.createParallelTwo([
      loggingFlow as Flow<number>,
      next
    ])
    return this.flowFactory.createCascade({
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
