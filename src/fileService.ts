/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as Uri } from 'vscode-uri';

export enum FileType {
	/**
	 * The file type is unknown.
	 */
	Unknown = 0,
	/**
	 * A regular file.
	 */
	File = 1,
	/**
	 * A directory.
	 */
	Directory = 2,
	/**
	 * A symbolic link to a file.
	 */
	SymbolicLink = 64
}
export interface FileStat {
	/**
	 * The type of the file, e.g. is a regular file, a directory, or symbolic link
	 * to a file.
	 */
	type: FileType;
	/**
	 * The creation timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
	 */
	ctime: number;
	/**
	 * The modification timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
	 */
	mtime: number;
	/**
	 * The size in bytes.
	 */
	size: number;
}

/**
 * Service for reading files and getting file information
 */
export interface FileService {
	/**
	 * Reads the entire contents of a file
	 * @param uri The URI of the file to read
	 * @returns A Thenable that resolves to the file contents as a Uint8Array
	 */
	readFile(uri: Uri): Thenable<Uint8Array>;
	/**
	 * Retrieves file statistics for the given URI
	 * @param uri The URI of the file to stat
	 * @returns A Thenable that resolves to the file statistics
	 */
	stat(uri: Uri): Thenable<FileStat>;
}

// following https://nodejs.org/api/path.html#path_path_isabsolute_path
const PathMatchRegex = new RegExp('^(/|//|\\\\\\\\|[A-Za-z]:(/|\\\\))');
const Dot = '.'.charCodeAt(0);

/**
 * Determines whether the given path is an absolute path
 * @param path The path to check
 * @returns True if the path is absolute, false otherwise
 */
export function isAbsolutePath(path: string) {
	return PathMatchRegex.test(path);
}

/**
 * Resolves a path relative to a base URI
 * @param uri The base URI to resolve the path against
 * @param path The path to resolve (can be absolute or relative)
 * @returns A new URI with the resolved path
 */
export function resolvePath(uri: Uri, path: string): Uri {
	if (isAbsolutePath(path)) {
		return uri.with({ path: normalizePath(path.split('/')) });
	}
	return joinPath(uri, path);
}

/**
 * Normalizes a path by resolving '.' and '..' segments
 * @param parts An array of path segments to normalize
 * @returns The normalized path as a string
 */
export function normalizePath(parts: string[]): string {
	const newParts: string[] = [];
	for (const part of parts) {
		if (part.length === 0 || part.length === 1 && part.charCodeAt(0) === Dot) {
			// ignore
		} else if (part.length === 2 && part.charCodeAt(0) === Dot && part.charCodeAt(1) === Dot) {
			newParts.pop();
		} else {
			newParts.push(part);
		}
	}
	if (parts.length > 1 && parts[parts.length - 1].length === 0) {
		newParts.push('');
	}
	let res = newParts.join('/');
	if (parts[0].length === 0) {
		res = '/' + res;
	}
	return res;
}

/**
 * Joins multiple path segments to a base URI
 * @param uri The base URI to join paths to
 * @param paths One or more path segments to join
 * @returns A new URI with the joined path
 */
export function joinPath(uri: Uri, ...paths: string[]): Uri {
	const parts = uri.path.split('/');
	for (const path of paths) {
		parts.push(...path.split('/'));
	}
	return uri.with({ path: normalizePath(parts) });
}
