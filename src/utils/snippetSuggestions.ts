/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import expand, { UserConfig } from 'emmet';
import { CompletionItem, InsertTextFormat, Range, TextEdit } from 'vscode-languageserver-types';
import { addFinalTabStop, escapeNonTabStopDollar, replaceTabStopsWithCursors } from './textProcessing';

export function makeSnippetSuggestion(
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
