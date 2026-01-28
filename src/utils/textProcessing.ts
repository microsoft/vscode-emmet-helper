/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function replaceTabStopsWithCursors(expandedWord: string): string {
	return expandedWord.replace(/([^\\])\$\{\d+\}/g, '$1|').replace(/\$\{\d+:([^\}]+)\}/g, '$1');
}

export function removeTabStops(expandedWord: string): string {
	return expandedWord.replace(/([^\\])\$\{\d+\}/g, '$1').replace(/\$\{\d+:([^\}]+)\}/g, '$1');
}

export function escapeNonTabStopDollar(text: string): string {
	return text ? text.replace(/([^\\])(\$)([^\{])/g, '$1\\$2$3') : text;
}

export function addFinalTabStop(text: string): string {
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
