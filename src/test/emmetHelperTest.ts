import { TextDocument, Position, CompletionItemKind } from 'vscode-languageserver-types'
import { isAbbreviationValid, extractAbbreviation, extractAbbreviationFromText, getExpandOptions, emmetSnippetField, updateExtensionsPath, doComplete, expandAbbreviation } from '../emmetHelper';
import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';

const extensionsPath = path.join(path.normalize(path.join(__dirname, '../..')), 'testData', 'custom-snippets-profile');
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

describe('Validate Abbreviations', () => {
	it('should return true for valid abbreviations', () => {
		const htmlAbbreviations = ['ul>li', 'ul', 'h1', 'ul>li*3', '(ul>li)+div', '.hello', '!', '#hello', '.item[id=ok]'];
		htmlAbbreviations.forEach(abbr => {
			assert(isAbbreviationValid('html', abbr));
		});
		htmlAbbreviations.forEach(abbr => {
			assert(isAbbreviationValid('haml', abbr));
		});
	});
	it('should return false for invalid abbreviations', () => {
		const htmlAbbreviations = ['!ul!', '(hello)', 'super(hello)', 'console.log(hello)', '()', '[]'];
		const cssAbbreviations = ['123'];
		htmlAbbreviations.forEach(abbr => {
			assert(!isAbbreviationValid('html', abbr));
		});
		htmlAbbreviations.forEach(abbr => {
			assert(!isAbbreviationValid('haml', abbr));
		});
		cssAbbreviations.forEach(abbr => {
			assert(!isAbbreviationValid('css', abbr));
		});
		cssAbbreviations.forEach(abbr => {
			assert(!isAbbreviationValid('scss', abbr));
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

			assert.equal(expectedAbbr, abbreviation);
			assert.equal(expectedRangeStartLine, abbreviationRange.start.line);
			assert.equal(expectedRangeStartChar, abbreviationRange.start.character);
			assert.equal(expectedRangeEndLine, abbreviationRange.end.line);
			assert.equal(expectedRangeEndChar, abbreviationRange.end.character);
			assert.equal(filter, expectedFilter);
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
			const { abbreviationRange, abbreviation, filter } = extractAbbreviation(document, position, { syntax: 'css', lookAhead: false });

			assert.equal(expectedAbbr, abbreviation);
			assert.equal(expectedRangeStartLine, abbreviationRange.start.line);
			assert.equal(expectedRangeStartChar, abbreviationRange.start.character);
			assert.equal(expectedRangeEndLine, abbreviationRange.end.line);
			assert.equal(expectedRangeEndChar, abbreviationRange.end.character);
			assert.equal(filter, expectedFilter);
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

			assert.equal(expectedAbbr, abbreviation);
			assert.equal(filter, expectedFilter);

		});
	});
});

describe('Test Basic Expand Options', () => {
	it('should check for basic expand options', () => {
		const syntax = 'anythingreally';
		let expandOptions = getExpandOptions(syntax);

		assert.equal(expandOptions.field, emmetSnippetField)
		assert.equal(expandOptions.syntax, syntax);
		assert.equal(Object.keys(expandOptions.addons).length, 0);
	});
});

