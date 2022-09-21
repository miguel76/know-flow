import { Algebra } from 'sparqlalgebrajs'
import * as RDF from 'rdf-js'
import dataFactory from '@rdfjs/data-model'

import { DEFAULT_INPUT_VARNAME } from './constants'

type ArrayElement<A> = A extends readonly (infer T)[] ? T : never

type ScalarsInputType = {
  scalars: { [varname: string]: RDF.Term }
}

type TuplesInputType = {
  tuples: { [varname: string]: RDF.Term }[]
}

type ScalarDefaultInputType<DataItemType extends RDF.Term> = {
  scalars: { [varname in typeof DEFAULT_INPUT_VARNAME]: DataItemType }
}

type EmptyInputType = {
  scalars: {}
}

// type GenericDataInputType = ScalarsInputType & Partial<TuplesInputType>
type GenericDataInputType = {
  scalars: { [varname: string]: RDF.Term }
  tuples?: { [varname: string]: RDF.Term }[]
}

// type DataInputSpecType<DataInputType extends GenericDataInputType> = {
//   scalars: (keyof DataInputType['scalars'])[]
// } & (DataInputType extends {tuples: unknown}
//   ? {tuples: (keyof ArrayElement<DataInputType['tuples']>)[]}
//   : {})

type DataInputSpecType<DataInputType extends GenericDataInputType> = {
  scalars:
    keyof DataInputType['scalars'] extends never
      ? Record<string,never>
      : {
        [ScalarVarname in keyof DataInputType['scalars']]: true
      }
} & (
    DataInputType extends {tuples: unknown}
    ? {
      tuples: keyof DataInputType['tuples'] extends never
        ? Record<string,never>
        : {
          [TuplesVarname in keyof ArrayElement<DataInputType['tuples']>]: true
        }
    }
    : {})


type JustScalarsInputType<DataInputType extends GenericDataInputType> = {
  scalars: Pick<DataInputType, 'scalars'>
  // Record<keyof DataInputType['scalars'], RDF.Term>
}

type TuplesTypeOf<DataInputType extends GenericDataInputType> =
  DataInputType['tuples']

const SCALAR_DEFAULT_INPUT_SPEC: DataInputSpecType<
  ScalarDefaultInputType<RDF.Term>
> = {
  // scalars: [DEFAULT_INPUT_VARNAME]
  scalars: {[DEFAULT_INPUT_VARNAME]: true}
}

const EMPTY_INPUT_SPEC: DataInputSpecType<EmptyInputType> = {
  scalars: {}
}

/**
 * Base class for flows, which are networks of know-flow operations
 * A flow take implicitly as input a sequence of RDF bindings and a knowledge
 * graph, performs some data operations which may involve querying the knowledge
 * graph, performs some data-driven actions, and finally returning some output.
 * Flows can be composed of other flows (called subflows).
 */
// eslint-disable-next-line no-unused-vars
export abstract class Flow<
  DataInputType extends GenericDataInputType,
  ReturnType
> {
  inputSpec: DataInputSpecType<DataInputType>
}

export type Action<InputType, OutputType> =
  | ((input: InputType) => Promise<OutputType>)
  | ((input: InputType) => OutputType)

/**
 * Action executors are flows composed of a single (potentially async) function
 * taking as input the current parameter bindings.
 */
export class ActionExecutor<
  DataItemType extends RDF.Term,
  ReturnType
> extends Flow<ScalarDefaultInputType<DataItemType>, ReturnType> {
  /** Async/sync function to be excuted */
  action: Action<DataItemType, ReturnType>
  inputSpec = SCALAR_DEFAULT_INPUT_SPEC

  /**
   * Creates a new action executor
   * @param action - Async/sync function to be excuted
   */
  constructor(action: Action<DataItemType, ReturnType>) {
    super()
    this.action = action
  }
}

/**
 * Action executors are flows composed of a single (potentially async) function
 * taking as input the current parameter bindings.
 */
