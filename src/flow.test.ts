import FlowFactory from './flowFactory';
import {stringifyFlow, tableFromArray} from './utils';
import FlowEngine from './flowEngine';
import {newEngine} from '@comunica/actor-init-sparql';
import { Types } from '.';
import { Factory } from 'sparqlalgebrajs';

const engine = newEngine();
let algebraFactory = new Factory();
let dataFactory = algebraFactory.dataFactory;


let options = {
    prefixes: {
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'dbo': 'http://dbpedia.org/ontology/',
        'dbr': 'http://dbpedia.org/resource/'
    }
};

let queryContext = {
    sources: [{ type: 'sparql', value: 'https://dbpedia.org/sparql' }]
};

let flowFactory = new FlowFactory(options);

let table3 = tableFromArray([
    {}, {}, {}
]);

let action1 = flowFactory.createConstant('Action 1');
let action2 = flowFactory.createConstant('Action 2');
let action3 = flowFactory.createConstant('Action 3');
let action4 = flowFactory.createConstant('Action 4');
let action5 = flowFactory.createConstant('Action 5');

let flowSeq = flowFactory.createParallel([action1, action2, action3]);
let forEach = flowFactory.createForEach(action1);

let traverse = flowFactory.createTraverse({predicate: 'rdf:type', subflow: action4});

let join = flowFactory.createJoin({
    right: '$_ rdf:type rdf:List; rdfs:label "ciccio"',
    subflow: action5
});

let showList = {};

function showAttr(attrPath: string, attrLabel: string, language?: string): Types.Flow<string> {
    let show = flowFactory.createActionOnFirst(bindings =>
            attrLabel + ': ' + bindings.get('?_').value);
    let filterAndShow = language ?
            flowFactory.createFilter({
                expression: 'langMatches( lang(?_), "' + language + '" )',
                subflow: show
            }) :
            show;
    return flowFactory.createTraverse({
        predicate: attrPath,
        subflow: filterAndShow
    });
}

let showLanguage =
        flowFactory.createCascade({
            subflow: flowFactory.createParallel([
                    showAttr('rdf:label', 'Name'),
                    showAttr('dbo:iso6392Code', 'ISO Code'),
                    showAttr('dbo:languageFamily', 'Family')
            ]),
            action: (lines: string[]) => lines.join('\n')});

let filter = flowFactory.createFilter({
    expression: '$_ = "pluto"',
    subflow: action5
});

console.log(action1);
console.log(stringifyFlow(action1));

console.log(stringifyFlow(flowSeq));
console.log(stringifyFlow(forEach));

console.log(stringifyFlow(traverse));

console.log(stringifyFlow(join));

console.log(filter);
console.log(stringifyFlow(filter));

let te = new FlowEngine({engine, queryContext})

te.run(action1).then(console.log, console.error);
te.run(flowSeq).then(console.log, console.error);
te.run(forEach).then(console.log, console.error);

te.run({
    flow: showLanguage,
    input: tableFromArray([{
        '?_': dataFactory.namedNode('http://dbpedia.org/resource/Bari_dialect')
    }])
}).then(console.log, console.error);

te.run({
    flow: showAttr('rdfs:label', 'Name', 'EN'),
    input: tableFromArray([{
        '?_': dataFactory.namedNode('http://dbpedia.org/resource/Bari_dialect')
    }])
}).then(console.log, console.error);

