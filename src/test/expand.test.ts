import * as assert from 'assert';
import { describe, it } from 'mocha';
import { TextDocument, Position } from 'vscode-languageserver-types'
import { doComplete } from '../emmetHelper';

const COMPLETE_OPTIONS = {
	preferences: {},
	showExpandedAbbreviation: 'always' as const,
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
	
	function testNotExpand(syntax: string, abbrev: string) {
		it(`should not expand ${abbrev}`, async () => {
			const document = TextDocument.create(`test://test/test.${syntax}`, syntax, 0, abbrev);
			const position = Position.create(0, abbrev.length);

			const completionList = doComplete(document, position, syntax, COMPLETE_OPTIONS);
			
			assert.ok(!completionList)
		})
	}
	
	// https://github.com/microsoft/vscode/issues/63703
	testExpand('jsx', 'button[onClick={props.onClick}]', '<button onClick={props.onClick}>${0}</button>');

	// https://github.com/microsoft/vscode/issues/59951
	testExpand('scss', 'fsz18', 'font-size: 18px;');

	// https://github.com/microsoft/vscode/issues/71002
	testExpand('css', '@m', '@media ${1:screen} {\n\t${0}\n}');

	// https://github.com/microsoft/vscode/issues/67971
	testExpand('html', 'div>p+lorem3', '<div>\n\t<p>${0}</p>\n\tLorem, ipsum dolor.\n</div>');

	testNotExpand('html', 'div*101')
})