export class BlindActionExecutor<ReturnType> extends Flow<
  EmptyInputType,
  ReturnType
> {
  /** Async/sync function to be excuted */
  action: Action<void, ReturnType>
  inputSpec = EMPTY_INPUT_SPEC

  /**
   * Creates a new action executor
   * @param action - Async/sync function to be excuted
   */
  constructor(action: Action<void, ReturnType>) {
    super()
    this.action = action
  }
}

/** Cascades are flows composed of a subflow and a follow up action, the latter
 * taking as input the output of the former.
 */
export class Cascade<
  DataInputType extends GenericDataInputType,
  SubflowReturnType,
  ActionReturnType
> extends Flow<DataInputType, ActionReturnType> {
  /** Subflow to be executed before the action */
  subflow: Flow<DataInputType, SubflowReturnType>
  /** Function to be executed as action after the subflow */
  action: Action<SubflowReturnType, ActionReturnType>

  /**
   * Creates a new cascade
   * @param subflow - Subflow to be executed before the action
   * @param action - Function to be executed as action after the subflow
   */
  constructor(
    subflow: Flow<DataInputType, SubflowReturnType>,
    action: Action<SubflowReturnType, ActionReturnType>
  ) {
    super()
    this.subflow = subflow
    this.action = action
    this.inputSpec = subflow.inputSpec
  }
}

function mergeInputSpecs<DataInputType extends GenericDataInputType>(
  inputSpecs: DataInputSpecType<DataInputType>[]
): DataInputSpecType<DataInputType> {
  return {
    scalars: [...new Set(inputSpecs.flatMap((inputSpec) => inputSpec.scalars))]
    // ...(inputSpecs.some((inputSpec) => 'tuples' in inputSpec)
    //   ? {
    //       tuples: [
    //         ...new Set(
    //           inputSpecs.flatMap((inputSpec) =>
    //             'tuples' in inputSpec ? inputSpec.tuples : []
    //           )
    //         )
    //       ]
    //     }
    //   : {})
  }
}

type DataInputTypeMergeTwo<
  DataInputType1 extends GenericDataInputType,
  DataInputType2 extends GenericDataInputType
> = {
  scalars: DataInputType1['scalars'] & DataInputType2['scalars']
} & (DataInputType1 extends {tuples: unknown}
  ? DataInputType2 extends {tuples: unknown}
    ? { tuples: (ArrayElement<DataInputType1['tuples']> &
    ArrayElement<DataInputType2['tuples']>)[]}
    : { tuples: DataInputType1['tuples'] }
  : DataInputType2 extends {tuples: unknown}
  ? { tuples: DataInputType2['tuples'] }
  : {
      
    })

  type DataInputTypeSpecMergeTwo<
    DataInputType1 extends GenericDataInputType,
    DataInputType2 extends GenericDataInputType
  > = {
    scalars: (keyof DataInputType1['scalars'] | keyof DataInputType2['scalars'])[]
  } & (DataInputType1 extends {tuples: unknown}
    ? DataInputType2 extends {tuples: unknown}
      ? { tuples: (keyof ArrayElement<DataInputType1['tuples']> |
      keyof ArrayElement<DataInputType2['tuples']>)[]}
      : { tuples: DataInputType1['tuples'] }
    : DataInputType2 extends {tuples: unknown}
    ? { tuples: DataInputType2['tuples'] }
    : {
        
      })
  
  

type InputScalar1 = {
  scalars: { a: RDF.Literal, b: RDF.NamedNode}
}

type InputScalar2 = {
  scalars: { b: RDF.NamedNode, c: RDF.Literal}
}

type MergeScalar = DataInputTypeMergeTwo<InputScalar1, InputScalar2>

type InputTuples1 = {
  scalars: {},
  tuples: {va: RDF.Literal, vb: RDF.NamedNode}[]
}

type InputTuples2 = {
  scalars: {},
  tuples: {vb: RDF.NamedNode, vc: RDF.Literal}[]
}

