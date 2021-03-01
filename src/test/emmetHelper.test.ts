import { Position, CompletionItemKind } from 'vscode-languageserver-types'
import { isAbbreviationValid, extractAbbreviation, extractAbbreviationFromText, getExpandOptions, emmetSnippetField, updateExtensionsPath as updateExtensionsPathHelper, doComplete, expandAbbreviation } from '../emmetHelper';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { describe, it } from 'mocha';
import assert from 'assert';
import * as path from 'path';
import * as util from 'util';
import * as fs from 'fs';
import { FileService, FileType } from '../fileService';
import { URI } from 'vscode-uri';
import { ExtractOptions } from 'emmet';

const extensionsPath = path.join(path.normalize(path.join(__dirname, '../../..')), 'testData', 'custom-snippets-profile');
const bemFilterExample = 'ul.search-form._wide>li.-querystring+li.-btn_large';
const expectedBemFilterOutput =
	`<ul class="search-form search-form_wide">
	<li class="search-form__querystring">\${1}</li>
	<li class="search-form__btn search-form__btn_large">\${0}</li>
</ul>`;
const expectedBemFilterOutputDocs = expectedBemFilterOutput.replace(/\$\{\d+\}/g, '|');
const commentFilterExample = 'ul.nav>li#item';
const expectedCommentFilterOutput =
	`<ul class="nav">
	<li id="item">\${0}</li>
	<!-- /#item -->
</ul>
<!-- /.nav -->`;
const expectedCommentFilterOutputDocs = expectedCommentFilterOutput.replace(/\$\{\d+\}/g, '|');
const bemCommentFilterExample = bemFilterExample;
const expectedBemCommentFilterOutput =
	`<ul class="search-form search-form_wide">
	<li class="search-form__querystring">\${1}</li>
	<!-- /.search-form__querystring -->
	<li class="search-form__btn search-form__btn_large">\${0}</li>
	<!-- /.search-form__btn search-form__btn_large -->
</ul>
<!-- /.search-form search-form_wide -->`;
const expectedBemCommentFilterOutputDocs = expectedBemCommentFilterOutput.replace(/\$\{\d+\}/g, '|');

const fileService: FileService = {
	async readFile(uri: URI): Promise<Uint8Array> {
		if (uri.scheme === 'file') {
			return await util.promisify(fs.readFile)(uri.fsPath);
		}
		throw new Error(`schema ${uri.scheme} not supported`);
	},
	stat(uri: URI) {
		if (uri.scheme === 'file') {
			return new Promise((c, e) => {
				fs.stat(uri.fsPath, (err, stats) => {
					if (err) {
						if (err.code === 'ENOENT') {
							return c({ type: FileType.Unknown, ctime: -1, mtime: -1, size: -1 });
						} else {
							return e(err);
						}
					}

					let type = FileType.Unknown;
					if (stats.isFile()) {
						type = FileType.File;
					} else if (stats.isDirectory()) {
						type = FileType.Directory;
					} else if (stats.isSymbolicLink()) {
						type = FileType.SymbolicLink;
					}

					c({
						type,
						ctime: stats.ctime.getTime(),
						mtime: stats.mtime.getTime(),
						size: stats.size
					});
				});
			});
		}
	}
}

function updateExtensionsPath(extPath: string | string[]): Promise<void> {
	return updateExtensionsPathHelper(extPath, fileService, URI.file('/home/projects/test'))
}

describe('Validate Abbreviations', () => {
	it('should return true for valid abbreviations', () => {
		const htmlAbbreviations = [
			'ul>li',
			'ul',
			'h1',
			'ul>li*3',
			'(ul>li)+div',
			'.hello',
			'!',
			'#hello',
			'.item[id=ok]',
			'.',
			'.foo',
			'div{ foo (bar) baz }',
			'div{ foo ((( abc }',
			'div{()}',
			'div{ a (b) c}',
			'div{ a (b) c}+div{ a (( }'
		];
		const cssAbbreviations = ['#123', '#abc', 'bd1#s'];
		htmlAbbreviations.forEach(abbr => {
			assert(isAbbreviationValid('html', abbr), `${abbr} should be treated as valid abbreviation`);
		});
		htmlAbbreviations.forEach(abbr => {
			assert(isAbbreviationValid('haml', abbr), `${abbr} should be treated as valid abbreviation`);
		});
		cssAbbreviations.forEach(abbr => {
			assert(isAbbreviationValid('css', abbr), `${abbr} should be treated as valid abbreviation`);
		});
		cssAbbreviations.forEach(abbr => {
			assert(isAbbreviationValid('scss', abbr), `${abbr} should be treated as valid abbreviation`);
		});
	});
	it('should return false for invalid abbreviations', () => {
		const htmlAbbreviations = [
			'!ul!',
			'(hello)',
			'super(hello)',
			'console.log(hello)',
			'console.log(._hello)',
			'()',
			'[]',
			'(my.data[0].element)',
			'if(!ok)',
			'while(!ok)',
			'(!ok)',
			'div{ foo }(bar){ baz }',
			'div{ foo ((}( abc }',
			'div{ a}(b) c}',
			'div{ a (b){c}',
			'div{ a}(b){c}',
			'div{ a ((  dsf} d (( sf )) }'
		];
		const cssAbbreviations = ['123', '#xyz'];
		htmlAbbreviations.forEach(abbr => {
			assert(!isAbbreviationValid('html', abbr), `${abbr} should be treated as invalid abbreviation in html`);
		});
		htmlAbbreviations.forEach(abbr => {
			assert(!isAbbreviationValid('haml', abbr), `${abbr} should be treated as invalid abbreviation in haml`);
		});
		cssAbbreviations.forEach(abbr => {
			assert(!isAbbreviationValid('css', abbr), `${abbr} should be treated as invalid abbreviation in css`);
		});
		cssAbbreviations.forEach(abbr => {
			assert(!isAbbreviationValid('scss', abbr), `${abbr} should be treated as invalid abbreviation in scss`);
		});
	})
});

