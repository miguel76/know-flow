import { newEngine } from '@comunica/actor-init-sparql'
import {
  Types,
  stringifyFlow,
  FlowFactory,
  FlowEngine,
  tableFromArray
} from '..'
import { Factory } from 'sparqlalgebrajs'

const engine = newEngine()
const algebraFactory = new Factory()
const dataFactory = algebraFactory.dataFactory

const options = {
  prefixes: {
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    dbo: 'http://dbpedia.org/ontology/',
    dbr: 'http://dbpedia.org/resource/'
  }
}

const queryContext = {
  sources: [{ type: 'sparql', value: 'https://dbpedia.org/sparql' }]
}

const flowFactory = new FlowFactory(options)

const table3 = tableFromArray([{}, {}, {}])

const action1 = flowFactory.createConstant('Action 1')
const action2 = flowFactory.createConstant('Action 2')
const action3 = flowFactory.createConstant('Action 3')
const action4 = flowFactory.createConstant('Action 4')
const action5 = flowFactory.createConstant('Action 5')

const flowSeq = flowFactory.createParallel([action1, action2, action3])
const forEach = flowFactory.createForEach(action1)

const traverse = flowFactory.createTraverse({
  path: 'rdf:type',
  subflow: action4
})

const join = flowFactory.createJoin({
  right: '$_ rdf:type rdf:List; rdfs:label "ciccio"',
  subflow: action5
})

const showList = {}

function showAttr(
  attrPath: string,
  attrLabel: string,
  language?: string
): Types.Flow<string> {
  const show = flowFactory.createActionOnFirst(
    (bindings) => attrLabel + ': ' + bindings.get('?_').value
  )
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
  subflow: flowFactory.createParallel([
    showAttr('rdf:label', 'Name'),
    showAttr('dbo:iso6392Code', 'ISO Code'),
    showAttr('dbo:languageFamily', 'Family')
  ]),
  action: (lines: string[]) => lines.join('\n')
})

const filter = flowFactory.createFilter({
  expression: '$_ = "pluto"',
  subflow: action5
})

console.log(action1)
console.log(stringifyFlow(action1))

console.log(stringifyFlow(flowSeq))
console.log(stringifyFlow(forEach))

console.log(stringifyFlow(traverse))

console.log(stringifyFlow(join))

console.log(filter)
console.log(stringifyFlow(filter))

const te = new FlowEngine({ engine, queryContext })

te.run(action1).then(console.log, console.error)
te.run(flowSeq).then(console.log, console.error)
te.run(forEach).then(console.log, console.error)

te.run({
  flow: showLanguage,
  input: tableFromArray([
    {
      '?_': dataFactory.namedNode('http://dbpedia.org/resource/Bari_dialect')
    }
  ])
}).then(console.log, console.error)

te.run({
  flow: showAttr('rdfs:label', 'Name', 'EN'),
  input: tableFromArray([
    {
      '?_': dataFactory.namedNode('http://dbpedia.org/resource/Bari_dialect')
    }
  ])
}).then(console.log, console.error)
