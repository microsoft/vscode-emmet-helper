import { TextDocument, Position, Range, CompletionList } from 'vscode-languageserver-types';
export interface EmmetConfiguration {
    useNewEmmet: boolean;
    showExpandedAbbreviation: string;
    showAbbreviationSuggestions: boolean;
    syntaxProfiles: object;
    variables: object;
}
export declare function doComplete(document: TextDocument, position: Position, syntax: string, emmetConfig: EmmetConfiguration): CompletionList;
export declare const emmetSnippetField: (index: any, placeholder: any) => string;
export declare function isStyleSheet(syntax: any): boolean;
/**
 * Extracts abbreviation from the given position in the given document
 */
export declare function extractAbbreviation(document: TextDocument, position: Position): {
    abbreviationRange: Range;
    abbreviation: any;
    filters: any[];
};
export declare function extractAbbreviationFromText(text: string): any;
/**
 * Returns a boolean denoting validity of given abbreviation in the context of given syntax
 * Not needed once https://github.com/emmetio/atom-plugin/issues/22 is fixed
 * @param syntax string
 * @param abbreviation string
 */
export declare function isAbbreviationValid(syntax: string, abbreviation: string): boolean;
/**
 * Returns options to be used by the expand module
 * @param syntax
 * @param textToReplace
 */
export declare function getExpandOptions(syntax: string, syntaxProfiles?: object, variables?: object, filters?: string[]): {
    field: (index: any, placeholder: any) => string;
    syntax: string;
    profile: any;
    addons: {};
    variables: any;
    snippets: any;
};
/**
 * Expands given abbreviation using given options
 * @param abbreviation string
 * @param options
 */
export declare function expandAbbreviation(abbreviation: string, options: any): any;
/**
 * Updates customizations from snippets.json and syntaxProfiles.json files in the directory configured in emmet.extensionsPath setting
 */
export declare function updateExtensionsPath(emmetExtensionsPath: string): Promise<void>;
/**
* Get the corresponding emmet mode for given vscode language mode
* Eg: jsx for typescriptreact/javascriptreact or pug for jade
* If the language is not supported by emmet or has been exlcuded via `exlcudeLanguages` setting,
* then nothing is returned
*
* @param language
* @param exlcudedLanguages Array of language ids that user has chosen to exlcude for emmet
*/
export declare function getEmmetMode(language: string, excludedLanguages: string[]): string;