describe('Extract Abbreviations', () => {
	it('should extract abbreviations from document html', () => {
		const testCases: [string, number, number, string, number, number, number, number, string][] = [
			['<div>ul>li*3</div>', 0, 7, 'ul', 0, 5, 0, 7, undefined],
			['<div>ul>li*3</div>', 0, 10, 'ul>li', 0, 5, 0, 10, undefined],
			['<div>ul>li*3</div>', 0, 12, 'ul>li*3', 0, 5, 0, 12, undefined],
			['ul>li', 0, 5, 'ul>li', 0, 0, 0, 5, undefined],
			['ul>li|bem', 0, 9, 'ul>li', 0, 0, 0, 9, 'bem'],
			['ul>li|c|bem', 0, 11, 'ul>li', 0, 0, 0, 11, 'c,bem'],
			['ul>li|bem|c', 0, 11, 'ul>li', 0, 0, 0, 11, 'bem,c'],
			['ul>li|t|bem|c', 0, 13, 'ul>li', 0, 0, 0, 13, 't,bem,c'],
			['div[a="b" c="d"]>md-button', 0, 26, 'div[a="b" c="d"]>md-button', 0, 0, 0, 26, undefined],
			['div[a=b c="d"]>md-button', 0, 24, 'div[a=b c="d"]>md-button', 0, 0, 0, 24, undefined],
			['div[a=b c=d]>md-button', 0, 22, 'div[a=b c=d]>md-button', 0, 0, 0, 22, undefined]
		]

		testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedRangeStartLine, expectedRangeStartChar, expectedRangeEndLine, expectedRangeEndChar, expectedFilter]) => {
			const document = TextDocument.create('test://test/test.html', 'html', 0, content);
			const position = Position.create(positionLine, positionChar);
			const { abbreviationRange, abbreviation, filter } = extractAbbreviation(document, position);

			assert.strictEqual(expectedAbbr, abbreviation);
			assert.strictEqual(expectedRangeStartLine, abbreviationRange.start.line);
			assert.strictEqual(expectedRangeStartChar, abbreviationRange.start.character);
			assert.strictEqual(expectedRangeEndLine, abbreviationRange.end.line);
			assert.strictEqual(expectedRangeEndChar, abbreviationRange.end.character);
			assert.strictEqual(filter, expectedFilter);
		});
	});
	it('should extract abbreviations from document css', () => {
		const testCases: [string, number, number, string, number, number, number, number, string][] = [
			['<div style="dn"></div>', 0, 14, 'dn', 0, 12, 0, 14, undefined],
			['<div style="trf:rx"></div>', 0, 18, 'trf:rx', 0, 12, 0, 18, undefined],
			['<div style="-mwo-trf:rx"></div>', 0, 23, '-mwo-trf:rx', 0, 12, 0, 23, undefined],
		]

		testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedRangeStartLine, expectedRangeStartChar, expectedRangeEndLine, expectedRangeEndChar, expectedFilter]) => {
			const document = TextDocument.create('test://test/test.html', 'html', 0, content);
			const position = Position.create(positionLine, positionChar);
			const extractOptions: Partial<ExtractOptions> = { type: 'stylesheet', lookAhead: false };
			const { abbreviationRange, abbreviation, filter } = extractAbbreviation(document, position, extractOptions);

			assert.strictEqual(expectedAbbr, abbreviation);
			assert.strictEqual(expectedRangeStartLine, abbreviationRange.start.line);
			assert.strictEqual(expectedRangeStartChar, abbreviationRange.start.character);
			assert.strictEqual(expectedRangeEndLine, abbreviationRange.end.line);
			assert.strictEqual(expectedRangeEndChar, abbreviationRange.end.character);
			assert.strictEqual(filter, expectedFilter);
		});
	});

	it('should extract abbreviations from text', () => {
		const testCases: [string, string, string][] = [
			['ul', 'ul', undefined],
			['ul>li', 'ul>li', undefined],
			['ul>li*3', 'ul>li*3', undefined],
			['ul>li|bem', 'ul>li', 'bem'],
			['ul>li|t', 'ul>li', 't'],
			['ul>li|bem|c', 'ul>li', 'bem,c'],
			['ul>li|c|bem', 'ul>li', 'c,bem'],
			['ul>li|c|bem|t', 'ul>li', 'c,bem,t'],
		]

		testCases.forEach(([content, expectedAbbr, expectedFilter]) => {
			const { abbreviation, filter } = extractAbbreviationFromText(content);

			assert.strictEqual(expectedAbbr, abbreviation);
			assert.strictEqual(filter, expectedFilter);
		});
	});
});

describe('Test Basic Expand Options', () => {
	it('should check for basic expand options', () => {
		const syntax = 'anythingreally';
		const expandOptions = getExpandOptions(syntax);

		assert.strictEqual(expandOptions.options['output.field'], emmetSnippetField)
		assert.strictEqual(expandOptions.syntax, syntax);
	});
});

describe('Test addons in Expand Options', () => {
	it('should add jsx as addon for jsx syntax', () => {
		const syntax = 'jsx';
		const expandOptions = getExpandOptions(syntax);

		assert.strictEqual(expandOptions.options['jsx.enabled'], true);
	});

	it('should add bem as addon when bem filter is provided', () => {
		const syntax = 'anythingreally';
		const expandOptions = getExpandOptions(syntax, {}, 'bem');

		assert.strictEqual(expandOptions.options['bem.element'], '__');
	});

	it('should add bem before jsx as addon when bem filter is provided', () => {
		const syntax = 'jsx';
		const expandOptions = getExpandOptions(syntax, {}, 'bem');

		assert.strictEqual(expandOptions.options['bem.element'], '__');
		assert.strictEqual(expandOptions.options['jsx.enabled'], true);
	});
});

describe('Test output profile settings', () => {
	it('should convert output profile from old format to new', () => {
		const profile = {
			tag_case: 'lower',
			attr_case: 'lower',
			attr_quotes: 'single',
			tag_nl: true,
			inline_break: 2,
			self_closing_tag: 'xhtml'
		}

		const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: profile } });

		assert.strictEqual(profile['tag_case'], expandOptions.options['output.tagCase']);
		assert.strictEqual(profile['attr_case'], expandOptions.options['output.attributeCase']);
		assert.strictEqual(profile['attr_quotes'], expandOptions.options['output.attributeQuotes']);
		assert.strictEqual(profile['tag_nl'], expandOptions.options['output.format']);
		assert.strictEqual(profile['inline_break'], expandOptions.options['output.inlineBreak']);
		assert.strictEqual(profile['self_closing_tag'], expandOptions.options['output.selfClosingStyle']);
	});

	it('should convert self_closing_style', () => {
		const testCases = [true, false, 'xhtml'];
		const expectedValue = ['xml', 'html', 'xhtml'];

		for (let i = 0; i < testCases.length; i++) {
			const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: { self_closing_tag: testCases[i] } } });
			assert.strictEqual(expandOptions.options['output.selfClosingStyle'], expectedValue[i]);
		}
	});

	it('should convert tag_nl', () => {
		const testCases = [true, false, 'decide'];
		const expectedValue = [true, false, true];

		for (let i = 0; i < testCases.length; i++) {
			const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: { tag_nl: testCases[i] } } });
			assert.strictEqual(expandOptions.options['output.format'], expectedValue[i]);
		}
	});

	it('should use output profile in new format as is', () => {
		const profile = {
			tagCase: 'lower',
			attributeCase: 'lower',
			attributeQuotes: 'single',
			format: true,
			inlineBreak: 2,
			selfClosingStyle: 'xhtml'
		};

		const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: profile } });
		Object.keys(profile).forEach(key => {
			assert.strictEqual(expandOptions.options[`output.${key}`], profile[key]);
		});
	});

	it('should use profile from settings that overrides the ones from extensionsPath', async () => {
		await updateExtensionsPath(extensionsPath);
		const profile = {
			tag_case: 'lower',
			attr_case: 'lower',
			attr_quotes: 'single',
			tag_nl: true,
			inline_break: 2,
			self_closing_tag: 'xhtml'
		};
		const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: profile } });

		assert.strictEqual(expandOptions.options['output.tagCase'], 'lower');
		assert.strictEqual(profile['tag_case'], 'lower');
	});
});

