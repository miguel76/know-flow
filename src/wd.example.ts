import FlowFactory from './flowFactory'
import { tableFromArray } from './table'
import FlowEngine from './flowEngine'
import { newEngine } from '@comunica/actor-init-sparql'
import { Types } from '.'
import { Factory, Algebra } from 'sparqlalgebrajs'
import {
  ActionContext,
  IActorQueryOperationOutput,
  IActorQueryOperationOutputBindings,
  IQueryEngine
} from '@comunica/types'

const engine = newEngine()
const algebraFactory = new Factory()
const dataFactory = algebraFactory.dataFactory

const proxyEngine: IQueryEngine = {
  query: async (queryOp: Algebra.Operation, queryContext: any) => {
    // console.log('');
    // console.log('Executing...');
    // console.log(toSparqlFragment(queryOp));
    const res = <IActorQueryOperationOutputBindings>(
      await engine.query(queryOp, queryContext)
    )
    // console.log('Result variables :' + res.variables);
    return res
  },
  getResultMediaTypes: function (
    context?: ActionContext
  ): Promise<Record<string, number>> {
    throw new Error('Function not implemented.')
  },
  getResultMediaTypeFormats: function (
    context?: ActionContext
  ): Promise<Record<string, string>> {
    throw new Error('Function not implemented.')
  },
  resultToString: function (
    queryResult: IActorQueryOperationOutput,
    mediaType?: string,
    context?: any
  ) {
    throw new Error('Function not implemented.')
  },
  invalidateHttpCache: function (url?: string): Promise<any> {
    throw new Error('Function not implemented.')
  }
}

const options = {
  prefixes: {
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    dbo: 'http://dbpedia.org/ontology/',
    dbr: 'http://dbpedia.org/resource/',
    wd: 'http://www.wikidata.org/entity/',
    wdt: 'http://www.wikidata.org/prop/direct/'
  }
}

const queryContext = {
  sources: [{ type: 'sparql', value: 'https://query.wikidata.org/sparql' }]
}

const flowFactory = new FlowFactory(options)

// select ?language ?languageLabel WHERE {
//     ?language wdt:P31 wd:Q1288568;
//               wdt:P17 wd:Q38.
//      SERVICE wikibase:label {
//        bd:serviceParam wikibase:language "en" .
//      }
//   } limit 200

const wdt = {
  instanceOf: 'wdt:P31',
  country: 'wdt:P17',
  ISO_639_3_code: 'wdt:P220'
}

const wd = {
  italy: 'wd:Q38',
  ModernLanguage: 'wd:Q1288568'
}

function showAttr(
  attrPath: string,
  attrLabel: string,
  language?: string
): Types.Flow<string> {
  const show = flowFactory.createActionOnFirst({
    exec: (bindings) => {
      const term = bindings.get('?_')
      return attrLabel + ': ' + (term ? term.value : '?')
    }
  })
  const filterAndShow = language
    ? flowFactory.createFilter({
        expression: 'langMatches( lang(?_), "' + language + '" )',
        subflow: show
      })
    : show
  return flowFactory.createTraverse({
    path: attrPath,
    subflow: filterAndShow
  })
}

const showLanguage = flowFactory.createCascade({
  subflow: flowFactory.log(
    flowFactory.createParallel({
      subflows: [
        flowFactory.log(showAttr('rdfs:label', 'Name', 'en'), 'Show Label'),
        flowFactory.log(showAttr(wdt.ISO_639_3_code, 'ISO Code'), 'Show Code')
      ]
    }),
    'Seq of attrs'
  ),
  action: (lines: string[]) => lines.join('\n')
})

const showLanguageList = flowFactory.createCascade<string[], string>({
  subflow: flowFactory.createForEach({ subflow: showLanguage }),
  action: (lines: string[]) => lines.join('\n')
})

const showLanguagesForCountrySimple = flowFactory.createTraverse({
  path: `^${wdt.country}`,
  subflow: flowFactory.createFilter({
    expression: `EXISTS {?_ ${wdt.instanceOf} ${wd.ModernLanguage}}`,
    subflow: showLanguageList
  })
})

const showLanguagesForCountry = flowFactory.createJoin({
  right: `?language ${wdt.instanceOf} ${wd.ModernLanguage}; ${wdt.country} ?_`,
  newDefault: '?language',
  hideCurrVar: true,
  subflow: showLanguageList
})

const fe = new FlowEngine({ engine: proxyEngine, queryContext })

fe.run({
  flow: showLanguagesForCountry,
  input: tableFromArray([
    {
      '?_': dataFactory.namedNode('http://www.wikidata.org/entity/Q38')
    }
  ])
}).then(console.log, console.error)
