import * as S from "./source";
import { translate, toSparql  } from 'sparqlalgebrajs';

test("Testing 'Source' structures", () => {

    const defaultSparqlEndpointDS = new S.DefaultSparqlEndpoint();

    console.log(defaultSparqlEndpointDS);

    const allTermsTS = new S.AllTermsFromDatasetSource(defaultSparqlEndpointDS);

    console.log(allTermsTS);

    const selectQueryTxt = 'SELECT * WHERE { ?x ?y ?pippo. {SELECT * WHERE {?s ?p ?pippo} } }';
    const selectQuery = translate(selectQueryTxt);

    const varFromSelectQuery = new S.VarFromSelectQuery("newThis", selectQuery, defaultSparqlEndpointDS, new Map<string, S.RDFTermSource>([["this", allTermsTS]]));

    console.log(varFromSelectQuery);

    expect(varFromSelectQuery).toBe(expect.anything());


});
