/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const bemFilterSuffix = 'bem';
const filterDelimitor = '|';
const trimFilterSuffix = 't';
const commentFilterSuffix = 'c';
const maxFilters = 3;

export function getFilters(text: string, pos: number): { pos: number, filter: string | undefined } {
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

