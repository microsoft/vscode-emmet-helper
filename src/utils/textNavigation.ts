/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position, TextDocument } from 'vscode-languageserver-textdocument';

export function getCurrentLine(document: TextDocument, position: Position): string {
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

export function getCurrentWord(currentLineTillPosition: string): string | undefined {
	if (currentLineTillPosition) {
		const matches = currentLineTillPosition.match(/[\w,:,-,\.]*$/)
		if (matches) {
			return matches[0];
		}
	}
}
