/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as JSONC from 'jsonc-parser';
import { TextDecoder } from 'util';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItem, CompletionItemKind, CompletionList, InsertTextFormat, Position, Range, TextEdit } from 'vscode-languageserver-types';
import { URI } from 'vscode-uri';
import { cssData, htmlData } from './data';
import { FileService, FileStat, FileType, isAbsolutePath, joinPath } from './fileService';

import expand, { Config, extract, ExtractOptions, MarkupAbbreviation, Options, parseMarkup, parseStylesheet, resolveConfig, stringifyMarkup, stringifyStylesheet, StylesheetAbbreviation, SyntaxType, UserConfig } from 'emmet';
import { parseSnippets, SnippetsMap, syntaxes } from './configCompat';

// /* workaround for webpack issue: https://github.com/webpack/webpack/issues/5756
//  @emmetio/extract-abbreviation has a cjs that uses a default export
// */
// const extract = typeof _extractAbbreviation === 'function' ? _extractAbbreviation : _extractAbbreviation.default;

export { FileService, FileType, FileStat };

let l10n: { t: (message: string) => string };
try {
	l10n = require('vscode').l10n;
} catch {
	// Fallback to the identity function.
	l10n = {
		t: (message: string) => message
	};
}

const snippetKeyCache = new Map<string, string[]>();
let markupSnippetKeys: string[];
const stylesheetCustomSnippetsKeyCache = new Map<string, string[]>();
const htmlAbbreviationStartRegex = /^[a-z,A-Z,!,(,[,#,\.\{]/;
// take off { for jsx because it interferes with the language
const jsxAbbreviationStartRegex = /^[a-z,A-Z,!,(,[,#,\.]/;
const cssAbbreviationRegex = /^-?[a-z,A-Z,!,@,#]/;
const htmlAbbreviationRegex = /[a-z,A-Z\.]/;
const commonlyUsedTags = [...htmlData.tags, 'lorem'];
const bemFilterSuffix = 'bem';
const filterDelimitor = '|';
const trimFilterSuffix = 't';
const commentFilterSuffix = 'c';
const maxFilters = 3;

/**
 * Emmet configuration as derived from the Emmet related VS Code settings
 */
export interface VSCodeEmmetConfig {
	showExpandedAbbreviation?: string;
	showAbbreviationSuggestions?: boolean;
	syntaxProfiles?: object;
	variables?: object;
	preferences?: object;
	excludeLanguages?: string[];
	showSuggestionsAsSnippets?: boolean;
}

/**
 * Returns all applicable emmet expansions for abbreviation at given position in a CompletionList
 * @param document TextDocument in which completions are requested
 * @param position Position in the document at which completions are requested
 * @param syntax Emmet supported language
 * @param emmetConfig Emmet Configurations as derived from VS Code
 */
export function doComplete(document: TextDocument, position: Position, syntax: string, emmetConfig: VSCodeEmmetConfig): CompletionList | undefined {
	if (emmetConfig.showExpandedAbbreviation === 'never' || !getEmmetMode(syntax, emmetConfig.excludeLanguages)) {
		return;
	}

	const isStyleSheetRes = isStyleSheet(syntax);

	// Fetch markupSnippets so that we can provide possible abbreviation completions
	// For example, when text at position is `a`, completions should return `a:blank`, `a:link`, `acr` etc.
	if (!isStyleSheetRes) {
		if (!snippetKeyCache.has(syntax)) {
			const registry: SnippetsMap = {
				...getDefaultSnippets(syntax),
				...customSnippetsRegistry[syntax]
			};
			snippetKeyCache.set(syntax, Object.keys(registry));
		}
		markupSnippetKeys = snippetKeyCache.get(syntax) ?? [];
	}

	const extractOptions: Partial<ExtractOptions> = { lookAhead: !isStyleSheetRes, type: isStyleSheetRes ? 'stylesheet' : 'markup' };
	const extractedValue = extractAbbreviation(document, position, extractOptions);
	if (!extractedValue) {
		return;
	}
	const { abbreviationRange, abbreviation, filter } = extractedValue;
	const currentLineTillPosition = getCurrentLine(document, position).substr(0, position.character);
	const currentWord = getCurrentWord(currentLineTillPosition);

	// Don't attempt to expand open tags
	if (currentWord === abbreviation
		&& currentLineTillPosition.endsWith(`<${abbreviation}`)
		&& syntaxes.markup.includes(syntax)) {
		return;
	}

	const expandOptions = getExpandOptions(syntax, emmetConfig, filter);

	let expandedText: string = "";
	let expandedAbbr: CompletionItem | undefined;
	let completionItems: CompletionItem[] = [];

	// Create completion item after expanding given abbreviation
	// if abbreviation is valid and expanded value is not noise
	const createExpandedAbbr = (syntax: string, abbr: string) => {
		if (!isAbbreviationValid(syntax, abbreviation)) {
			return;
		}

		try {
			expandedText = expand(abbr, expandOptions);

			// manually patch https://github.com/microsoft/vscode/issues/120245 for now
			if (isStyleSheetRes && '!important'.startsWith(abbr)) {
				expandedText = '!important';
			}
		} catch (e) {
		}

		if (!expandedText || isExpandedTextNoise(syntax, abbr, expandedText, expandOptions.options)) {
			return;
		}

		expandedAbbr = CompletionItem.create(abbr);
		expandedAbbr.textEdit = TextEdit.replace(abbreviationRange, escapeNonTabStopDollar(addFinalTabStop(expandedText)));
		expandedAbbr.documentation = replaceTabStopsWithCursors(expandedText);
		expandedAbbr.insertTextFormat = InsertTextFormat.Snippet;
		expandedAbbr.detail = l10n.t('Emmet Abbreviation');
		expandedAbbr.label = abbreviation;
		expandedAbbr.label += filter ? '|' + filter.replace(',', '|') : "";
		completionItems = [expandedAbbr];
	}

	if (isStyleSheet(syntax)) {
		createExpandedAbbr(syntax, abbreviation);

		// When abbr is longer than usual emmet snippets and matches better with existing css property, then no emmet
		if (abbreviation.length > 4
			&& cssData.properties.find(x => x.startsWith(abbreviation))) {
			return CompletionList.create([], true);
		}

		if (expandedAbbr && expandedText.length) {
			expandedAbbr.textEdit = TextEdit.replace(abbreviationRange, escapeNonTabStopDollar(addFinalTabStop(expandedText)));
			expandedAbbr.documentation = replaceTabStopsWithCursors(expandedText);
			expandedAbbr.label = removeTabStops(expandedText);
			expandedAbbr.filterText = abbreviation;

			// Custom snippets should show up in completions if abbreviation is a prefix
			const stylesheetCustomSnippetsKeys = stylesheetCustomSnippetsKeyCache.has(syntax) ?
				stylesheetCustomSnippetsKeyCache.get(syntax) : stylesheetCustomSnippetsKeyCache.get('css');
			completionItems = makeSnippetSuggestion(
				stylesheetCustomSnippetsKeys ?? [],
				abbreviation,
				abbreviation,
				abbreviationRange,
				expandOptions,
				'Emmet Custom Snippet',
				false);

			if (!completionItems.find(x => x.textEdit?.newText && x.textEdit?.newText === expandedAbbr?.textEdit?.newText)) {

				// Fix for https://github.com/Microsoft/vscode/issues/28933#issuecomment-309236902
				// When user types in propertyname, emmet uses it to match with snippet names, resulting in width -> widows or font-family -> font: family
				// Filter out those cases here.
				const abbrRegex = new RegExp('.*' + abbreviation.split('').map(x => (x === '$' || x === '+') ? '\\' + x : x).join('.*') + '.*', 'i');
				if (/\d/.test(abbreviation) || abbrRegex.test(expandedAbbr.label)) {
					completionItems.push(expandedAbbr);
				}
			}
		}
	} else {
		createExpandedAbbr(syntax, abbreviation);

		let tagToFindMoreSuggestionsFor = abbreviation;
		const newTagMatches = abbreviation.match(/(>|\+)([\w:-]+)$/);
		if (newTagMatches && newTagMatches.length === 3) {
			tagToFindMoreSuggestionsFor = newTagMatches[2];
		}

		if (syntax !== 'xml') {
			const commonlyUsedTagSuggestions = makeSnippetSuggestion(commonlyUsedTags, tagToFindMoreSuggestionsFor, abbreviation, abbreviationRange, expandOptions, 'Emmet Abbreviation');
			completionItems = completionItems.concat(commonlyUsedTagSuggestions);
		}

		if (emmetConfig.showAbbreviationSuggestions === true) {
			const abbreviationSuggestions = makeSnippetSuggestion(markupSnippetKeys.filter(x => !commonlyUsedTags.includes(x)), tagToFindMoreSuggestionsFor, abbreviation, abbreviationRange, expandOptions, 'Emmet Abbreviation');

			// Workaround for the main expanded abbr not appearing before the snippet suggestions
			if (expandedAbbr && abbreviationSuggestions.length > 0 && tagToFindMoreSuggestionsFor !== abbreviation) {
				expandedAbbr.sortText = '0' + expandedAbbr.label;
				abbreviationSuggestions.forEach(item => {
					// Workaround for snippet suggestions items getting filtered out as the complete abbr does not start with snippetKey
					item.filterText = abbreviation
					// Workaround for the main expanded abbr not appearing before the snippet suggestions
					item.sortText = '9' + abbreviation;
				});
			}
			completionItems = completionItems.concat(abbreviationSuggestions);
		}

		// https://github.com/microsoft/vscode/issues/66680
		if (syntax === 'html' && completionItems.length >= 2 && abbreviation.includes(":")
			&& expandedAbbr?.textEdit?.newText === `<${abbreviation}>\${0}</${abbreviation}>`) {
			completionItems = completionItems.filter(item => item.label !== abbreviation);
		}
	}

	if (emmetConfig.showSuggestionsAsSnippets === true) {
		completionItems.forEach(x => x.kind = CompletionItemKind.Snippet);
	}
	return completionItems.length ? CompletionList.create(completionItems, true) : undefined;
}

/**
 * Create & return snippets for snippet keys that start with given prefix
 */
function makeSnippetSuggestion(
	snippetKeys: string[],
	prefix: string,
	abbreviation: string,
	abbreviationRange: Range,
	expandOptions: UserConfig,
	snippetDetail: string,
	skipFullMatch: boolean = true
): CompletionItem[] {
	if (!prefix || !snippetKeys) {
		return [];
	}
	const snippetCompletions: CompletionItem[] = [];
	snippetKeys.forEach(snippetKey => {
		if (!snippetKey.startsWith(prefix.toLowerCase()) || (skipFullMatch && snippetKey === prefix.toLowerCase())) {
			return;
		}

		const currentAbbr = abbreviation + snippetKey.substr(prefix.length);
		let expandedAbbr;
		try {
			expandedAbbr = expand(currentAbbr, expandOptions);
		} catch (e) {

		}
		if (!expandedAbbr) {
			return;
		}

		const item = CompletionItem.create(prefix + snippetKey.substr(prefix.length));
		item.documentation = replaceTabStopsWithCursors(expandedAbbr);
		item.detail = snippetDetail;
		item.textEdit = TextEdit.replace(abbreviationRange, escapeNonTabStopDollar(addFinalTabStop(expandedAbbr)));
		item.insertTextFormat = InsertTextFormat.Snippet;

		snippetCompletions.push(item);
	});
	return snippetCompletions;
}

function getCurrentWord(currentLineTillPosition: string): string | undefined {
	if (currentLineTillPosition) {
		const matches = currentLineTillPosition.match(/[\w,:,-,\.]*$/)
		if (matches) {
			return matches[0];
		}
	}
}

function replaceTabStopsWithCursors(expandedWord: string): string {
	return expandedWord.replace(/([^\\])\$\{\d+\}/g, '$1|').replace(/\$\{\d+:([^\}]+)\}/g, '$1');
}

function removeTabStops(expandedWord: string): string {
	return expandedWord.replace(/([^\\])\$\{\d+\}/g, '$1').replace(/\$\{\d+:([^\}]+)\}/g, '$1');
}

function escapeNonTabStopDollar(text: string): string {
	return text ? text.replace(/([^\\])(\$)([^\{])/g, '$1\\$2$3') : text;
}

function addFinalTabStop(text: string): string {
	if (!text || !text.trim()) {
		return text;
	}

	let maxTabStop = -1;
	type TabStopRange = { numberStart: number, numberEnd: number };
	let maxTabStopRanges: TabStopRange[] = [];
	let foundLastStop = false;
	let replaceWithLastStop = false;
	let i = 0;
	const n = text.length;

	try {
		while (i < n && !foundLastStop) {
			// Look for ${
			if (text[i++] != '$' || text[i++] != '{') {
				continue;
			}

			// Find tabstop
			let numberStart = -1;
			let numberEnd = -1;
			while (i < n && /\d/.test(text[i])) {
				numberStart = numberStart < 0 ? i : numberStart;
				numberEnd = i + 1;
				i++;
			}

			// If ${ was not followed by a number and either } or :, then its not a tabstop
			if (numberStart === -1 || numberEnd === -1 || i >= n || (text[i] != '}' && text[i] != ':')) {
				continue;
			}

			// If ${0} was found, then break
			const currentTabStop = text.substring(numberStart, numberEnd);
			foundLastStop = currentTabStop === '0';
			if (foundLastStop) {
				break;
			}

			let foundPlaceholder = false;
			if (text[i++] == ':') {
				// TODO: Nested placeholders may break here
				while (i < n) {
					if (text[i] == '}') {
						foundPlaceholder = true;
						break;
					}
					i++;
				}
			}

			// Decide to replace currentTabStop with ${0} only if its the max among all tabstops and is not a placeholder
			if (Number(currentTabStop) > Number(maxTabStop)) {
				maxTabStop = Number(currentTabStop);
				maxTabStopRanges = [{ numberStart, numberEnd }];
				replaceWithLastStop = !foundPlaceholder;
			} else if (Number(currentTabStop) === maxTabStop) {
				maxTabStopRanges.push({ numberStart, numberEnd });
			}
		}
	} catch (e) {

	}

	if (replaceWithLastStop && !foundLastStop) {
		for (let i = 0; i < maxTabStopRanges.length; i++) {
			const rangeStart = maxTabStopRanges[i].numberStart;
			const rangeEnd = maxTabStopRanges[i].numberEnd;
			text = text.substr(0, rangeStart) + '0' + text.substr(rangeEnd);
		}
	}

	return text;
}

function getCurrentLine(document: TextDocument, position: Position): string {
	const offset = document.offsetAt(position);
	const text = document.getText();
	let start = 0;
	let end = text.length;
	for (let i = offset - 1; i >= 0; i--) {
		if (text[i] === '\n') {
			start = i + 1;
			break;
		}
	}
	for (let i = offset; i < text.length; i++) {
		if (text[i] === '\n') {
			end = i;
			break;
		}
	}
	return text.substring(start, end);
}

let customSnippetsRegistry: Record<string, SnippetsMap> = {};
let variablesFromFile = {};
let profilesFromFile = {};

export const emmetSnippetField = (index: number, placeholder: string) => `\${${index}${placeholder ? ':' + placeholder : ''}}`;

/** Returns whether or not syntax is a supported stylesheet syntax, like CSS */
export function isStyleSheet(syntax: string): boolean {
	return syntaxes.stylesheet.includes(syntax);
}

/** Returns the syntax type, either markup (e.g. for HTML) or stylesheet (e.g. for CSS) */
export function getSyntaxType(syntax: string): SyntaxType {
	return isStyleSheet(syntax) ? 'stylesheet' : 'markup';
}

/** Returns the default syntax (html or css) to use for the snippets registry */
export function getDefaultSyntax(syntax: string): string {
	return isStyleSheet(syntax) ? 'css' : 'html';
}

/** Returns the default snippets that Emmet suggests */
export function getDefaultSnippets(syntax: string): SnippetsMap {
	const syntaxType = getSyntaxType(syntax);
	const emptyUserConfig: UserConfig = { type: syntaxType, syntax };
	const resolvedConfig: Config = resolveConfig(emptyUserConfig);

	// https://github.com/microsoft/vscode/issues/97632
	// don't return markup (HTML) snippets for XML
	return syntax === 'xml' ? {} : resolvedConfig.snippets;
}

function getFilters(text: string, pos: number): { pos: number, filter: string | undefined } {
	let filter: string | undefined;
	for (let i = 0; i < maxFilters; i++) {
		if (text.endsWith(`${filterDelimitor}${bemFilterSuffix}`, pos)) {
			pos -= bemFilterSuffix.length + 1;
			filter = filter ? bemFilterSuffix + ',' + filter : bemFilterSuffix;
		} else if (text.endsWith(`${filterDelimitor}${commentFilterSuffix}`, pos)) {
			pos -= commentFilterSuffix.length + 1;
			filter = filter ? commentFilterSuffix + ',' + filter : commentFilterSuffix;
		} else if (text.endsWith(`${filterDelimitor}${trimFilterSuffix}`, pos)) {
			pos -= trimFilterSuffix.length + 1;
			filter = filter ? trimFilterSuffix + ',' + filter : trimFilterSuffix;
		} else {
			break;
		}
	}
	return {
		pos: pos,
		filter: filter
	}
}

/**
 * Extracts abbreviation from the given position in the given document
 * @param document The TextDocument from which abbreviation needs to be extracted
 * @param position The Position in the given document from where abbreviation needs to be extracted
 * @param options The options to pass to the @emmetio/extract-abbreviation module
 */
export function extractAbbreviation(document: TextDocument, position: Position, options?: Partial<ExtractOptions>): { abbreviation: string, abbreviationRange: Range, filter: string | undefined } | undefined {
	const currentLine = getCurrentLine(document, position);
	const currentLineTillPosition = currentLine.substr(0, position.character);
	const { pos, filter } = getFilters(currentLineTillPosition, position.character);
	const lengthOccupiedByFilter = filter ? filter.length + 1 : 0;
	const result = extract(currentLine, pos, options);
	if (!result) {
		return;
	}
	const rangeToReplace = Range.create(position.line, result.location, position.line, result.location + result.abbreviation.length + lengthOccupiedByFilter);
	return {
		abbreviationRange: rangeToReplace,
		abbreviation: result.abbreviation,
		filter
	};
}

/**
 * Extracts abbreviation from the given text
 * @param text Text from which abbreviation needs to be extracted
 * @param syntax Syntax used to extract the abbreviation from the given text
 */
export function extractAbbreviationFromText(text: string, syntax: string): { abbreviation: string, filter: string | undefined } | undefined {
	if (!text) {
		return;
	}
	const { pos, filter } = getFilters(text, text.length);
	const extractOptions = (isStyleSheet(syntax) || syntax === 'stylesheet') ?
		{ syntax: 'stylesheet', lookAhead: false } :
		{ lookAhead: true };
	const result = extract(text, pos, extractOptions);
	if (!result) {
		return;
	}
	return {
		abbreviation: result.abbreviation,
		filter
	};
}

/**
 * Returns a boolean denoting validity of given abbreviation in the context of given syntax
 * Not needed once https://github.com/emmetio/atom-plugin/issues/22 is fixed
 * @param syntax string
 * @param abbreviation string
 */
export function isAbbreviationValid(syntax: string, abbreviation: string): boolean {
	if (!abbreviation) {
		return false;
	}
	if (isStyleSheet(syntax)) {
		if (abbreviation.includes('#')) {
			if (abbreviation.startsWith('#')) {
				const hexColorRegex = /^#[\d,a-f,A-F]{1,6}$/;
				return hexColorRegex.test(abbreviation);
			} else if (commonlyUsedTags.includes(abbreviation.substring(0, abbreviation.indexOf('#')))) {
				return false;
			}
		}
		return cssAbbreviationRegex.test(abbreviation);
	}
	if (abbreviation.startsWith('!')) {
		return !/[^!]/.test(abbreviation);
	}

	// Its common for users to type (sometextinsidebrackets), this should not be treated as an abbreviation
	// Grouping in abbreviation is valid only if it's inside a text node or preceeded/succeeded with one of the symbols for nesting, sibling, repeater or climb up
	// Also, cases such as `span[onclick="alert();"]` are valid
	if ((/\(/.test(abbreviation) || /\)/.test(abbreviation))
		&& !/\{[^\}\{]*[\(\)]+[^\}\{]*\}(?:[>\+\*\^]|$)/.test(abbreviation)
		&& !/\(.*\)[>\+\*\^]/.test(abbreviation)
		&& !/\[[^\[\]\(\)]+=".*"\]/.test(abbreviation)
		&& !/[>\+\*\^]\(.*\)/.test(abbreviation)) {
		return false;
	}

	if (syntax === 'jsx') {
		return (jsxAbbreviationStartRegex.test(abbreviation) && htmlAbbreviationRegex.test(abbreviation));
	}
	return (htmlAbbreviationStartRegex.test(abbreviation) && htmlAbbreviationRegex.test(abbreviation));
}

function isExpandedTextNoise(syntax: string, abbreviation: string, expandedText: string, options: Partial<Options> | undefined): boolean {
	// Unresolved css abbreviations get expanded to a blank property value
	// Eg: abc -> abc: ; or abc:d -> abc: d; which is noise if it gets suggested for every word typed
	if (isStyleSheet(syntax) && options) {
		const between = options['stylesheet.between'] ?? ': ';
		const after = options['stylesheet.after'] ?? ';';

		// Remove overlapping between `abbreviation` and `between`, if any
		let endPrefixIndex = abbreviation.indexOf(between[0], Math.max(abbreviation.length - between.length, 0));
		endPrefixIndex = endPrefixIndex >= 0 ? endPrefixIndex : abbreviation.length;
		const abbr = abbreviation.substring(0, endPrefixIndex);

		return expandedText === `${abbr}${between}\${0}${after}` ||
			expandedText.replace(/\s/g, '') === abbreviation.replace(/\s/g, '') + after;
	}

	// we don't want common html tags suggested for xml
	if (syntax === 'xml' &&
		commonlyUsedTags.some(tag => tag.startsWith(abbreviation.toLowerCase()))) {
		return true;
	}

	if (commonlyUsedTags.includes(abbreviation.toLowerCase()) ||
		markupSnippetKeys.includes(abbreviation)) {
		return false;
	}

	// Custom tags can have - or :
	if (/[-,:]/.test(abbreviation) && !/--|::/.test(abbreviation) &&
		!abbreviation.endsWith(':')) {
		return false;
	}

	// Its common for users to type some text and end it with period, this should not be treated as an abbreviation
	// Else it becomes noise.

	// When user just types '.', return the expansion
	// Otherwise emmet loses change to participate later
	// For example in `.foo`. See https://github.com/Microsoft/vscode/issues/66013
	if (abbreviation === '.') {
		return false;
	}

	const dotMatches = abbreviation.match(/^([a-z,A-Z,\d]*)\.$/);
	if (dotMatches) {
		// Valid html tags such as `div.`
		if (dotMatches[1] && htmlData.tags.includes(dotMatches[1])) {
			return false;
		}
		return true;
	}

	// Fix for https://github.com/microsoft/vscode/issues/89746
	// PascalCase tags are common in jsx code, which should not be treated as noise.
	// Eg: MyAwesomComponent -> <MyAwesomComponent></MyAwesomComponent>
	if (syntax === 'jsx' && /^([A-Z][A-Za-z0-9]*)+$/.test(abbreviation)) {
		return false;
	}

	// Unresolved html abbreviations get expanded as if it were a tag
	// Eg: abc -> <abc></abc> which is noise if it gets suggested for every word typed
	return (expandedText.toLowerCase() === `<${abbreviation.toLowerCase()}>\${1}</${abbreviation.toLowerCase()}>`);
}

type ExpandOptionsConfig = {
	type: SyntaxType,
	options: Partial<Options>,
	variables: SnippetsMap,
	snippets: SnippetsMap,
	syntax: string,
	text: string | string[] | undefined
	maxRepeat: number
}

/**
 * Returns options to be used by emmet
 */
export function getExpandOptions(syntax: string, emmetConfig?: VSCodeEmmetConfig, filter?: string): ExpandOptionsConfig {
	emmetConfig = emmetConfig ?? {};
	emmetConfig['preferences'] = emmetConfig['preferences'] ?? {};

	const preferences: any = emmetConfig['preferences'];
	const stylesheetSyntax = isStyleSheet(syntax) ? syntax : 'css';

	// Fetch Profile
	const profile = getProfile(syntax, emmetConfig['syntaxProfiles'] ?? {});
	const filtersFromProfile: string[] = (profile && profile['filters']) ? profile['filters'].split(',') : [];
	const trimmedFilters = filtersFromProfile.map(filterFromProfile => filterFromProfile.trim());
	const bemEnabled = (filter && filter.split(',').some(x => x.trim() === 'bem')) || trimmedFilters.includes('bem');
	const commentEnabled = (filter && filter.split(',').some(x => x.trim() === 'c')) || trimmedFilters.includes('c');

	// Fetch formatters
	const formatters = getFormatters(syntax, emmetConfig['preferences']);
	const unitAliases: SnippetsMap = (formatters?.stylesheet && formatters.stylesheet['unitAliases']) || {};

	// These options are the default values provided by vscode for
	// extension preferences
	const defaultVSCodeOptions: Partial<Options> = {
		// inlineElements: string[],
		// 'output.indent': string,
		// 'output.baseIndent': string,
		// 'output.newline': string,
		// 'output.tagCase': profile['tagCase'],
		// 'output.attributeCase': profile['attributeCase'],
		// 'output.attributeQuotes': profile['attributeQuotes'],
		// 'output.format': profile['format'] ?? true,
		// 'output.formatLeafNode': boolean,
		'output.formatSkip': ['html'],
		'output.formatForce': ['body'],
		'output.inlineBreak': 0,
		'output.compactBoolean': false,
		// 'output.booleanAttributes': string[],
		'output.reverseAttributes': false,
		// 'output.selfClosingStyle': profile['selfClosingStyle'],
		'output.field': emmetSnippetField,
		// 'output.text': TextOutput,
		'markup.href': true,
		'comment.enabled': false,
		'comment.trigger': ['id', 'class'],
		'comment.before': '',
		'comment.after': '\n<!-- /[#ID][.CLASS] -->',
		'bem.enabled': false,
		'bem.element': '__',
		'bem.modifier': '_',
		'jsx.enabled': syntax === 'jsx',
		// 'stylesheet.keywords': string[],
		// 'stylesheet.unitless': string[],
		'stylesheet.shortHex': true,
		'stylesheet.between': syntax === 'stylus' ? ' ' : ': ',
		'stylesheet.after': (syntax === 'sass' || syntax === 'stylus') ? '' : ';',
		'stylesheet.intUnit': 'px',
		'stylesheet.floatUnit': 'em',
		'stylesheet.unitAliases': { e: 'em', p: '%', x: 'ex', r: 'rem' },
		// 'stylesheet.json': boolean,
		// 'stylesheet.jsonDoubleQuotes': boolean,
		'stylesheet.fuzzySearchMinScore': 0.3,
	};

	// These options come from user prefs in the vscode repo
	const userPreferenceOptions: Partial<Options> = {
		// inlineElements: string[],
		// 'output.indent': string,
		// 'output.baseIndent': string,
		// 'output.newline': string,
		'output.tagCase': profile['tagCase'],
		'output.attributeCase': profile['attributeCase'],
		'output.attributeQuotes': profile['attributeQuotes'],
		'output.format': profile['format'] ?? true,
		// 'output.formatLeafNode': boolean,
		'output.formatSkip': preferences['format.noIndentTags'],
		'output.formatForce': preferences['format.forceIndentationForTags'],
		'output.inlineBreak': profile['inlineBreak'] ?? preferences['output.inlineBreak'],
		'output.compactBoolean': profile['compactBooleanAttributes'] ?? preferences['profile.allowCompactBoolean'],
		// 'output.booleanAttributes': string[],
		'output.reverseAttributes': preferences['output.reverseAttributes'],
		'output.selfClosingStyle': profile['selfClosingStyle'] ?? preferences['output.selfClosingStyle'] ?? getClosingStyle(syntax),
		'output.field': emmetSnippetField,
		// 'output.text': TextOutput,
		// 'markup.href': boolean,
		'comment.enabled': commentEnabled,
		'comment.trigger': preferences['filter.commentTrigger'],
		'comment.before': preferences['filter.commentBefore'],
		'comment.after': preferences['filter.commentAfter'],
		'bem.enabled': bemEnabled,
		'bem.element': preferences['bem.elementSeparator'] ?? '__',
		'bem.modifier': preferences['bem.modifierSeparator'] ?? '_',
		'jsx.enabled': syntax === 'jsx',
		// 'stylesheet.keywords': string[],
		// 'stylesheet.unitless': string[],
		'stylesheet.shortHex': preferences['css.color.short'],
		'stylesheet.between': preferences[`${stylesheetSyntax}.valueSeparator`],
		'stylesheet.after': preferences[`${stylesheetSyntax}.propertyEnd`],
		'stylesheet.intUnit': preferences['css.intUnit'],
		'stylesheet.floatUnit': preferences['css.floatUnit'],
		'stylesheet.unitAliases': unitAliases,
		// 'stylesheet.json': boolean,
		// 'stylesheet.jsonDoubleQuotes': boolean,
		'stylesheet.fuzzySearchMinScore': preferences['css.fuzzySearchMinScore'],
	}

	const combinedOptions: any = {};
	[...Object.keys(defaultVSCodeOptions), ...Object.keys(userPreferenceOptions)].forEach(key => {
		const castKey = key as keyof Options;
		combinedOptions[castKey] = userPreferenceOptions[castKey] ?? defaultVSCodeOptions[castKey];
	});
	const mergedAliases = { ...defaultVSCodeOptions['stylesheet.unitAliases'], ...userPreferenceOptions['stylesheet.unitAliases'] };
	combinedOptions['stylesheet.unitAliases'] = mergedAliases;

	const type = getSyntaxType(syntax);
	const variables = getVariables(emmetConfig['variables']);
	const baseSyntax = getDefaultSyntax(syntax);
	const snippets = (type === 'stylesheet') ?
		(customSnippetsRegistry[syntax] ?? customSnippetsRegistry[baseSyntax]) :
		customSnippetsRegistry[syntax];

	return {
		type,
		options: combinedOptions,
		variables,
		snippets,
		syntax,
		// context: null,
		text: undefined,
		maxRepeat: 1000,
		// cache: null
	};
}

function getClosingStyle(syntax: string): string {
	switch (syntax) {
		case 'xhtml': return 'xhtml';
		case 'xml': return 'xml';
		case 'xsl': return 'xml';
		case 'jsx': return 'xhtml';
		default: return 'html';
	}
}

/**
 * Parses given abbreviation using given options and returns a tree
 * @param abbreviation string
 * @param options options used by the emmet module to parse given abbreviation
 */
export function parseAbbreviation(abbreviation: string, options: UserConfig): StylesheetAbbreviation | MarkupAbbreviation {
	const resolvedOptions = resolveConfig(options);
	return (options.type === 'stylesheet') ?
		parseStylesheet(abbreviation, resolvedOptions) :
		parseMarkup(abbreviation, resolvedOptions);
}

/**
 * Expands given abbreviation using given options
 * @param abbreviation string or parsed abbreviation
 * @param config options used by the @emmetio/expand-abbreviation module to expand given abbreviation
 */
export function expandAbbreviation(abbreviation: string | MarkupAbbreviation | StylesheetAbbreviation, config: UserConfig): string {
	let expandedText;
	const resolvedConfig = resolveConfig(config);
	if (config.type === 'stylesheet') {
		if (typeof abbreviation === 'string') {
			expandedText = expand(abbreviation, resolvedConfig);
		} else {
			expandedText = stringifyStylesheet(abbreviation as StylesheetAbbreviation, resolvedConfig);
		}
	} else {
		if (typeof abbreviation === 'string') {
			expandedText = expand(abbreviation, resolvedConfig);
		} else {
			expandedText = stringifyMarkup(abbreviation as MarkupAbbreviation, resolvedConfig);
		}
	}
	return escapeNonTabStopDollar(addFinalTabStop(expandedText));
}

/**
 * Maps and returns syntaxProfiles of previous format to ones compatible with new emmet modules
 * @param syntax
 */
function getProfile(syntax: string, profilesFromSettings: any): any {
	if (!profilesFromSettings) {
		profilesFromSettings = {};
	}
	const profilesConfig = Object.assign({}, profilesFromFile, profilesFromSettings);

	const options = profilesConfig[syntax];
	if (!options || typeof options === 'string') {
		if (options === 'xhtml') {
			return {
				selfClosingStyle: 'xhtml'
			};
		}
		return {};
	}
	const newOptions: any = {};
	for (const key in options) {
		switch (key) {
			case 'tag_case':
				newOptions['tagCase'] = (options[key] === 'lower' || options[key] === 'upper') ? options[key] : '';
				break;
			case 'attr_case':
				newOptions['attributeCase'] = (options[key] === 'lower' || options[key] === 'upper') ? options[key] : '';
				break;
			case 'attr_quotes':
				newOptions['attributeQuotes'] = options[key];
				break;
			case 'tag_nl':
				newOptions['format'] = (options[key] === true || options[key] === false) ? options[key] : true;
				break;
			case 'inline_break':
				newOptions['inlineBreak'] = options[key];
				break;
			case 'self_closing_tag':
				if (options[key] === true) {
					newOptions['selfClosingStyle'] = 'xml'; break;
				}
				if (options[key] === false) {
					newOptions['selfClosingStyle'] = 'html'; break;
				}
				newOptions['selfClosingStyle'] = options[key];
				break;
			case 'compact_bool':
				newOptions['compactBooleanAttributes'] = options[key];
				break;
			default:
				newOptions[key] = options[key];
				break;
		}
	}
	return newOptions;
}

/**
 * Returns variables to be used while expanding snippets
 */
function getVariables(variablesFromSettings: object | undefined): SnippetsMap {
	if (!variablesFromSettings) {
		return variablesFromFile;
	}
	return Object.assign({}, variablesFromFile, variablesFromSettings) as SnippetsMap;
}

function getFormatters(syntax: string, preferences: any): any {
	if (!preferences || typeof preferences !== 'object') {
		return {};
	}

	if (!isStyleSheet(syntax)) {
		const commentFormatter: any = {};
		for (const key in preferences) {
			switch (key) {
				case 'filter.commentAfter':
					commentFormatter['after'] = preferences[key];
					break;
				case 'filter.commentBefore':
					commentFormatter['before'] = preferences[key];
					break;
				case 'filter.commentTrigger':
					commentFormatter['trigger'] = preferences[key];
					break;
				default:
					break;
			}
		}
		return {
			comment: commentFormatter
		};
	}
	let fuzzySearchMinScore = typeof preferences?.['css.fuzzySearchMinScore'] === 'number' ? preferences['css.fuzzySearchMinScore'] : 0.3;
	if (fuzzySearchMinScore > 1) {
		fuzzySearchMinScore = 1
	} else if (fuzzySearchMinScore < 0) {
		fuzzySearchMinScore = 0
	}
	const stylesheetFormatter: any = {
		'fuzzySearchMinScore': fuzzySearchMinScore
	};
	for (const key in preferences) {
		switch (key) {
			case 'css.floatUnit':
				stylesheetFormatter['floatUnit'] = preferences[key];
				break;
			case 'css.intUnit':
				stylesheetFormatter['intUnit'] = preferences[key];
				break;
			case 'css.unitAliases':
				const unitAliases: any = {};
				preferences[key].split(',').forEach((alias: string) => {
					if (!alias || !alias.trim() || !alias.includes(':')) {
						return;
					}
					const aliasName = alias.substr(0, alias.indexOf(':'));
					const aliasValue = alias.substr(aliasName.length + 1);
					if (!aliasName.trim() || !aliasValue) {
						return;
					}
					unitAliases[aliasName.trim()] = aliasValue;
				});
				stylesheetFormatter['unitAliases'] = unitAliases;
				break;
			case `${syntax}.valueSeparator`:
				stylesheetFormatter['between'] = preferences[key];
				break;
			case `${syntax}.propertyEnd`:
				stylesheetFormatter['after'] = preferences[key];
				break;
			default:
				break;
		}
	}
	return {
		stylesheet: stylesheetFormatter
	};
}

/**
 * Updates customizations from snippets.json and syntaxProfiles.json files in the directory configured in emmet.extensionsPath setting
 * @param emmetExtensionsPathSetting setting passed from emmet.extensionsPath. Supports multiple paths
 */
export async function updateExtensionsPath(emmetExtensionsPathSetting: string[], fs: FileService, workspaceFolderPaths?: URI[], homeDir?: URI): Promise<void> {
	resetSettingsFromFile();

	if (!emmetExtensionsPathSetting.length) {
		return;
	}

	// Extract URIs from the given setting
	const emmetExtensionsPathUri: URI[] = [];
	for (let emmetExtensionsPath of emmetExtensionsPathSetting) {
		if (emmetExtensionsPath) {
			emmetExtensionsPath = emmetExtensionsPath.trim();
		}

		if (emmetExtensionsPath.length && emmetExtensionsPath[0] === '~') {
			if (homeDir) {
				emmetExtensionsPathUri.push(joinPath(homeDir, emmetExtensionsPath.substr(1)));
			}
		} else if (!isAbsolutePath(emmetExtensionsPath)) {
			if (workspaceFolderPaths) {
				// Try pushing the path for each workspace root
				for (const workspacePath of workspaceFolderPaths) {
					emmetExtensionsPathUri.push(joinPath(workspacePath, emmetExtensionsPath));
				}
			}
		} else {
			emmetExtensionsPathUri.push(URI.file(emmetExtensionsPath));
		}
	}

	// For each URI, grab the files
	for (const uri of emmetExtensionsPathUri) {
		try {
			if ((await fs.stat(uri)).type !== FileType.Directory) {
				// Invalid directory, or path is not a directory
				continue;
			}
		} catch (e) {
			// stat threw an error
			continue;
		}

		const snippetsPath = joinPath(uri, 'snippets.json');
		const profilesPath = joinPath(uri, 'syntaxProfiles.json');
		let decoder: TextDecoder | undefined;
		if (typeof (globalThis as any).TextDecoder === 'function') {
			decoder = new (globalThis as any).TextDecoder() as TextDecoder;
		} else {
			decoder = new TextDecoder();
		}

		// the only errors we want to throw here are JSON parse errors
		let snippetsDataStr = "";
		try {
			const snippetsData = await fs.readFile(snippetsPath);
			snippetsDataStr = decoder.decode(snippetsData);
		} catch (e) {
		}
		if (snippetsDataStr.length) {
			try {
				const snippetsJson = tryParseFile(snippetsPath, snippetsDataStr);
				if (snippetsJson['variables']) {
					updateVariables(snippetsJson['variables']);
				}
				updateSnippets(snippetsJson);
			} catch (e) {
				resetSettingsFromFile();
				throw e;
			}
		}

		let profilesDataStr = "";
		try {
			const profilesData = await fs.readFile(profilesPath);
			profilesDataStr = decoder.decode(profilesData);
		} catch (e) {
		}
		if (profilesDataStr.length) {
			try {
				const profilesJson = tryParseFile(profilesPath, profilesDataStr);
				updateProfiles(profilesJson);
			} catch (e) {
				resetSettingsFromFile();
				throw e;
			}
		}
	}
}

function tryParseFile(strPath: URI, dataStr: string): any {
	let errors: JSONC.ParseError[] = [];
	const json = JSONC.parse(dataStr, errors);
	if (errors.length) {
		throw new Error(`Found error ${JSONC.printParseErrorCode(errors[0].error)} while parsing the file ${strPath} at offset ${errors[0].offset}`);
	}
	return json;
}

/**
 * Assigns variables from one snippet file under emmet.extensionsPath to
 * variablesFromFile
 */
function updateVariables(varsJson: any) {
	if (typeof varsJson === 'object' && varsJson) {
		variablesFromFile = Object.assign({}, variablesFromFile, varsJson);
	} else {
		throw new Error(l10n.t('Invalid emmet.variables field. See https://code.visualstudio.com/docs/editor/emmet#_emmet-configuration for a valid example.'));
	}
}

/**
 * Assigns profiles from one profile file under emmet.extensionsPath to
 * profilesFromFile
 */
function updateProfiles(profileJson: any) {
	if (typeof profileJson === 'object' && profileJson) {
		profilesFromFile = Object.assign({}, profilesFromFile, profileJson);
	} else {
		throw new Error(l10n.t('Invalid syntax profile. See https://code.visualstudio.com/docs/editor/emmet#_emmet-configuration for a valid example.'));
	}
}

/**
 * Assigns snippets from one snippet file under emmet.extensionsPath to
 * customSnippetsRegistry, snippetKeyCache, and stylesheetCustomSnippetsKeyCache
 */
function updateSnippets(snippetsJson: any) {
	if (typeof snippetsJson === 'object' && snippetsJson) {
		Object.keys(snippetsJson).forEach(syntax => {
			if (!snippetsJson[syntax]['snippets']) {
				return;
			}
			const baseSyntax = getDefaultSyntax(syntax);
			let customSnippets = snippetsJson[syntax]['snippets'];
			if (snippetsJson[baseSyntax] && snippetsJson[baseSyntax]['snippets'] && baseSyntax !== syntax) {
				customSnippets = Object.assign({}, snippetsJson[baseSyntax]['snippets'], snippetsJson[syntax]['snippets'])
			}
			if (!isStyleSheet(syntax)) {
				// In Emmet 2.0 all snippets should be valid abbreviations
				// Convert old snippets that do not follow this format to new format
				for (const snippetKey in customSnippets) {
					if (customSnippets.hasOwnProperty(snippetKey)
						&& customSnippets[snippetKey].startsWith('<')
						&& customSnippets[snippetKey].endsWith('>')) {
						customSnippets[snippetKey] = `{${customSnippets[snippetKey]}}`
					}
				}
			} else {
				const prevSnippetKeys = stylesheetCustomSnippetsKeyCache.get(syntax);
				const mergedSnippetKeys = Object.assign([], prevSnippetKeys, Object.keys(customSnippets));
				stylesheetCustomSnippetsKeyCache.set(syntax, mergedSnippetKeys);
			}
			const prevSnippetsRegistry = customSnippetsRegistry[syntax];
			const newSnippets = parseSnippets(customSnippets);
			const mergedSnippets = Object.assign({}, prevSnippetsRegistry, newSnippets);
			customSnippetsRegistry[syntax] = mergedSnippets;
		});
	} else {
		throw new Error(l10n.t('Invalid snippets file. See https://code.visualstudio.com/docs/editor/emmet#_using-custom-emmet-snippets for a valid example.'));
	}
}

function resetSettingsFromFile() {
	customSnippetsRegistry = {};
	snippetKeyCache.clear();
	stylesheetCustomSnippetsKeyCache.clear();
	profilesFromFile = {};
	variablesFromFile = {};
}


/**
* Get the corresponding emmet mode for given vscode language mode
* Eg: jsx for typescriptreact/javascriptreact or pug for jade
* If the language is not supported by emmet or has been exlcuded via `exlcudeLanguages` setting,
* then nothing is returned
*
* @param language
* @param exlcudedLanguages Array of language ids that user has chosen to exlcude for emmet
*/
export function getEmmetMode(language: string, excludedLanguages: string[] = []): string | undefined {
	if (!language || excludedLanguages.includes(language)) {
		return;
	}
	if (/\b(typescriptreact|javascriptreact|jsx-tags)\b/.test(language)) { // treat tsx like jsx
		return 'jsx';
	}
	if (language === 'sass-indented') { // map sass-indented to sass
		return 'sass';
	}
	if (language === 'jade') {
		return 'pug';
	}
	if (syntaxes.markup.includes(language) || syntaxes.stylesheet.includes(language)) {
		return language;
	}
}