type MergeTuples = DataInputTypeMergeTwo<InputTuples1, InputTuples2>
type Merge1 = DataInputTypeMergeTwo<InputScalar1,InputTuples1>
type Merge2 = DataInputTypeMergeTwo<InputScalar2,InputTuples2>

var inputScalar1: InputScalar1 = {scalars: {a: dataFactory.literal('la'), b: dataFactory.namedNode('http://b1.org/')}}
var inputScalar2: InputScalar2 = {scalars: {b: dataFactory.namedNode('http://b2.org/'), c: dataFactory.literal('lc')}}
var inputTuples1: InputTuples1 = {
  scalars: {},
  tuples: [
    {va: dataFactory.literal('v_la1'), vb: dataFactory.namedNode('http://v.b1.org/')},
    {va: dataFactory.literal('v_la2'), vb: dataFactory.namedNode('http://v.b2.org/')},
    {va: dataFactory.literal('v_la3'), vb: dataFactory.namedNode('http://v.b3.org/')},
  ]
}
var inputTuples2: InputTuples2 = {
  scalars: {},
  tuples: [
    {vb: dataFactory.namedNode('http://v.b1.org/'), vc: dataFactory.literal('v_lc1')},
    {vb: dataFactory.namedNode('http://v.b2.org/'), vc: dataFactory.literal('v_lc2')},
  ]
}
var inputSpecScalar1: DataInputSpecType<InputScalar1> = {
  // scalars: ['a', 'b']
  scalars: {
    'a': true,
    'b': true,
  }
}
var inputSpecScalar2: DataInputSpecType<InputScalar2> = {
  // scalars: ['b', 'c']
  scalars: {
    'c': true,
    'b': true
  }
}
var inputSpecTuples1: DataInputSpecType<InputTuples1> = {
  scalars: {  },
  tuples: {
    'va': true,
    'vb': true
  }
}
var inputSpecTuples2: DataInputSpecType<InputTuples2> = {
  scalars: {},
  tuples: {'vb': true, 'vc': true}
}

var mergeScalar: MergeScalar
 = {
  scalars: {
    a: dataFactory.literal('la'), b: dataFactory.namedNode('http://b1.org/'), c: dataFactory.literal('lc')
  }
}

var merge1: Merge1 = {
  scalars: {a: dataFactory.literal('la_m'), b: dataFactory.namedNode('http://m.b1.org/')},
  tuples: [
    {va: dataFactory.literal('v_la1_m'), vb: dataFactory.namedNode('http://m.v.b1.org/')},
    {va: dataFactory.literal('v_la2_m'), vb: dataFactory.namedNode('http://m.v.b2.org/')},
  ]
}

type MergeAll = DataInputTypeMergeTwo<Merge1,Merge2>

var mergeAll: MergeAll = {
  scalars: {
    a: dataFactory.literal('la'), b: dataFactory.namedNode('http://b1.org/'), c: dataFactory.literal('lc')
  },
  tuples: [
    {va: dataFactory.literal('v_la1_m'), vb: dataFactory.namedNode('http://m.v.b1.org/'), vc: dataFactory.literal('v_lc1')},
    {va: dataFactory.literal('v_la2_m'), vb: dataFactory.namedNode('http://m.v.b2.org/'), vc: dataFactory.literal('v_lc2')},
  ]
}

// var spec1: DataInputSpecType<Merge1> = mergeTwoInputSpecs(inputSpecScalar1, inputSpecTuples1)
var spec1 = mergeTwoInputSpecs(inputSpecTuples1, inputSpecScalar1)
var spec1Bis = mergeTwoInputSpecs(inputSpecScalar1, inputSpecTuples1)

var spec2 = mergeTwoInputSpecs(inputSpecScalar2, inputSpecTuples2)