describe('Test addons in Expand Options', () => {
	it('should add jsx as addon for jsx syntax', () => {
		const syntax = 'jsx';
		let expandOptions = getExpandOptions(syntax);

		assert.equal(Object.keys(expandOptions.addons).length, 1);
		assert.equal(expandOptions.addons['jsx'], true);
	});

	it('should add bem as addon when bem filter is provided', () => {
		const syntax = 'anythingreally';
		let expandOptions = getExpandOptions(syntax, {}, 'bem');

		assert.equal(Object.keys(expandOptions.addons).length, 1);
		assert.equal(expandOptions.addons['bem']['element'], '__');
	});

	it('should add bem before jsx as addon when bem filter is provided', () => {
		const syntax = 'jsx';
		let expandOptions = getExpandOptions(syntax, {}, 'bem');

		assert.equal(Object.keys(expandOptions.addons).length, 2);
		assert.equal(Object.keys(expandOptions.addons)[0], 'bem');
		assert.equal(Object.keys(expandOptions.addons)[1], 'jsx');
		assert.equal(expandOptions.addons['bem']['element'], '__');
		assert.equal(expandOptions.addons['jsx'], true);
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

		assert.equal(profile['tag_case'], expandOptions.profile['tagCase']);
		assert.equal(profile['attr_case'], expandOptions.profile['attributeCase']);
		assert.equal(profile['attr_quotes'], expandOptions.profile['attributeQuotes']);
		assert.equal(profile['tag_nl'], expandOptions.profile['format']);
		assert.equal(profile['inline_break'], expandOptions.profile['inlineBreak']);
		assert.equal(profile['self_closing_tag'], expandOptions.profile['selfClosingStyle']);
	});

	it('should convert self_closing_style', () => {
		const testCases = [true, false, 'xhtml'];
		const expectedValue = ['xml', 'html', 'xhtml'];

		for (let i = 0; i < testCases.length; i++) {
			const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: { self_closing_tag: testCases[i] } } });
			assert.equal(expandOptions.profile['selfClosingStyle'], expectedValue[i]);
		}
	});

	it('should convert tag_nl', () => {
		const testCases = [true, false, 'decide'];
		const expectedValue = [true, false, true];

		for (let i = 0; i < testCases.length; i++) {
			const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: { tag_nl: testCases[i] } } });
			assert.equal(expandOptions.profile['format'], expectedValue[i]);
		}
	});

	it('shoud use output profile in new format as is', () => {
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
			assert.equal(expandOptions.profile[key], profile[key]);
		});
	});

	it('should use profile from settings that overrides the ones from extensionsPath', () => {
		return updateExtensionsPath(extensionsPath).then(() => {
			const profile = {
				tag_case: 'lower',
				attr_case: 'lower',
				attr_quotes: 'single',
				tag_nl: true,
				inline_break: 2,
				self_closing_tag: 'xhtml'
			}

			const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: profile } });
			assert.equal(expandOptions.profile['tagCase'], 'lower');
			assert.equal(profile['tag_case'], 'lower');
			return Promise.resolve();
		});
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
			assert.equal(expandOptions.variables[key], variables[key]);
		});
	});

	it('should use variables from extensionsPath', () => {
		updateExtensionsPath(extensionsPath).then(() => {
			const expandOptions = getExpandOptions('html', {});
			assert.equal(expandOptions.variables['lang'], 'fr');
		});
	});

	it('should use given variables that override ones from extensionsPath', () => {
		updateExtensionsPath(extensionsPath).then(() => {
			const variables = {
				lang: 'en',
				charset: 'UTF-8'
			}

			const expandOptions = getExpandOptions('html', { variables });
			assert.equal(expandOptions.variables['lang'], variables['lang']);
		});
	});
});

