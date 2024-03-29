import { FlowFactory, FlowEngine, Actions } from '../src/index'

import { newEngine } from '@comunica/actor-init-sparql-file'
const path = require('path')

const ff = new FlowFactory({
  prefixes: {
    ex: 'http://example.org/',
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#'
  }
})

// let engine = newEngine();
// let proxyEngine: IQueryEngine = {
//     query: async (query: string | Algebra.Operation, queryContext: any) => {
//         console.log('');
//         console.log('Executing...');
//         console.log(typeof query === 'string' ? query : toSparqlFragment(query));
//         const res = <IActorQueryOperationOutputBindings>await engine.query(query, queryContext);
//         console.log('Result variables :' + res.variables);
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

const fe = new FlowEngine({
  engine: newEngine(),
  queryContext: {
    sources: [path.join(__dirname, '../tests/test-data.ttl')]
  }
})

const showBindings = ff.createActionExecutor(Actions.onAll((b) => b))
const showOneBinding = ff.createActionExecutor(Actions.onFirst((b) => b))
const showOne = ff.createActionExecutor(Actions.onFirstDefault((b) => b))

const flows = {
  constant: ff.createActionExecutor(Actions.constant(42)),
  'action constant': ff.createActionExecutor(() => {
    return 42
  }),
  'action show bindings': showBindings,
  'action show one set of bindings': showOneBinding,
  'action show default bindings': showOne,
  'filter true': ff.createFilter({
    expression: 'true',
    subflow: showBindings
  }),
  'empty join': ff.createJoin({
    input: [],
    subflow: showBindings
  }),
  'single default binding show bindings': ff.createJoin({
    input: 'VALUES ?_ {ex:Res1}',
    subflow: showBindings
  }),
  'multiple default bindings': ff.createJoin({
    input: 'VALUES ?_ {ex:Res1 ex:Res2 ex:Res3}',
    subflow: showBindings
  }),
  join: ff.createJoin({
    input: '?s ?p ?o',
    subflow: showBindings
  }),
  'empty parallel': ff.createParallel([]),
  parallel: ff.createJoin({
    input: 'VALUES ?_ {ex:Res1 ex:Res2 ex:Res3}',
    subflow: ff.createParallel([
      showBindings,
      ff.createJoin({
        input: '?_ ex:prop1 ?new',
        subflow: showBindings
      }),
      ff.createJoin({
        input: '?_ ex:prop2 ?new',
        subflow: showBindings
      }),
      ff.createJoin({
        input: '?_ ex:prop3 ?new',
        subflow: showBindings
      })
    ])
  }),
  'foreach value reader': ff.createJoin({
    input: 'VALUES ?_ { ex:Res1 ex:Res2 ex:Res3 "pippo" 42 3.14}',
    subflow: ff.createForEach(showBindings)
  }),
  'all triples foreach x 3': ff.createJoin({
    input: '?s ?p ?o',
    subflow: ff.createForEach({
      select: ['?s'],
      subflow: ff.createForEach({
        select: ['?p'],
        subflow: ff.createForEach({
          select: ['?o'],
          subflow: showBindings
        })
      })
    })
  }),
  'all triples foreach x 2': ff.createJoin({
    input: '?s ?p ?o',
    subflow: ff.createForEach({
      select: ['?s'],
      subflow: ff.createForEach({
        select: ['?p', '?o'],
        subflow: showBindings
      })
    })
  }),
  'all triples foreach x 1': ff.createJoin({
    input: '?s ?p ?o',
    subflow: ff.createForEach({
      select: ['?s', '?p', '?o'],
      subflow: showBindings
    })
  }),
  'all triples foreach x 1 implicit': ff.createJoin({
    input: '?s ?p ?o',
    subflow: ff.createForEach({
      select: { allVars: true },
      subflow: showBindings
    })
  }),
  'all triples renamed': ff.createJoin({
    input: '?s ?p ?o',
    subflow: ff.createRename({
      renamings: [
        { currVarname: '?s', newVarname: '?s2' },
        { currVarname: '?p', hideCurrVar: true }
      ],
      subflow: showBindings
    })
  }),
  'all triples foreach x 1 renamed': ff.createJoin({
    input: '?s ?p ?o',
    subflow: ff.createForEach({
      select: ['?s', '?p', '?o'],
      subflow: ff.createRename({
        renamings: [
          { currVarname: '?s', newVarname: '?s2' },
          { currVarname: '?p', hideCurrVar: true }
        ],
        subflow: showBindings
      })
    })
  }),
  'all triples hide': ff.createJoin({
    input: '?s ?p ?o',
    subflow: ff.createHide({
      variables: ['?p', '?o'],
      subflow: showBindings
    })
  })
}

// jest.setTimeout(60000);

// Object.entries(flows).forEach(([label, flow]) => {
//   test('describe ' + label, () => expect(flow).toMatchSnapshot())
//   test('run ' + label, () => expect(fe.run(flow)).resolves.toMatchSnapshot())
// })

for (const [label, flow] of Object.entries(flows)) {
  test('describe ' + label, () => expect(flow).toMatchSnapshot())
  test('run ' + label, () => expect(fe.run(flow)).resolves.toMatchSnapshot())
}

// Object.entries(flows).forEach(([label, flow]) => {
//     test('run ' + label, async () => {
//         console.log(flow);
//         let result = await te.run(flow);
//         console.log(result);
//         expect(result).toMatchSnapshot();
//     });
// });

// Object.entries(flows).forEach(([label, flow]) => {
//     test('run ' + label, done => {
//         console.log(flow);
//         te.run(flow).then(result => {
//             expect(result).toMatchSnapshot();
//             done();
//         });
//     });
// });