type SpecAll = DataInputSpecType<MergeAll>
var specAllEx: SpecAll = {
  scalars: ['a'],
  tuples: ['vb']
}
// var specAll: SpecAll = mergeTwoInputSpecs(mergeTwoInputSpecs<InputScalar1, InputTuples1>(inputSpecScalar1, inputSpecTuples1), mergeTwoInputSpecs<InputScalar2, InputTuples2>(inputSpecScalar2, inputSpecTuples2))
var specAll: SpecAll = mergeTwoInputSpecs(spec1, spec2)

type SpecAllScalars = SpecAll['scalars']
var specAllScalars: SpecAllScalars = ['a']

// } & (keyof DataInputType['tuples'] extends never
// ? {}
// : { tuples: keyof DataInputType['tuples'] })

// function mergeTwoInputSpecs<
//   DataInputType1 extends GenericDataInputType,
//   DataInputType2 extends GenericDataInputType
// >(
//   inputSpecs1: DataInputSpecType<DataInputType1>,
//   inputSpecs2: DataInputSpecType<DataInputType2>
// ): DataInputTypeSpecMergeTwo<DataInputType1, DataInputType2>
// // DataInputSpecType<DataInputTypeMergeTwo<DataInputType1, DataInputType2>>
// {
//   return {
//     scalars: [...new Set([...inputSpecs1.scalars, ...inputSpecs2.scalars])],
//     ...('tuples' in inputSpecs1
//       ? 'tuples' in inputSpecs2
//         ? {
//             tuples: [
//               ...new Set([...inputSpecs1.tuples, ...inputSpecs2.tuples])
//             ]
//           }
//         : { tuples: inputSpecs1.tuples }
//       : 'tuples' in inputSpecs2
//       ? { tuples: inputSpecs2.tuples }
//       : {})
//   } as DataInputTypeSpecMergeTwo<DataInputType1, DataInputType2> //as DataInputSpecType<DataInputTypeMergeTwo<DataInputType1, DataInputType2>>
  
//   // const scalars: DataInputSpecType<DataInputTypeMergeTwo<DataInputType1, DataInputType2>>['scalars'] = [...new Set([...inputSpecs1.scalars, ...inputSpecs2.scalars])] as DataInputSpecType<DataInputTypeMergeTwo<DataInputType1, DataInputType2>>['scalars']
//   // return {
//   //   scalars: [...new Set([...inputSpecs1.scalars, ...inputSpecs2.scalars])],
//   //   ...('tuples' in inputSpecs1
//   //     ? 'tuples' in inputSpecs2
//   //       ? {
//   //           tuples: []
//   //         }
//   //       : { tuples: [] }
//   //     : 'tuples' in inputSpecs2
//   //     ? { tuples: [] }
//   //     : {})
//   // }
// }

function mergeTwoInputSpecs<
  DataInputType1 extends GenericDataInputType,
  DataInputType2 extends GenericDataInputType
>(
  inputSpecs1: DataInputSpecType<DataInputType1>,
  inputSpecs2: DataInputSpecType<DataInputType2>
): DataInputSpecType<DataInputTypeMergeTwo<DataInputType1, DataInputType2>>
{
  return {
    scalars: {...inputSpecs1.scalars, ...inputSpecs2.scalars},
    ...('tuples' in inputSpecs1
      ? 'tuples' in inputSpecs2
        ? {
            tuples: {...inputSpecs1.tuples, ...inputSpecs2.tuples}
          }
        : { tuples: inputSpecs1.tuples }
      : 'tuples' in inputSpecs2
      ? { tuples: inputSpecs2.tuples }
      : {})
  } //as DataInputTypeSpecMergeTwo<DataInputType1, DataInputType2> //as DataInputSpecType<DataInputTypeMergeTwo<DataInputType1, DataInputType2>>
  
  // const scalars: DataInputSpecType<DataInputTypeMergeTwo<DataInputType1, DataInputType2>>['scalars'] = [...new Set([...inputSpecs1.scalars, ...inputSpecs2.scalars])] as DataInputSpecType<DataInputTypeMergeTwo<DataInputType1, DataInputType2>>['scalars']
  // return {
  //   scalars: [...new Set([...inputSpecs1.scalars, ...inputSpecs2.scalars])],
  //   ...('tuples' in inputSpecs1
  //     ? 'tuples' in inputSpecs2
  //       ? {
  //           tuples: []
  //         }
  //       : { tuples: [] }
  //     : 'tuples' in inputSpecs2
  //     ? { tuples: [] }
  //     : {})
  // }
}