describe('Test variables settings', () => {
	it('should take in variables as is', () => {
		const variables = {
			lang: 'de',
			charset: 'UTF-8'
		}

		const expandOptions = getExpandOptions('html', { variables });
		Object.keys(variables).forEach(key => {
			assert.strictEqual(expandOptions.variables[key], variables[key]);
		});
	});

	it('should use variables from the extensionsPath', async () => {
		await updateExtensionsPath(extensionsPath);

		const expandOptions = getExpandOptions('html', {});
		assert.strictEqual(expandOptions.variables['lang'], 'fr');
	});

	it('should use given variables that override ones from extensionsPath', async () => {
		await updateExtensionsPath(extensionsPath);

		const variables = {
			lang: 'en',
			charset: 'UTF-8'
		}
		const expandOptions = getExpandOptions('html', { variables });
		assert.strictEqual(expandOptions.variables['lang'], variables['lang']);
	});
});

describe('Test custom snippets', () => {
	it('should use custom snippets for given syntax from extensionsPath', async () => {
		const customSnippetKey = 'ch';
		await updateExtensionsPath(null);
		const expandOptionsWithoutCustomSnippets = getExpandOptions('css');
		assert(!expandOptionsWithoutCustomSnippets.snippets);

		// Use custom snippets from extensionsPath
		await updateExtensionsPath(extensionsPath);
		const expandOptionsWithCustomSnippets = getExpandOptions('css');

		assert.strictEqual(Object.keys(expandOptionsWithCustomSnippets.snippets).some(key => key === customSnippetKey), true);
	});

	it('should use custom snippets inherited from base syntax from extensionsPath', async () => {
		const customSnippetKey = 'ch';

		await updateExtensionsPath(null);
		const expandOptionsWithoutCustomSnippets = getExpandOptions('scss');
		assert(!expandOptionsWithoutCustomSnippets.snippets);

		// Use custom snippets from extensionsPath
		await updateExtensionsPath(extensionsPath);

		const expandOptionsWithCustomSnippets = getExpandOptions('css');
		const expandOptionsWithCustomSnippetsInhertedSytnax = getExpandOptions('scss');

		assert.strictEqual(Object.keys(expandOptionsWithCustomSnippets.snippets).some(key => key === customSnippetKey), true);
		assert.strictEqual(Object.keys(expandOptionsWithCustomSnippetsInhertedSytnax.snippets).some(key => key === customSnippetKey), true);
	});

	it('should use custom snippets for given syntax in the absence of base syntax from extensionsPath', async () => {
		const customSnippetKey = 'ch';
		await updateExtensionsPath(null);
		const expandOptionsWithoutCustomSnippets = getExpandOptions('scss');
		assert(!expandOptionsWithoutCustomSnippets.snippets);

		// Use custom snippets from extensionsPath
		await updateExtensionsPath(path.join(path.normalize(path.join(__dirname, '../../..')), 'testData', 'custom-snippets-without-inheritence'));
		const expandOptionsWithCustomSnippets = getExpandOptions('scss');

		assert.strictEqual(Object.keys(expandOptionsWithCustomSnippets.snippets).some(key => key === customSnippetKey), true);
	});

	it('should throw error when snippets file from extensionsPath has invalid json', async () => {
		const invalidJsonPath = path.join(path.normalize(path.join(__dirname, '../../..')), 'testData', 'custom-snippets-invalid-json');
		try {
			await updateExtensionsPath(invalidJsonPath);
			return Promise.reject('There should be an error as snippets file contained invalid json');
		} catch (e) {
			assert.ok(e);
		}
	});

	it('should reset custom snippets when no extensionsPath is given', async () => {
		const customSnippetKey = 'ch';
		await updateExtensionsPath(extensionsPath);
		assert.strictEqual(Object.keys(getExpandOptions('scss').snippets).some(key => key === customSnippetKey), true);

		await updateExtensionsPath(null);
		assert.ok(!getExpandOptions('scss').snippets, 'There should be no custom snippets as extensionPath was not given');
	});

	it('should reset custom snippets when non-existent extensionsPath is given', async () => {
		const customSnippetKey = 'ch';
		await updateExtensionsPath(extensionsPath);
		assert.strictEqual(Object.keys(getExpandOptions('scss').snippets).some(key => key === customSnippetKey), true);

		try {
			await updateExtensionsPath(extensionsPath + 'path');
			return Promise.reject('There should be an error as extensionPath was faulty');
		} catch (e) {
			assert.ok(!getExpandOptions('scss').snippets, 'There should be no custom snippets as extensionPath was faulty');
		}
	});

	it('should reset custom snippets when directory with no snippets is given', async () => {
		const customSnippetKey = 'ch';
		await updateExtensionsPath(extensionsPath);

		const foundCustomSnippet = Object.keys(getExpandOptions('scss').snippets)
			.some(key => key === customSnippetKey);
		assert.strictEqual(foundCustomSnippet, true);

		const extensionsPathParent = path.join(path.normalize(path.join(__dirname, '../../..')), 'testData');
		try {
			await updateExtensionsPath(extensionsPathParent);
			return Promise.reject('There should be an error as extensionPath was faulty');
		} catch (e) {
			assert.ok(!getExpandOptions('scss').snippets, 'There should be no custom snippets as extensionPath was faulty');
		}
	});

	// https://github.com/microsoft/vscode/issues/116741
	it('should use the first valid custom snippets from an array of extensions path', async () => {
		const customSnippetKey = 'ch';
		await updateExtensionsPath(null);
		const expandOptionsWithoutCustomSnippets = getExpandOptions('css');
		assert(!expandOptionsWithoutCustomSnippets.snippets);

		// Use custom snippets from extensionsPathArray
		const extensionsPathArray = ["./this/is/not/valid", extensionsPath]
		await updateExtensionsPath(extensionsPathArray);
		const expandOptionsWithCustomSnippets = getExpandOptions('css');

		assert.strictEqual(Object.keys(expandOptionsWithCustomSnippets.snippets).some(key => key === customSnippetKey), true);
	});

	it('should throw error when all extensionsPath in the array are invalid', async () => {
		const extensionsPathArray = ["./this/is/not/valid", "./this/is/also/not/valid"]
		try {
			await updateExtensionsPath(extensionsPathArray);
			return Promise.reject('There should be an error as no valid path is found in the array');
		} catch (e) {
			assert.ok(e);
		}
	});
});

