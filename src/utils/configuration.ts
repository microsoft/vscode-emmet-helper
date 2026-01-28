/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SnippetsMap } from '../configCompat';

export function getClosingStyle(syntax: string): string {
	switch (syntax) {
		case 'xhtml': return 'xhtml';
		case 'xml': return 'xml';
		case 'xsl': return 'xml';
		case 'jsx': return 'xhtml';
		default: return 'html';
	}
}

/**
 * Maps and returns syntaxProfiles of previous format to ones compatible with new emmet modules
 * @param syntax
 */
export function getProfile(syntax: string, profilesFromSettings: any, profilesFromFile: any): any {
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
export function getVariables(variablesFromSettings: object | undefined, variablesFromFile: any): SnippetsMap {
	if (!variablesFromSettings) {
		return variablesFromFile;
	}
	return Object.assign({}, variablesFromFile, variablesFromSettings) as SnippetsMap;
}

export function getFormatters(syntax: string, preferences: any, isStyleSheetFn: (syntax: string) => boolean): any {
	if (!preferences || typeof preferences !== 'object') {
		return {};
	}

	if (!isStyleSheetFn(syntax)) {
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
