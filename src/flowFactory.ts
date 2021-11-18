import { Algebra, translate, Factory } from 'sparqlalgebrajs'
import * as RDF from 'rdf-js'
import {
  Table,
  TableSync,
  Flow,
  Action,
  ForEach,
  Join,
  Filter,
  Cascade,
  Let,
  Parallel
} from './flow'
import { Bindings, BindingsStream } from '@comunica/types'
import { syncTable, promisifyFromSync } from './utils'
import { ArrayIterator } from 'asynciterator'
import { Map } from 'immutable'
import { RDFToValueOrObject } from './toNative'

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

function isPath(op: Algebra.Operation): op is Algebra.Path {
  return op.type == Algebra.types.PATH
}

function isBgp(op: Algebra.Operation): op is Algebra.Bgp {
  return op.type == Algebra.types.BGP
}

function isPromise<Type>(value: Type | Promise<Type>): value is Promise<Type> {
  return value && typeof (<any>value).then === 'function'
}

function asyncify<Domain, Range>(
  fn: (x: Domain) => Range | ((x: Domain) => Promise<Range>)
): (x: Domain) => Promise<Range> {
  let isAsync = false
  return (x: Domain) => {
    try {
      let value = fn(x)
      if (isPromise(value)) {
        return <Promise<Range>>value
      } else {
        return new Promise<Range>((resolve, reject) => {
          resolve(<Range>value)
        })
      }
    } catch (e) {
      return new Promise<Range>((resolve, reject) => {
        reject(e)
      })
    }
  }
}

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

export interface FlowFactoryOptions extends TranslateOptions {
  algebraFactory?: Factory
}

export type PathParam = Algebra.PropertyPathSymbol | RDF.Term | string

export default class FlowFactory {
  algebraFactory: Factory
  dataFactory: RDF.DataFactory
  defaultInput: RDF.Variable
  defaultOutput: RDF.Variable
  options: FlowFactoryOptions

  constructor(options: FlowFactoryOptions = {}) {
    this.algebraFactory =
      options.algebraFactory || new Factory(options.dataFactory)
    this.dataFactory = this.algebraFactory.dataFactory
    this.defaultInput = this.dataFactory.variable('_')
    this.defaultOutput = this.dataFactory.variable('_out')
    this.options = options
  }

  createCascadeAsync<SubflowReturnType, ActionReturnType>(config: {
    subflow: Flow<SubflowReturnType>
    action: (subflowResult: SubflowReturnType) => Promise<ActionReturnType>
  }): Cascade<SubflowReturnType, ActionReturnType> {
    return new Cascade<SubflowReturnType, ActionReturnType>(
      config.subflow,
      config.action
    )
  }

  createCascade<SubflowReturnType, ActionReturnType>(config: {
    subflow: Flow<SubflowReturnType>
    action: (subflowResult: SubflowReturnType) => ActionReturnType
  }): Cascade<SubflowReturnType, ActionReturnType> {
    return this.createCascadeAsync({
      subflow: config.subflow,
      action: promisifyFromSync(config.action)
    })
  }

  createActionAsync<ReturnType>(
    config:
      | {
          exec: (input: Table) => Promise<ReturnType>
        }
      | ((input: Table) => Promise<ReturnType>)
  ): Action<ReturnType> {
    let exec = <(input: Table) => Promise<ReturnType>>(
      ((<any>config).exec || config)
    )
    return new Action<ReturnType>(exec)
  }

  createAction<ReturnType>(
    config:
      | {
          exec: (input: Table) => ReturnType
        }
      | ((input: Table) => ReturnType)
  ): Action<ReturnType> {
    let exec = <(input: Table) => ReturnType>((<any>config).exec || config)
    return this.createActionAsync({
      exec: promisifyFromSync(exec)
    })
  }

  createConstant<ReturnType>(value: ReturnType): Action<ReturnType> {
    return this.createAction({
      exec: () => value
    })
  }

  createActionAsyncOnAll<ReturnType>(
    config:
      | {
          exec: (input: TableSync) => Promise<ReturnType>
        }
      | ((input: TableSync) => Promise<ReturnType>)
  ): Action<ReturnType> {
    let exec = <(input: TableSync) => Promise<ReturnType>>(
      ((<any>config).exec || config)
    )
    return this.createActionAsync((table) => {
      return new Promise<ReturnType>((resolve, reject) => {
        syncTable(table).then(
          (tableSync) => {
            exec(tableSync).then(
              (res) => {
                resolve(res)
              },
              (error) => {
                reject(error)
              }
            )
          },
          (error) => {
            reject(error)
          }
        )
      })
    })
  }

  createActionOnAll<ReturnType>(
    config:
      | {
          exec: (input: TableSync) => ReturnType
        }
      | ((input: TableSync) => ReturnType)
  ): Action<ReturnType> {
    let exec = <(input: TableSync) => ReturnType>((<any>config).exec || config)
    return this.createActionAsyncOnAll({
      exec: promisifyFromSync(exec)
    })
  }

