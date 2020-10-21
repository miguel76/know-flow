import * as S from "../src/source";
import { translate, toSparql  } from 'sparqlalgebrajs';

test("Testing 'Source' structures", () => {

    const defaultSparqlEndpointDS = new S.DefaultSparqlEndpoint();
    expect(defaultSparqlEndpointDS instanceof S.DefaultSparqlEndpoint).toBe(true);
    expect(defaultSparqlEndpointDS).toEqual({consumers: []});


    const allTermsTS = new S.AllTermsFromDatasetSource(defaultSparqlEndpointDS);
    expect(allTermsTS instanceof S.AllTermsFromDatasetSource).toBe(true);
    expect(allTermsTS).toEqual({
        consumers: [],
        observers: [],
        datasetSource: defaultSparqlEndpointDS
    });
    expect(defaultSparqlEndpointDS).toHaveProperty('consumers', [allTermsTS]);

    const selectQueryTxt = 'SELECT ?newThis WHERE { ?this ?p ?newThis }';
    const selectQuery = translate(selectQueryTxt);

    const varFromSelectQuery =
            new S.VarFromSelectQuery(
                    "newThis", selectQuery, defaultSparqlEndpointDS,
                    new Map<string, S.RDFTermSource>([["this", allTermsTS]]));

    expect(varFromSelectQuery instanceof S.VarFromSelectQuery).toBe(true);
    expect(varFromSelectQuery).toEqual({
        consumers: [],
        observers: [],
        varName: 'newThis',
        selectQuery: selectQuery,
        datasetSource: defaultSparqlEndpointDS,
        params: new Map<string, S.RDFTermSource>([["this", allTermsTS]])
        // params: {
        //     'this': allTermsTS
        // }
    });
    expect(defaultSparqlEndpointDS).toHaveProperty('consumers', [allTermsTS, varFromSelectQuery]);
    expect(allTermsTS).toHaveProperty('consumers', [varFromSelectQuery]);

});
