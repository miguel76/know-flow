import * as S from "../src/source";
import * as U from "../src/sourceUtils";
import { translate, toSparql, Algebra  } from 'sparqlalgebrajs';

test("Testing sourceUtils methods", () => {

    const defaultSparqlEndpointDS = new S.DefaultSparqlEndpoint();
    const allTermsTS = new S.AllTermsFromDatasetSource(defaultSparqlEndpointDS);
    const selectQueryTxt = 'SELECT ?newThis WHERE { ?this ?p ?newThis }';
    const selectQuery = translate(selectQueryTxt);
    const selectQueryNoProj = (translate(selectQueryTxt) as Algebra.Project).input;

    const varFromSelectQuery = U.createRDFTermSourceFromSelectQueryAlgebra(
                    "newThis", selectQuery, defaultSparqlEndpointDS,
                    new Map<string, S.RDFTermSource>([["this", allTermsTS]]));

    expect(varFromSelectQuery instanceof S.VarFromSelectQuery).toBe(true);
    expect(varFromSelectQuery).toEqual({
        type: "varFromSelect",
        consumers: [],
        observers: [],
        varName: 'newThis',
        selectQuery: selectQueryNoProj,
        datasetSource: defaultSparqlEndpointDS,
        params: new Map<string, S.RDFTermSource>([["this", allTermsTS]])
    });
    expect(defaultSparqlEndpointDS).toHaveProperty('consumers', [allTermsTS, varFromSelectQuery]);
    expect(allTermsTS).toHaveProperty('consumers', [varFromSelectQuery]);

    const allTerms = new S.DefaultVarAllTerms(defaultSparqlEndpointDS);

    const querySource = U.createSourceFromQuery(selectQuery, {
        output: {default:  "newThis", named: []},
        dataset: defaultSparqlEndpointDS,
        input: [{source: allTerms, var: {default: "this", named: []}}]
    });

});
