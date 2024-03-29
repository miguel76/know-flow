import FlowFactory from './flowFactory'
import * as RDF from 'rdf-js'
import { Algebra, Factory } from 'sparqlalgebrajs'
import { Flow, Cascade, Action } from './flow'
import { Table } from './table'

export class FlowApplier<SubflowReturnType, ActionReturnType> extends Cascade<
  SubflowReturnType,
  ActionReturnType
> {
  flowFactory: FlowFactory

  constructor(
    flowFactory: FlowFactory,
    flow: Flow<SubflowReturnType>,
    action: Action<SubflowReturnType, ActionReturnType>
  ) {
    super(flow, action)
    this.flowFactory = flowFactory
  }

  apply<NewReturnType>(
    action: Action<ActionReturnType, NewReturnType>
  ): FlowApplier<ActionReturnType, NewReturnType> {
    return new FlowApplier<ActionReturnType, NewReturnType>(
      this.flowFactory,
      this.subflow,
      action
    )
  }
}

export default class FlowBuilder {
  flowFactory: FlowFactory
  generateFlow: (localFlow: Flow<any>) => Flow<any>

  constructor(
    options: {
      generateFlow?: (localFlow: Flow<any>) => Flow<any>
      flowFactory?: FlowFactory
      dataFactory?: RDF.DataFactory
      algebraFactory?: Factory
      quads?: boolean
      prefixes?: { [prefix: string]: string }
      baseIRI?: string
      blankToVariable?: boolean
      sparqlStar?: boolean
      onError?: (error: any) => void
    } = {}
  ) {
    if (options.flowFactory) {
      this.flowFactory = options.flowFactory
    } else {
      this.flowFactory = new FlowFactory(options)
    }
    this.generateFlow = options.generateFlow || ((t) => t)
  }

  derive<InnerReturnType, ReturnType>(
    localGenerateFlow: (localFlow: Flow<InnerReturnType>) => Flow<ReturnType>
  ): FlowBuilder {
    return new FlowBuilder({
      flowFactory: this.flowFactory,
      generateFlow: (flow: Flow<InnerReturnType>) =>
        this.generateFlow(localGenerateFlow(flow))
    })
  }

  static isFlowBuilder(t: Flow<any> | FlowBuilder): t is FlowBuilder {
    return 'generateFlow' in t
  }

  next<ReturnType>(obj: any): FlowApplier<unknown, unknown> {
    return new FlowApplier<ReturnType, ReturnType>(
      this.flowFactory,
      this.generateFlow(this.flowFactory.createParallelFromObject(obj)),
      async (x) => x
    )
  }

  action<ReturnType>(action: Action<Table, ReturnType>): Flow<ReturnType> {
    return this.next(this.flowFactory.createActionExecutor(action))
  }

  traverse(path: Algebra.PropertyPathSymbol | RDF.Term | string): FlowBuilder {
    return this.derive((subflow: Flow<any>) =>
      this.flowFactory.createTraversal({
        subflow,
        path
      })
    )
  }

  filter(expression: Algebra.Expression | string): FlowBuilder {
    return this.derive((subflow: Flow<any>) =>
      this.flowFactory.createFilter({
        subflow,
        expression
      })
    )
  }

  forEach(path?: Algebra.PropertyPathSymbol | RDF.Term | string): FlowBuilder {
    return this.derive((subflow: Flow<any>) =>
      this.flowFactory.createForEach({
        subflow,
        path
      })
    )
  }

  value(
    path?: Algebra.PropertyPathSymbol | RDF.Term | string
  ): FlowApplier<any, any> {
    return this.next(this.flowFactory.createValueReader({ path }))
  }

  str(
    path?: Algebra.PropertyPathSymbol | RDF.Term | string
  ): FlowApplier<any, string> {
    return <FlowApplier<any, string>>(
      this.next(this.flowFactory.createStringReader({ path }))
    )
  }

  input(
    bindings:
      | { [key: string]: RDF.Term | string }[]
      | { [key: string]: RDF.Term | string }
      | (RDF.Term | string)[]
      | RDF.Term
      | string
  ): FlowBuilder {
    return this.derive((flow: Flow<any>) =>
      this.flowFactory.createValues({
        bindings,
        subflow: flow
      })
    )
  }
}
