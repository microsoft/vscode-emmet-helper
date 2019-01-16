import * as assert from 'assert';
import { describe, it } from 'mocha';
import { TextDocument, Position } from 'vscode-languageserver-types'
import { doComplete } from '../emmetHelper';

const COMPLETE_OPTIONS = {
	preferences: {},
	showExpandedAbbreviation: 'always',
	showAbbreviationSuggestions: false,
	syntaxProfiles: {},
	variables: {}
} 

describe('Expand Abbreviations', () => {
  
  function testExpand(syntax: string, abbrev: string, expanded: string) {
		it(`should expand ${abbrev} to ${expanded}`, async () => {
			const document = TextDocument.create(`test://test/test.${syntax}`, syntax, 0, abbrev);
			const position = Position.create(0, abbrev.length);

			const completionList = doComplete(document, position, syntax, COMPLETE_OPTIONS);

			assert.ok(completionList && completionList.items, `completion list exists for ${abbrev}`)
			assert.ok(completionList.items.length > 0, `completion list is not empty for ${abbrev}`)
			
			assert.equal(expanded, TextDocument.applyEdits(document, [completionList.items[0].textEdit]))
		})
  }
	
	testExpand('jsx', 'button[onClick={props.onClick}]', '<button onClick="props.onClick">${0}</button>')
})