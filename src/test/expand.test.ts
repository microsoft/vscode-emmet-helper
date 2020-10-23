import assert from 'assert';
import { Options, UserConfig } from 'emmet';
import { describe, it } from 'mocha';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types'
import { doComplete, expandAbbreviation, getSyntaxType } from '../emmetHelper';

const COMPLETE_OPTIONS = {
	preferences: {},
	showExpandedAbbreviation: 'always',
	showAbbreviationSuggestions: false,
	syntaxProfiles: {},
	variables: {}
}

function testExpandWithCompletion(syntax: string, abbrev: string, expanded: string) {
	it(`should expand ${abbrev} to\n${expanded}`, async () => {
		const document = TextDocument.create(`test://test/test.${syntax}`, syntax, 0, abbrev);
		const position = Position.create(0, abbrev.length);

		const completionList = doComplete(document, position, syntax, COMPLETE_OPTIONS);

		assert.ok(completionList && completionList.items, `completion list exists for ${abbrev}`);
		assert.ok(completionList.items.length > 0, `completion list is not empty for ${abbrev}`);

		assert.strictEqual(expanded, TextDocument.applyEdits(document, [completionList.items[0].textEdit]));
	});
}

function testExpand(syntax: string, abbrev: string, expanded: string) {
	it(`should wrap ${abbrev} to obtain\n${expanded}`, async () => {
		const type = getSyntaxType(syntax);
		const config: UserConfig = {
			type,
			syntax
		}
		const expandedRes = expandAbbreviation(abbrev, config);
		assert.strictEqual(expanded, expandedRes);
	});
}

function testWrap(abbrev: string, text: string | string[], expanded: string, options?: Partial<Options>) {
	it(`should wrap ${text} with ${abbrev} to obtain\n${expanded}`, async () => {
		const syntax = 'html';
		const type = getSyntaxType(syntax);
		const config: UserConfig = {
			type,
			syntax,
			text,
			options
		};
		const expandedRes = expandAbbreviation(abbrev, config);
		assert.strictEqual(expanded, expandedRes);
	});
}

describe('Expand Abbreviations', () => {
	// https://github.com/microsoft/vscode/issues/59951
	testExpandWithCompletion('scss', 'fsz18', 'font-size: 18px;');

	// https://github.com/microsoft/vscode/issues/63703
	testExpandWithCompletion('jsx', 'button[onClick={props.onClick}]', '<button onClick={props.onClick}>${0}</button>');

	// https://github.com/microsoft/vscode/issues/67971
	testExpandWithCompletion('html', 'div>p+lorem3', '<div>\n\t<p>${0}</p>\n\tLorem, ipsum dolor.\n</div>');

	// https://github.com/microsoft/vscode/issues/69168
	testExpandWithCompletion('html', 'ul>li{my list $@-}*3', '<ul>\n\t<li>my list 3</li>\n\t<li>my list 2</li>\n\t<li>my list 1</li>\n</ul>');

	// https://github.com/microsoft/vscode/issues/74505
	testExpandWithCompletion('css', '@f', '@font-face {\n\tfont-family: ${0};\n\tsrc: url(${0});\n}');
	testExpandWithCompletion('css', '@i', '@import url(${0});');
	testExpandWithCompletion('css', '@import', '@import url(${0});');
	testExpandWithCompletion('css', '@kf', '@keyframes ${1:identifier} {\n\t${0}\n}');
	testExpandWithCompletion('css', '@', '@media ${1:screen} {\n\t${0}\n}');
	testExpandWithCompletion('css', '@m', '@media ${1:screen} {\n\t${0}\n}');

	// https://github.com/microsoft/vscode/issues/92120
	testExpandWithCompletion('css', 'd', 'display: ${1:block};');

	// escaped dollar signs should not change after going through Emmet expansion only
	// NOTE: VS Code automatically removes the backslashes after the expansion
	testExpand('html', 'span{\\$5}', '<span>\\$5</span>');
	testExpand('html', 'span{\\$hello}', '<span>\\$hello</span>');
	testExpand('html', 'ul>li.item$*2{test\\$}', '<ul>\n\t<li class="item1">test\\$</li>\n\t<li class="item2">test\\$</li>\n</ul>');
});

