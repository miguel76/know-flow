import { Algebra } from 'sparqlalgebrajs-input'
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

export type ScalarDefaultInputType<DataItemType extends RDF.Term> = {
  scalars: { [varname in typeof DEFAULT_INPUT_VARNAME]: DataItemType },
  tuples: null
}

export type EmptyInputType = {
  scalars: {},
  tuples: null
}

// type GenericDataInputType = ScalarsInputType & Partial<TuplesInputType>
export type GenericDataInputType = {
  scalars: { [varname: string]: RDF.Term }
  tuples: { [varname: string]: RDF.Term }[] | null
}

// type DataInputSpecType<DataInputType extends GenericDataInputType> = {
//   scalars: (keyof DataInputType['scalars'])[]
// } & (DataInputType extends {tuples: unknown}
//   ? {tuples: (keyof ArrayElement<DataInputType['tuples']>)[]}
//   : {})

export type DataInputSpecType<DataInputType extends GenericDataInputType> = {
  scalars:
    keyof DataInputType['scalars'] extends never
      ? Record<string,never>
      : {
        [ScalarVarname in keyof DataInputType['scalars']]: true
      }
} & (
    DataInputType['tuples'] extends null
    ? {tuples: null}
    : {
      tuples: keyof DataInputType['tuples'] extends never
        ? Record<string,never>
        : {
          [TuplesVarname in keyof ArrayElement<DataInputType['tuples']>]: true
        }
    }
)

type DataInputSpecTypeArrays<DataInputType extends GenericDataInputType> = {
  scalars:
    keyof DataInputType['scalars'] extends never
      ? Record<string,never>
      : {
        [ScalarVarname in keyof DataInputType['scalars']]: true
      }
} & (
    DataInputType['tuples'] extends null
    ? {tuples: null}
    : {
      tuples: keyof DataInputType['tuples'] extends never
        ? Record<string,never>
        : {
          [TuplesVarname in keyof ArrayElement<DataInputType['tuples']>]: true
        }
    }
)


type JustScalarsInputType<DataInputType extends GenericDataInputType> = {
  scalars: Pick<DataInputType, 'scalars'>
  // Record<keyof DataInputType['scalars'], RDF.Term>
}

type TuplesTypeOf<DataInputType extends GenericDataInputType> =
  DataInputType['tuples']

export const SCALAR_DEFAULT_INPUT_SPEC: DataInputSpecType<
  ScalarDefaultInputType<RDF.Term>
> = {
  // scalars: [DEFAULT_INPUT_VARNAME]
  scalars: {[DEFAULT_INPUT_VARNAME]: true},
  tuples: null
}

export const EMPTY_INPUT_SPEC: DataInputSpecType<EmptyInputType> = {
  scalars: {},
  tuples: null
}

// function mergeInputSpecs<DataInputType extends GenericDataInputType>(
//   inputSpecs: DataInputSpecType<DataInputType>[]
// ): DataInputSpecType<DataInputType> {
//   return {
//     scalars: [...new Set(inputSpecs.flatMap((inputSpec) => inputSpec.scalars))]
//     // ...(inputSpecs.some((inputSpec) => 'tuples' in inputSpec)
//     //   ? {
//     //       tuples: [
//     //         ...new Set(
//     //           inputSpecs.flatMap((inputSpec) =>
//     //             'tuples' in inputSpec ? inputSpec.tuples : []
//     //           )
//     //         )
//     //       ]
//     //     }
//     //   : {})
//   }
// }

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
  : {}
)

type DataInputTypeExcept<
  DataInputType1 extends GenericDataInputType,
  DataInputType2 extends GenericDataInputType
> = {
  scalars: Omit<DataInputType1['scalars'], keyof DataInputType2['scalars']>
} & (DataInputType1 extends {tuples: unknown}
  ? DataInputType2 extends {tuples: unknown}
    ? { 
      tuples: Omit<DataInputType1['tuples'], keyof DataInputType2['tuples']>[]
    }
    : { tuples: DataInputType1['tuples'] }
  : {}
)
  
    // type DataInputTypeSpecMergeTwo<
  //   DataInputType1 extends GenericDataInputType,
  //   DataInputType2 extends GenericDataInputType
  // > = {
  //   scalars: (keyof DataInputType1['scalars'] | keyof DataInputType2['scalars'])[]
  // } & (DataInputType1 extends {tuples: unknown}
  //   ? DataInputType2 extends {tuples: unknown}
  //     ? { tuples: (keyof ArrayElement<DataInputType1['tuples']> |
  //     keyof ArrayElement<DataInputType2['tuples']>)[]}
  //     : { tuples: DataInputType1['tuples'] }
  //   : DataInputType2 extends {tuples: unknown}
  //   ? { tuples: DataInputType2['tuples'] }
  //   : {
        
  //     })
  
  

