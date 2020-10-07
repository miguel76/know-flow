import * as Source from "./source";
import { translate, toSparql  } from 'sparqlalgebrajs';

export { Source };

// const defaultSparqlEndpointDS = new Source.DefaultSparqlEndpoint();
//
// console.log(defaultSparqlEndpoint);
//
// const allTermsTS = new Source.AllTermsFromDatasetSource(defaultSparqlEndpoint);
//
// console.log(allTerms);
//
// const selectQueryTxt = 'SELECT * WHERE { ?x ?y ?pippo. {SELECT * WHERE {?s ?p ?pippo} } }';
// const selectQuery = translate(selectQueryTxt);
//
// const varFromSelectQuery = new Source.VarFromSelectQuery("newThis", selectQuery, defaultSparqlEndpointDS, {"this": allTermsTS});
//
// console.log(varFromSelectQuery);
