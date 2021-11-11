const {FlowFactory, FlowEngine, stringifyFlow} = require('../dist/index');

const {newEngine} = require('@comunica/actor-init-sparql-file');
const { toSparqlFragment } = require('../dist/utils');
const path = require('path');

const ff =  new FlowFactory({
    prefixes: {
        'ex': 'http://example.org/',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#'
    }
});

let engine = newEngine();
let proxyEngine = {
    query: async (query, queryContext) => {
        console.log('');
        console.log('Executing...');
        console.log(typeof query === 'string' ? query : toSparqlFragment(query));
        const res = await engine.query(query, queryContext);
        console.log('Result variables :' + res.variables);
        return res;
    },
    getResultMediaTypes: function (context) {
        throw new Error('Function not implemented.');
    },
    getResultMediaTypeFormats: function (context) {
        throw new Error('Function not implemented.');
    },
    resultToString: function (queryResult, mediaType, context) {
        throw new Error('Function not implemented.');
    },
    invalidateHttpCache: function (url) {
        throw new Error('Function not implemented.');
    }
};

let te = new FlowEngine({
    engine: proxyEngine,
    queryContext: {
        sources: [path.join(__dirname, '../tests/test-data.ttl')]
    }
});

const showBindings = ff.createActionOnAll((b) => b);

const flows = {
    'constant': ff.createConstant(42),
    'action constant': ff.createAction(() => {console.log('The answer'); return 42;}),
    'action show bindings': showBindings,
    // 'undefined value reader': ff.createValueReader(),
    // 'identity': ff.createIdentity(showBindings),
    'single default binding show value': ff.createValues({
        bindings: 'ex:Res1',
        subflow: ff.createValueReader()
    }),
    'single default binding show all': ff.createValues({
        bindings: 'ex:Res1',
        subflow: showBindings
    }),
    // 'multiple default bindings': ff.createValues({
    //     bindings: ['ex:Res1','ex:Res2','ex:Res3'],
    //     subflow: showBindings
    // }),
    // 'join': ff.createJoin({
    //     right: '?s ?p ?o',
    //     subflow: showBindings
    // }),
};


console.log('pippo!!!!!');
// jest.setTimeout(60000);

// Object.entries(flows).forEach(([label, flow]) => {
//     test('run ' + label, () => expect(te.run(flow)).resolves.toMatchSnapshot());
// });

Object.entries(flows).forEach(([label, flow]) => {
    test('run ' + label, async () => {
        console.log(flow);
        let result = await te.run(flow);
        console.log(result);
        expect(result).toMatchSnapshot();
    });
});