  createActionAsyncOnFirst<ReturnType>(
    config:
      | {
          exec: (bindings: Bindings) => Promise<ReturnType>
          acceptEmpty?: boolean
        }
      | ((bindings: Bindings) => Promise<ReturnType>)
  ): Action<ReturnType> {
    let exec = <(bindings: Bindings) => Promise<ReturnType>>(
      ((<any>config).exec || config)
    )
    let acceptEmpty =
      (<any>config).acceptEmpty !== undefined ? (<any>config).acceptEmpty : true
    return this.createActionAsync((table) => {
      return new Promise<ReturnType>((resolve, reject) => {
        let cb = (bindings: Bindings) => {
          exec(bindings).then(
            (res) => {
              resolve(res)
            },
            (err) => {
              reject(err)
            }
          )
        }
        var firstTime = true
        table.bindingsStream.on('data', (binding) => {
          if (firstTime) {
            cb(binding)
            firstTime = false
          }
        })
        table.bindingsStream.on('end', () => {
          if (firstTime) {
            if (acceptEmpty) {
              cb(Map<string, RDF.Term>({}))
            } else {
              reject('Expected at least a value, zero found')
            }
          }
        })
        table.bindingsStream.on('error', (e) => {
          reject(e)
        })
      })
    })
  }

  createActionOnFirst<ReturnType>(
    config:
      | {
          exec: (bindings: Bindings) => ReturnType
        }
      | ((bindings: Bindings) => ReturnType)
  ): Action<ReturnType> {
    let exec = <(bindings: Bindings) => ReturnType>(
      ((<any>config).exec || config)
    )
    return this.createActionAsyncOnFirst({
      exec: promisifyFromSync(exec)
    })
  }

  createActionAsyncOnFirstDefault<ReturnType>(
    config:
      | {
          exec: (term: RDF.Term) => Promise<ReturnType>
        }
      | ((term: RDF.Term) => Promise<ReturnType>)
  ): Action<ReturnType> {
    let exec = <(term: RDF.Term) => Promise<ReturnType>>(
      ((<any>config).exec || config)
    )
    return this.createActionAsyncOnFirst({
      exec: (bindings: Bindings) => exec(bindings.get('?_'))
    })
  }

  createActionOnFirstDefault<ReturnType>(
    config:
      | {
          exec: (term: RDF.Term) => ReturnType
        }
      | ((term: RDF.Term) => ReturnType)
  ): Action<ReturnType> {
    let exec = <(term: RDF.Term) => ReturnType>((<any>config).exec || config)
    return this.createActionOnFirst({
      exec: (bindings: Bindings) => exec(bindings.get('?_'))
    })
  }

  createParallel<EachReturnType>(
    config:
      | {
          subflows: Flow<EachReturnType>[]
        }
      | Flow<EachReturnType>[]
  ): Parallel<EachReturnType> {
    let subflows = Array.isArray(config) ? config : config.subflows
    return new Parallel<EachReturnType>(subflows)
  }

  createParallelDict<EachReturnType>(
    config:
      | {
          subflows: { [key: string]: Flow<EachReturnType> }
        }
      | { [key: string]: Flow<EachReturnType> }
  ): Flow<{ [key: string]: EachReturnType }> {
    let values = Object.values(config)
    let subflowsMap =
      !values.length || values[0] instanceof Flow ? config : config.subflows
    let keys: string[] = []
    let subflows: Flow<EachReturnType>[] = []
    Object.entries(subflowsMap).forEach(([key, subflow]) => {
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
      return this.createConstant(obj)
    }
  }

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
      let v = config.var
      variablesOrDistinct =
        v === undefined ? !!config.distinct : Array.isArray(v) ? v : [v]
    }
    let forEach = new ForEach<EachReturnType>(subflow, variablesOrDistinct)
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
      let op = <Algebra.Values>this.translateOp('VALUES ?_ {' + input + '}')
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
    let bindings = this.buildBindingsSeq(config.bindings)
    let varnames = [...new Set(bindings.flatMap((b) => Object.keys(b)))]
    let valuesOp = this.algebraFactory.createValues(
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
    let path = config.path
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
      path?: Algebra.PropertyPathSymbol | RDF.Term | string
      graph?: RDF.Term
      filter?: Algebra.Expression | string
      lang?: string
      datatype?: string
    } = {}
  ): Flow<RDF.Term> {
    let action = this.createActionOnFirstDefault({
      exec: (x) => x
    })
    let actionIfLang = config.lang
      ? this.createFilter({
          expression: 'langMatches( lang(?_), "' + config.lang + '" )',
          subflow: action
        })
      : action
    let actionIfTypeAndLang = config.datatype
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
    let actionIfFilter = config.filter
      ? this.createFilter({
          expression: config.filter,
          subflow: actionIfTypeAndLang
        })
      : actionIfTypeAndLang
    return config && config.path
      ? this.createTraverse({
          path: config.path,
          graph: config.graph,
          subflow: actionIfFilter
        })
      : actionIfFilter
  }

  createValueReader(
    config: {
      path?: Algebra.PropertyPathSymbol | RDF.Term | string
      graph?: RDF.Term
      filter?: Algebra.Expression | string
      lang?: string
      datatype?: string
      plainIDs?: boolean
    } = {}
  ): Flow<any> {
    // TODO: manage arrays of values too
    let plainIDs = config.plainIDs !== undefined ? config.plainIDs : true
    return this.createCascade({
      subflow: this.createTermReader(config),
      action: (term) => RDFToValueOrObject(term, plainIDs)
    })
  }

  createStringReader(
    config: {
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
    let logFlowId = ++this.logFlowCount
    var callCount = 0
    let loggingFlow = this.createActionOnAll({
      exec: (table: TableSync) => {
        let callId = ++callCount
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
      }
    })
    let seq = this.createParallel<any>({
      subflows: [loggingFlow, next]
    })
    return this.createCascade({
      subflow: seq,
      action: (resSeq: any) => {
        let callId = resSeq[0]
        let actionRes = resSeq[1]
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
