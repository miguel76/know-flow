import { FlowBuilder, FlowEngine, stringifyFlow, toSparqlFragment } from '..'
import { newEngine as newComunicaEngine } from '@comunica/actor-init-sparql'
import {
  ActionContext,
  IActorQueryOperationOutput,
  IActorQueryOperationOutputBindings,
  IQueryEngine
} from '@comunica/types'
import { Algebra } from 'sparqlalgebrajs'

const tb = new FlowBuilder({
  prefixes: {
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    wd: 'http://www.wikidata.org/entity/',
    wdt: 'http://www.wikidata.org/prop/direct/'
  }
})

const getLabel = tb.value('rdfs:label')

const adorno = tb.input('wd:Q152388')
const hegel = tb.input('wd:Q9235')

const habermas = tb.input('wd:Q76357')

const labelOfAdorno = adorno.next(getLabel)

// const getPersonInfo = tb.next({
//     name: tb.value('wdt:P735'),
//     surname: tb.value('wdt:P734'),
//     dateOfBirth: tb.value('wdt:P569')
// });

const getPersonInfo = tb.next({
  resource: tb.str(),
  name: tb.str('wdt:P1559'),
  dateOfBirth: tb.value('wdt:P569'),
  dateOfDeath: tb.value('wdt:P570')
})

const infoOnAdorno = adorno.next(getPersonInfo)
const infoOnHegel = hegel.next(getPersonInfo)

const getStudentsInfo = tb.forEach('wdt:P802').next(getPersonInfo)
const getTeachersInfo = tb.forEach('^wdt:P802').next(getPersonInfo)

const adornoStudentsInfo = adorno.next(getStudentsInfo)
const hegelStudentsInfo = hegel.next(getStudentsInfo)

const habermasTeachersInfo = habermas.next(getTeachersInfo)
// const engine = newEngine();

const engine = newComunicaEngine()

const proxyEngine: IQueryEngine = {
  query: async (queryOp: Algebra.Operation, queryContext: any) => {
    console.log('')
    console.log('Executing...')
    console.log(toSparqlFragment(queryOp))
    const res = <IActorQueryOperationOutputBindings>(
      await engine.query(queryOp, queryContext)
    )
    console.log('Result variables :' + res.variables)
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

console.log(JSON.stringify(stringifyFlow(infoOnAdorno), null, 4))
console.log(JSON.stringify(stringifyFlow(adornoStudentsInfo), null, 4))

const te = new FlowEngine({
  // engine: newComunicaEngine(),
  engine: proxyEngine,
  queryContext: {
    sources: [{ type: 'sparql', value: 'https://query.wikidata.org/sparql' }]
  }
})

te.run(infoOnAdorno).then(console.log, console.error)
// {
//   name: 'Theodor Ludwig Wiesengrund Adorno',
//   dateOfBirth: '1903-09-11T00:00:00Z',
//   dateOfDeath: '1969-08-06T00:00:00Z'
// }

te.run(infoOnHegel).then(console.log, console.error)

te.run(adornoStudentsInfo).then(console.log, console.error)

te.run(habermasTeachersInfo).then(console.log, console.error)
