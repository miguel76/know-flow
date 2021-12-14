import { TemplateFactory, FlowEngine, Actions } from '../src/index'

import { newEngine } from '@comunica/actor-init-sparql-file'
const path = require('path')

const tf = new TemplateFactory({
  prefixes: {
    ex: 'http://example.org/',
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#'
  }
})

const ff = tf.flowFactory

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
  'action show bindings': showBindings,
  'action show one set of bindings': showOneBinding,
  'action show default bindings': showOne,
  'undefined term reader': tf.createTermReader(),
  'undefined value reader': tf.createValueReader(),
  'single default binding show value': tf.createValues({
    bindings: 'ex:Res1',
    subflow: tf.createValueReader()
  }),
  'single default binding show term': tf.createValues({
    bindings: 'ex:Res1',
    subflow: tf.createTermReader()
  }),
  'single default binding show all': tf.createValues({
    bindings: 'ex:Res1',
    subflow: showBindings
  }),
  traversal: tf.createValues({
    bindings: 'ex:Res1',
    subflow: tf.createValueReader({ path: 'ex:prop1' })
  }),
  'traversal path': tf.createValues({
    bindings: 'ex:Res1',
    subflow: tf.createValueReader({ path: 'ex:prop1/ex:prop2' })
  }),
  'multiple default bindings': tf.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3'],
    subflow: showBindings
  }),
  'empty parallel': ff.createParallel([]),
  parallel: tf.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3'],
    subflow: ff.createParallel([
      tf.createValueReader(),
      tf.createValueReader({ path: 'ex:prop1' }),
      tf.createValueReader({ path: 'ex:prop2' }),
      tf.createValueReader({ path: 'ex:prop3' })
    ])
  }),
  'foreach value reader': tf.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3', '"pippo"', '42', '3.14'],
    subflow: tf.createForEach(tf.createValueReader())
  }),
  'foreach traversal value reader': tf.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3', '"pippo"', '42', '3.14'],
    subflow: tf.createForEach({
      select: { path: 'ex:prop1' },
      subflow: tf.createValueReader()
    })
  }),
  'foreach foreach string reader': tf.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3'],
    subflow: tf.createForEach(
      tf.createForEach({
        select: { path: 'ex:prop1' },
        subflow: tf.createStringReader()
      })
    )
  }),
  'foreach foreach value reader': tf.createValues({
    bindings: ['ex:Res1', 'ex:Res2', 'ex:Res3'],
    subflow: tf.createForEach(
      tf.createForEach({
        select: { path: 'ex:prop1' },
        subflow: tf.createValueReader()
      })
    )
  }),
  'all triples foreach x 3': ff.createJoin({
    input: '?s ?p ?o',
    subflow: tf.createForEach({
      select: ['?s'],
      subflow: tf.createForEach({
        select: ['?p'],
        subflow: tf.createForEach({
          select: ['?o'],
          subflow: ff.createParallelDict({
            s: tf.createValueReader({ var: '?s' }),
            p: tf.createValueReader({ var: '?p' }),
            o: tf.createValueReader({ var: '?o' })
          })
        })
      })
    })
  }),
  'all triples foreach x 2': ff.createJoin({
    input: '?s ?p ?o',
    subflow: tf.createForEach({
      select: ['?s'],
      subflow: tf.createForEach({
        select: ['?p', '?o'],
        subflow: ff.createParallelDict({
          s: tf.createValueReader({ var: '?s' }),
          p: tf.createValueReader({ var: '?p' }),
          o: tf.createValueReader({ var: '?o' })
        })
      })
    })
  }),
  'all triples foreach x 1': ff.createJoin({
    input: '?s ?p ?o',
    subflow: tf.createForEach({
      select: ['?s', '?p', '?o'],
      subflow: ff.createParallelDict({
        s: tf.createValueReader({ var: '?s' }),
        p: tf.createValueReader({ var: '?p' }),
        o: tf.createValueReader({ var: '?o' })
      })
    })
  }),
  'all triples foreach x 1 implicit': ff.createJoin({
    input: '?s ?p ?o',
    subflow: tf.createForEach({
      select: { allVars: true },
      subflow: ff.createParallelDict({
        s: tf.createValueReader({ var: '?s' }),
        p: tf.createValueReader({ var: '?p' }),
        o: tf.createValueReader({ var: '?o' })
      })
    })
  })
}

// jest.setTimeout(60000);

Object.entries(flows).forEach(([label, flow]) => {
  test('describe ' + label, () => expect(flow).toMatchSnapshot())
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
