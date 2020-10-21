/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Position, Range, CompletionItem, CompletionList, TextEdit, InsertTextFormat, CompletionItemKind } from 'vscode-languageserver-types'
import { TextDocument } from 'vscode-languageserver-textdocument';

import * as JSONC from 'jsonc-parser';
import { cssData, htmlData } from './data';
import { URI } from 'vscode-uri';
import { FileService, joinPath, isAbsolutePath, FileType, FileStat } from './fileService';
import { TextDecoder } from 'util';

import expand, { Config, extract, ExtractOptions, MarkupAbbreviation, Options, parseMarkup, parseStylesheet, resolveConfig, stringifyMarkup, stringifyStylesheet, StylesheetAbbreviation, SyntaxType, UserConfig } from 'emmet';
import { parseSnippets, SnippetsMap, syntaxes } from './configCompat';

// /* workaround for webpack issue: https://github.com/webpack/webpack/issues/5756
//  @emmetio/extract-abbreviation has a cjs that uses a default export
// */
// const extract = typeof _extractAbbreviation === 'function' ? _extractAbbreviation : _extractAbbreviation.default;


export { FileService, FileType, FileStat }

const snippetKeyCache = new Map<string, string[]>();
let markupSnippetKeys: string[];
const stylesheetCustomSnippetsKeyCache = new Map<string, string[]>();
const htmlAbbreviationStartRegex = /^[a-z,A-Z,!,(,[,#,\.]/;
const cssAbbreviationRegex = /^-?[a-z,A-Z,!,@,#]/;
const htmlAbbreviationRegex = /[a-z,A-Z\.]/;
const commonlyUsedTags = [...htmlData.tags, 'lorem'];
const bemFilterSuffix = 'bem';
const filterDelimitor = '|';
const trimFilterSuffix = 't';
const commentFilterSuffix = 'c';
const maxFilters = 3;
const vendorPrefixes = { 'w': "webkit", 'm': "moz", 's': "ms", 'o': "o" };
const defaultVendorProperties = {
	'w': "animation, animation-delay, animation-direction, animation-duration, animation-fill-mode, animation-iteration-count, animation-name, animation-play-state, animation-timing-function, appearance, backface-visibility, background-clip, background-composite, background-origin, background-size, border-fit, border-horizontal-spacing, border-image, border-vertical-spacing, box-align, box-direction, box-flex, box-flex-group, box-lines, box-ordinal-group, box-orient, box-pack, box-reflect, box-shadow, color-correction, column-break-after, column-break-before, column-break-inside, column-count, column-gap, column-rule-color, column-rule-style, column-rule-width, column-span, column-width, dashboard-region, font-smoothing, highlight, hyphenate-character, hyphenate-limit-after, hyphenate-limit-before, hyphens, line-box-contain, line-break, line-clamp, locale, margin-before-collapse, margin-after-collapse, marquee-direction, marquee-increment, marquee-repetition, marquee-style, mask-attachment, mask-box-image, mask-box-image-outset, mask-box-image-repeat, mask-box-image-slice, mask-box-image-source, mask-box-image-width, mask-clip, mask-composite, mask-image, mask-origin, mask-position, mask-repeat, mask-size, nbsp-mode, perspective, perspective-origin, rtl-ordering, text-combine, text-decorations-in-effect, text-emphasis-color, text-emphasis-position, text-emphasis-style, text-fill-color, text-orientation, text-security, text-stroke-color, text-stroke-width, transform, transition, transform-origin, transform-style, transition-delay, transition-duration, transition-property, transition-timing-function, user-drag, user-modify, user-select, writing-mode, svg-shadow, box-sizing, border-radius",
	'm': "animation-delay, animation-direction, animation-duration, animation-fill-mode, animation-iteration-count, animation-name, animation-play-state, animation-timing-function, appearance, backface-visibility, background-inline-policy, binding, border-bottom-colors, border-image, border-left-colors, border-right-colors, border-top-colors, box-align, box-direction, box-flex, box-ordinal-group, box-orient, box-pack, box-shadow, box-sizing, column-count, column-gap, column-rule-color, column-rule-style, column-rule-width, column-width, float-edge, font-feature-settings, font-language-override, force-broken-image-icon, hyphens, image-region, orient, outline-radius-bottomleft, outline-radius-bottomright, outline-radius-topleft, outline-radius-topright, perspective, perspective-origin, stack-sizing, tab-size, text-blink, text-decoration-color, text-decoration-line, text-decoration-style, text-size-adjust, transform, transform-origin, transform-style, transition, transition-delay, transition-duration, transition-property, transition-timing-function, user-focus, user-input, user-modify, user-select, window-shadow, background-clip, border-radius",
	's': "accelerator, backface-visibility, background-position-x, background-position-y, behavior, block-progression, box-align, box-direction, box-flex, box-line-progression, box-lines, box-ordinal-group, box-orient, box-pack, content-zoom-boundary, content-zoom-boundary-max, content-zoom-boundary-min, content-zoom-chaining, content-zoom-snap, content-zoom-snap-points, content-zoom-snap-type, content-zooming, filter, flow-from, flow-into, font-feature-settings, grid-column, grid-column-align, grid-column-span, grid-columns, grid-layer, grid-row, grid-row-align, grid-row-span, grid-rows, high-contrast-adjust, hyphenate-limit-chars, hyphenate-limit-lines, hyphenate-limit-zone, hyphens, ime-mode, interpolation-mode, layout-flow, layout-grid, layout-grid-char, layout-grid-line, layout-grid-mode, layout-grid-type, line-break, overflow-style, perspective, perspective-origin, perspective-origin-x, perspective-origin-y, scroll-boundary, scroll-boundary-bottom, scroll-boundary-left, scroll-boundary-right, scroll-boundary-top, scroll-chaining, scroll-rails, scroll-snap-points-x, scroll-snap-points-y, scroll-snap-type, scroll-snap-x, scroll-snap-y, scrollbar-arrow-color, scrollbar-base-color, scrollbar-darkshadow-color, scrollbar-face-color, scrollbar-highlight-color, scrollbar-shadow-color, scrollbar-track-color, text-align-last, text-autospace, text-justify, text-kashida-space, text-overflow, text-size-adjust, text-underline-position, touch-action, transform, transform-origin, transform-origin-x, transform-origin-y, transform-origin-z, transform-style, transition, transition-delay, transition-duration, transition-property, transition-timing-function, user-select, word-break, wrap-flow, wrap-margin, wrap-through, writing-mode",
	'o': "dashboard-region, animation, animation-delay, animation-direction, animation-duration, animation-fill-mode, animation-iteration-count, animation-name, animation-play-state, animation-timing-function, border-image, link, link-source, object-fit, object-position, tab-size, table-baseline, transform, transform-origin, transition, transition-delay, transition-duration, transition-property, transition-timing-function, accesskey, input-format, input-required, marquee-dir, marquee-loop, marquee-speed, marquee-style"
}
const vendorPrefixesEnabled = false;

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
export function doComplete(document: TextDocument, position: Position, syntax: string, emmetConfig: VSCodeEmmetConfig): CompletionList {
	if (emmetConfig.showExpandedAbbreviation === 'never' || !getEmmetMode(syntax, emmetConfig.excludeLanguages)) {
		return;
	}

	const isStyleSheetRes = isStyleSheet(syntax);

	// Fetch markupSnippets so that we can provide possible abbreviation completions
	// For example, when text at position is `a`, completions should return `a:blank`, `a:link`, `acr` etc.
	if (!isStyleSheetRes) {
		if (!snippetKeyCache.has(syntax)) {
			const registry = customSnippetsRegistry[syntax] ?? getDefaultSnippets(syntax);
			snippetKeyCache.set(syntax, Object.keys(registry));
		}
		markupSnippetKeys = snippetKeyCache.get(syntax);
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

	let expandedText: string;
	let expandedAbbr: CompletionItem;
	let completionItems: CompletionItem[] = [];

	// Create completion item after expanding given abbreviation 
	// if abbreviation is valid and expanded value is not noise
	const createExpandedAbbr = (syntax: string, abbr: string) => {
		if (!isAbbreviationValid(syntax, abbreviation)) {
			return;
		}

		try {
			expandedText = expand(abbr, expandOptions);
		} catch (e) {
		}

		if (!expandedText || isExpandedTextNoise(syntax, abbr, expandedText)) {
			return;
		}

		expandedAbbr = CompletionItem.create(abbr);
		expandedAbbr.textEdit = TextEdit.replace(abbreviationRange, escapeNonTabStopDollar(addFinalTabStop(expandedText)));
		expandedAbbr.documentation = replaceTabStopsWithCursors(expandedText);
		expandedAbbr.insertTextFormat = InsertTextFormat.Snippet;
		expandedAbbr.detail = 'Emmet Abbreviation';
		expandedAbbr.label = abbreviation;
		expandedAbbr.label += filter ? '|' + filter.replace(',', '|') : "";
		completionItems = [expandedAbbr];
	}

	if (isStyleSheet(syntax)) {
		const { prefixOptions, abbreviationWithoutPrefix } = splitVendorPrefix(abbreviation);
		createExpandedAbbr(syntax, abbreviationWithoutPrefix);

		// When abbr is longer than usual emmet snippets and matches better with existing css property, then no emmet
		if (abbreviationWithoutPrefix.length > 4
			&& cssData.properties.find(x => x.startsWith(abbreviationWithoutPrefix))) {
			return CompletionList.create([], true);
		}

		if (expandedAbbr) {
			const prefixedExpandedText = applyVendorPrefixes(expandedText, prefixOptions, expandOptions.options);
			expandedAbbr.textEdit = TextEdit.replace(abbreviationRange, escapeNonTabStopDollar(addFinalTabStop(prefixedExpandedText)));
			expandedAbbr.documentation = replaceTabStopsWithCursors(prefixedExpandedText);
			expandedAbbr.label = removeTabStops(expandedText);
			expandedAbbr.filterText = abbreviation;

			// Custom snippets should show up in completions if abbreviation is a prefix
			const stylesheetCustomSnippetsKeys = stylesheetCustomSnippetsKeyCache.has(syntax) ? stylesheetCustomSnippetsKeyCache.get(syntax) : stylesheetCustomSnippetsKeyCache.get('css');
			completionItems = makeSnippetSuggestion(stylesheetCustomSnippetsKeys, abbreviation, abbreviation, abbreviationRange, expandOptions, 'Emmet Custom Snippet', false);

			if (!completionItems.find(x => x.textEdit.newText === expandedAbbr.textEdit.newText)) {

				// Fix for https://github.com/Microsoft/vscode/issues/28933#issuecomment-309236902
				// When user types in propertyname, emmet uses it to match with snippet names, resulting in width -> widows or font-family -> font: family
				// Filter out those cases here.
				const abbrRegex = new RegExp('.*' + abbreviationWithoutPrefix.split('').map(x => (x === '$' || x === '+') ? '\\' + x : x).join('.*') + '.*', 'i');
				if (/\d/.test(abbreviation) || abbrRegex.test(expandedAbbr.label)) {
					completionItems.push(expandedAbbr);
				}
			}
		}

		if (vendorPrefixesEnabled) {
			// Incomplete abbreviations that use vendor prefix
			if (!completionItems.length && (abbreviation === '-' || /^-[wmso]{1,4}-?$/.test(abbreviation))) {
				return CompletionList.create([], true);
			}
		}
	} else {
		createExpandedAbbr(syntax, abbreviation);

		let tagToFindMoreSuggestionsFor = abbreviation;
		const newTagMatches = abbreviation.match(/(>|\+)([\w:-]+)$/);
		if (newTagMatches && newTagMatches.length === 3) {
			tagToFindMoreSuggestionsFor = newTagMatches[2];
		}

		const commonlyUsedTagSuggestions = makeSnippetSuggestion(commonlyUsedTags, tagToFindMoreSuggestionsFor, abbreviation, abbreviationRange, expandOptions, 'Emmet Abbreviation');
		completionItems = completionItems.concat(commonlyUsedTagSuggestions);

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
	const snippetCompletions = [];
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

function getCurrentWord(currentLineTillPosition: string): string {
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

function addFinalTabStop(text): string {
	if (!text || !text.trim()) {
		return text;
	}

	let maxTabStop = -1;
	let maxTabStopRanges = [];
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
				maxTabStop = currentTabStop;
				maxTabStopRanges = [{ numberStart, numberEnd }];
				replaceWithLastStop = !foundPlaceholder;
			} else if (currentTabStop == maxTabStop) {
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

export const emmetSnippetField = (index, placeholder) => `\${${index}${placeholder ? ':' + placeholder : ''}}`;

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
	const syntaxToUse = isStyleSheet(syntax) ? getDefaultSyntax(syntax) : syntax;
	const emptyUserConfig: UserConfig = { type: syntaxType, syntax: syntaxToUse };
	const resolvedConfig: Config = resolveConfig(emptyUserConfig);
	return resolvedConfig.snippets;
}

function getFilters(text: string, pos: number): { pos: number, filter: string } {
	let filter;
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
export function extractAbbreviation(document: TextDocument, position: Position, options?: Partial<ExtractOptions>): { abbreviation: string, abbreviationRange: Range, filter: string } {
	const currentLine = getCurrentLine(document, position);
	const currentLineTillPosition = currentLine.substr(0, position.character);
	const { pos, filter } = getFilters(currentLineTillPosition, position.character);
	const lengthOccupiedByFilter = filter ? filter.length + 1 : 0;

	try {
		const result = extract(currentLine, pos, options);
		const rangeToReplace = Range.create(position.line, result.location, position.line, result.location + result.abbreviation.length + lengthOccupiedByFilter);
		return {
			abbreviationRange: rangeToReplace,
			abbreviation: result.abbreviation,
			filter
		};
	}
	catch (e) {
	}
}

/**
 * Extracts abbreviation from the given text		
 * @param text Text from which abbreviation needs to be extracted
 * @param syntax Syntax used to extract the abbreviation from the given text
 */
export function extractAbbreviationFromText(text: string, syntax?: string): { abbreviation: string, filter: string } {
	if (!text) {
		return;
	}

	const { pos, filter } = getFilters(text, text.length);

	try {
		const extractOptions = (isStyleSheet(syntax) || syntax === 'stylesheet') ?
			{ syntax: 'stylesheet', lookAhead: false } : { lookAhead: true };
		const result = extract(text, pos, extractOptions);
		return {
			abbreviation: result.abbreviation,
			filter
		};
	}
	catch (e) {
	}
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
		// Fix for https://github.com/Microsoft/vscode/issues/1623 in new emmet
		if (abbreviation.endsWith(':')) {
			return false;
		}
		if (abbreviation.includes('#')) {
			return hexColorRegex.test(abbreviation) || propertyHexColorRegex.test(abbreviation);
		}
		return cssAbbreviationRegex.test(abbreviation);
	}
	if (abbreviation.startsWith('!')) {
		return !/[^!]/.test(abbreviation);
	}

	// Its common for users to type (sometextinsidebrackets), this should not be treated as an abbreviation
	// Grouping in abbreviation is valid only if it's inside a text node or preceeded/succeeded with one of the symbols for nesting, sibling, repeater or climb up
	if ((/\(/.test(abbreviation) || /\)/.test(abbreviation)) && !/\{[^\}\{]*[\(\)]+[^\}\{]*\}(?:[>\+\*\^]|$)/.test(abbreviation) && !/\(.*\)[>\+\*\^]/.test(abbreviation) && !/[>\+\*\^]\(.*\)/.test(abbreviation)) {
		return false;
	}

	return (htmlAbbreviationStartRegex.test(abbreviation) && htmlAbbreviationRegex.test(abbreviation));
}

function isExpandedTextNoise(syntax: string, abbreviation: string, expandedText: string): boolean {
	// Unresolved css abbreviations get expanded to a blank property value
	// Eg: abc -> abc: ; or abc:d -> abc: d; which is noise if it gets suggested for every word typed
	if (isStyleSheet(syntax)) {
		const after = (syntax === 'sass' || syntax === 'stylus') ? '' : ';';
		return expandedText === `${abbreviation}: \${1}${after}` || expandedText.replace(/\s/g, '') === abbreviation.replace(/\s/g, '') + after;
	}

	if (commonlyUsedTags.includes(abbreviation.toLowerCase()) || markupSnippetKeys.includes(abbreviation)) {
		return false;
	}

	// Custom tags can have - or :
	if (/[-,:]/.test(abbreviation) && !/--|::/.test(abbreviation) && !abbreviation.endsWith(':')) {
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

	const dotMatches = abbreviation.match(/^([a-z,A-Z,\d]*)\.$/)
	if (dotMatches) {
		// Valid html tags such as `div.`
		if (dotMatches[1] && htmlData.tags.includes(dotMatches[1])) {
			return false
		}
		return true;
	}

	// Unresolved html abbreviations get expanded as if it were a tag
	// Eg: abc -> <abc></abc> which is noise if it gets suggested for every word typed
	return (expandedText.toLowerCase() === `<${abbreviation.toLowerCase()}>\${1}</${abbreviation.toLowerCase()}>`);
}

/**
 * Returns options to be used by emmet
 */
export function getExpandOptions(syntax: string, emmetConfig?: VSCodeEmmetConfig, filter?: string): UserConfig {
	emmetConfig = emmetConfig || {};
	emmetConfig['preferences'] = emmetConfig['preferences'] || {};

	const preferences = emmetConfig['preferences'];
	const stylesheetSyntax = isStyleSheet(syntax) ? syntax : 'css';

	// Fetch Profile
	const profile = getProfile(syntax, emmetConfig['syntaxProfiles']);
	const filtersFromProfile: string[] = (profile && profile['filters']) ? profile['filters'].split(',') : [];
	const trimmedFilters = filtersFromProfile.map(filterFromProfile => filterFromProfile.trim());
	const bemEnabled = (filter && filter.split(',').some(x => x.trim() === 'bem')) || trimmedFilters.includes('bem');
	const commentEnabled = (filter && filter.split(',').some(x => x.trim() === 'c')) || trimmedFilters.includes('c');

	// Fetch formatters
	const formatters = getFormatters(syntax, emmetConfig['preferences']);
	const unitAliases: SnippetsMap = (formatters?.stylesheet && formatters.stylesheet['unitAliases']) || {};

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
		// 'output.inlineBreak': profile['inlineBreak'],
		'output.compactBoolean': false,
		// 'output.booleanAttributes': string[],
		// 'output.reverseAttributes': boolean,
		// 'output.selfClosingStyle': profile['selfClosingStyle'],
		'output.field': emmetSnippetField,
		// 'output.text': TextOutput,
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
		// 'stylesheet.shortHex': boolean,
		'stylesheet.between': ': ',
		'stylesheet.after': ';',
		'stylesheet.intUnit': 'px',
		'stylesheet.floatUnit': 'em',
		'stylesheet.unitAliases': { e: 'em', p: '%', x: 'ex', r: 'rem' },
		// 'stylesheet.json': boolean,
		// 'stylesheet.jsonDoubleQuotes': boolean,
		'stylesheet.fuzzySearchMinScore': 0.3,
	};

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
		'output.inlineBreak': profile['inlineBreak'],
		'output.compactBoolean': profile['compactBooleanAttributes'] ?? preferences['profile.allowCompactBoolean'],
		// 'output.booleanAttributes': string[],
		// 'output.reverseAttributes': boolean,
		'output.selfClosingStyle': profile['selfClosingStyle'],
		'output.field': emmetSnippetField,
		// 'output.text': TextOutput,
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
		// 'stylesheet.shortHex': boolean,
		'stylesheet.between': preferences[`${stylesheetSyntax}.valueSeparator`],
		'stylesheet.after': preferences[`${stylesheetSyntax}.propertyEnd`],
		'stylesheet.intUnit': preferences['css.intUnit'],
		'stylesheet.floatUnit': preferences['css.floatUnit'],
		'stylesheet.unitAliases': unitAliases,
		// 'stylesheet.json': boolean,
		// 'stylesheet.jsonDoubleQuotes': boolean,
		'stylesheet.fuzzySearchMinScore': preferences['css.fuzzySearchMinScore'],
	}

	const combinedOptions = {};
	[ ...Object.keys(defaultVSCodeOptions), ...Object.keys(userPreferenceOptions) ].forEach(key => {
		combinedOptions[key] = userPreferenceOptions[key] ?? defaultVSCodeOptions[key];
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
		text: null,
		maxRepeat: 1000,
		// cache: null
	};
}

function splitVendorPrefix(abbreviation: string): { prefixOptions: string, abbreviationWithoutPrefix: string } {
	if (!vendorPrefixesEnabled) {
		return {
			prefixOptions: '',
			abbreviationWithoutPrefix: abbreviation
		}
	}

	abbreviation = abbreviation || "";
	if (abbreviation[0] != '-') {
		return {
			prefixOptions: "",
			abbreviationWithoutPrefix: abbreviation
		};
	} else {
		abbreviation = abbreviation.substr(1);
		let pref = "-";
		if (/^[wmso]*-./.test(abbreviation)) {
			const index = abbreviation.indexOf("-");
			if (index > -1) {
				pref += abbreviation.substr(0, index + 1);
				abbreviation = abbreviation.substr(index + 1);
			}
		}
		return {
			prefixOptions: pref,
			abbreviationWithoutPrefix: abbreviation
		};
	}
}

function applyVendorPrefixes(expandedProperty: string, vendors: string, preferences: any): string {
	if (!vendorPrefixesEnabled) {
		return expandedProperty;
	}

	preferences = preferences || {};
	expandedProperty = expandedProperty || "";
	vendors = vendors || "";

	if (vendors[0] !== '-') {
		return expandedProperty;
	}

	if (vendors == "-") {
		let defaultVendors = "-";
		const property = expandedProperty.substr(0, expandedProperty.indexOf(':'));
		if (!property) {
			return expandedProperty;
		}

		for (const v in vendorPrefixes) {
			const vendorProperties = preferences['css.' + vendorPrefixes[v] + 'Properties'];
			if (vendorProperties && vendorProperties.split(',').find(x => x.trim() === property)) defaultVendors += v;
		}

		// If no vendors specified, add all
		vendors = defaultVendors == "-" ? "-wmso" : defaultVendors;
		vendors += '-';
	}
	vendors = vendors.substr(1);

	let prefixedProperty = "";
	for (let index = 0; index < vendors.length - 1; index++) {
		prefixedProperty += '-' + vendorPrefixes[vendors[index]] + '-' + expandedProperty + "\n";
	}
	return prefixedProperty + expandedProperty;
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
			const { prefixOptions, abbreviationWithoutPrefix } = splitVendorPrefix(abbreviation);
			expandedText = expand(abbreviationWithoutPrefix, resolvedConfig);
			expandedText = applyVendorPrefixes(expandedText, prefixOptions, resolvedConfig.options);
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
function getProfile(syntax: string, profilesFromSettings: object): any {
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
	const newOptions = {};
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
function getVariables(variablesFromSettings: object): any {
	if (!variablesFromSettings) {
		return variablesFromFile;
	}
	return Object.assign({}, variablesFromFile, variablesFromSettings);
}

function getFormatters(syntax: string, preferences: any) {
	if (!preferences) {
		return {};
	}

	if (!isStyleSheet(syntax)) {
		const commentFormatter = {};
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
	let fuzzySearchMinScore = typeof preferences['css.fuzzySearchMinScore'] === 'number' ? preferences['css.fuzzySearchMinScore'] : 0.3;
	if (fuzzySearchMinScore > 1) {
		fuzzySearchMinScore = 1
	} else if (fuzzySearchMinScore < 0) {
		fuzzySearchMinScore = 0
	}
	const stylesheetFormatter = {
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
				const unitAliases = {};
				preferences[key].split(',').forEach(alias => {
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
 */
export async function updateExtensionsPath(emmetExtensionsPath: string | undefined | null, fs: FileService, workspaceFolderPath?: URI, homeDir?: URI): Promise<void> {
	if (emmetExtensionsPath) {
		emmetExtensionsPath = emmetExtensionsPath.trim();
	}
	if (!emmetExtensionsPath) {
		resetSettingsFromFile();
		return Promise.resolve();
	}

	let emmetExtensionsPathUri: URI | undefined;
	if (emmetExtensionsPath[0] === '~') {
		if (homeDir) {
			emmetExtensionsPathUri = joinPath(homeDir, emmetExtensionsPath.substr(1));
		}
	} else if (!isAbsolutePath(emmetExtensionsPath)) {
		if (workspaceFolderPath) {
			emmetExtensionsPathUri = joinPath(workspaceFolderPath, emmetExtensionsPath);
		}
	} else {
		emmetExtensionsPathUri = URI.file(emmetExtensionsPath);
	}

	if (!emmetExtensionsPathUri || (await fs.stat(emmetExtensionsPathUri)).type !== FileType.Directory) {
		resetSettingsFromFile();
		return Promise.reject(`The directory ${emmetExtensionsPath} doesn't exist. Update emmet.extensionsPath setting`);
	}

	const snippetsPath = joinPath(emmetExtensionsPathUri, 'snippets.json');
	const profilesPath = joinPath(emmetExtensionsPathUri, 'syntaxProfiles.json');

	try {
		const snippetsData = await fs.readFile(snippetsPath);
		const snippetsDataStr = new TextDecoder().decode(snippetsData);

		const errors: JSONC.ParseError[] = [];
		const snippetsJson = JSONC.parse(snippetsDataStr, errors);
		if (errors.length > 0) {
			throw new Error(`Found error ${JSONC.printParseErrorCode(errors[0].error)} while parsing the file ${snippetsPath} at offset ${errors[0].offset}`);
		}
		variablesFromFile = snippetsJson['variables'];
		customSnippetsRegistry = {};
		snippetKeyCache.clear();
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
				stylesheetCustomSnippetsKeyCache.set(syntax, Object.keys(customSnippets));
			}

			customSnippetsRegistry[syntax] = parseSnippets(customSnippets);

			const snippetKeys: string[] = Object.keys(customSnippetsRegistry[syntax]);
			snippetKeyCache.set(syntax, snippetKeys);
		});
	} catch (e) {
		resetSettingsFromFile();
		throw new Error(`Error while parsing the file ${snippetsPath}`);
	}

	try {
		const profilesData = await fs.readFile(profilesPath);
		const profilesDataStr = new TextDecoder().decode(profilesData);
		profilesFromFile = JSON.parse(profilesDataStr);
	} catch (e) {
		// 
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

const propertyHexColorRegex = /^[a-zA-Z]+:?#[\d.a-fA-F]{0,6}$/;
const hexColorRegex = /^#[\d,a-f,A-F]{1,6}$/;
const onlyLetters = /^[a-z,A-Z]+$/;

/**
 * Returns a completion participant for Emmet of the form {
 * 		onCssProperty: () => void
 * 		onCssPropertyValue: () => void
 * 		onHtmlContent: () => void
 * }
 * @param document The TextDocument for which completions are being provided
 * @param position The Position in the given document where completions are being provided
 * @param syntax The Emmet syntax to use when providing Emmet completions
 * @param emmetSettings The Emmet settings to use when providing Emmet completions
 * @param result The Completion List object that needs to be updated with Emmet completions
 */
export function getEmmetCompletionParticipants(document: TextDocument, position: Position, syntax: string, emmetSettings: VSCodeEmmetConfig, result: CompletionList): any {
	return {
		getId: () => 'emmet',
		onCssProperty: (context) => {
			if (context && context.propertyName) {
				const currentresult = doComplete(document, position, syntax, emmetSettings);
				if (result && currentresult) {
					result.items = currentresult.items;
					result.isIncomplete = true;
				}
			}
		},
		onCssPropertyValue: (context) => {
			if (context && context.propertyValue) {
				const extractOptions: Partial<ExtractOptions> = { lookAhead: false, type: 'stylesheet' };
				const extractedResults = extractAbbreviation(document, position, extractOptions);
				if (!extractedResults) {
					return;
				}
				const validAbbreviationWithColon = extractedResults.abbreviation === `${context.propertyName}:${context.propertyValue}` && onlyLetters.test(context.propertyValue);
				if (validAbbreviationWithColon // Allows abbreviations like pos:f
					|| hexColorRegex.test(extractedResults.abbreviation)
					|| extractedResults.abbreviation === '!') {
					const currentresult = doComplete(document, position, syntax, emmetSettings);
					if (result && currentresult) {
						result.items = currentresult.items;
						result.isIncomplete = true;
					}
				}
			}
		},
		onHtmlContent: () => {
			const currentresult = doComplete(document, position, syntax, emmetSettings);
			if (result && currentresult) {
				result.items = currentresult.items;
				result.isIncomplete = true;
			}
		}
	};
}