describe('Test emmet preferences', () => {
	it('should use stylesheet preferences', () => {
		assert.strictEqual(expandAbbreviation('m10', getExpandOptions('css', { preferences: { 'css.propertyEnd': ';;' } })), 'margin: 10px;;');
		assert.strictEqual(expandAbbreviation('m10', getExpandOptions('scss', { preferences: { 'scss.valueSeparator': '::' } })), 'margin::10px;');
		assert.strictEqual(expandAbbreviation('m10', getExpandOptions('less', { preferences: { 'css.intUnit': 'pt' } })), 'margin: 10pt;');
		assert.strictEqual(expandAbbreviation('m10.2', getExpandOptions('css', { preferences: { 'css.floatUnit': 'ex' } })), 'margin: 10.2ex;');
		assert.strictEqual(expandAbbreviation('m10r', getExpandOptions('css', { preferences: { 'css.unitAliases': 'e:em, p:%,r: /rem' } })), 'margin: 10 /rem;');
		assert.strictEqual(expandAbbreviation('m10p', getExpandOptions('css', { preferences: { 'css.unitAliases': 'e:em, p:%,r: /rem' } })), 'margin: 10%;');
	});
});

describe('Test filters (bem and comment)', () => {
	it('should expand haml', async () => {
		await updateExtensionsPath(null);
		assert.strictEqual(expandAbbreviation('ul[data="class"]', getExpandOptions('haml', {})), '%ul(data="class") ${0}');
	});

	it('should expand attributes with []', async () => {
		await updateExtensionsPath(null);
		assert.strictEqual(expandAbbreviation('div[[a]="b"]', getExpandOptions('html', {})), '<div [a]="b">${0}</div>');
	});

	it('should expand abbreviations that are nodes with no name', async () => {
		await updateExtensionsPath(null);
		assert.strictEqual(expandAbbreviation('c', getExpandOptions('html', {})), '<!-- ${0} -->');
	});

	it('should use filters from expandOptions', async () => {
		await updateExtensionsPath(null);
		assert.strictEqual(expandAbbreviation(bemFilterExample, getExpandOptions('html', {}, 'bem')), expectedBemFilterOutput);
		assert.strictEqual(expandAbbreviation(commentFilterExample, getExpandOptions('html', {}, 'c')), expectedCommentFilterOutput);
		assert.strictEqual(expandAbbreviation(bemCommentFilterExample, getExpandOptions('html', {}, 'bem,c')), expectedBemCommentFilterOutput);
	});

	it('should use filters from syntaxProfiles', async () => {
		await updateExtensionsPath(null);
		assert.strictEqual(expandAbbreviation(bemFilterExample, getExpandOptions('html', {
			syntaxProfiles: {
				html: {
					filters: 'html, bem'
				}
			}
		})), expectedBemFilterOutput);
		assert.strictEqual(expandAbbreviation(commentFilterExample, getExpandOptions('html', {
			syntaxProfiles: {
				html: {
					filters: 'html, c'
				}
			}
		})), expectedCommentFilterOutput);
	});
});

