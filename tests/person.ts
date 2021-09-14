async function showPersonCard(personIRI) {
    const result = await myEngine.query(`
            SELECT ?name ?birthDate ?deathDate WHERE {
                ?person rdfs:label ?name;
                    dbo:birthDate ?birthDate.
                OPTIONAL {?person dbo:deathDate ?deathDate}
            }`,
            {
                sources: [{ type: 'sparql', value: 'https://dbpedia.org/sparql' }],
                initialBindings: new Bindings({
                    '?person': personIRI
                })
            });    
    const bindings = await result.bindings();
    {
        // render card with bindings[0].get('?name'), ...
    }
}

async function showListOfPhilosophers() {
    const result = await myEngine.query(`
            SELECT ?philosopher WHERE {
                ?philosopher a dbo:Philosopher;
                    dbo:birthDate ?birthDate.
            }
            ORDER BY ?birthDate`,
            {
                sources: [{ type: 'sparql', value: 'https://dbpedia.org/sparql' }]
            });    
    // render list header
    result.bindingsStream.on('data', (binding) => {
        showPersonCard(binding.get('?philosopher'));
        // render card separator
    });
}