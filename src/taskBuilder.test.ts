import {TaskBuilder, TaskEngine, stringifyTask} from './index';
// import {newEngine} from '@comunica/actor-init-sparql';

const tb =  new TaskBuilder({
    prefixes: {
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'wd': 'http://www.wikidata.org/entity/',
        'wdt': 'http://www.wikidata.org/prop/direct/'
    }
});

let getLabel = tb.value('rdfs:label');

let adorno = tb.input('wd:Q152388');
let hegel = tb.input('wd:Q9235');

let labelOfAdorno = adorno.next(getLabel);

let getPersonInfo = tb.next({
    name: tb.value('wdt:P735'),
    surname: tb.value('wdt:P734'),
    dateOfBirth: tb.value('wdt:P569')
});

// let getPersonInfo = tb.next([
//     tb.value('wdt:P735'),
//     tb.value('wdt:P734'),
//     tb.value('wdt:P569')
// ]);

let infoOnAdorno = adorno.next(getPersonInfo);

let getStudentsInfo = tb.forEach('wdt:P1066').next(getPersonInfo);

let adornoStudentsInfo = adorno.next(getPersonInfo);

// const engine = newEngine();

// let proxyEngine: IQueryEngine = {
//     query: async (queryOp: Algebra.Operation, queryContext: any) => {
//         // console.log('');
//         // console.log('Executing...');
//         // console.log(toSparqlFragment(queryOp));
//         const res = <IActorQueryOperationOutputBindings>await engine.query(queryOp, queryContext);
//         // console.log('Result variables :' + res.variables);
//         return res;
//     },
//     getResultMediaTypes: function (context?: ActionContext): Promise<Record<string, number>> {
//         throw new Error('Function not implemented.');
//     },
//     getResultMediaTypeFormats: function (context?: ActionContext): Promise<Record<string, string>> {
//         throw new Error('Function not implemented.');
//     },
//     resultToString: function (queryResult: IActorQueryOperationOutput, mediaType?: string, context?: any) {
//         throw new Error('Function not implemented.');
//     },
//     invalidateHttpCache: function (url?: string): Promise<any> {
//         throw new Error('Function not implemented.');
//     }
// };

console.log(JSON.stringify(stringifyTask(infoOnAdorno), null, 4));

let te = new TaskEngine({
    queryContext: {
        sources: [{ type: 'sparql', value: 'https://query.wikidata.org/sparql' }]
    }
});

te.run(infoOnAdorno).then(console.log, console.error);
