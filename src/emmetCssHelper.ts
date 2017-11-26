/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { TextDocument, Position, Range, CompletionItem, CompletionList, TextEdit, InsertTextFormat } from 'vscode-languageserver-types'
import { expand, createSnippetsRegistry } from './expand/expand-full';
import * as path from 'path';
import * as fs from 'fs';

const stylesheetCustomSnippetsKeyCache = new Map<string, string[]>();
const cssAbbreviationRegex = /^[a-z,A-Z,!,@,#]/;
interface EmmetConfiguration {
	showExpandedAbbreviation: string;
	showAbbreviationSuggestions: boolean;
	syntaxProfiles: object;
	variables: object;
	preferences: object;
}

export function doComplete(document: TextDocument, position: Position, syntax: string, emmetConfig: EmmetConfiguration): CompletionList {

	let abbreviation = extractAbbreviation(document, position).substr(0, position.character);
	if (!abbreviation) {
		return CompletionList.create([], true);
	}

	let abbreviationRange = Range.create(position.line, position.character - abbreviation.length, position.line, position.character);

	let expandOptions = getCssExpandOptions(syntax, emmetConfig);
	let expandedText;
	let expandedAbbr: CompletionItem;
	let completionItems: CompletionItem[] = [];

	// If abbreviation is valid, then expand it and ensure the expanded value is not noise
	if (isCssAbbreviationValid(syntax, abbreviation)) {
		try {
			expandedText = expand(abbreviation, expandOptions);
		} catch (e) {
		}

		if (expandedText && isCssExpandedTextNoise(syntax, abbreviation, expandedText)) {
			expandedText = '';
		}
	}

	if (!expandedText) {
		return CompletionList.create([], true);
	}

	// Create completion item for expanded abbreviation

	expandedAbbr = CompletionItem.create(abbreviation);
	expandedAbbr.textEdit = TextEdit.replace(abbreviationRange, escapeNonTabStopDollar(addFinalTabStop(expandedText)));
	expandedAbbr.documentation = replaceTabStopsWithCursors(expandedText);
	expandedAbbr.insertTextFormat = InsertTextFormat.Snippet;
	expandedAbbr.detail = 'Emmet Abbreviation';

	const stylesheetCustomSnippetsKeys = stylesheetCustomSnippetsKeyCache.has(syntax) ? stylesheetCustomSnippetsKeyCache.get(syntax) : stylesheetCustomSnippetsKeyCache.get('css');
	completionItems = makeSnippetSuggestion(stylesheetCustomSnippetsKeys, abbreviation, abbreviation, abbreviationRange, expandOptions, 'Emmet Custom Snippet', false);

	if (!completionItems.find(x => x.textEdit.newText === expandedAbbr.textEdit.newText)) {

		// Fix for https://github.com/Microsoft/vscode/issues/28933#issuecomment-309236902
		// When user types in propertyname, emmet uses it to match with snippet names, resulting in width -> widows or font-family -> font: fantasy
		// Updating the label will update the filterText used by VS Code, thus filtering out such cases
		expandedAbbr.label = removeTabStops(expandedText);

		// Fix for https://github.com/Microsoft/vscode/issues/33898 and
		// https://github.com/Microsoft/vscode/issues/32277#issuecomment-321836737
		if (/\d/.test(abbreviation)) {
			expandedAbbr.filterText = abbreviation;
		}

		completionItems.push(expandedAbbr);
	}
	return CompletionList.create(completionItems, true);

}

function makeSnippetSuggestion(snippets: string[], prefix: string, abbreviation: string, abbreviationRange: Range, expandOptions: any, snippetDetail: string, skipFullMatch: boolean = true): CompletionItem[] {
	if (!prefix || !snippets) {
		return [];
	}
	let snippetCompletions = [];
	snippets.forEach(snippetKey => {
		if (!snippetKey.startsWith(prefix.toLowerCase()) || (skipFullMatch && snippetKey === prefix.toLowerCase())) {
			return;
		}

		let currentAbbr = abbreviation + snippetKey.substr(prefix.length);
		let expandedAbbr;
		try {
			expandedAbbr = expand(currentAbbr, expandOptions);
		} catch (e) {

		}
		if (!expandedAbbr) {
			return;
		}

		let item = CompletionItem.create(prefix + snippetKey.substr(prefix.length));
		item.documentation = replaceTabStopsWithCursors(expandedAbbr);
		item.detail = snippetDetail;
		item.textEdit = TextEdit.replace(abbreviationRange, escapeNonTabStopDollar(addFinalTabStop(expandedAbbr)));
		item.insertTextFormat = InsertTextFormat.Snippet;

		snippetCompletions.push(item);
	});
	return snippetCompletions;
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
	let maxTabStopStart = -1;
	let maxTabStopEnd = -1;
	let foundLastStop = false;
	let replaceWithLastStop = false;
	let i = 0;
	let n = text.length;

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
			if (currentTabStop > maxTabStop) {
				maxTabStop = currentTabStop;
				maxTabStopStart = foundPlaceholder ? -1 : numberStart;
				maxTabStopEnd = foundPlaceholder ? -1 : numberEnd;
				replaceWithLastStop = !foundPlaceholder;
			}
		}
	} catch (e) {

	}

	if (replaceWithLastStop && !foundLastStop) {
		text = text.substr(0, maxTabStopStart) + '0' + text.substr(maxTabStopEnd);
	}

	return text;
}