/**
 * Parallel flows are composed of an array of subflows executed in parallel.
 * The output is the array of the results of each subflow.
 */
export class Parallel<
  DataInputType extends GenericDataInputType,
  ReturnType
> extends Flow<DataInputType, ReturnType[]> {
  /** Array of subflows to be executed in parallel */
  subflows: Flow<DataInputType, ReturnType>[]

  /**
   * Creates a new Parallel
   * @param subflows - Array of subflows to be executed in parallel
   */
  constructor(subflows: Flow<DataInputType, ReturnType>[]) {
    super()
    this.subflows = subflows
    this.inputSpec = {
      scalars: [...new Set(subflows.flatMap((f) => f.inputSpec.scalars))],
      tuples: [...new Set(subflows.flatMap((f) => f.inputSpec.tuples))]
    }
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
export class ParallelTwo<
  DataInputType1 extends GenericDataInputType,
  ReturnType1,
  DataInputType2 extends GenericDataInputType,
  ReturnType2
> extends Flow<DataInputType1 | DataInputType2, [ReturnType1, ReturnType2]> {
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
   * @param subflow - Subflow to be executed each time
   * @param variablesOrDistinct - If an arrary, the set of variables used for
   * the iteration. If a boolean, all the variables in the input are
   * considered and the boolean decides if repeated bindings are taken in the
   * same iteration or not.
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
 * Base class of data operations based on a SPARQL algebra operation.
 */
export abstract class SPARQLAlgebraDataOperation<
  OpType extends Algebra.BaseOperation,
  ReturnType
> extends DataOperation<ReturnType> {
  /** Type of the algebra operation */
  dataOperationType: OpType['type']
  /** Subflow executed after the operation. */
  subflow: Flow<ReturnType>

  constructor(type: Algebra.Operation['type'], subflow: Flow<ReturnType>) {
    super(subflow)
    this.dataOperationType = type
  }
}

/**
 * Class of data operations which have a single input, i.e. the current sequence
 * of bindings.
 */
export class SingleInputDataOperation<
  OpType extends Algebra.Single,
  ReturnType
> extends SPARQLAlgebraDataOperation<OpType, ReturnType> {
  /** Parameters for the operation */
  params: Omit<OpType, 'type | input'>

  constructor(
    type: OpType['type'],
    subflow: Flow<ReturnType>,
    params: Omit<OpType, 'type | input'>
  ) {
    super(type, subflow)
    this.params = params
  }
}

/**
 * Class of data operations which have two inputs with different roles,
 * labelled 'left' and 'right', and the current sequence of bindings is used as
 * 'left' input.
 */
export class InputFromLeftDataOperation<
  OpType extends Algebra.Double,
  ReturnType
> extends SPARQLAlgebraDataOperation<OpType, ReturnType> {
  /** Parameters for the operation */
  params: Omit<OpType, 'type | input'>
  /** SPARQL subquery which is the 'right' input of the data operation. */
  rightInput: Algebra.Operation

  constructor(
    type: OpType['type'],
    subflow: Flow<ReturnType>,
    rightInput: Algebra.Operation,
    params: Omit<OpType, 'type | input'>
  ) {
    super(type, subflow)
    this.params = params
    this.rightInput = rightInput
  }
}

/**
 * Base class of data operations which have two inputs with different roles,
 * labelled 'left' and 'right', and the current sequence of bindings is used as
 * 'right' input.
 */
export class InputFromRightDataOperation<
  OpType extends Algebra.Double,
  ReturnType
> extends SPARQLAlgebraDataOperation<OpType, ReturnType> {
  /** Parameters for the operation */
  params: Omit<OpType, 'type | input'>
  /** SPARQL subquery which is the 'left' input of the data operation. */
  leftInput: Algebra.Operation

  constructor(
    type: OpType['type'],
    subflow: Flow<ReturnType>,
    leftInput: Algebra.Operation,
    params: Omit<OpType, 'type | input'>
  ) {
    super(type, subflow)
    this.leftInput = leftInput
    this.params = params
  }
}

/**
 * Class of data operations which have multiple inputs, i.e. at least one
 * more than the input sequence of bindings, with no specific meaning given to
 * the order of the inputs (associative and symmetric).
 */
export class MultiInputDataOperation<
  OpType extends Algebra.Multi,
  ReturnType
> extends SPARQLAlgebraDataOperation<OpType, ReturnType> {
  /** Parameters for the operation */
  params: Omit<OpType, 'type | input'>
  /** Set of SPARQL subqueries which are inputs of the data operation, along
   * with the current sequence of bindings. */
  input: Algebra.Operation[]

  constructor(
    type: OpType['type'],
    subflow: Flow<ReturnType>,
    input: Algebra.Operation[],
    params: Omit<OpType, 'type | input'>
  ) {
    super(type, subflow)
    this.input = input
    this.params = params
  }
}

// /**
//  * Let operations replace the value of a variable with the value taken from
//  * another variable.
//  * It optionally hides the variable originally holding the value
//  */
// export class Let<ReturnType> extends DataOperation<ReturnType> {
//   /** Name of the variable whose value is used. */
//   currVarname: string
//   /** Name of the variable to which the value is assigned. */
//   newVarname: string
//   /** If true, the original variable (`currVarname`) is hidden.  */
//   hideCurrVar: boolean

//   /**
//    * Creates a new Let
//    * @param subflow - Subflow executed after the operation.
//    * @param currVarname - Name of the variable whose value is used.
//    * @param newVarname - Name of the variable to which the value is assigned.
//    * @param hideCurrVar - If true, the original variable (`currVarname`) is
//    * hidden.
//    */
//   constructor(
//     subflow: Flow<ReturnType>,
//     currVarname: string,
//     newVarname: string,
//     hideCurrVar: boolean
//   ) {
//     super(subflow)
//     this.currVarname = currVarname
//     this.newVarname = newVarname
//     this.hideCurrVar = hideCurrVar
//   }
// }

/**
 * Object to configure the renaming of a variable
 */
export type SingleVarRenameConfig = {
  /** Current of the variable. */
  currVarname: string
  /** New name of the variable. */
  newVarname: string
  /** If true, the original variable (`currVarname`) is hidden.  */
  hideCurrVar: boolean
}

/**
 * Rename operations rename a set of variables
 */
export class Rename<ReturnType> extends DataOperation<ReturnType> {
  /** Name of the variable whose value is used. */
  renamings: SingleVarRenameConfig[]

  /**
   * Creates a new Let
   * @param subflow - Subflow executed after the operation.
   * @param renamings - Configuration of the renamings applied.
   */
  constructor(subflow: Flow<ReturnType>, renamings: SingleVarRenameConfig[]) {
    super(subflow)
    this.renamings = renamings
  }
}

/**
 * Hide operations omit a set of variables from the bindings
 */
export class Hide<ReturnType> extends DataOperation<ReturnType> {
  /** Names of the variables to omit. */
  variables: string[]

  /**
   * Creates a new Hide
   * @param subflow - Subflow executed after the operation.
   * @param variables - Names of the variables to omit.
   */
  constructor(subflow: Flow<ReturnType>, variables: string[]) {
    super(subflow)
    this.variables = variables
  }
}

// /**
//  * Filter operations perform a Filter over the current sequence of bindings.
//  * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algFilter}
//  */
// export class Filter<ReturnType> extends DataOperation<ReturnType> {
//   /** Expression used for filter the current sequence of bindings. */
//   expression: Algebra.Expression

//   /**
//    * Creates a new Filter
//    * @param subflow - Subflow executed after the operation.
//    * @param expression - Expression used for filter the current sequence of
//    * bindings.
//    */
//   constructor(subflow: Flow<ReturnType>, expression: Algebra.Expression) {
//     super(subflow)
//     this.expression = expression
//   }
// }

// /**
//  * Aggregate operations perform grouping and aggregation over the current
//  * sequence of bindings.
//  * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algGroup} and
//  * {@link https://www.w3.org/TR/sparql11-query/#defn_algAggregation}.
//  */
// export class Aggregate<ReturnType> extends DataOperation<ReturnType> {
//   /** Variables used for grouping. */
//   variables: RDF.Variable[]
//   /** Aggregate expressions, each bound to a new variable. */
//   aggregates: Algebra.BoundAggregate[]

//   /**
//    * Creates a new Aggregate
//    * @param subflow - Subflow executed after the operation.
//    * @param variables - Variables used for grouping.
//    * @param aggregates - Aggregate expressions, each bound to a new variable.
//    */
//   constructor(
//     subflow: Flow<ReturnType>,
//     variables: RDF.Variable[],
//     aggregates: Algebra.BoundAggregate[]
//   ) {
//     super(subflow)
//     this.variables = variables
//     this.aggregates = aggregates
//   }
// }

// /**
//  * Slice operations take a subsequence of the current sequence of bindings.
//  * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algSlice}.
//  */
// export class Slice<ReturnType> extends DataOperation<ReturnType> {
//   /** Index of the first element of the sequence which is taken, starting from
//    * 0. */
//   start: number
//   /** Length of the taken subsequence, or until the end if not defined. */
//   length?: number

//   /**
//    * Creates a new Slice
//    * @param subflow - Subflow executed after the operation.
//    * @param start - Index of the first element of the sequence which is taken,
//    * starting from 0.
//    * @param length - Length of the taken subsequence, or until the end if not
//    * defined.
//    */
//   constructor(subflow: Flow<ReturnType>, start: number, length?: number) {
//     super(subflow)
//     this.start = start
//     this.length = length
//   }
// }

// /**
//  * LeftJoinFromLeft operations perform a LeftJoin between the current sequence
//  * of bindings and the output of SPARQL subquery.
//  * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algLeftJoin}
//  */
// export class LeftJoinFromLeft<
//   ReturnType
// > extends InputFromLeftDataOperation<ReturnType> {}

// /**
//  * LeftJoinFromRight operations perform a LeftJoin between the output of SPARQL
//  * subquery and the current sequence of bindings.
//  * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algLeftJoin}
//  */
// export class LeftJoinFromRight<
//   ReturnType
// > extends InputFromRightDataOperation<ReturnType> {}

// /**
//  * MinusFromLeft operations perform a Minus between the current sequence of
//  * bindings and the output of SPARQL subquery.
//  * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algMinus}
//  */
// export class MinusFromLeft<
//   ReturnType
// > extends InputFromLeftDataOperation<ReturnType> {}

// /**
//  * MinusFromRight operations perform a Minus between the output of SPARQL subquery
//  * and the current sequence of bindings.
//  * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algMinus}
//  */
// export class MinusFromRight<
//   ReturnType
// > extends InputFromRightDataOperation<ReturnType> {}

// /**
//  * Join operations perform a Join between the current sequence of bindings and
//  * the outputs of a set of SPARQL subqueries.
//  * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algJoin}
//  */
// export class Join<ReturnType> extends MultiInputDataOperation<ReturnType> {}

// /**
//  * Union operations perform a Union between the current sequence of bindings and
//  * the outputs of a set of SPARQL subqueries.
//  * @see {@link https://www.w3.org/TR/sparql11-query/#defn_algUnion}
//  */
// export class Union<ReturnType> extends MultiInputDataOperation<ReturnType> {}