describe('Test completions', () => {
	it('should provide multiple common tags completions in html', async () => {
		await updateExtensionsPath(null);
		const document = TextDocument.create('test://test/test.html', 'html', 0, 'd');
		const position = Position.create(0, 1);
		const completionList = doComplete(document, position, 'html', {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: true,
			syntaxProfiles: {},
			variables: {}
		});
		const expectedItems = ['dl', 'dt', 'dd', 'div'];

		assert.ok(expectedItems.every(x => completionList.items.some(y => y.label === x)), 'All common tags starting with d not found');
	});

	it('should provide multiple snippet suggestions in html', async () => {
		await updateExtensionsPath(null);
		const document = TextDocument.create('test://test/test.html', 'html', 0, 'a:');
		const position = Position.create(0, 2);
		const completionList = doComplete(document, position, 'html', {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: true,
			syntaxProfiles: {},
			variables: {}
		});
		const expectedItems = ['a:link', 'a:mail', 'a:tel'];

		assert.ok(expectedItems.every(x => completionList.items.some(y => y.label === x)), 'All snippet suggestions for a: not found');
	});

	it('should not provide any suggestions in html for class names or id', async () => {
		await updateExtensionsPath(null);
		const testCases = ['div.col', 'div#col'];
		testCases.forEach(abbr => {
			const document = TextDocument.create('test://test/test.html', 'html', 0, abbr);
			const position = Position.create(0, abbr.length);
			const completionList = doComplete(document, position, 'html', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: true,
				syntaxProfiles: {},
				variables: {}
			});

			assert.ok(completionList.items.every(x => x.label !== 'colg'), `colg is not a valid suggestion for ${abbr}`);
		});
	});

	it('should provide multiple snippet suggestions in html for nested abbreviations', async () => {
		await updateExtensionsPath(null);
		const testCases = ['ul>a:', 'ul+a:'];
		testCases.forEach(abbr => {
			const document = TextDocument.create('test://test/test.html', 'html', 0, abbr);
			const position = Position.create(0, abbr.length);
			const completionList = doComplete(document, position, 'html', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: true,
				syntaxProfiles: {},
				variables: {}
			});
			const expectedItems = ['a:link', 'a:mail', 'a:tel'];

			assert.ok(expectedItems.every(x => completionList.items.some(y => y.label === x)), 'All snippet suggestions for a: not found');
		});
	});

	it('should not provide link:m as a suggestion', async () => {
		// https://github.com/microsoft/vscode/issues/66680
		await updateExtensionsPath(null);
		const abbr = 'link:m';
		const document = TextDocument.create('test://test/test.html', 'html', 0, abbr);
		const position = Position.create(0, abbr.length);
		const completionList = doComplete(document, position, 'html', {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: true,
			syntaxProfiles: {},
			variables: {}
		});

		assert.strictEqual(completionList.items.every(x => x.label !== 'link:m'), true);
	});

	it('should not provide marginright as a suggestion SCSS', async () => {
		// https://github.com/microsoft/vscode-emmet-helper/issues/42
		await updateExtensionsPath(null);
		const abbr = 'marginright';
		const document = TextDocument.create('test://test/test.scss', 'scss', 0, abbr);
		const position = Position.create(0, abbr.length);
		const completionList = doComplete(document, position, 'scss', {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: true,
			syntaxProfiles: {},
			variables: {}
		});

		assert.strictEqual(completionList, undefined);
	});

	it('should provide completions html', async () => {
		await updateExtensionsPath(null);
		const bemFilterExampleWithInlineFilter = bemFilterExample + '|bem';
		const commentFilterExampleWithInlineFilter = commentFilterExample + '|c';
		const bemCommentFilterExampleWithInlineFilter = bemCommentFilterExample + '|bem|c';
		const commentBemFilterExampleWithInlineFilter = bemCommentFilterExample + '|c|bem';
		const testCases: [string, number, number, string, string, string][] = [
			['<div>ul>li*3</div>', 0, 7, 'ul', '<ul>|</ul>', '<ul>\${0}</ul>'],
			['<div>UL</div>', 0, 7, 'UL', '<UL>|</UL>', '<UL>\${0}</UL>'],
			['<div>ul>li*3</div>', 0, 10, 'ul>li', '<ul>\n\t<li>|</li>\n</ul>', '<ul>\n\t<li>\${0}</li>\n</ul>'],
			['<div>(ul>li)*3</div>', 0, 14, '(ul>li)*3', '<ul>\n\t<li>|</li>\n</ul>\n<ul>\n\t<li>|</li>\n</ul>\n<ul>\n\t<li>|</li>\n</ul>', '<ul>\n\t<li>\${1}</li>\n</ul>\n<ul>\n\t<li>\${2}</li>\n</ul>\n<ul>\n\t<li>\${0}</li>\n</ul>'],
			['<div>custom-tag</div>', 0, 15, 'custom-tag', '<custom-tag>|</custom-tag>', '<custom-tag>\${0}</custom-tag>'],
			['<div>custom:tag</div>', 0, 15, 'custom:tag', '<custom:tag>|</custom:tag>', '<custom:tag>\${0}</custom:tag>'],
			['<div>sp</div>', 0, 7, 'span', '<span>|</span>', '<span>\${0}</span>'],
			['<div>SP</div>', 0, 7, 'SPan', '<SPan>|</SPan>', '<SPan>\${0}</SPan>'],
			['<div>u-l-z</div>', 0, 10, 'u-l-z', '<u-l-z>|</u-l-z>', '<u-l-z>\${0}</u-l-z>'],
			['<div>div.foo_</div>', 0, 13, 'div.foo_', '<div class="foo_">|</div>', '<div class="foo_">\${0}</div>'],
			[bemFilterExampleWithInlineFilter, 0, bemFilterExampleWithInlineFilter.length, bemFilterExampleWithInlineFilter, expectedBemFilterOutputDocs, expectedBemFilterOutput],
			[commentFilterExampleWithInlineFilter, 0, commentFilterExampleWithInlineFilter.length, commentFilterExampleWithInlineFilter, expectedCommentFilterOutputDocs, expectedCommentFilterOutput],
			[bemCommentFilterExampleWithInlineFilter, 0, bemCommentFilterExampleWithInlineFilter.length, bemCommentFilterExampleWithInlineFilter, expectedBemCommentFilterOutputDocs, expectedBemCommentFilterOutput],
			[commentBemFilterExampleWithInlineFilter, 0, commentBemFilterExampleWithInlineFilter.length, commentBemFilterExampleWithInlineFilter, expectedBemCommentFilterOutputDocs, expectedBemCommentFilterOutput],
			['li*2+link:css', 0, 13, 'li*2+link:css', '<li>|</li>\n<li>|</li>\n<link rel="stylesheet" href="style.css">', '<li>\${1}</li>\n<li>\${2}</li>\n<link rel="stylesheet" href="\${4:style}.css">'],
			['li*10', 0, 5, 'li*10', '<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>',
				'<li>\${1}</li>\n<li>\${2}</li>\n<li>\${3}</li>\n<li>\${4}</li>\n<li>\${5}</li>\n<li>\${6}</li>\n<li>\${7}</li>\n<li>\${8}</li>\n<li>\${9}</li>\n<li>\${0}</li>'],
		];
		testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedExpansionDocs, expectedExpansion]) => {
			const document = TextDocument.create('test://test/test.html', 'html', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'html', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items[0].label, expectedAbbr);
			assert.strictEqual(completionList.items[0].documentation, expectedExpansionDocs);
			assert.strictEqual(completionList.items[0].textEdit.newText, expectedExpansion);
		});
	});

	it('should provide completions css', async () => {
		await updateExtensionsPath(null);
		const testCases: [string, string][] = [
			['trf', 'transform: ;'],
			['trf:rx', 'transform: rotateX(angle);'],
			['trfrx', 'transform: rotateX(angle);'],
			['m10+p10', 'margin: 10px;\npadding: 10px;'],
			['brs', 'border-radius: ;'],
			['brs5', 'border-radius: 5px;'],
			['brs10px', 'border-radius: 10px;'],
			['p', 'padding: ;']
		];
		const positionLine = 0;
		testCases.forEach(([abbreviation, expected]) => {
			const document = TextDocument.create('test://test/test.css', 'css', 0, abbreviation);
			const position = Position.create(positionLine, abbreviation.length);
			const completionList = doComplete(document, position, 'css', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items[0].label, expected);
			assert.strictEqual(completionList.items[0].filterText, abbreviation);
		});
	});

	it('should not provide html completions for xml', async () => {
		// https://github.com/microsoft/vscode/issues/97632
		await updateExtensionsPath(null);
		const testCases: [string] = ['a'];
		const positionLine = 0;
		testCases.forEach(abbreviation => {
			const document = TextDocument.create('test://test/test.xml', 'xml', 0, abbreviation);
			const position = Position.create(positionLine, abbreviation.length);
			const completionList = doComplete(document, position, 'xml', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: true,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items.some(item => item.label === 'a'), false);
			assert.strictEqual(completionList.items.some(item => item.label === 'a:blank'), false);
			assert.strictEqual(completionList.items.some(item => item.label === 'a:link'), false);
			assert.strictEqual(completionList.items.some(item => item.label === 'a:mail'), false);
			assert.strictEqual(completionList.items.some(item => item.label === 'a:tel'), false);
		});
	});

	it('should provide hex color completions css', async () => {
		await updateExtensionsPath(null);
		const testCases: [string, string][] = [
			['#1', '#111'],
			['#ab', '#ababab'],
			['#abc', '#abc'],
			['c:#1', 'color: #111;'],
			['c:#1a', 'color: #1a1a1a;'],
			['bgc:1', 'background-color: 1px;'],
			['c:#0.1', 'color: rgba(0, 0, 0, 0.1);']
		];
		const positionLine = 0;
		testCases.forEach(([abbreviation, expected]) => {
			const document = TextDocument.create('test://test/test.css', 'css', 0, abbreviation);
			const position = Position.create(positionLine, abbreviation.length);
			const completionList = doComplete(document, position, 'css', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items[0].label, expected);
			assert.strictEqual(completionList.items[0].filterText, abbreviation);
		});
	});

	it.skip('should provide empty incomplete completion list for abbreviations that just have the vendor prefix', async () => {
		await updateExtensionsPath(null);
		const testCases: [string, number, number][] = [
			['-', 0, 1],
			['-m-', 0, 3],
			['-s-', 0, 3],
			['-o-', 0, 3],
			['-w-', 0, 3],
			['-ow-', 0, 4],
			['-mw-', 0, 4],
			['-mo', 0, 3],
		];
		testCases.forEach(([abbreviation, positionLine, positionChar]) => {
			const document = TextDocument.create('test://test/test.css', 'css', 0, abbreviation);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'css', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items.length, 0, completionList.items.length ? completionList.items[0].label : 'all good');
			assert.strictEqual(completionList.isIncomplete, true);
		});
	})

	it('should provide completions for text that are prefix for snippets, ensure $ doesnt get escaped', async () => {
		await updateExtensionsPath(null);
		const testCases: [string, number, number][] = [
			['<div> l </div>', 0, 7]
		];
		testCases.forEach(([content, positionLine, positionChar]) => {
			const document = TextDocument.create('test://test/test.html', 'html', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'html', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: true,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items.find(x => x.label === 'link').documentation, '<link rel="stylesheet" href="|">');
			assert.strictEqual(completionList.items.find(x => x.label === 'link').textEdit.newText, '<link rel="stylesheet" href="${0}">');
			assert.strictEqual(completionList.items.find(x => x.label === 'link:css').documentation, '<link rel="stylesheet" href="style.css">');
			assert.strictEqual(completionList.items.find(x => x.label === 'link:css').textEdit.newText, '<link rel="stylesheet" href="${2:style}.css">');

		});
	});

	it('should provide completions for scss', async () => {
		await updateExtensionsPath(null);
		const testCases: [string, number, number][] = [
			['m:a', 0, 3]
		];
		testCases.forEach(([content, positionLine, positionChar]) => {
			const document = TextDocument.create('test://test/test.scss', 'scss', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'scss', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items.find(x => x.label === 'margin: auto;').documentation, 'margin: auto;');
		});
	});

	it('should provide completions with escaped $ in scss', async () => {
		await updateExtensionsPath(null);
		const testCases: [string, number, number][] = [
			['bgi$hello', 0, 9]
		];
		testCases.forEach(([content, positionLine, positionChar]) => {
			const document = TextDocument.create('test://test/test.scss', 'scss', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'scss', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items.find(x => x.label === 'background-image: $hello;').documentation, 'background-image: $hello;');
			assert.strictEqual(completionList.items.find(x => x.label === 'background-image: $hello;').textEdit.newText, 'background-image: \\$hello;');
		});
	});

	it('should provide completions with escaped $ in html', async () => {
		await updateExtensionsPath(null);
		const testCases: [string, number, number, string, string][] = [
			['span{\\$5}', 0, 9, '<span>$5</span>', '<span>\\$5</span>'],
			['span{\\$hello}', 0, 13, '<span>$hello</span>', '<span>\\$hello</span>']
		];
		testCases.forEach(([content, positionLine, positionChar, expectedDoc, expectedSnippetText]) => {
			const document = TextDocument.create('test://test/test.html', 'html', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'html', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items.find(x => x.label === content).documentation, expectedDoc);
			assert.strictEqual(completionList.items.find(x => x.label === content).textEdit.newText, expectedSnippetText);
		});
	});

	it('should provide completions using custom snippets html', async () => {
		await updateExtensionsPath(extensionsPath);
		const testCases: [string, number, number, string, string][] = [
			['<div>hey</div>', 0, 8, 'hey', '<ul>\n\t<li><span class="hello">|</span></li>\n\t<li><span class="hello">|</span></li>\n</ul>']
		];
		testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedExpansion]) => {
			const document = TextDocument.create('test://test/test.html', 'html', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'html', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {
					'html': {
						'tag_case': 'lower'
					}
				},
				variables: {}
			});

			assert.strictEqual(completionList.items[0].label, expectedAbbr);
			assert.strictEqual(completionList.items[0].documentation, expectedExpansion);
		});
	});

	it('should provide completions using custom snippets css and unit aliases', async () => {
		await updateExtensionsPath(extensionsPath);
		const testCases: [string, number, number, string, string, string][] = [
			['hel', 0, 3, 'hello', 'margin: 10px;', undefined],
			['hello', 0, 5, 'hello', 'margin: 10px;', undefined],
			['m10p', 0, 4, 'margin: 10%;', 'margin: 10%;', 'm10p'],
			['m10e', 0, 4, 'margin: 10hi;', 'margin: 10hi;', 'm10e'],
			['m10h', 0, 4, 'margin: 10hello;', 'margin: 10hello;', 'm10h'],
			['p10-20', 0, 6, 'padding: 10px 20px;', 'padding: 10px 20px;', 'p10-20'] // The - in the number range will result in filtering this item out, so filter text should match abbreviation
		];
		testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedExpansion, expectedFilterText]) => {
			const document = TextDocument.create('test://test/test.css', 'css', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'css', {
				preferences: {
					'css.unitAliases': 'e:hi,h:hello'
				},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items[0].label, expectedAbbr);
			assert.strictEqual(completionList.items[0].documentation, expectedExpansion);
			assert.strictEqual(completionList.items[0].filterText, expectedFilterText);
		});
	});

	it('should provide both custom and default snippet completion when partial match with custom snippet', async () => {
		await updateExtensionsPath(extensionsPath);
		const expandOptions = {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: false,
			syntaxProfiles: {},
			variables: {}
		};

		const completionList1 = doComplete(TextDocument.create('test://test/test.css', 'css', 0, 'm'), Position.create(0, 1), 'css', expandOptions);
		const completionList2 = doComplete(TextDocument.create('test://test/test.css', 'css', 0, 'mr'), Position.create(0, 2), 'css', expandOptions);

		assert.strictEqual(completionList1.items.some(x => x.label === 'margin: ;'), true);
		assert.strictEqual(completionList1.items.some(x => x.label === 'mrgstart'), true);

		assert.strictEqual(completionList2.items.some(x => x.label === 'margin-right: ;'), true);
		assert.strictEqual(completionList2.items.some(x => x.label === 'mrgstart'), true);
	});

	it('should not provide completions as they would noise when typing (html)', async () => {
		await updateExtensionsPath(null);
		const testCases: [string, number, number][] = [
			['<div>abc</div>', 0, 8],
			['<div>Abc</div>', 0, 8],
			['<div>abc12</div>', 0, 10],
			['<div>abc.</div>', 0, 9],
			['<div>(div)</div>', 0, 10],
			['<div>($db)</div>', 0, 10],
			['<div>($db.)</div>', 0, 11],
			['<div>ul::l</div>', 0, 10],
			['<div', 0, 4],
			['<div>ul:</div>', 0, 8] // https://github.com/Microsoft/vscode/issues/49376
		];
		testCases.forEach(([content, positionLine, positionChar]) => {
			const document = TextDocument.create('test://test/test.html', 'html', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'html', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(!completionList, true, (completionList && completionList.items.length > 0) ? completionList.items[0].label + ' should not show up' : 'All good');
		});
	});

	it('should provide completions for pascal-case tags when typing (jsx)', async () => {
		await updateExtensionsPath(null);
		const testCases: [string, number, number, string, string][] = [
			['<div>Router</div>', 0, 11, 'Router', '<Router>|</Router>', ],
			['<div>MyAwesomeComponent</div>', 0, 23, 'MyAwesomeComponent', '<MyAwesomeComponent>|</MyAwesomeComponent>'],
		];
		testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedExpansion]) => {
			const document = TextDocument.create('test://test/test.jsx', 'jsx', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'jsx', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items[0].label, expectedAbbr);
			assert.strictEqual(completionList.items[0].documentation, expectedExpansion);
		});
	})

	it('should not provide completions as they would noise when typing (css)', async () => {
		await updateExtensionsPath(null);
		const testCases: [string, number, number][] = [
			['background', 0, 10],
			['font-family', 0, 11],
			['width', 0, 5],
			['background:u', 0, 12],
			['text-overflo', 0, 12] // Partial match with property name
		];
		testCases.forEach(([content, positionLine, positionChar]) => {
			const document = TextDocument.create('test://test/test.css', 'css', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'css', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(!completionList || !completionList.items || !completionList.items.length, true, (completionList && completionList.items.length > 0) ? completionList.items[0].label + ' should not show up' : 'All good');
		});
	});

	it('should provide completions for loremn with n words', async () => {
		await updateExtensionsPath(null);
		const document = TextDocument.create('test://test/test.html', 'html', 0, '.item>lorem10');
		const position = Position.create(0, 13);
		const completionList = doComplete(document, position, 'html', {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: false,
			syntaxProfiles: {},
			variables: {}
		});
		const expandedText = completionList.items[0].documentation;
		if (typeof expandedText !== 'string') {
			return;
		}
		const matches = expandedText.match(/<div class="item">(.*)<\/div>/);

		assert.strictEqual(completionList.items[0].label, '.item>lorem10');
		assert.strictEqual(matches != null, true);
		assert.strictEqual(matches[1].split(' ').length, 10);
		assert.strictEqual(matches[1].startsWith('Lorem'), true);
	});

	it('should provide completions for lorem*n with n lines', async () => {
		await updateExtensionsPath(null);
		const document = TextDocument.create('test://test/test.html', 'html', 0, 'lorem*3');
		const position = Position.create(0, 12);
		const completionList = doComplete(document, position, 'html', {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: false,
			syntaxProfiles: {},
			variables: {}
		});
		const expandedText = completionList.items[0].documentation;
		if (typeof expandedText !== 'string') {
			return;
		}

		assert.strictEqual(completionList.items[0].label, 'lorem*3');
		assert.strictEqual(expandedText.split('\n').length, 3);
		assert.strictEqual(expandedText.startsWith('Lorem'), true);
	});

	it('should provide completions for lorem*2 with 2 lines', async () => {
		// https://github.com/microsoft/vscode/issues/52345
		await updateExtensionsPath(null);
		const document = TextDocument.create('test://test/test.html', 'html', 0, 'lorem*2');
		const position = Position.create(0, 12);
		const completionList = doComplete(document, position, 'html', {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: false,
			syntaxProfiles: {},
			variables: {}
		});
		const expandedText = completionList.items[0].documentation;
		if (typeof expandedText !== 'string') {
			return;
		}

		assert.strictEqual(completionList.items[0].label, 'lorem*2');
		assert.strictEqual(expandedText.split('\n').length, 2);
		assert.strictEqual(expandedText.startsWith('Lorem'), true);
	});

	it.skip('should provide completions using vendor prefixes', async () => {
		await updateExtensionsPath(extensionsPath);
		const testCases: [string, number, number, string, string, string][] = [
			['brs', 0, 3, 'border-radius: ;', 'border-radius: |;', 'brs'],
			['brs5', 0, 4, 'border-radius: 5px;', 'border-radius: 5px;', 'brs5'],
			['-brs', 0, 4, 'border-radius: ;', '-webkit-border-radius: |;\n-moz-border-radius: |;\nborder-radius: |;', '-brs'],
			['-mo-brs', 0, 7, 'border-radius: ;', '-moz-border-radius: |;\n-o-border-radius: |;\nborder-radius: |;', '-mo-brs'],
			['-om-brs', 0, 7, 'border-radius: ;', '-o-border-radius: |;\n-moz-border-radius: |;\nborder-radius: |;', '-om-brs'],
			['-brs10', 0, 6, 'border-radius: 10px;', '-webkit-border-radius: 10px;\n-moz-border-radius: 10px;\nborder-radius: 10px;', '-brs10'],
			['-bdts', 0, 5, 'border-top-style: ;', '-webkit-border-top-style: |;\n-moz-border-top-style: |;\n-ms-border-top-style: |;\n-o-border-top-style: |;\nborder-top-style: |;', '-bdts'],
			['-p', 0, 2, 'padding: ;', '-webkit-padding: |;\n-moz-padding: |;\n-ms-padding: |;\n-o-padding: |;\npadding: |;', '-p'],
			['-p10-20p', 0, 8, 'padding: 10px 20%;', '-webkit-padding: 10px 20%;\n-moz-padding: 10px 20%;\n-ms-padding: 10px 20%;\n-o-padding: 10px 20%;\npadding: 10px 20%;', '-p10-20p'],
		];
		testCases.forEach(([content, positionLine, positionChar, expectedLabel, expectedExpansion, expectedFilterText]) => {
			const document = TextDocument.create('test://test/test.css', 'css', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'css', {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items[0].label, expectedLabel);
			assert.strictEqual(completionList.items[0].documentation, expectedExpansion);
			assert.strictEqual(completionList.items[0].filterText, expectedFilterText);
		});
	});

	it.skip('should provide completions using vendor prefixes with custom preferences', async () => {
		await updateExtensionsPath(extensionsPath);
		const testCases: [string, number, number, string, string, string][] = [
			['brs', 0, 3, 'border-radius: ;', 'border-radius: |;', 'brs'],
			['brs5', 0, 4, 'border-radius: 5px;', 'border-radius: 5px;', 'brs5'],
			['-brs', 0, 4, 'border-radius: ;', '-webkit-border-radius: |;\nborder-radius: |;', '-brs'],
			['-mo-brs', 0, 7, 'border-radius: ;', '-moz-border-radius: |;\n-o-border-radius: |;\nborder-radius: |;', '-mo-brs'],
			['-bdts', 0, 5, 'border-top-style: ;', '-o-border-top-style: |;\nborder-top-style: |;', '-bdts'],
			['-bdi', 0, 4, 'border-image: url();', '-webkit-border-image: url(|);\n-moz-border-image: url(|);\n-ms-border-image: url(|);\n-o-border-image: url(|);\nborder-image: url(|);', '-bdi']
		];
		testCases.forEach(([content, positionLine, positionChar, expectedLabel, expectedExpansion, expectedFilterText]) => {
			const document = TextDocument.create('test://test/test.css', 'css', 0, content);
			const position = Position.create(positionLine, positionChar);
			const completionList = doComplete(document, position, 'css', {
				preferences: {
					'css.webkitProperties': 'foo, bar,padding , border-radius',
					'css.mozProperties': '',
					'css.oProperties': 'border-top-style',
				},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			});

			assert.strictEqual(completionList.items[0].label, expectedLabel);
			assert.strictEqual(completionList.items[0].documentation, expectedExpansion);
			assert.strictEqual(completionList.items[0].filterText, expectedFilterText);
		});
	});

	it.skip('should expand with multiple vendor prefixes', async () => {
		await updateExtensionsPath(null);
		assert.strictEqual(expandAbbreviation('brs', getExpandOptions('css', {})), 'border-radius: ${0};');
		assert.strictEqual(expandAbbreviation('brs5', getExpandOptions('css', {})), 'border-radius: 5px;');
		assert.strictEqual(expandAbbreviation('brs10px', getExpandOptions('css', {})), 'border-radius: 10px;');
		assert.strictEqual(expandAbbreviation('-brs', getExpandOptions('css', {})), '-webkit-border-radius: ${0};\n-moz-border-radius: ${0};\nborder-radius: ${0};');
		assert.strictEqual(expandAbbreviation('-brs10', getExpandOptions('css', {})), '-webkit-border-radius: 10px;\n-moz-border-radius: 10px;\nborder-radius: 10px;');
		assert.strictEqual(expandAbbreviation('-bdts', getExpandOptions('css', {})), '-webkit-border-top-style: ${0};\n-moz-border-top-style: ${0};\n-ms-border-top-style: ${0};\n-o-border-top-style: ${0};\nborder-top-style: ${0};');
		assert.strictEqual(expandAbbreviation('-bdts2px', getExpandOptions('css', {})), '-webkit-border-top-style: 2px;\n-moz-border-top-style: 2px;\n-ms-border-top-style: 2px;\n-o-border-top-style: 2px;\nborder-top-style: 2px;');
		assert.strictEqual(expandAbbreviation('-p10-20', getExpandOptions('css', {})), '-webkit-padding: 10px 20px;\n-moz-padding: 10px 20px;\n-ms-padding: 10px 20px;\n-o-padding: 10px 20px;\npadding: 10px 20px;');
		assert.strictEqual(expandAbbreviation('-p10p20', getExpandOptions('css', {})), '-webkit-padding: 10% 20px;\n-moz-padding: 10% 20px;\n-ms-padding: 10% 20px;\n-o-padding: 10% 20px;\npadding: 10% 20px;');
		assert.strictEqual(expandAbbreviation('-mo-brs', getExpandOptions('css', {})), '-moz-border-radius: ${0};\n-o-border-radius: ${0};\nborder-radius: ${0};');
	});

	it.skip('should expand with default vendor prefixes in properties', async () => {
		await updateExtensionsPath(null);
		assert.strictEqual(expandAbbreviation('-p', getExpandOptions('css', { preferences: { 'css.webkitProperties': 'foo, bar, padding' } })), '-webkit-padding: ${0};\npadding: ${0};');
		assert.strictEqual(expandAbbreviation('-p', getExpandOptions('css', { preferences: { 'css.oProperties': 'padding', 'css.webkitProperties': 'padding' } })), '-webkit-padding: ${0};\n-o-padding: ${0};\npadding: ${0};');
		assert.strictEqual(expandAbbreviation('-brs', getExpandOptions('css', { preferences: { 'css.oProperties': 'padding', 'css.webkitProperties': 'padding', 'css.mozProperties': '', 'css.msProperties': '' } })), '-webkit-border-radius: ${0};\n-moz-border-radius: ${0};\n-ms-border-radius: ${0};\n-o-border-radius: ${0};\nborder-radius: ${0};');
		assert.strictEqual(expandAbbreviation('-o-p', getExpandOptions('css', { preferences: { 'css.oProperties': 'padding', 'css.webkitProperties': 'padding' } })), '-o-padding: ${0};\npadding: ${0};');
	});

	it('should not provide completions for excludedLanguages', async () => {
		await updateExtensionsPath(null);
		const document = TextDocument.create('test://test/test.html', 'html', 0, 'ul>li');
		const position = Position.create(0, 5);
		const completionList = doComplete(document, position, 'html', {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: false,
			syntaxProfiles: {},
			variables: {},
			excludeLanguages: ['html']
		});

		assert.strictEqual(!completionList, true);
	});

	it('should provide completions with kind snippet when showSuggestionsAsSnippets is enabled', async () => {
		await updateExtensionsPath(null);
		const document = TextDocument.create('test://test/test.html', 'html', 0, 'ul>li');
		const position = Position.create(0, 5);
		const completionList = doComplete(document, position, 'html', {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: false,
			syntaxProfiles: {},
			variables: {},
			showSuggestionsAsSnippets: true
		});

		assert.strictEqual(completionList.items[0].kind, CompletionItemKind.Snippet);
	});

	it('should not provide double completions for commonly used tags that are also snippets', async () => {
		await updateExtensionsPath(null);
		const document = TextDocument.create('test://test/test.html', 'html', 0, 'abb');
		const position = Position.create(0, 3);
		const completionList = doComplete(document, position, 'html', {
			preferences: {},
			showExpandedAbbreviation: 'always',
			showAbbreviationSuggestions: true,
			syntaxProfiles: {},
			variables: {},
			excludeLanguages: []
		});

		assert.strictEqual(completionList.items.length, 1);
		assert.strictEqual(completionList.items[0].label, 'abbr');
	});
})
