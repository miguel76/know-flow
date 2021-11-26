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
  'undefined term reader': ff.createTermReader(),
  'undefined value reader': ff.createValueReader(),
  'single default binding show value': ff.createValues({
    bindings: 'ex:Res1',
    subflow: ff.createValueReader()
  }),
  'single default binding show term': ff.createValues({
    bindings: 'ex:Res1',
    subflow: ff.createTermReader()
  }),
  'single default binding show all': ff.createValues({
    bindings: 'ex:Res1',
    subflow: showBindings
  }),
  traversal: ff.createValues({
    bindings: 'ex:Res1',
    subflow: ff.createValueReader({ path: 'ex:prop1' })
  }),
  'traversal path': ff.createValues({
    bindings: 'ex:Res1',
    subflow: ff.createValueReader({ path: 'ex:prop1/ex:prop2' })
  }),
  'multiple default bindings': ff.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3'],
    subflow: showBindings
  }),
  join: ff.createJoin({
    right: '?s ?p ?o',
    subflow: showBindings
  }),
  'empty parallel': ff.createParallel([]),
  parallel: ff.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3'],
    subflow: ff.createParallel([
      ff.createValueReader(),
      ff.createValueReader({ path: 'ex:prop1' }),
      ff.createValueReader({ path: 'ex:prop2' }),
      ff.createValueReader({ path: 'ex:prop3' })
    ])
  }),
  'foreach value reader': ff.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3', '"pippo"', '42', '3.14'],
    subflow: ff.createForEach(ff.createValueReader())
  }),
  'foreach traversal value reader': ff.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3', '"pippo"', '42', '3.14'],
    subflow: ff.createForEach({
      select: { path: 'ex:prop1' },
      subflow: ff.createValueReader()
    })
  }),
  'foreach foreach string reader': ff.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3'],
    subflow: ff.createForEach(
      ff.createForEach({
        select: { path: 'ex:prop1' },
        subflow: ff.createStringReader()
      })
    )
  }),
  'foreach foreach value reader': ff.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3'],
    subflow: ff.createForEach(
      ff.createForEach({
        select: { path: 'ex:prop1' },
        subflow: ff.createValueReader()
      })
    )
  }),
  'all triples foreach x 3': ff.createJoin({
    right: '?s ?p ?o',
    subflow: ff.createForEach({
      select: ['?s'],
      subflow: ff.createForEach({
        select: ['?p'],
        subflow: ff.createForEach({
          select: ['?o'],
          subflow: ff.createParallelDict({
            s: ff.createValueReader({ var: '?s' }),
            p: ff.createValueReader({ var: '?p' }),
            o: ff.createValueReader({ var: '?o' })
          })
        })
      })
    })
  }),
  'all triples foreach x 2': ff.createJoin({
    right: '?s ?p ?o',
    subflow: ff.createForEach({
      select: ['?s'],
      subflow: ff.createForEach({
        select: ['?p', '?o'],
        subflow: ff.createParallelDict({
          s: ff.createValueReader({ var: '?s' }),
          p: ff.createValueReader({ var: '?p' }),
          o: ff.createValueReader({ var: '?o' })
        })
      })
    })
  }),
  'all triples foreach x 1': ff.createJoin({
    right: '?s ?p ?o',
    subflow: ff.createForEach({
      select: ['?s', '?p', '?o'],
      subflow: ff.createParallelDict({
        s: ff.createValueReader({ var: '?s' }),
        p: ff.createValueReader({ var: '?p' }),
        o: ff.createValueReader({ var: '?o' })
      })
    })
  }),
  'all triples foreach x 1 implicit': ff.createJoin({
    right: '?s ?p ?o',
    subflow: ff.createForEach({
      select: { allVars: true },
      subflow: ff.createParallelDict({
        s: ff.createValueReader({ var: '?s' }),
        p: ff.createValueReader({ var: '?p' }),
        o: ff.createValueReader({ var: '?o' })
      })
    })
  })
}

// jest.setTimeout(60000);

Object.entries(flows).forEach(([label, flow]) => {
  test('run ' + label, () => expect(fe.run(flow)).resolves.toMatchSnapshot())
})

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
