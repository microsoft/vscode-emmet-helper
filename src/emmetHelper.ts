/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import { expand, createSnippetsRegistry } from '@emmetio/expand-abbreviation';
import * as extract from '@emmetio/extract-abbreviation';
import * as path from 'path';
import * as fs from 'fs';

const snippetKeyCache = new Map<string, string[]>();
const htmlAbbreviationStartRegex = /^[a-z,A-Z,!,(,[,#,\.]/;
const htmlAbbreviationEndRegex = /[a-z,A-Z,!,),\],#,\.,},\d,*,$]$/;
const cssAbbreviationRegex = /^[a-z,A-Z,!,@,#]/;
const emmetModes = ['html', 'pug', 'slim', 'haml', 'xml', 'xsl', 'jsx', 'css', 'scss', 'sass', 'less', 'stylus'];

export class EmmetCompletionItemProvider implements vscode.CompletionItemProvider {
	private _syntax: string;

	constructor(syntax: string) {
		if (syntax) {
			this._syntax = syntax;
		}
	}

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList> {

		let emmetConfig = vscode.workspace.getConfiguration('emmet');
		if (!emmetConfig['useNewEmmet']
			|| emmetConfig['showExpandedAbbreviation'] === false
			|| emmetConfig['showExpandedAbbreviation'] === 'never'
			|| emmetModes.indexOf(this._syntax) === -1) {
			return Promise.resolve(null);
		}

		let expandedAbbr: vscode.CompletionItem;
		let [abbreviationRange, abbreviation] = extractAbbreviation(document, position);

		if (isAbbreviationValid(this._syntax, abbreviation)) {
			let expandedText = expand(abbreviation, getExpandOptions(this._syntax));
			if (expandedText) {
				expandedAbbr = new vscode.CompletionItem(abbreviation);
				expandedAbbr.insertText = new vscode.SnippetString(expandedText);
				expandedAbbr.documentation = this.removeTabStops(expandedText);
				expandedAbbr.range = abbreviationRange;
				expandedAbbr.detail = 'Emmet Abbreviation';
				if (isStyleSheet(this._syntax)) {
					// Temporary fix for https://github.com/Microsoft/vscode/issues/28933
					expandedAbbr.filterText = abbreviation;
					expandedAbbr.sortText = expandedAbbr.documentation;
					expandedAbbr.label = expandedAbbr.documentation;
					return Promise.resolve(new vscode.CompletionList([expandedAbbr], true));
				}
			}
		}

		let completionItems: vscode.CompletionItem[] = expandedAbbr ? [expandedAbbr] : [];
		if (!isStyleSheet(this._syntax)) {
			if (expandedAbbr) {
				// Workaround for the main expanded abbr not appearing before the snippet suggestions
				expandedAbbr.sortText = '0' + expandedAbbr.label;
			}

			let currentWord = this.getCurrentWord(document, position);
			let abbreviationSuggestions = this.getAbbreviationSuggestions(this._syntax, currentWord, abbreviation, abbreviationRange);
			completionItems = completionItems.concat(abbreviationSuggestions);
		}
		return Promise.resolve(new vscode.CompletionList(completionItems, true));
	}

	getAbbreviationSuggestions(syntax: string, prefix: string, abbreviation: string, abbreviationRange: vscode.Range): vscode.CompletionItem[] {
		if (!vscode.workspace.getConfiguration('emmet')['showAbbreviationSuggestions'] || !prefix || !abbreviation) {
			return [];
		}

		if (!snippetKeyCache.has(syntax)) {
			let registry = createSnippetsRegistry(syntax);
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
			let expandedAbbr = expand(currentAbbr, getExpandOptions(syntax));

			let item = new vscode.CompletionItem(snippetKey);
			item.documentation = this.removeTabStops(expandedAbbr);
			item.detail = 'Emmet Abbreviation';
			item.insertText = new vscode.SnippetString(expandedAbbr);
			item.range = abbreviationRange;

			// Workaround for snippet suggestions items getting filtered out as the complete abbr does not start with snippetKey 
			item.filterText = abbreviation;

			// Workaround for the main expanded abbr not appearing before the snippet suggestions
			item.sortText = '9' + abbreviation;

			snippetCompletions.push(item);
		});

		return snippetCompletions;
	}

	private getCurrentWord(document: vscode.TextDocument, position: vscode.Position): string {
		let currentLine = document.lineAt(position.line).text;
		let matches = currentLine.match(/[\w,:]*$/);
		if (matches) {
			return matches[0];
		}
	}

	private removeTabStops(expandedWord: string): string {
		return expandedWord.replace(/\$\{\d+\}/g, '').replace(/\$\{\d+:([^\}]+)\}/g, '$1');
	}

}

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
export function extractAbbreviation(document: vscode.TextDocument, position: vscode.Position): [vscode.Range, string] {
	let currentLine = document.lineAt(position.line).text;
	let result = extract(currentLine, position.character, true);
	if (!result) {
		return [null, ''];
	}

	let rangeToReplace = new vscode.Range(position.line, result.location, position.line, result.location + result.abbreviation.length);
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
export function getExpandOptions(syntax: string, textToReplace?: string) {
	return {
		field: field,
		syntax: syntax,
		profile: getProfile(syntax),
		addons: syntax === 'jsx' ? { 'jsx': true } : null,
		variables: getVariables(),
		text: textToReplace ? textToReplace : null
	};
}

/**
 * Maps and returns syntaxProfiles of previous format to ones compatible with new emmet modules
 * @param syntax 
 */
export function getProfile(syntax: string): any {
	let profilesFromSettings = vscode.workspace.getConfiguration('emmet')['syntaxProfiles'] || {};
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
export function getVariables(): any {
	let variablesFromSettings = vscode.workspace.getConfiguration('emmet')['variables'];
	return Object.assign({}, variablesFromFile, variablesFromSettings);
}

/**
 * Updates customizations from snippets.json and syntaxProfiles.json files in the directory configured in emmet.extensionsPath setting
 */
export function updateExtensionsPath() {
	let currentEmmetExtensionsPath = vscode.workspace.getConfiguration('emmet')['extensionsPath'];
	if (emmetExtensionsPath !== currentEmmetExtensionsPath) {
		emmetExtensionsPath = currentEmmetExtensionsPath;

		if (emmetExtensionsPath && emmetExtensionsPath.trim()) {
			let dirPath = path.isAbsolute(emmetExtensionsPath) ? emmetExtensionsPath : path.join(vscode.workspace.rootPath, emmetExtensionsPath);
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
*/
export function getEmmetMode(language: string): string {
	    const excludedConfig = vscode.workspace.getConfiguration('emmet')['excludeLanguages'];
	    const excludedLanguages = Array.isArray(excludedConfig) ? excludedConfig : [];

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






