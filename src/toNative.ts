/*
 * Original copyright (c) 2017 Digital Bazaar, Inc.
 * Derived from fromRDF.js in digitalbazaar/jsonld.js
 */
'use strict';

import * as RDF from 'rdf-js';

// constants
import {
  RDF_JSON_LITERAL,
  XSD_BOOLEAN,
  XSD_DOUBLE,
  XSD_INTEGER,
  XSD_STRING,
} from './constants';

const REGEX_BCP47 = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;

/**
 * Returns true if the given value is numeric.
 *
 * @param v the value to check.
 *
 * @return true if the value is numeric, false if not.
 */
 const isNumeric = (v: any) => !isNaN(parseFloat(v)) && isFinite(v);
 
 /**
 * Converts an RDF term to a JSON-LD object.
 *
 * @param term the RDF term to convert.
 * @param useNativeTypes true to output native types, false not to.
 *
 * @return the JSON-LD object.
 */
export function RDFToObject(term: RDF.Term, useNativeTypes: boolean, rdfDirection?: string): any {
  // convert NamedNode/BlankNode object to JSON-LD
  if (!term) {
    return null;
  }

  if(term.termType.endsWith('Node')) {
    return {'@id': term.value};
  }

  // convert literal to JSON-LD
  const rval: any = {'@value': term.value};

  let literal = <RDF.Literal> term;
  // add language
  if(literal.language) {
    rval['@language'] = literal.language;
  } else {
    let type = literal.datatype.value;
    if(!type) {
      type = XSD_STRING;
    }
    if(type === RDF_JSON_LITERAL) {
      type = '@json';
      // try {
        rval['@value'] = JSON.parse(rval['@value']);
      // } catch(e) {
      //   throw new Error(
      //     'JSON literal could not be parsed.',
      //     'jsonld.InvalidJsonLiteral',
      //     {code: 'invalid JSON literal', value: rval['@value'], cause: e});
      // }
    }
    // use native types for certain xsd types
    if(useNativeTypes) {
      if(type === XSD_BOOLEAN) {
        if(rval['@value'] === 'true') {
          rval['@value'] = true;
        } else if(rval['@value'] === 'false') {
          rval['@value'] = false;
        }
      } else if(isNumeric(rval['@value'])) {
        if(type === XSD_INTEGER) {
          const i = parseInt(rval['@value'], 10);
          if(i.toFixed(0) === rval['@value']) {
            rval['@value'] = i;
          }
        } else if(type === XSD_DOUBLE) {
          rval['@value'] = parseFloat(rval['@value']);
        }
      }
      // do not add native type
      if(![XSD_BOOLEAN, XSD_INTEGER, XSD_DOUBLE, XSD_STRING].includes(type)) {
        rval['@type'] = type;
      }
    } else if(rdfDirection === 'i18n-datatype' &&
      type.startsWith('https://www.w3.org/ns/i18n#')) {
      const [, language, direction] = type.split(/[#_]/);
      if(language.length > 0) {
        rval['@language'] = language;
        if(!language.match(REGEX_BCP47)) {
          console.warn(`@language must be valid BCP47: ${language}`);
        }
      }
      rval['@direction'] = direction;
    } else if(type !== XSD_STRING) {
      rval['@type'] = type;
    }
  }

  return rval; 
}

 /**
 * Converts an RDF term to a native value (if possible) or JSON-LD object.
 *
 * @param term the RDF term to convert.
 *
 * @return the value or JSON-LD object.
 */
export function RDFToValueOrObject(term: RDF.Term, rdfDirection?: string): any {
  let rval = RDFToObject(term, true, rdfDirection);
  return (!rval || rval['@value'] === undefined) ? rval : rval['@value'];
}