describe('Test custom snippets', () => {
	it('should use custom snippets for given syntax from extensionsPath', () => {
		const customSnippetKey = 'ch';
		return updateExtensionsPath(null).then(() => {
			const expandOptionsWithoutCustomSnippets = getExpandOptions('css');
			assert(!expandOptionsWithoutCustomSnippets.snippets);

			// Use custom snippets from extensionsPath
			return updateExtensionsPath(extensionsPath).then(() => {
				let foundCustomSnippet = false;
				const expandOptionsWithCustomSnippets = getExpandOptions('css');
				expandOptionsWithCustomSnippets.snippets.all({ type: 'string' }).forEach(snippet => {
					if (snippet.key === customSnippetKey) {
						foundCustomSnippet = true;
					}
				});
				assert.equal(foundCustomSnippet, true);
				return Promise.resolve();
			});
		});
	});

	it('should use custom snippets inherited from base syntax from extensionsPath', () => {
		const customSnippetKey = 'ch';

		return updateExtensionsPath(null).then(() => {
			const expandOptionsWithoutCustomSnippets = getExpandOptions('scss');
			assert(!expandOptionsWithoutCustomSnippets.snippets);

			// Use custom snippets from extensionsPath
			return updateExtensionsPath(extensionsPath).then(() => {
				let foundCustomSnippet = false;
				let foundCustomSnippetInInhertitedSyntax = false;

				const expandOptionsWithCustomSnippets = getExpandOptions('css');
				const expandOptionsWithCustomSnippetsInhertedSytnax = getExpandOptions('scss');

				expandOptionsWithCustomSnippets.snippets.all({ type: 'string' }).forEach(snippet => {
					if (snippet.key === customSnippetKey) {
						foundCustomSnippet = true;
					}
				});

				expandOptionsWithCustomSnippetsInhertedSytnax.snippets.all({ type: 'string' }).forEach(snippet => {
					if (snippet.key === customSnippetKey) {
						foundCustomSnippetInInhertitedSyntax = true;
					}
				});

				assert.equal(foundCustomSnippet, true);
				assert.equal(foundCustomSnippetInInhertitedSyntax, true);

				return Promise.resolve();
			});
		});
	});

	it('should use custom snippets for given syntax in the absence of base syntax from extensionsPath', () => {
		const customSnippetKey = 'ch';
		return updateExtensionsPath(null).then(() => {
			const expandOptionsWithoutCustomSnippets = getExpandOptions('scss');
			assert(!expandOptionsWithoutCustomSnippets.snippets);

			// Use custom snippets from extensionsPath
			return updateExtensionsPath(path.join(path.normalize(path.join(__dirname, '../..')), 'testData', 'custom-snippets-without-inheritence')).then(() => {
				let foundCustomSnippet = false;
				const expandOptionsWithCustomSnippets = getExpandOptions('scss');
				expandOptionsWithCustomSnippets.snippets.all({ type: 'string' }).forEach(snippet => {
					if (snippet.key === customSnippetKey) {
						foundCustomSnippet = true;
					}
				});
				assert.equal(foundCustomSnippet, true);
				return Promise.resolve();
			});
		});
	});

	it('should throw error when snippets file from extensionsPath has invalid json', () => {
		// Use invalid snippets.json
		return updateExtensionsPath(path.join(path.normalize(path.join(__dirname, '../..')), 'testData', 'custom-snippets-invalid-json')).then(() => {
			assert.ok(false, 'updateExtensionsPath method should have failed for invalid json but it didnt');
			return Promise.resolve();
		}, (e) => {
			assert.ok(e);
			return Promise.resolve();
		});
	});

	it('should reset custom snippets when no extensionsPath is given', () => {
		const customSnippetKey = 'ch';
		return updateExtensionsPath(extensionsPath).then(() => {
			let foundCustomSnippet = false;
			getExpandOptions('scss').snippets.all({ type: 'string' }).forEach(snippet => {
				if (snippet.key === customSnippetKey) {
					foundCustomSnippet = true;
				}
			});
			assert.equal(foundCustomSnippet, true);

			// Use invalid snippets.json
			return updateExtensionsPath(null).then(() => {
				assert.ok(!getExpandOptions('scss').snippets, 'There should be no custom snippets as extensionPath was not given');
				return Promise.resolve();
			}, (e) => {
				assert.ok(!e, 'When extensionsPath is not given, there shouldnt be any error.');
			});
		});
	});
});

describe('Test emmet preferences', () => {
	it('should use stylesheet preferences', () => {
		assert.equal(expandAbbreviation('m10', getExpandOptions('css', { preferences: { 'css.propertyEnd': ';;' } })), 'margin: 10px;;');
		assert.equal(expandAbbreviation('m10', getExpandOptions('scss', { preferences: { 'scss.valueSeparator': '::' } })), 'margin::10px;');
		assert.equal(expandAbbreviation('m10', getExpandOptions('less', { preferences: { 'css.intUnit': 'pt' } })), 'margin: 10pt;');
		assert.equal(expandAbbreviation('m10.2', getExpandOptions('css', { preferences: { 'css.floatUnit': 'ex' } })), 'margin: 10.2ex;');
		assert.equal(expandAbbreviation('m10r', getExpandOptions('css', { preferences: { 'css.unitAliases': 'e:em, p:%,r: /rem' } })), 'margin: 10 /rem;');
		assert.equal(expandAbbreviation('m10p', getExpandOptions('css', { preferences: { 'css.unitAliases': 'e:em, p:%,r: /rem' } })), 'margin: 10%;');
	});
});