function extractAbbreviation(document: TextDocument, position: Position): string {
	let offset = document.offsetAt(position);
	let text = document.getText();
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
	let currentLineTillPosition = text.substring(start, end);
	if (currentLineTillPosition) {
		let matches = currentLineTillPosition.match(/[\w,:,\-,\$]*$/);
		if (matches) {
			return matches[0];
		}
	}
}

let customSnippetRegistry = {};
const emmetSnippetField = (index, placeholder) => `\${${index}${placeholder ? ':' + placeholder : ''}}`;

/**
 * Returns a boolean denoting validity of given abbreviation in the context of given syntax
 * Not needed once https://github.com/emmetio/atom-plugin/issues/22 is fixed
 * @param syntax string
 * @param abbreviation string
 */
export function isCssAbbreviationValid(syntax: string, abbreviation: string): boolean {
	if (!abbreviation) {
		return false;
	}

	// Fix for https://github.com/Microsoft/vscode/issues/1623 in new emmet
	if (abbreviation.endsWith(':')) {
		return false;
	}
	return cssAbbreviationRegex.test(abbreviation);
}

function isCssExpandedTextNoise(syntax: string, abbreviation: string, expandedText: string): boolean {
	// Unresolved css abbreviations get expanded to a blank property value
	// Eg: abc -> abc: ; or abc:d -> abc: d; which is noise if it gets suggested for every word typed

	let after = (syntax === 'sass' || syntax === 'stylus') ? '' : ';';
	return expandedText === `${abbreviation}: \${1}${after}` || expandedText.replace(/\s/g, '') === abbreviation.replace(/\s/g, '') + after;

}

/**
 * Returns options to be used by the expand module
 * @param syntax 
 * @param textToReplace 
 */
export function getCssExpandOptions(syntax: string, emmetConfig?: object) {
	emmetConfig = emmetConfig || {};
	emmetConfig['preferences'] = emmetConfig['preferences'] || {};

	// Fetch snippet registry
	if (!customSnippetRegistry[syntax] && customSnippetRegistry['css']) {
		customSnippetRegistry[syntax] = customSnippetRegistry['css'];
	}

	// Fetch Formatters
	let formatters = getCssFormatters(syntax, emmetConfig['preferences']);

	return {
		field: emmetSnippetField,
		syntax: syntax,
		snippets: customSnippetRegistry[syntax],
		format: formatters,
		profile: undefined,
		addons: undefined,
		variables: undefined
	};
}

function getCssFormatters(syntax: string, preferences: object) {
	if (!preferences) {
		return {};
	}

	let stylesheetFormatter = {
		'fuzzySearchMinScore': 0.3
	};
	for (let key in preferences) {
		switch (key) {
			case 'css.floatUnit':
				stylesheetFormatter['floatUnit'] = preferences[key];
				break;
			case 'css.intUnit':
				stylesheetFormatter['intUnit'] = preferences[key];
				break;
			case 'css.unitAliases':
				let unitAliases = {};
				preferences[key].split(',').forEach(alias => {
					if (!alias || !alias.trim() || alias.indexOf(':') === -1) {
						return;
					}
					let aliasName = alias.substr(0, alias.indexOf(':'));
					let aliasValue = alias.substr(aliasName.length + 1);
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
export function updateCssExtensionsPath(emmetExtensionsPath: string): Promise<void> {
	if (!emmetExtensionsPath || !emmetExtensionsPath.trim()) {
		resetSettingsFromFile();
		return Promise.resolve();
	}
	if (!path.isAbsolute(emmetExtensionsPath.trim())) {
		resetSettingsFromFile();
		return Promise.reject('The path provided in emmet.extensionsPath setting should be absoulte path');
	}
	if (!dirExists(emmetExtensionsPath.trim())) {
		resetSettingsFromFile();
		return Promise.reject(`The directory ${emmetExtensionsPath.trim()} doesnt exist. Update emmet.extensionsPath setting`);
	}

	let dirPath = emmetExtensionsPath.trim();
	let snippetsPath = path.join(dirPath, 'snippets.json');

	return new Promise<void>((resolve, reject) => {
		fs.readFile(snippetsPath, (err, snippetsData) => {
			if (err) {
				return reject(`Error while fetching the file ${snippetsPath}`);
			}
			try {
				let snippetsJson = JSON.parse(snippetsData.toString());
				customSnippetRegistry = {};
				Object.keys(snippetsJson).forEach(syntax => {
					if (!snippetsJson[syntax]['snippets']) {
						return;
					}
					let baseSyntax = 'css';
					let customSnippets = snippetsJson[syntax]['snippets'];
					if (snippetsJson[baseSyntax] && snippetsJson[baseSyntax]['snippets'] && baseSyntax !== syntax) {
						customSnippets = Object.assign({}, snippetsJson[baseSyntax]['snippets'], snippetsJson[syntax]['snippets'])
					}

					stylesheetCustomSnippetsKeyCache.set(syntax, Object.keys(customSnippets));
					customSnippetRegistry[syntax] = createSnippetsRegistry(syntax, customSnippets);

				});
			} catch (e) {
				return reject(`Error while parsing the file ${snippetsPath}`);
			}
			return resolve();
		});
	});




}

function dirExists(dirPath: string): boolean {
	try {

		return fs.statSync(dirPath).isDirectory();
	} catch (e) {
		return false;
	}
}

function resetSettingsFromFile() {
	customSnippetRegistry = {};
	stylesheetCustomSnippetsKeyCache.clear();
}