describe('Wrap Abbreviations (basic)', () => {
	// basic cases
	testWrap('ul>li', 'test', '<ul>\n\t<li>test</li>\n</ul>');
	testWrap('ul>li', ['test'], '<ul>\n\t<li>test</li>\n</ul>');
	testWrap('ul>li', ['test1', 'test2'], '<ul>\n\t<li>\n\t\ttest1\n\t\ttest2\n\t</li>\n</ul>');

	// dollar signs should be escaped when wrapped (specific to VS Code)
	testWrap('ul>li*', ['test$', 'test$'], '<ul>\n\t<li>test\\$</li>\n\t<li>test\\$</li>\n</ul>');
	testWrap('ul>li*', ['$1', '$2'], '<ul>\n\t<li>\\$1</li>\n\t<li>\\$2</li>\n</ul>');
	testWrap('ul>li.item$*', ['test$', 'test$'], '<ul>\n\t<li class="item1">test\\$</li>\n\t<li class="item2">test\\$</li>\n</ul>');

	// https://github.com/emmetio/expand-abbreviation/issues/17
	testWrap('ul', '<li>test1</li>\n<li>test2</li>', '<ul>\n\t<li>test1</li>\n\t<li>test2</li>\n</ul>');
});

describe('Wrap Abbreviations (with internal nodes)', () => {
	// wrapping elements where the internals contain nodes should result in proper indentation
	testWrap('ul', '<li>test</li>', '<ul>\n\t<li>test</li>\n</ul>');
	testWrap('ul', ['<li>test1</li>', '<li>test2</li>'], '<ul>\n\t<li>test1</li>\n\t<li>test2</li>\n</ul>');
	testWrap('ul>li', '<span>test</span>', '<ul>\n\t<li>\n\t\t<span>test</span>\n\t</li>\n</ul>');
	testWrap('ul>li>div', '<p><span>test</span></p>', '<ul>\n\t<li>\n\t\t<div>\n\t\t\t<p><span>test</span></p>\n\t\t</div>\n\t</li>\n</ul>');
	testWrap('ul*', ['<li>test1</li>', '<li>test2</li>'], '<ul>\n\t<li>test1</li>\n</ul>\n<ul>\n\t<li>test2</li>\n</ul>');
	testWrap('div', 'teststring', '<div>teststring</div>');
	testWrap('div', 'test\nstring', '<div>\n\ttest\n\tstring\n</div>');
});

describe('Wrap Abbreviations (more advanced)', () => {
	// https://github.com/microsoft/vscode/issues/45724
	testWrap('ul>li{hello}', 'Hello world', '<ul>\n\t<li>helloHello world</li>\n</ul>');
	testWrap('ul>li{hello}+li.bye', 'Hello world', '<ul>\n\t<li>hello</li>\n\t<li class="bye">Hello world</li>\n</ul>');

	// https://github.com/microsoft/vscode/issues/65469
	// VS Code has to trim empty entries, for example:
	testWrap('p*', ['first line', '', 'second line'].filter(s => s.length), '<p>first line</p>\n<p>second line</p>');

	// https://github.com/microsoft/vscode/issues/78015
	// (upstream issue)
	// testWrap('ul>li*', ['one', 'two'], '<ul>\n\t<li>one</li>\n\t<li>two</li>\n</ul>', { "output.format": false });

	// https://github.com/microsoft/vscode/issues/54711
	// https://github.com/microsoft/vscode/issues/107592
	// (upstream issue)
	// testWrap('a', 'www.google.it', '<a href="www.google.it">www.google.it</a>');
	// testWrap('a', 'http://www.site.com/en-us/download/details.aspx?id=12345', '<a href="http://www.site.com/en-us/download/details.aspx?id=12345">http://www.site.com/en-us/download/details.aspx?id=12345</a>');
});
