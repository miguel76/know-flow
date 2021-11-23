const showPersonBasicInfo = ctxt.build`
        <p>Name: ${ 'rdfs:label' }</p> 
        ${ {'dbo:birthDate': ctxt.build`<p>Birth date:${ '_' }</p>`} }`;

const showPhilosopherCard = ctxt.build`
        <div class='philosopher'>
            ${ showPersonBasicInfo }
            <div class='philosopher-abstract'>${ 'dbo:abstract' }</div>
        </div>`;

//     SELECT ?name ?birthDate ?deathDate WHERE {
//       ?person rdfs:label ?name;
//         dbo:birthDate ?birthDate.
//       OPTIONAL{?person dbo:deathDate ?deathDate}.

const philosopherList = graph.resources.isA('dbo:Philosopher').bind('searchLabel', searchLabel).has('rdfs:label', 'contains(_, ?searchLabel)');

philosopherList.foreach(showPhilosopherCard);

// FUNCTION showPhilosophersFromSearch(?searchLabel) {
//   LET philosopherList = (
//     SELECT DISTINCT ?philosopher WHERE {
//       ?philosopher a dbo:Philosopher; rdfs:label ?name.
//       FILTER(contains(?name, ?searchLabel)).
//     });
//   listPhilosophers(philosopherList);
//   LET philosopherBirthPlaces = (
//     SELECT ?place WHERE {
//       QVALUES(philosopherList).
//       ?philosopher dbo:birthPlace ?place.
//     });
//   showMap(philosopherBirthPlaces);
// }

// FUNCTION listPhilosophers(philosopherList) {
//   FOR(?philosopher IN philosopherList) {
//     showPhilosopherCard(?philosopher);
//   }
// }

// const showPersonBasicInfo = (context) => {
//   context.out()
//   return (person) => {
//     showPersonBasicInfo(?philosopher);
//     showAbstract(?philosopher);
//     showInfluencedPeople(?philosopher);
//   };
// };
//   LET info = (
//     SELECT ?name ?birthDate ?deathDate WHERE {
//       ?person rdfs:label ?name;
//         dbo:birthDate ?birthDate.
//       OPTIONAL{?person dbo:deathDate ?deathDate}.
//     });
//   ...
// }

// FUNCTION showInfluencedPeople(?person) {
//   FOR(SELECT ?influencedPerson WHERE {
//         ?influencedPerson a dbo:Person; ^dbo:influenced ?person.}) {
//     showPersonBasicInfo(?influencedPerson);
//   }
// }

// FUNCTION showMap(places) {
//   FOR(?place IN places) {
//     showPointOnMap(?place);
//   }
// }

// FUNCTION showPointOnMap(?place) {
//   LET coordinates = (
//     SELECT ?lat ?long WHERE {?place geo:lat ?lat; geo:long ?long});
//   ...
// }
