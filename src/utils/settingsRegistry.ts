/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as JSONC from 'jsonc-parser';
import { URI } from 'vscode-uri';
import { parseSnippets, SnippetsMap } from '../configCompat';

let l10n: { t: (message: string) => string };
try {
	l10n = require('vscode').l10n;
} catch {
	// Fallback to the identity function.
	l10n = {
		t: (message: string) => message
	};
}

export function tryParseFile(strPath: URI, dataStr: string): any {
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
export function updateVariables(varsJson: any, variablesFromFile: any): any {
	if (typeof varsJson === 'object' && varsJson) {
		return Object.assign({}, variablesFromFile, varsJson);
	} else {
		throw new Error(l10n.t('Invalid emmet.variables field. See https://code.visualstudio.com/docs/editor/emmet#_emmet-configuration for a valid example.'));
	}
}

/**
 * Assigns profiles from one profile file under emmet.extensionsPath to
 * profilesFromFile
 */
export function updateProfiles(profileJson: any, profilesFromFile: any): any {
	if (typeof profileJson === 'object' && profileJson) {
		return Object.assign({}, profilesFromFile, profileJson);
	} else {
		throw new Error(l10n.t('Invalid syntax profile. See https://code.visualstudio.com/docs/editor/emmet#_emmet-configuration for a valid example.'));
	}
}

/**
 * Assigns snippets from one snippet file under emmet.extensionsPath to
 * customSnippetsRegistry, snippetKeyCache, and stylesheetCustomSnippetsKeyCache
 */
export function updateSnippets(
	snippetsJson: any,
	customSnippetsRegistry: Record<string, SnippetsMap>,
	stylesheetCustomSnippetsKeyCache: Map<string, string[]>,
	getDefaultSyntaxFn: (syntax: string) => string,
	isStyleSheetFn: (syntax: string) => boolean
): { customSnippetsRegistry: Record<string, SnippetsMap>, stylesheetCustomSnippetsKeyCache: Map<string, string[]> } {
	if (typeof snippetsJson === 'object' && snippetsJson) {
		Object.keys(snippetsJson).forEach(syntax => {
			if (!snippetsJson[syntax]['snippets']) {
				return;
			}
			const baseSyntax = getDefaultSyntaxFn(syntax);
			let customSnippets = snippetsJson[syntax]['snippets'];
			if (snippetsJson[baseSyntax] && snippetsJson[baseSyntax]['snippets'] && baseSyntax !== syntax) {
				customSnippets = Object.assign({}, snippetsJson[baseSyntax]['snippets'], snippetsJson[syntax]['snippets'])
			}
			if (!isStyleSheetFn(syntax)) {
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
		return { customSnippetsRegistry, stylesheetCustomSnippetsKeyCache };
	} else {
		throw new Error(l10n.t('Invalid snippets file. See https://code.visualstudio.com/docs/editor/emmet#_using-custom-emmet-snippets for a valid example.'));
	}
}

export function resetSettingsFromFile(): {
	customSnippetsRegistry: Record<string, SnippetsMap>,
	snippetKeyCache: Map<string, string[]>,
	stylesheetCustomSnippetsKeyCache: Map<string, string[]>,
	profilesFromFile: any,
	variablesFromFile: any
} {
	return {
		customSnippetsRegistry: {},
		snippetKeyCache: new Map<string, string[]>(),
		stylesheetCustomSnippetsKeyCache: new Map<string, string[]>(),
		profilesFromFile: {},
		variablesFromFile: {}
	};
}
