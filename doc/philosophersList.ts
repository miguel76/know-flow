class PhilosophersList {

    async loadAndRender() {
        const result = await this.ctxt.endpoint.query(`
                SELECT ?philosopher WHERE {
                    ?philosopher a dbo:Philosopher;
                        dbo:birthDate ?birthDate.
                }
                ORDER BY ?birthDate`);    
        // render list header
        result.bindingsStream.on('data', (binding) => {
            showPersonCard(binding.get('?philosopher'));
            // render card separator
        });
    }

    renderListHeader() {

    }
}