type InputScalar1 = {
  scalars: { a: RDF.Literal, b: RDF.NamedNode},
  tuples: null
}

type InputScalar2 = {
  scalars: { b: RDF.NamedNode, c: RDF.Literal}
  tuples: null
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

var inputScalar1: InputScalar1 = {scalars: {a: dataFactory.literal('la'), b: dataFactory.namedNode('http://b1.org/')}, tuples: null}
var inputScalar2: InputScalar2 = {scalars: {b: dataFactory.namedNode('http://b2.org/'), c: dataFactory.literal('lc')}, tuples: null}
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
  },
  tuples: null
}
var inputSpecScalar2: DataInputSpecType<InputScalar2> = {
  // scalars: ['b', 'c']
  scalars: {
    'c': true,
    'b': true
  },
  tuples: null
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
  },
  tuples: null
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
  scalars: {
    'a': true,
    'b': true,
    'c': true
  },
  tuples: {
    'va': true,
    'vb': true,
    'vc': true
  }
}

var specAllEx2: DataInputSpecType<GenericDataInputType> = {
  scalars: {
    'a': true,
    'b': true,
    'c': true
  },
  tuples: {
    'va': true,
    'vb': true,
    'vc': true
  }
}

// var specAll: SpecAll = mergeTwoInputSpecs(mergeTwoInputSpecs<InputScalar1, InputTuples1>(inputSpecScalar1, inputSpecTuples1), mergeTwoInputSpecs<InputScalar2, InputTuples2>(inputSpecScalar2, inputSpecTuples2))
var specAll: SpecAll = mergeTwoInputSpecs(spec1, spec2)

type SpecAllScalars = SpecAll['scalars']

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
    tuples: (inputSpecs1.tuples !== null)
              ? ((inputSpecs2.tuples !== null)
                ? {...inputSpecs1.tuples, ...inputSpecs2.tuples}
                : inputSpecs1.tuples)
              : ((inputSpecs2.tuples !== null)
                ? inputSpecs2.tuples
                : null)
  } as DataInputSpecType<DataInputTypeMergeTwo<DataInputType1, DataInputType2>>
}

type ForEachSpecOnTuplesType<TuplesType extends ArrayElement<GenericDataInputType['tuples']>> = {
  [TuplesVarname in keyof TuplesType]?: true
}

type ForEachSpecOn<DataInputType extends GenericDataInputType> = {
  [TuplesVarname in keyof ArrayElement<DataInputType['tuples']>]?: true
}

type Drivers<Si,So> = {
  [P in (keyof Si) & (keyof So)]: Si[P]
};

type DataInputTypeForEachOne<
  InnerDataInputType extends GenericDataInputType,
  VarnameType extends keyof ArrayElement<InnerDataInputType['scalars']>
> = {
  scalars: Omit<InnerDataInputType['scalars'], VarnameType>
  tuples: (ArrayElement<InnerDataInputType['tuples']> & Pick<ArrayElement<InnerDataInputType['scalars']>, VarnameType>)[]
}

type DataInputTypeForEach<
  DataInputType extends GenericDataInputType,
  ForEachSpec extends ForEachSpecOn<GenericDataInputType>
> = {
  scalars: Omit<DataInputType['scalars'], keyof ForEachSpec>,
  tuples: ((DataInputType extends {tuples: unknown} ? DataInputType['tuples'] : {}) & {
    [ForEachVarname in (keyof ForEachSpec) & (keyof ArrayElement<GenericDataInputType['scalars']>)]:
        ArrayElement<GenericDataInputType['scalars']>[ForEachVarname]
  })[]
}


type StringLiteral<T> = T extends string ? string extends T ? never : T : never;

