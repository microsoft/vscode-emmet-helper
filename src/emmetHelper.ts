/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { TextDocument, Position, Range, CompletionItem, CompletionList, TextEdit, InsertTextFormat } from 'vscode-languageserver-types'
import { expand, createSnippetsRegistry } from '@emmetio/expand-abbreviation';
import * as extract from '@emmetio/extract-abbreviation';
import * as path from 'path';
import * as fs from 'fs';

const snippetKeyCache = new Map<string, string[]>();
let htmlSnippetKeys: string[];
const htmlAbbreviationStartRegex = /^[a-z,A-Z,!,(,[,#,\.]/;
const htmlAbbreviationEndRegex = /[a-z,A-Z,!,),\],#,\.,},\d,*,$]$/;
const cssAbbreviationRegex = /^[a-z,A-Z,!,@,#]/;
const emmetModes = ['html', 'pug', 'slim', 'haml', 'xml', 'xsl', 'jsx', 'css', 'scss', 'sass', 'less', 'stylus'];

export interface EmmetConfiguration {
	useNewEmmet: string;
	showExpandedAbbreviation: string;
	showAbbreviationSuggestions: boolean;
	syntaxProfiles: object;
	variables: object;
}

export function doComplete(document: TextDocument, position: Position, syntax: string, emmetConfig: EmmetConfiguration): CompletionList {

	if (!emmetConfig.useNewEmmet || emmetConfig.showExpandedAbbreviation === 'never' || emmetModes.indexOf(syntax) === -1) {
		return;
	}

	if (!snippetKeyCache.has('html')) {
		let registry = customSnippetRegistry[syntax] ? customSnippetRegistry[syntax] : createSnippetsRegistry('html');
		htmlSnippetKeys = registry.all({ type: 'string' }).map(snippet => {
			return snippet.key;
		});
		snippetKeyCache.set('html', htmlSnippetKeys);
	}

	let expandedAbbr: CompletionItem;
	let [abbreviationRange, abbreviation] = extractAbbreviation(document, position);
	let expandOptions = getExpandOptions(emmetConfig.syntaxProfiles, emmetConfig.variables, syntax);

	if (isAbbreviationValid(syntax, abbreviation)) {
		let expandedText;
		// Skip cases where abc -> <abc>${1}</abc> as this is noise
		if (isStyleSheet(syntax) || !/^[a-z,A-Z]*$/.test(abbreviation) || htmlSnippetKeys.indexOf(abbreviation) > -1) {
			try {
				expandedText = expand(abbreviation, expandOptions);
				// Skip cases when abc -> abc: ; as this is noise
				if (isStyleSheet(syntax) && expandedText === `${abbreviation}: \${1};`) {
					expandedText = '';
				}
			} catch (e) {

			}
		}

		if (expandedText) {
			expandedAbbr = CompletionItem.create(abbreviation);
			expandedAbbr.textEdit = TextEdit.replace(abbreviationRange, expandedText);
			expandedAbbr.documentation = removeTabStops(expandedText);
			expandedAbbr.insertTextFormat = InsertTextFormat.Snippet;
			expandedAbbr.detail = 'Emmet Abbreviation';
			if (isStyleSheet(syntax)) {
				// See https://github.com/Microsoft/vscode/issues/28933#issuecomment-309236902
				// Due to this we set filterText, sortText and label to expanded abbreviation
				// - Label makes it clear to the user what their choice is 
				// - FilterText fixes the issue when user types in propertyname and emmet uses it to match with abbreviations
				// - SortText will sort the choice in a way that is intutive to the user
				expandedAbbr.filterText = expandedAbbr.documentation;
				expandedAbbr.sortText = expandedAbbr.documentation;
				expandedAbbr.label = expandedAbbr.documentation;
				return CompletionList.create([expandedAbbr], true);
			}
		}
	}

	let completionItems: CompletionItem[] = expandedAbbr ? [expandedAbbr] : [];
	if (!isStyleSheet(syntax)) {
		if (expandedAbbr) {
			// Workaround for the main expanded abbr not appearing before the snippet suggestions
			expandedAbbr.sortText = '0' + expandedAbbr.label;
		}

		if (emmetConfig.showAbbreviationSuggestions) {
			let currentWord = getCurrentWord(document, position);
			let abbreviationSuggestions = getAbbreviationSuggestions(syntax, currentWord, abbreviation, abbreviationRange, expandOptions);
			completionItems = completionItems.concat(abbreviationSuggestions);
		}

	}
	return CompletionList.create(completionItems, true);
}

function getAbbreviationSuggestions(syntax: string, prefix: string, abbreviation: string, abbreviationRange: Range, expandOptions: object): CompletionItem[] {
	if (!prefix) {
		return [];
	}
	if (!snippetKeyCache.has(syntax)) {
		let registry = customSnippetRegistry[syntax] ? customSnippetRegistry[syntax] : createSnippetsRegistry(syntax);
		let snippetKeys: string[] = registry.all({ type: 'string' }).map(snippet => {
			return snippet.key;
		});
		snippetKeyCache.set(syntax, snippetKeys);
	}

	let snippetKeys = snippetKeyCache.get(syntax);
	let snippetCompletions = [];
	snippetKeys.forEach(snippetKey => {
		if (!snippetKey.startsWith(prefix) || snippetKey === prefix) {
			return;
		}

		let currentAbbr = abbreviation + snippetKey.substr(prefix.length);
		let expandedAbbr;
		try {
			expandedAbbr = expand(currentAbbr, expandOptions);
		} catch (e) {

		}

		let item = CompletionItem.create(snippetKey);
		item.documentation = removeTabStops(expandedAbbr);
		item.detail = 'Emmet Abbreviation';
		item.textEdit = TextEdit.replace(abbreviationRange, expandedAbbr);
		item.insertTextFormat = InsertTextFormat.Snippet;

		// Workaround for snippet suggestions items getting filtered out as the complete abbr does not start with snippetKey 
		item.filterText = abbreviation;

		// Workaround for the main expanded abbr not appearing before the snippet suggestions
		item.sortText = '9' + abbreviation;

		snippetCompletions.push(item);
	});

	return snippetCompletions;
}

function getCurrentWord(document: TextDocument, position: Position): string {
	let currentLine = getCurrentLine(document, position);
	if (currentLine) {
		let matches = currentLine.match(/[\w,:]*$/);
		if (matches) {
			return matches[0];
		}
	}
}

function removeTabStops(expandedWord: string): string {
	return expandedWord.replace(/\$\{\d+\}/g, '').replace(/\$\{\d+:([^\}]+)\}/g, '$1');
}

function getCurrentLine(document: TextDocument, position: Position): string {
	let offset = document.offsetAt(position);
	let text = document.getText();
	let start = 0;
	let end = text.length - 1;
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

let customSnippetRegistry = {};
let variablesFromFile = {};
let profilesFromFile = {};
let emmetExtensionsPath = '';

const field = (index, placeholder) => `\${${index}${placeholder ? ':' + placeholder : ''}}`;

export function isStyleSheet(syntax): boolean {
	let stylesheetSyntaxes = ['css', 'scss', 'sass', 'less', 'stylus'];
	return (stylesheetSyntaxes.indexOf(syntax) > -1);
}

/**
 * Extracts abbreviation from the given position in the given document
 */
export function extractAbbreviation(document: TextDocument, position: Position): [Range, string] {
	let currentLine = getCurrentLine(document, position);
	let result;
	try {
		result = extract(currentLine, position.character, true);
	} catch (e) {

	}
	if (!result) {
		return [null, ''];
	}

	let rangeToReplace = Range.create(position.line, result.location, position.line, result.location + result.abbreviation.length);
	return [rangeToReplace, result.abbreviation];
}

/**
 * Returns a boolean denoting validity of given abbreviation in the context of given syntax
 * Not needed once https://github.com/emmetio/atom-plugin/issues/22 is fixed
 * @param syntax string
 * @param abbreviation string
 */
export function isAbbreviationValid(syntax: string, abbreviation: string): boolean {
	return !isStyleSheet(syntax) ? (htmlAbbreviationStartRegex.test(abbreviation) && htmlAbbreviationEndRegex.test(abbreviation)) : cssAbbreviationRegex.test(abbreviation);
}

/**
 * Returns options to be used by the expand module
 * @param syntax 
 * @param textToReplace 
 */
export function getExpandOptions(syntaxProfiles: object, variables: object, syntax: string, textToReplace?: string) {
	return {
		field: field,
		syntax: syntax,
		profile: getProfile(syntax, syntaxProfiles),
		addons: syntax === 'jsx' ? { 'jsx': true } : null,
		variables: getVariables(variables),
		text: textToReplace ? textToReplace : null,
		snippets: customSnippetRegistry[syntax]
	};
}

/**
 * Maps and returns syntaxProfiles of previous format to ones compatible with new emmet modules
 * @param syntax 
 */
function getProfile(syntax: string, profilesFromSettings: object): any {
	let profilesConfig = Object.assign({}, profilesFromFile, profilesFromSettings);

	let options = profilesConfig[syntax];
	if (!options || typeof options === 'string') {
		if (options === 'xhtml') {
			return {
				selfClosingStyle: 'xhtml'
			};
		}
		return {};
	}
	let newOptions = {};
	for (let key in options) {
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
				newOptions['format'] = (options[key] === 'true' || options[key] === 'false') ? options[key] : 'true';
				break;
			case 'indent':
				newOptions['attrCase'] = (options[key] === 'true' || options[key] === 'false') ? '\t' : options[key];
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
	return Object.assign({}, variablesFromFile, variablesFromSettings);
}

/**
 * Updates customizations from snippets.json and syntaxProfiles.json files in the directory configured in emmet.extensionsPath setting
 */
export function updateExtensionsPath(currentEmmetExtensionsPath: string) {
	if (emmetExtensionsPath !== currentEmmetExtensionsPath) {
		emmetExtensionsPath = currentEmmetExtensionsPath;

		if (emmetExtensionsPath && emmetExtensionsPath.trim() && path.isAbsolute(emmetExtensionsPath.trim())) {
			let dirPath = emmetExtensionsPath.trim();
			let snippetsPath = path.join(dirPath, 'snippets.json');
			let profilesPath = path.join(dirPath, 'syntaxProfiles.json');
			if (dirExists(dirPath)) {
				fs.readFile(snippetsPath, (err, snippetsData) => {
					if (err) {
						return;
					}
					try {
						let snippetsJson = JSON.parse(snippetsData.toString());
						variablesFromFile = snippetsJson['variables'];
						Object.keys(snippetsJson).forEach(syntax => {
							if (snippetsJson[syntax]['snippets']) {
								customSnippetRegistry[syntax] = createSnippetsRegistry(syntax, snippetsJson[syntax]['snippets']);
							}
						});
					} catch (e) {

					}
				});
				fs.readFile(profilesPath, (err, profilesData) => {
					if (err) {
						return;
					}
					try {
						profilesFromFile = JSON.parse(profilesData.toString());
					} catch (e) {

					}
				});
			}
		}
	}
}

function dirExists(dirPath: string): boolean {
	try {

		return fs.statSync(dirPath).isDirectory();
	} catch (e) {
		return false;
	}
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
export function getEmmetMode(language: string, excludedLanguages: string[]): string {
	if (!language || excludedLanguages.indexOf(language) > -1) {
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
	if (emmetModes.indexOf(language) > -1) {
		return language;
	}
}