describe('Test filters (bem and comment)', () => {

	it('should use filters from expandOptions', () => {
		return updateExtensionsPath(null).then(() => {
			assert.equal(expandAbbreviation(bemFilterExample, getExpandOptions('html', {}, 'bem')), expectedBemFilterOutput);
			assert.equal(expandAbbreviation(commentFilterExample, getExpandOptions('html', {}, 'c')), expectedCommentFilterOutput);
			assert.equal(expandAbbreviation(bemCommentFilterExample, getExpandOptions('html', {}, 'bem,c')), expectedBemCommentFilterOutput);
			return Promise.resolve();
		});
	});

	it('should use filters from syntaxProfiles', () => {
		return updateExtensionsPath(null).then(() => {
			assert.equal(expandAbbreviation(bemFilterExample, getExpandOptions('html', {
				syntaxProfiles: {
					html: {
						filters: 'html, bem'
					}
				}
			})), expectedBemFilterOutput);
			assert.equal(expandAbbreviation(commentFilterExample, getExpandOptions('html', {
				syntaxProfiles: {
					html: {
						filters: 'html, c'
					}
				}
			})), expectedCommentFilterOutput);
			return Promise.resolve();
		});
	});
});

describe('Test completions', () => {
	it('should provide multiple common tags completions in html', () => {
		return updateExtensionsPath(null).then(() => {
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
			assert.ok(expectedItems.every(x => !!completionList.items.find(y => y.label === x)), 'All common tags starting with d not found');
			return Promise.resolve();
		});
	});

	it('should provide multiple snippet suggestions in html', () => {
		return updateExtensionsPath(null).then(() => {
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
			assert.ok(expectedItems.every(x => !!completionList.items.find(y => y.label === x)), 'All snippet suggestions for a: not found');
			return Promise.resolve();
		});
	});

	it('should not provide any suggestions in html for class names or id', () => {
		return updateExtensionsPath(null).then(() => {
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
			return Promise.resolve();
		});
	});

	it('should provide multiple snippet suggestions in html for nested abbreviations', () => {
		return updateExtensionsPath(null).then(() => {
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
				assert.ok(expectedItems.every(x => !!completionList.items.find(y => y.label === x)), 'All snippet suggestions for a: not found');
			});
			
			return Promise.resolve();
		});
	});


	it('should provide completions html', () => {
		return updateExtensionsPath(null).then(() => {
			let bemFilterExampleWithInlineFilter = bemFilterExample + '|bem';
			let commentFilterExampleWithInlineFilter = commentFilterExample + '|c';
			let bemCommentFilterExampleWithInlineFilter = bemCommentFilterExample + '|bem|c';
			let commentBemFilterExampleWithInlineFilter = bemCommentFilterExample + '|c|bem';

			const testCases: [string, number, number, string, string, string][] = [
				['<div>ul>li*3</div>', 0, 7, 'ul', '<ul>|</ul>', '<ul>\${0}</ul>'], // One of the commonly used tags
				['<div>UL</div>', 0, 7, 'UL', '<UL>|</UL>', '<UL>\${0}</UL>'], // One of the commonly used tags with upper case
				['<div>ul>li*3</div>', 0, 10, 'ul>li', '<ul>\n\t<li>|</li>\n</ul>', '<ul>\n\t<li>\${0}</li>\n</ul>'], // Valid abbreviation
				['<div>(ul>li)*3</div>', 0, 14, '(ul>li)*3', '<ul>\n\t<li>|</li>\n</ul>\n<ul>\n\t<li>|</li>\n</ul>\n<ul>\n\t<li>|</li>\n</ul>', '<ul>\n\t<li>\${1}</li>\n</ul>\n<ul>\n\t<li>\${2}</li>\n</ul>\n<ul>\n\t<li>\${0}</li>\n</ul>'], //Valid abbreviation with grouping
				['<div>custom-tag</div>', 0, 15, 'custom-tag', '<custom-tag>|</custom-tag>', '<custom-tag>\${0}</custom-tag>'], // custom tag with -
				['<div>custom:tag</div>', 0, 15, 'custom:tag', '<custom:tag>|</custom:tag>', '<custom:tag>\${0}</custom:tag>'], // custom tag with -
				['<div>sp</div>', 0, 7, 'span', '<span>|</span>', '<span>\${0}</span>'], // Prefix of a common tag
				['<div>SP</div>', 0, 7, 'SPan', '<SPan>|</SPan>', '<SPan>\${0}</SPan>'], // Prefix of a common tag in upper case
				['<div>u:l:l</div>', 0, 10, 'u:l:l', '<u:l:l>|</u:l:l>', '<u:l:l>\${0}</u:l:l>'], // Word with : is valid
				['<div>u-l-z</div>', 0, 10, 'u-l-z', '<u-l-z>|</u-l-z>', '<u-l-z>\${0}</u-l-z>'], // Word with - is valid
				['<div>div.foo_</div>', 0, 13, 'div.foo_', '<div class="foo_">|</div>', '<div class="foo_">\${0}</div>'], // Word with _ is valid
				[bemFilterExampleWithInlineFilter, 0, bemFilterExampleWithInlineFilter.length, bemFilterExampleWithInlineFilter, expectedBemFilterOutputDocs, expectedBemFilterOutput],
				[commentFilterExampleWithInlineFilter, 0, commentFilterExampleWithInlineFilter.length, commentFilterExampleWithInlineFilter, expectedCommentFilterOutputDocs, expectedCommentFilterOutput],
				[bemCommentFilterExampleWithInlineFilter, 0, bemCommentFilterExampleWithInlineFilter.length, bemCommentFilterExampleWithInlineFilter, expectedBemCommentFilterOutputDocs, expectedBemCommentFilterOutput],
				[commentBemFilterExampleWithInlineFilter, 0, commentBemFilterExampleWithInlineFilter.length, commentBemFilterExampleWithInlineFilter, expectedBemCommentFilterOutputDocs, expectedBemCommentFilterOutput],
				['li*2+link:css', 0, 13, 'li*2+link:css', '<li>|</li>\n<li>|</li>\n<link rel="stylesheet" href="style.css">', '<li>\${1}</li>\n<li>\${2}</li>\n<link rel="stylesheet" href="\${4:style}.css">'], // No last tab stop gets added as max tab stop is of a placeholder
				['li*10', 0, 5, 'li*10', '<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>\n<li>|</li>',
					'<li>\${1}</li>\n<li>\${2}</li>\n<li>\${3}</li>\n<li>\${4}</li>\n<li>\${5}</li>\n<li>\${6}</li>\n<li>\${7}</li>\n<li>\${8}</li>\n<li>\${9}</li>\n<li>\${0}</li>'], // tabstop 10 es greater than 9, should be replaced by 0
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

				assert.equal(completionList.items[0].label, expectedAbbr);
				assert.equal(completionList.items[0].documentation, expectedExpansionDocs);
				assert.equal(completionList.items[0].textEdit.newText, expectedExpansion);
			});
			return Promise.resolve();

		});
	});

	it('should provide completions css', () => {
		return updateExtensionsPath(null).then(() => {

			const testCases: [string, number, number, string][] = [
				['trf', 0, 3, 'transform: ;'], // Simple case
				['trf:rx', 0, 6, 'transform: rotateX(angle);'], // using : to delimit property name and value, case insensitve 
				['trfrx', 0, 5, 'transform: rotateX(angle);'], // no delimiting between property name and value, case insensitive
			];

			testCases.forEach(([abbreviation, positionLine, positionChar, expected]) => {
				const document = TextDocument.create('test://test/test.css', 'css', 0, abbreviation);
				const position = Position.create(positionLine, positionChar);
				const completionList = doComplete(document, position, 'css', {
					preferences: {},
					showExpandedAbbreviation: 'always',
					showAbbreviationSuggestions: false,
					syntaxProfiles: {},
					variables: {}
				});

				assert.equal(completionList.items[0].label, expected);
				assert.equal(completionList.items[0].filterText, abbreviation);
			});
			return Promise.resolve();

		});
	});

	it('should not provide completions for property names css', () => {
		return updateExtensionsPath(null).then(() => {

			const testCases: [string, number, number][] = [
				['width', 0, 5],
				['font-family', 0, 11]
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

				assert.equal(!completionList, true);
			});
			return Promise.resolve();

		});
	});

	it('should provide empty incomplete completion list for abbreviations that just have the vendor prefix', () => {
		return updateExtensionsPath(null).then(() => {

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

				assert.equal(completionList.items.length, 0, completionList.items.length ? completionList.items[0].label : 'all good');
				assert.equal(completionList.isIncomplete, true);
			});
			return Promise.resolve();

		});
	})

	it('should provide completions for text that are prefix for snippets, ensure $ doesnt get escaped', () => {
		return updateExtensionsPath(null).then(() => {
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

				assert.equal(completionList.items.find(x => x.label === 'link').documentation, '<link rel="stylesheet" href="|">');
				assert.equal(completionList.items.find(x => x.label === 'link').textEdit.newText, '<link rel="stylesheet" href="${0}">');
				assert.equal(completionList.items.find(x => x.label === 'link:css').documentation, '<link rel="stylesheet" href="style.css">');
				assert.equal(completionList.items.find(x => x.label === 'link:css').textEdit.newText, '<link rel="stylesheet" href="${2:style}.css">');

			});
			return Promise.resolve();

		});
	});

	it('should provide completions with escaped $ in scss', () => {
		return updateExtensionsPath(null).then(() => {
			const testCases: [string, number, number][] = [
				['bim$hello', 0, 9]
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

				assert.equal(completionList.items.find(x => x.label === 'background-image: $hello;').documentation, 'background-image: $hello;');
				assert.equal(completionList.items.find(x => x.label === 'background-image: $hello;').textEdit.newText, 'background-image: \\$hello;');

			});
			return Promise.resolve();

		});
	});

	it('should provide completions with escaped $ in html', () => {
		return updateExtensionsPath(null).then(() => {
			const testCases: [string, number, number, string, string][] = [
				['span{\\$5}', 0, 9, '<span>\\$5</span>', '<span>\\$5</span>'],
				['span{$hello}', 0, 12, '<span>\$hello</span>', '<span>\\$hello</span>']
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

				assert.equal(completionList.items.find(x => x.label === content).documentation, expectedDoc);
				assert.equal(completionList.items.find(x => x.label === content).textEdit.newText, expectedSnippetText);

			});
			return Promise.resolve();

		});
	});

	it('should provide completions using custom snippets html', () => {
		return updateExtensionsPath(extensionsPath).then(() => {
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

				assert.equal(completionList.items[0].label, expectedAbbr);
				assert.equal(completionList.items[0].documentation, expectedExpansion);
			});
			return Promise.resolve();

		});
	});

	it('should provide completions using custom snippets css and unit aliases', () => {
		return updateExtensionsPath(extensionsPath).then(() => {
			const testCases: [string, number, number, string, string, string][] = [
				['hel', 0, 3, 'hello', 'margin: 10px;', undefined], // Partial match with custom snippet
				['hello', 0, 5, 'hello', 'margin: 10px;', undefined], // Full match with custom snippet
				['m10p', 0, 4, 'margin: 10%;', 'margin: 10%;', 'm10p'], // p is a unit alias with default value. FilterText should contain unit alias
				['m10e', 0, 4, 'margin: 10hi;', 'margin: 10hi;', 'm10e'], // e is a unit alias with custom value. FilterText should contain unit alias
				['m10h', 0, 4, 'margin: 10hello;', 'margin: 10hello;', 'm10h'], // h is a custom unit alias with custom value. FilterText should contain unit alias
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

				assert.equal(completionList.items[0].label, expectedAbbr);
				assert.equal(completionList.items[0].documentation, expectedExpansion);
				assert.equal(completionList.items[0].filterText, expectedFilterText);
			});
			return Promise.resolve();
		});
	});

	it('should provide both custom and default snippet completion when partial match with custom snippet', () => {
		return updateExtensionsPath(extensionsPath).then(() => {
			const expandOptions = {
				preferences: {},
				showExpandedAbbreviation: 'always',
				showAbbreviationSuggestions: false,
				syntaxProfiles: {},
				variables: {}
			};

			const completionList1 = doComplete(TextDocument.create('test://test/test.css', 'css', 0, 'm'), Position.create(0, 1), 'css', expandOptions);
			assert.equal(completionList1.items.findIndex(x => x.label === 'margin: ;') > -1, true);
			assert.equal(completionList1.items.findIndex(x => x.label === 'mrgstart') > -1, true);

			const completionList2 = doComplete(TextDocument.create('test://test/test.css', 'css', 0, 'mr'), Position.create(0, 2), 'css', expandOptions);
			assert.equal(completionList2.items.findIndex(x => x.label === 'margin-right: ;') > -1, true);
			assert.equal(completionList2.items.findIndex(x => x.label === 'mrgstart') > -1, true);

			const completionList3 = doComplete(TextDocument.create('test://test/test.css', 'css', 0, 'mrg'), Position.create(0, 3), 'css', expandOptions);
			assert.equal(completionList3.items.findIndex(x => x.label === 'margin-right: ;') > -1, true);
			assert.equal(completionList3.items.findIndex(x => x.label === 'mrgstart') > -1, true);

			return Promise.resolve();
		});
	});

	it('should not provide completions as they would noise when typing (html)', () => {
		return updateExtensionsPath(null).then(() => {
			const testCases: [string, number, number][] = [
				['<div>abc</div>', 0, 8], // Simple word
				['<div>Abc</div>', 0, 8], // Simple word with mixed casing
				['<div>abc12</div>', 0, 10], // Simple word with numbers
				['<div>abc.</div>', 0, 9], // Word ending with period
				['<div>(div)</div>', 0, 10], // Word inside brackets
				['<div>($db)</div>', 0, 10], // Word with symbols inside brackets
				['<div>($db.)</div>', 0, 11], // Word with symbols inside brackets
				['<div>ul::l</div>', 0, 10], // Word with : is valid, but not consecutive
				['<div', 0, 4] // Its an open tag
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

				assert.equal(!completionList, true, (completionList && completionList.items.length > 0) ? completionList.items[0].label + ' shouldnt show up' : 'All good');
			});
			return Promise.resolve();

		});
	});

	it('should not provide completions as they would noise when typing (css)', () => {
		return updateExtensionsPath(null).then(() => {
			const testCases: [string, number, number][] = [
				['background', 0, 10],
				['background:u', 0, 12]

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

				assert.equal(!completionList, true, (completionList && completionList.items.length > 0) ? completionList.items[0].label + ' shouldnt show up' : 'All good');
			});
			return Promise.resolve();

		});
	});

	it('should provide completions for lorem', () => {
		return updateExtensionsPath(null).then(() => {


			const document = TextDocument.create('test://test/test.html', 'html', 0, 'lorem10.item');
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
			let matches = expandedText.match(/<div class="item">(.*)<\/div>/);

			assert.equal(completionList.items[0].label, 'lorem10.item');
			assert.equal(matches != null, true);
			assert.equal(matches[1].split(' ').length, 10);
			assert.equal(matches[1].startsWith('Lorem'), true);

			return Promise.resolve();
		});
	});

	it('should provide completions using vendor prefixes', () => {
		return updateExtensionsPath(extensionsPath).then(() => {
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

				assert.equal(completionList.items[0].label, expectedLabel);
				assert.equal(completionList.items[0].documentation, expectedExpansion);
				assert.equal(completionList.items[0].filterText, expectedFilterText);
			});
			return Promise.resolve();
		});
	});
	it('should provide completions using vendor prefixes with custom preferences', () => {
		return updateExtensionsPath(extensionsPath).then(() => {
			const testCases: [string, number, number, string, string, string][] = [

				['brs', 0, 3, 'border-radius: ;', 'border-radius: |;', 'brs'],
				['brs5', 0, 4, 'border-radius: 5px;', 'border-radius: 5px;', 'brs5'],

				['-brs', 0, 4, 'border-radius: ;', '-webkit-border-radius: |;\nborder-radius: |;', '-brs'],		// Overriden moz prefix
				['-mo-brs', 0, 7, 'border-radius: ;', '-moz-border-radius: |;\n-o-border-radius: |;\nborder-radius: |;', '-mo-brs'], // "-mo-" overrides default behaviour
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

				assert.equal(completionList.items[0].label, expectedLabel);
				assert.equal(completionList.items[0].documentation, expectedExpansion);
				assert.equal(completionList.items[0].filterText, expectedFilterText);
			});
			return Promise.resolve();
		});
	});


	it('should expand with multiple vendor prefixes', () => {
		return updateExtensionsPath(null).then(() => {
			assert.equal(expandAbbreviation('brs', getExpandOptions('css', {})), 'border-radius: ${0};');
			assert.equal(expandAbbreviation('brs5', getExpandOptions('css', {})), 'border-radius: 5px;');
			assert.equal(expandAbbreviation('brs10px', getExpandOptions('css', {})), 'border-radius: 10px;');
			assert.equal(expandAbbreviation('-brs', getExpandOptions('css', {})), '-webkit-border-radius: ${0};\n-moz-border-radius: ${0};\nborder-radius: ${0};');
			assert.equal(expandAbbreviation('-brs10', getExpandOptions('css', {})), '-webkit-border-radius: 10px;\n-moz-border-radius: 10px;\nborder-radius: 10px;');
			assert.equal(expandAbbreviation('-bdts', getExpandOptions('css', {})), '-webkit-border-top-style: ${0};\n-moz-border-top-style: ${0};\n-ms-border-top-style: ${0};\n-o-border-top-style: ${0};\nborder-top-style: ${0};');
			assert.equal(expandAbbreviation('-bdts2px', getExpandOptions('css', {})), '-webkit-border-top-style: 2px;\n-moz-border-top-style: 2px;\n-ms-border-top-style: 2px;\n-o-border-top-style: 2px;\nborder-top-style: 2px;');
			assert.equal(expandAbbreviation('-p10-20', getExpandOptions('css', {})), '-webkit-padding: 10px 20px;\n-moz-padding: 10px 20px;\n-ms-padding: 10px 20px;\n-o-padding: 10px 20px;\npadding: 10px 20px;');
			assert.equal(expandAbbreviation('-p10p20', getExpandOptions('css', {})), '-webkit-padding: 10% 20px;\n-moz-padding: 10% 20px;\n-ms-padding: 10% 20px;\n-o-padding: 10% 20px;\npadding: 10% 20px;');
			assert.equal(expandAbbreviation('-mo-brs', getExpandOptions('css', {})), '-moz-border-radius: ${0};\n-o-border-radius: ${0};\nborder-radius: ${0};');

			return Promise.resolve();
		});
	});


	it('should expand with default vendor prefixes in properties', () => {
		return updateExtensionsPath(null).then(() => {
			assert.equal(expandAbbreviation('-p', getExpandOptions('css', { preferences: { 'css.webkitProperties': 'foo, bar, padding' } })), '-webkit-padding: ${0};\npadding: ${0};');
			assert.equal(expandAbbreviation('-p', getExpandOptions('css', { preferences: { 'css.oProperties': 'padding', 'css.webkitProperties': 'padding' } })), '-webkit-padding: ${0};\n-o-padding: ${0};\npadding: ${0};');
			assert.equal(expandAbbreviation('-brs', getExpandOptions('css', { preferences: { 'css.oProperties': 'padding', 'css.webkitProperties': 'padding', 'css.mozProperties': '', 'css.msProperties': '' } })), '-webkit-border-radius: ${0};\n-moz-border-radius: ${0};\n-ms-border-radius: ${0};\n-o-border-radius: ${0};\nborder-radius: ${0};');
			assert.equal(expandAbbreviation('-o-p', getExpandOptions('css', { preferences: { 'css.oProperties': 'padding', 'css.webkitProperties': 'padding' } })), '-o-padding: ${0};\npadding: ${0};');

			return Promise.resolve();
		});
	});

	it('should not provide completions for exlcudedLanguages', () => {
		return updateExtensionsPath(null).then(() => {
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
			assert.equal(!completionList, true);
		});
	});

	it('should provide completions with kind snippet when showSuggestionsAsSnippets is enabled', () => {
		return updateExtensionsPath(null).then(() => {
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
			assert.equal(completionList.items[0].kind, CompletionItemKind.Snippet);
		});
	});
})