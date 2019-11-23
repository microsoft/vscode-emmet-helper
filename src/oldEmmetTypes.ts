
export interface OldEmmetExpandOptions {
    /**
     * Type of abbreviation to parse: 'markup' or 'stylesheet'.
     * Can be auto-detected from `syntax` property. Default is 'markup'
     */
    type?: "markup" | "stylesheet",

    /**
     * Abbreviation output syntax
     */
    syntax?: string,

    /**
     * Field/tabstop generator for editor. Most editors support TextMate-style
     * fields: ${0} or ${1:item}. So for TextMate-style fields this function
     * will look like this:
     * @example
     * (index, placeholder) => `\${${index}${placeholder ? ':' + placeholder : ''}}`
     */
    field?: (index: string, placeholder: string) => string,

    /**
     * Insert given text string(s) into expanded abbreviation
     * If array of strings is given, the implicitly repeated element (e.g. `li*`)
     * will be repeated by the amount of items in array
     */
    text?: string | string[],

    /**
     * Either predefined output profile or options for output profile. Used for
     * abbreviation output
     * @type {Profile|Object}
     */
    profile?: EmmetOutputProfile,

    /**
     * Custom variables for variable resolver
     * @see @emmetio/variable-resolver
     */
    variables?: Record<string, string>,

    /**
     * Custom predefined snippets for abbreviation. The expanded abbreviation
     * will try to match given snippets that may contain custom elements,
     * predefined attributes etc.
     * May also contain array of items: either snippets (Object) or references
     * to default syntax snippets (String; the key in default snippets hash)
     * @see @emmetio/snippets
     */
    snippets?: SnippetsRegistry,

    /**
     * Hash of additional transformations that should be applied to expanded
     * abbreviation, like BEM or JSX. Since these transformations introduce
     * side-effect, they are disabled by default and should be enabled by
     * providing a transform name as a key and transform options as value:
     * @example
     * {
     *     bem: {element: '--'},
     *     jsx: true // no options, just enable transform
     * }
     * @see @emmetio/html-transform/lib/addons
     * @type {Object}
     */
    options?: any, // TODO

    /**
     * Additional options for syntax formatter
     * @see @emmetio/markup-formatters
     * @type {Object}
     */
    format?: any // TODO
}


interface EmmetOutputProfile {
    /**
     * String for one-level indentation. For example, `\t` or `  ` (N spaces)
     */
    indent?: string;

    /**
     * Tag case: lower, upper or '' (keep as-is)
     */
    tagCase?: '' | 'lower' | 'upper';

    /**
     * Attribute name case: lower, upper or '' (keep as-is)
     * @type {String}
     */
    attributeCase?: '' | 'lower' | 'upper';

    /**
     * Attribute value quotes: 'single' or 'double'
     */
    attributeQuotes?: 'single' | 'double';

    /**
     * Enable output formatting (indentation and line breaks)
     */
    format?: boolean;

    /**
     * A list of tag names that should not get inner indentation
     */
    formatSkip?: string[];

    /**
     * A list of tag names that should *always* get inner indentation.
     */
    formatForce?: string[];

    /**
     * How many inline sibling elements should force line break for each tag.
     * Set to 0 to output all inline elements without formatting.
     * Set to 1 to output all inline elements with formatting (same as block-level).
     */
    inlineBreak?: number;

    /**
     * Produce compact notation of boolean attributes: attributes where name equals value.
     * With this option enabled, output `<div contenteditable>` instead of
     * `<div contenteditable="contenteditable">`
     */
    compactBooleanAttributes?: boolean;

    /**
     * A set of boolean attributes
     */
    booleanAttributes?: string[];

    /**
     * Style of self-closing tags: html (`<br>`), xml (`<br/>`) or xhtml (`<br />`)
     */
    selfClosingStyle?: 'html' | 'xml' | 'xhtml';

    /**
     * A set of inline-level elements
     */
    inlineElements?: string[];

    /**
     * A function that takes field index and optional placeholder and returns 
     * a string field (tabstop) for host editor. For example, a TextMate-style 
     * field is `$index` or `${index:placeholder}`
     * @param index 
     * @param placeholder 
     */
    field(index: number, placeholder?: string): string;
}


interface SnippetsStorage {
    disabled: boolean,

    /**
     * Disables current store. A disabled store always returns `undefined`
     * on `get()` method
     */
    disable: () => void,

    /**
     * Enables current store.
     */
    enable: () => void,

    /**
     * Registers a new snippet item
     */
    set: (key: string | RegExp, value: string | Function) => SnippetsStorage,
    

    /**
     * Returns a snippet matching given key. It first tries to find snippet
     * exact match in a string key map, then tries to match one with regexp key
     */
    get: (key: string | RegExp) => undefined | Snippet,

    /**
     * Batch load of snippets data
     */
    load: (data: Map<string | RegExp, Snippet> | Record<string, Snippet>) => void,

    /**
     * Clears all stored snippets
     */
    reset: () => void,

    /**
     * Returns all available snippets from given store
     */
    values: () => (string | RegExp)[]
}

export interface SnippetsRegistry {
    /**
     * Return store for given level
     */
    get: (level: number) => SnippetsStorage,

    /**
     * Adds new store for given level
     * @param {Number} [level] Store level (priority). Store with higher level
     * takes precedence when resolving snippets
     * @param {Object} [snippets] A snippets data for new store
     * @return {SnipetsStorage}
     */
    add: (level?: number, snippets?: Parameters<SnippetsStorage["load"]>[]) => SnippetsStorage,

    /**
     * Remove registry with given level or store
     */
    remove: (data?: number | SnippetsStorage) => void

    /**
     * Returns snippet from registry that matches given name
     */
    resolve: (name: Parameters<SnippetsStorage["get"]>[0]) => Snippet,

    /**
     * Returns all available snippets from current registry. Snippets with the
     * same key are resolved by their storage priority.
     */
    all: (options: { type: Parameters<SnippetsStorage["get"]>[0] }) => Snippet[],

    /**
     * Removes all stores from registry
     */
    clear: () => void
}

interface Snippet {
    key: string | RegExp,
    value: string | Function
}